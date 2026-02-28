/* SIBYL portfolio API. Returns live treasury data from on-chain balances and prices.
   Queries all wallets via Base RPC batch call, fetches prices from DexScreener + CoinGecko.
   Cached at edge for 60 seconds. */

var RPC = process.env.BASE_RPC_URL || 'https://1rpc.io/base';

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

// Holdings metadata: updated when trades happen
var HOLDINGS_META = [
  { token: 'TGATE', entry_date: '2026-02-26', entry_size: 224, status: 'active' },
  { token: 'SIGIL', entry_date: '2026-02-26', entry_size: 346, status: 'active' },
  { token: 'CRED', entry_date: '2026-02-27', entry_size: 252, status: 'active' },
];

// SIGIL is held across stealth wallets + cold, not bankr. Query these separately.
var SIGIL_WALLETS = ['stealth_1', 'stealth_2', 'stealth_3', 'stealth_4', 'cold'];

// CRED is held across bankr + cold
var CRED_WALLETS = ['bankr', 'cold'];

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
        positions: HOLDINGS_META.length,
      },
      holdings: holdings,
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
    return data.ethereum.usd;
  } catch (e) {
    console.error('eth_price_failed:', e.message);
    return 0;
  }
}

async function fetchTgatePrice() {
  return fetchTokenPrice(TOKENS.tgate.address);
}

async function fetchTokenPrice(tokenAddress) {
  try {
    var resp = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + tokenAddress, {
      headers: { 'Accept': 'application/json' },
    });
    var data = await resp.json();
    if (data.pairs && data.pairs.length > 0) {
      // Use the pair with highest liquidity
      var sorted = data.pairs.sort(function (a, b) {
        return (b.liquidity && b.liquidity.usd || 0) - (a.liquidity && a.liquidity.usd || 0);
      });
      return parseFloat(sorted[0].priceUsd) || 0;
    }
    return 0;
  } catch (e) {
    console.error('token_price_failed:', tokenAddress, e.message);
    return 0;
  }
}

function round(n, decimals) {
  if (decimals === undefined) decimals = 2;
  var factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
