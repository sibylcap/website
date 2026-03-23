/* SIBYL portfolio API. Returns live treasury data from on-chain balances and prices.
   Queries all wallets via Base RPC batch call, fetches prices from DexScreener + CoinGecko.
   Cached at edge for 60 seconds. */

var RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

var WALLETS = {
  bankr:     '0xe3e14118238b5693c854674f7c276136a2dd311f',
  cold:      '0x4069ef1afC8A9b2a29117A3740fCAB2912499fBe',
  stealth_1: '0xDeDBD7AaA28F719D79c7AE677698c0C4A372a8E2',
  stealth_2: '0xD563a85c56a920043017A2F59db6F36FABa0d38d',
  stealth_3: '0xabE3ceAf64EE32262c387705916Dc25D28291a99',
  stealth_4: '0x9228ED96DC0d43cA8E3b69229e784428B9591d49',
};

var TOKENS = {
  weth:  { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  usdc:  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  tgate: { address: '0xfaded58c5fac3d95643a14ee33b7ea9f50084b9a', decimals: 18 },
};

// SIGIL tracked separately: held across stealth+cold, not bankr
var SIGIL = { address: '0xDacE999d08eA443E800996208dF40a6D13A9c1Bd', decimals: 18 };

// CRED tracked separately: held across bankr+cold
var CRED = { address: '0xAB3f23c2ABcB4E12Cc8B593C218A7ba64Ed17Ba3', decimals: 18 };

// Holdings metadata: falls back to hardcoded if treasury.json read fails
var HOLDINGS_META_FALLBACK = [
  { token: 'TGATE', entry_date: '2026-02-26', entry_size: 224, status: 'active' },
  { token: 'SIGIL', entry_date: '2026-02-26', entry_size: 346, status: 'active' },
  { token: 'CRED', entry_date: '2026-02-27', entry_size: 252, status: 'active' },
];

// Cache treasury.json with 60s TTL
var treasuryCache = { data: null, ts: 0 };

function getHoldingsMeta() {
  var now = Date.now();
  if (treasuryCache.data && now - treasuryCache.ts < 60000) {
    return treasuryCache.data;
  }
  try {
    var fs = require('fs');
    var path = require('path');
    var treasuryPath = path.resolve(__dirname, '../../memory/state/treasury.json');
    var raw = fs.readFileSync(treasuryPath, 'utf8');
    var treasury = JSON.parse(raw);
    if (treasury.positions && Array.isArray(treasury.positions)) {
      // Aggregate entry sizes per token from active positions
      var byToken = {};
      treasury.positions.forEach(function(p) {
        if (p.status !== 'active') return;
        var key = (p.token || '').toUpperCase();
        if (!key) return;
        if (!byToken[key]) byToken[key] = { token: key, entry_date: p.entry_date || '', entry_size: 0, status: 'active' };
        byToken[key].entry_size += (p.entry_amount_usd || 0);
        // Use earliest entry date
        if (p.entry_date && (!byToken[key].entry_date || p.entry_date < byToken[key].entry_date)) {
          byToken[key].entry_date = p.entry_date;
        }
      });
      var result = Object.keys(byToken).map(function(k) { return byToken[k]; })
        .filter(function(h) { return h.entry_size > 0 && ['TGATE', 'SIGIL', 'CRED', 'EXO'].indexOf(h.token) !== -1; });
      if (result.length > 0) {
        treasuryCache.data = result;
        treasuryCache.ts = now;
        return result;
      }
    }
  } catch (e) {
    console.error('treasury_read_failed:', e.message, '(using fallback)');
  }
  return HOLDINGS_META_FALLBACK;
}

// SIGIL is held across stealth wallets + cold, not bankr. Query these separately.
var SIGIL_WALLETS = ['stealth_1', 'stealth_2', 'stealth_3', 'stealth_4', 'cold'];

// CRED is held across bankr + cold
var CRED_WALLETS = ['bankr', 'cold'];

// Price cache: last known good prices survive within a single Vercel instance
var priceCache = { eth: 0, tgate: 0, sigil: 0, cred: 0 };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Build batch RPC: ETH balances for all wallets + token balances for bankr
    var calls = [];
    var walletNames = Object.keys(WALLETS);

    // ETH balance for each wallet
    for (var i = 0; i < walletNames.length; i++) {
      calls.push({ method: 'eth_getBalance', params: [WALLETS[walletNames[i]], 'latest'] });
    }

    // ERC20 balances for bankr wallet (WETH, USDC, TGATE)
    var tokenNames = Object.keys(TOKENS);
    var bankrAddr = WALLETS.bankr.toLowerCase().replace('0x', '');
    for (var j = 0; j < tokenNames.length; j++) {
      var calldata = '0x70a08231' + '000000000000000000000000' + bankrAddr;
      calls.push({ method: 'eth_call', params: [{ to: TOKENS[tokenNames[j]].address, data: calldata }, 'latest'] });
    }

    // SIGIL balances across stealth + cold wallets (separate batch to stay under limits)
    var sigilCalls = [];
    for (var s = 0; s < SIGIL_WALLETS.length; s++) {
      var sAddr = WALLETS[SIGIL_WALLETS[s]].toLowerCase().replace('0x', '');
      var sCalldata = '0x70a08231' + '000000000000000000000000' + sAddr;
      sigilCalls.push({ method: 'eth_call', params: [{ to: SIGIL.address, data: sCalldata }, 'latest'] });
    }

    // CRED balances across bankr + cold
    var credCalls = [];
    for (var c = 0; c < CRED_WALLETS.length; c++) {
      var cAddr = WALLETS[CRED_WALLETS[c]].toLowerCase().replace('0x', '');
      var cCalldata = '0x70a08231' + '000000000000000000000000' + cAddr;
      credCalls.push({ method: 'eth_call', params: [{ to: CRED.address, data: cCalldata }, 'latest'] });
    }

    // Fetch balances and prices in parallel (separate RPC batches to stay under limits)
    var results = await Promise.all([
      batchRpc(calls),
      batchRpc(sigilCalls),
      batchRpc(credCalls),
      fetchEthPrice(),
      fetchTgatePrice(),
      fetchTokenPrice(SIGIL.address),
      fetchTokenPrice(CRED.address),
    ]);

    var rpcResults = results[0];
    var sigilResults = results[1];
    var credResults = results[2];
    var ethPrice = results[3];
    var tgatePrice = results[4];
    var sigilPrice = results[5];
    var credPrice = results[6];

    // Detect if any prices are from cache (price = cached value and cache was set before this request)
    var stalePrice = (ethPrice === 0 && priceCache.eth > 0) ||
                     (tgatePrice === 0 && priceCache.tgate > 0) ||
                     (sigilPrice === 0 && priceCache.sigil > 0) ||
                     (credPrice === 0 && priceCache.cred > 0);

    // Parse ETH balances
    var ethBalances = {};
    for (var k = 0; k < walletNames.length; k++) {
      var r = rpcResults[k];
      ethBalances[walletNames[k]] = (r && r.result) ? parseInt(r.result, 16) / 1e18 : 0;
    }

    // Parse token balances for bankr
    var tokenBalances = {};
    for (var m = 0; m < tokenNames.length; m++) {
      var tr = rpcResults[walletNames.length + m];
      var dec = TOKENS[tokenNames[m]].decimals;
      tokenBalances[tokenNames[m]] = (tr && tr.result) ? parseInt(tr.result, 16) / Math.pow(10, dec) : 0;
    }

    // Parse SIGIL balances across stealth + cold wallets
    var totalSigilTokens = 0;
    for (var si = 0; si < SIGIL_WALLETS.length; si++) {
      var sr = sigilResults[si];
      if (sr && sr.result) {
        totalSigilTokens += parseInt(sr.result, 16) / Math.pow(10, SIGIL.decimals);
      }
    }

    // Parse CRED balances across bankr + cold
    var totalCredTokens = 0;
    for (var ci = 0; ci < CRED_WALLETS.length; ci++) {
      var cr = credResults[ci];
      if (cr && cr.result) {
        totalCredTokens += parseInt(cr.result, 16) / Math.pow(10, CRED.decimals);
      }
    }

    // Calculate totals
    var totalEthUsd = 0;
    for (var w in ethBalances) {
      totalEthUsd += ethBalances[w] * ethPrice;
    }
    // WETH in bankr counts as ETH
    totalEthUsd += (tokenBalances.weth || 0) * ethPrice;

    var totalUsdcUsd = tokenBalances.usdc || 0;
    var totalTgateUsd = (tokenBalances.tgate || 0) * tgatePrice;
    var totalSigilUsd = totalSigilTokens * sigilPrice;
    var totalCredUsd = totalCredTokens * credPrice;
    var totalUsd = totalEthUsd + totalUsdcUsd + totalTgateUsd + totalSigilUsd + totalCredUsd;
    var deployed = totalTgateUsd + totalSigilUsd + totalCredUsd;
    var reserve = totalUsd * 0.4;
    var deployable = Math.max(0, totalUsd * 0.6 - deployed);

    // Build wallet details for response
    var walletDetails = {};
    for (var wd in ethBalances) {
      walletDetails[wd] = { eth: round(ethBalances[wd], 6) };
    }
    walletDetails.bankr.usdc = round(tokenBalances.usdc, 2);
    walletDetails.bankr.weth = round(tokenBalances.weth, 6);
    walletDetails.bankr.tgate = Math.round(tokenBalances.tgate);

    // Build holdings with live values
    var HOLDINGS_META = getHoldingsMeta();
    var holdings = HOLDINGS_META.map(function (h) {
      var balance = 0;
      var valueUsd = 0;
      if (h.token === 'TGATE') {
        balance = Math.round(tokenBalances.tgate || 0);
        valueUsd = round(totalTgateUsd, 2);
      } else if (h.token === 'SIGIL') {
        balance = Math.round(totalSigilTokens);
        valueUsd = round(totalSigilUsd, 2);
      } else if (h.token === 'CRED') {
        balance = Math.round(totalCredTokens);
        valueUsd = round(totalCredUsd, 2);
      }
      var pnl = h.entry_size > 0 ? round((valueUsd / h.entry_size - 1) * 100, 1) : 0;
      return {
        token: h.token,
        balance: balance,
        value_usd: valueUsd,
        entry_date: h.entry_date,
        entry_size: h.entry_size,
        pnl_pct: pnl,
        status: h.status,
      };
    });

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      prices: {
        eth: round(ethPrice, 2),
        tgate: tgatePrice,
        sigil: sigilPrice,
        cred: credPrice,
      },
      wallets: walletDetails,
      treasury: {
        total_usd: round(totalUsd, 2),
        deployed_usd: round(deployed, 2),
        deployable_usd: round(deployable, 2),
        reserve_usd: round(reserve, 2),
        positions: holdings.length,
      },
      holdings: holdings,
      stale_price: stalePrice || undefined,
    });

  } catch (err) {
    console.error('portfolio_error:', err.message, err.stack);
    return res.status(500).json({ error: 'failed to fetch portfolio data' });
  }
};

// Batch JSON-RPC: one HTTP call for all balance queries
async function batchRpc(calls) {
  var batch = calls.map(function (c, i) {
    return { jsonrpc: '2.0', method: c.method, params: c.params, id: i + 1 };
  });

  var resp = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  });

  if (!resp.ok) {
    throw new Error('RPC batch failed: ' + resp.status);
  }

  var results = await resp.json();

  // Handle case where RPC returns single error instead of array
  if (!Array.isArray(results)) {
    throw new Error('RPC batch returned non-array: ' + JSON.stringify(results));
  }

  // Sort by id to maintain call order
  results.sort(function (a, b) { return a.id - b.id; });
  return results;
}

async function fetchEthPrice() {
  try {
    var resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', {
      headers: { 'Accept': 'application/json' },
    });
    var data = await resp.json();
    var price = data.ethereum.usd;
    if (price > 0) priceCache.eth = price;
    return price;
  } catch (e) {
    console.error('eth_price_failed:', e.message, priceCache.eth > 0 ? '(using cached)' : '');
    return priceCache.eth || 0;
  }
}

async function fetchTgatePrice() {
  return fetchTokenPrice(TOKENS.tgate.address);
}

async function fetchTokenPrice(tokenAddress) {
  // Map address to cache key
  var cacheKey = null;
  if (tokenAddress.toLowerCase() === TOKENS.tgate.address.toLowerCase()) cacheKey = 'tgate';
  else if (tokenAddress.toLowerCase() === SIGIL.address.toLowerCase()) cacheKey = 'sigil';
  else if (tokenAddress.toLowerCase() === CRED.address.toLowerCase()) cacheKey = 'cred';

  try {
    var resp = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + tokenAddress, {
      headers: { 'Accept': 'application/json' },
    });
    var data = await resp.json();
    if (data.pairs && data.pairs.length > 0) {
      var sorted = data.pairs.sort(function (a, b) {
        return (b.liquidity && b.liquidity.usd || 0) - (a.liquidity && a.liquidity.usd || 0);
      });
      var price = parseFloat(sorted[0].priceUsd) || 0;
      if (price > 0 && cacheKey) priceCache[cacheKey] = price;
      return price;
    }
    return (cacheKey && priceCache[cacheKey]) || 0;
  } catch (e) {
    console.error('token_price_failed:', tokenAddress, e.message, (cacheKey && priceCache[cacheKey]) ? '(using cached)' : '');
    return (cacheKey && priceCache[cacheKey]) || 0;
  }
}

function round(n, decimals) {
  if (decimals === undefined) decimals = 2;
  var factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
