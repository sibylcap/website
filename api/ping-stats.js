/* SIBYL Ping Dashboard API. Returns live protocol financials and user stats.
   Auth: ?key= query param checked against DASHBOARD_KEY env var.
   All data via raw RPC batch calls. No ping-sdk dependency. */

var RPCS = [
  'https://base-mainnet.g.alchemy.com/v2/RgNU6uKPEDG6b7LI14nKs',
  'https://base-mainnet.gateway.tatum.io/v4/t-69adc61b8b7c2d93b6192185-48fba70dc11e4944b605e028',
  'https://base.gateway.tenderly.co',
  'https://mainnet.base.org',
  'https://base.drpc.org',
  'https://base-rpc.publicnode.com',
];
var rpcIndex = 0;

// Contracts
var PING_V1 = '0xcd4af194dd8e79d26f9e7ccff8948e010a53d70a';
var DIAMOND = '0x59235da2dd29bd0ebce0399ba16a1c5213e605da';
var V2 = '0x0571b06a221683f8afddfedd90e8568b95086df6';
var PING_V1_DEPLOY = 42772822;
var DIAMOND_DEPLOY = 42818323;
var V2_DEPLOY = 43014945;

// Addresses
var SIBYL_ADDRESS = '0x4069ef1afC8A9b2a29117A3740fCAB2912499fBe';
var RELAY_WALLET = '0xb91d82EBE1b90117B6C6c5990104B350d3E2f9e6';
var USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
var ERC8004_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

// Event topics (keccak256 of event signatures)
var MESSAGE_SENT_TOPIC = '0xe2cf7446a11cbcd14cd99ea3a1bb77fb7653a64f4064d660140b5100d001e13c';

// Function selectors (verified via keccak256)
var SEL = {
  getUserCount:      '0xb5cb15f7',  // getUserCount()
  getUserAtIndex:    '0xffcc7bbf',  // getUserAtIndex(uint256)
  addressToUsername: '0xe07a0baa',  // addressToUsername(address)
  getUsername:       '0xce43c032',  // getUsername(address) — v2
  getTotalUserCount: '0xd38aac92',  // getTotalUserCount() — v2 (v1+v2 combined)
  messageFee:        '0x1a90a219',  // messageFee()
  treasury:          '0x61d027b3',  // treasury()
  getBroadcastFee:   '0xfc4e6745',  // getBroadcastFee()
  getBroadcastCount: '0x3d137c8e',  // getBroadcastCount()
  balanceOf:         '0x70a08231',  // balanceOf(address)
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Auth gate
  var key = req.query.key || '';
  var dashKey = process.env.DASHBOARD_KEY || '';
  if (!dashKey || key !== dashKey) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  try {
    // Phase 1: Get basic contract data + balances in one batch
    var batch1 = [
      // 0: ETH balance of Ping v1 (unclaimed message fees)
      { method: 'eth_getBalance', params: [PING_V1, 'latest'] },
      // 1: ETH balance of Diamond (unclaimed broadcast fees)
      { method: 'eth_getBalance', params: [DIAMOND, 'latest'] },
      // 2: messageFee()
      { method: 'eth_call', params: [{ to: PING_V1, data: SEL.messageFee }, 'latest'] },
      // 3: v1 getUserCount()
      { method: 'eth_call', params: [{ to: PING_V1, data: SEL.getUserCount }, 'latest'] },
      // 4: getBroadcastFee()
      { method: 'eth_call', params: [{ to: DIAMOND, data: SEL.getBroadcastFee }, 'latest'] },
      // 5: getBroadcastCount()
      { method: 'eth_call', params: [{ to: DIAMOND, data: SEL.getBroadcastCount }, 'latest'] },
      // 6: Relay ETH balance
      { method: 'eth_getBalance', params: [RELAY_WALLET, 'latest'] },
      // 7: Relay USDC balance
      { method: 'eth_call', params: [{ to: USDC, data: SEL.balanceOf + pad32(RELAY_WALLET) }, 'latest'] },
      // 8: Latest block number (for log queries)
      { method: 'eth_blockNumber', params: [] },
      // 9: v2 getUserCount() (v2-only registrations)
      { method: 'eth_call', params: [{ to: V2, data: SEL.getUserCount }, 'latest'] },
      // 10: getTotalUserCount() (v1+v2 combined, from v2)
      { method: 'eth_call', params: [{ to: V2, data: SEL.getTotalUserCount }, 'latest'] },
    ];

    var r1 = await batchRpc(batch1);

    var v1BalanceWei = hexToNum(r1[0]);
    var diamondBalanceWei = hexToNum(r1[1]);
    var messageFeeWei = hexToNum(r1[2]);
    var v1UserCount = hexToInt(r1[3]);
    var broadcastFeeWei = hexToNum(r1[4]);
    var broadcastCount = hexToInt(r1[5]);
    var relayEthWei = hexToNum(r1[6]);
    var relayUsdcRaw = hexToNum(r1[7]);
    var latestBlock = hexToInt(r1[8]);
    var v2UserCount = hexToInt(r1[9]);
    var userCount = hexToInt(r1[10]);

    // Phase 2: Get all user addresses from v1 + v2 via getUserAtIndex
    var userCalls = [];
    for (var i = 0; i < v1UserCount; i++) {
      var indexHex = i.toString(16).padStart(64, '0');
      userCalls.push({
        method: 'eth_call',
        params: [{ to: PING_V1, data: SEL.getUserAtIndex + indexHex }, 'latest']
      });
    }
    for (var iv2 = 0; iv2 < v2UserCount; iv2++) {
      var indexHexV2 = iv2.toString(16).padStart(64, '0');
      userCalls.push({
        method: 'eth_call',
        params: [{ to: V2, data: SEL.getUserAtIndex + indexHexV2 }, 'latest']
      });
    }

    // Also fetch ETH price in parallel
    var phase2 = await Promise.all([
      userCalls.length > 0 ? batchRpc(userCalls) : Promise.resolve([]),
      fetchEthPrice(),
    ]);

    var userResults = phase2[0];
    var ethPrice = phase2[1];

    // Parse + deduplicate user addresses
    var seenAddr = {};
    var userAddresses = [];
    for (var u = 0; u < userResults.length; u++) {
      var addr = parseAddress(userResults[u]);
      if (addr && !seenAddr[addr.toLowerCase()]) {
        seenAddr[addr.toLowerCase()] = true;
        userAddresses.push(addr);
      }
    }

    // Phase 3: Get usernames (via v2 getUsername) + agent check for each user
    var batch3 = [];
    for (var j = 0; j < userAddresses.length; j++) {
      var userAddr = userAddresses[j];
      // getUsername(address) via v2 — works for both v1 and v2 users
      batch3.push({
        method: 'eth_call',
        params: [{ to: V2, data: SEL.getUsername + pad32(userAddr) }, 'latest']
      });
      // ERC-8004 balanceOf(address) — check if agent
      batch3.push({
        method: 'eth_call',
        params: [{ to: ERC8004_REGISTRY, data: SEL.balanceOf + pad32(userAddr) }, 'latest']
      });
    }

    var r3 = batch3.length > 0 ? await batchRpc(batch3) : [];

    var users = [];
    var agentCount = 0;
    var humanCount = 0;
    for (var k = 0; k < userAddresses.length; k++) {
      var usernameResult = r3[k * 2];
      var agentResult = r3[k * 2 + 1];
      var username = decodeString(usernameResult);
      var isAgent = hexToInt(agentResult) > 0;
      if (isAgent) agentCount++; else humanCount++;
      users.push({
        address: userAddresses[k],
        username: username,
        is_agent: isAgent,
      });
    }

    // Phase 4: Get message logs from both v1 and v2
    var logResults = await Promise.all([
      getLogsChunked(PING_V1, MESSAGE_SENT_TOPIC, PING_V1_DEPLOY, latestBlock),
      getLogsChunked(V2, MESSAGE_SENT_TOPIC, V2_DEPLOY, latestBlock),
    ]);
    var msgLogs = logResults[0].concat(logResults[1]);

    // Count inbound/outbound for SIBYL
    var totalMessages = msgLogs.length;
    var inbound = 0;
    var outbound = 0;
    var uniqueSenders = {};
    var sibylPadded = '0x' + pad32(SIBYL_ADDRESS);

    for (var m = 0; m < msgLogs.length; m++) {
      var log = msgLogs[m];
      var from = log.topics[1] || '';
      var to = log.topics[2] || '';

      if (to.toLowerCase() === sibylPadded.toLowerCase()) {
        inbound++;
      }
      if (from.toLowerCase() === sibylPadded.toLowerCase()) {
        outbound++;
      }
      // Track unique senders to SIBYL
      if (to.toLowerCase() === sibylPadded.toLowerCase()) {
        uniqueSenders[from.toLowerCase()] = true;
      }
    }

    // Revenue calculations
    var messageFeeEth = Number(messageFeeWei) / 1e18;
    var broadcastFeeEth = Number(broadcastFeeWei) / 1e18;
    var v1BalanceEth = Number(v1BalanceWei) / 1e18;
    var diamondBalanceEth = Number(diamondBalanceWei) / 1e18;
    var grossRevenueEth = v1BalanceEth + diamondBalanceEth;
    var relayEthVal = Number(relayEthWei) / 1e18;
    var relayUsdcVal = Number(relayUsdcRaw) / 1e6;

    // SIBYL's own costs
    var sibylSendCostEth = outbound * messageFeeEth;
    // Count SIBYL broadcasts from logs would require another log query; use broadcastCount for now
    // For simplicity, estimate SIBYL broadcast costs as 0 unless we have log data
    var sibylBroadcastCostEth = 0;
    var netRevenueEth = grossRevenueEth - sibylSendCostEth - sibylBroadcastCostEth;

    // Unit economics
    var revenuePerUser = userCount > 0 ? grossRevenueEth / userCount : 0;
    var netRevenuePerUser = userCount > 0 ? netRevenueEth / userCount : 0;
    var costRatio = grossRevenueEth > 0 ? (sibylSendCostEth + sibylBroadcastCostEth) / grossRevenueEth : 0;

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      eth_price: round(ethPrice, 2),
      revenue: {
        v1_balance_eth: round(v1BalanceEth, 6),
        diamond_balance_eth: round(diamondBalanceEth, 6),
        gross_eth: round(grossRevenueEth, 6),
        gross_usd: round(grossRevenueEth * ethPrice, 2),
        sibyl_send_cost_eth: round(sibylSendCostEth, 6),
        sibyl_broadcast_cost_eth: round(sibylBroadcastCostEth, 6),
        net_eth: round(netRevenueEth, 6),
        net_usd: round(netRevenueEth * ethPrice, 2),
        cost_ratio: round(costRatio * 100, 1),
      },
      fees: {
        message_fee_eth: messageFeeEth,
        message_fee_usd: round(messageFeeEth * ethPrice, 4),
        broadcast_fee_eth: broadcastFeeEth,
        broadcast_fee_usd: round(broadcastFeeEth * ethPrice, 4),
      },
      messages: {
        total: totalMessages,
        inbound_sibyl: inbound,
        outbound_sibyl: outbound,
        broadcasts: broadcastCount,
        unique_senders: Object.keys(uniqueSenders).length,
      },
      users: {
        total: userCount,
        agents: agentCount,
        humans: humanCount,
        directory: users,
      },
      relay: {
        eth: round(relayEthVal, 6),
        eth_usd: round(relayEthVal * ethPrice, 2),
        usdc: round(relayUsdcVal, 2),
      },
      unit_economics: {
        rev_per_user_eth: round(revenuePerUser, 6),
        rev_per_user_usd: round(revenuePerUser * ethPrice, 4),
        net_rev_per_user_eth: round(netRevenuePerUser, 6),
        net_rev_per_user_usd: round(netRevenuePerUser * ethPrice, 4),
        cost_ratio_pct: round(costRatio * 100, 1),
        msgs_per_user: userCount > 0 ? round(totalMessages / userCount, 1) : 0,
      },
    });
  } catch (err) {
    console.error('ping_stats_error:', err.message, err.stack);
    return res.status(500).json({ error: 'failed to fetch ping stats' });
  }
};

// ── Helpers ──

function pad32(addr) {
  return addr.toLowerCase().replace('0x', '').padStart(64, '0');
}

function hexToNum(result) {
  if (result && result.result && result.result !== '0x') {
    // Handle large numbers by using BigInt then converting
    try {
      return Number(BigInt(result.result));
    } catch (e) {
      return parseInt(result.result, 16) || 0;
    }
  }
  return 0;
}

function hexToInt(result) {
  if (result && result.result && result.result !== '0x') {
    return parseInt(result.result, 16) || 0;
  }
  return 0;
}

function parseAddress(result) {
  if (result && result.result && result.result.length >= 66) {
    // Address is in last 40 chars of 64-char hex
    var hex = result.result.replace('0x', '');
    return '0x' + hex.slice(24, 64);
  }
  return null;
}

function decodeString(result) {
  if (!result || !result.result || result.result === '0x') return '';
  try {
    var hex = result.result.replace('0x', '');
    if (hex.length < 128) return '';
    // ABI-encoded string: offset (32 bytes) + length (32 bytes) + data
    var lenHex = hex.slice(64, 128);
    var strLen = parseInt(lenHex, 16);
    if (strLen === 0 || strLen > 256) return '';
    var dataHex = hex.slice(128, 128 + strLen * 2);
    var str = '';
    for (var i = 0; i < dataHex.length; i += 2) {
      var code = parseInt(dataHex.slice(i, i + 2), 16);
      if (code > 0) str += String.fromCharCode(code);
    }
    return str;
  } catch (e) {
    return '';
  }
}

function round(n, decimals) {
  if (decimals === undefined) decimals = 2;
  var factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

async function batchRpc(calls) {
  var batch = calls.map(function (c, i) {
    return { jsonrpc: '2.0', method: c.method, params: c.params, id: i + 1 };
  });
  var body = JSON.stringify(batch);

  var lastErr = null;
  for (var attempt = 0; attempt < RPCS.length; attempt++) {
    var idx = (rpcIndex + attempt) % RPCS.length;
    var url = RPCS[idx];
    try {
      var resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        lastErr = new Error('RPC ' + url + ' returned ' + resp.status);
        continue;
      }

      var results = await resp.json();
      if (!Array.isArray(results)) {
        lastErr = new Error('RPC ' + url + ' returned non-array');
        continue;
      }

      rpcIndex = (idx + 1) % RPCS.length;
      results.sort(function (a, b) { return a.id - b.id; });
      return results;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('all ' + RPCS.length + ' RPCs failed');
}

// Parallel chunked log fetching
async function getLogsChunked(address, topic, fromBlock, toBlock) {
  var CHUNK = 50000;
  var PARALLEL = 6;
  var allLogs = [];

  // Build all chunk params
  var chunks = [];
  var start = fromBlock;
  while (start <= toBlock) {
    var end = Math.min(start + CHUNK - 1, toBlock);
    chunks.push({ from: start, to: end });
    start = end + 1;
  }

  // Run chunks in parallel batches
  for (var i = 0; i < chunks.length; i += PARALLEL) {
    var batch = chunks.slice(i, i + PARALLEL);
    var promises = batch.map(function (c) {
      return fetchLogs(address, topic, c.from, c.to);
    });
    var results = await Promise.all(promises);
    for (var j = 0; j < results.length; j++) {
      allLogs = allLogs.concat(results[j]);
    }
  }

  return allLogs;
}

// Single getLogs call with fallback across providers
async function fetchLogs(address, topic, fromBlock, toBlock) {
  var params = [{
    address: address,
    topics: [topic],
    fromBlock: '0x' + fromBlock.toString(16),
    toBlock: '0x' + toBlock.toString(16),
  }];
  var body = JSON.stringify({ jsonrpc: '2.0', method: 'eth_getLogs', params: params, id: 1 });

  for (var attempt = 0; attempt < RPCS.length; attempt++) {
    var idx = (rpcIndex + attempt) % RPCS.length;
    try {
      var resp = await fetch(RPCS[idx], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) continue;
      var data = await resp.json();
      if (data.error) {
        // Range too large — halve and retry
        if (data.error.message && data.error.message.includes('too large')) {
          var mid = Math.floor((fromBlock + toBlock) / 2);
          var h1 = await fetchLogs(address, topic, fromBlock, mid);
          var h2 = await fetchLogs(address, topic, mid + 1, toBlock);
          return h1.concat(h2);
        }
        continue;
      }
      if (data.result && Array.isArray(data.result)) return data.result;
    } catch (e) { /* try next */ }
  }
  return [];
}

var ethPriceCache = { price: 0, ts: 0 };
var PRICE_TTL = 60000; // 60s cache

async function fetchEthPrice() {
  if (Date.now() - ethPriceCache.ts < PRICE_TTL && ethPriceCache.price > 0) {
    return ethPriceCache.price;
  }
  try {
    var resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    var data = await resp.json();
    ethPriceCache = { price: data.ethereum.usd, ts: Date.now() };
    return data.ethereum.usd;
  } catch (e) {
    console.error('eth_price_failed:', e.message);
    return ethPriceCache.price || 2000;
  }
}
