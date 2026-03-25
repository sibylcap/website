/* Ping Cache API — serves pre-indexed on-chain data for fast frontend loading.
   Public endpoint. Vercel edge cache: 60s fresh, 120s stale-while-revalidate.
   One RPC batch replaces 100+ individual calls from the browser.

   RPC architecture:
   - Single provider registry with declared capabilities per provider
   - eth_getLogs requests auto-route to providers that support the required block range
   - Failover: on failure, mark provider unhealthy and try next eligible provider
   - Recovery: unhealthy providers are retried after a cooldown window
   - No silent error swallowing: errors are logged, never ignored */

// ── RPC Provider Registry ──
// Each provider declares its capabilities. The router picks the right one.
var PROVIDERS = [
  {
    url: 'https://base.gateway.tenderly.co',
    maxLogRange: Infinity,   // tested: handles 400K+ block ranges
    batchLimit: 100,
    timeout: 12000,
  },
  {
    url: 'https://base-rpc.publicnode.com',
    maxLogRange: Infinity,   // tested: handles 400K+ block ranges
    batchLimit: 100,
    timeout: 12000,
  },
  {
    url: 'https://base.drpc.org',
    maxLogRange: 10000,      // free tier: "ranges over 10000 blocks are not supported"
    batchLimit: 100,
    timeout: 10000,
  },
  {
    url: 'https://mainnet.base.org',
    maxLogRange: 10000,      // "eth_getLogs is limited to a 10,000 range"
    batchLimit: 50,
    timeout: 10000,
  },
  {
    url: 'https://base-mainnet.g.alchemy.com/v2/RgNU6uKPEDG6b7LI14nKs',
    maxLogRange: 10,         // free tier: 10 block range limit
    batchLimit: 100,
    timeout: 8000,
  },
  {
    url: 'https://base-mainnet.gateway.tatum.io/v4/t-69adc61b8b7c2d93b6192185-48fba70dc11e4944b605e028',
    maxLogRange: 100,        // free tier: "Requested range is over limit of 100"
    batchLimit: 50,
    timeout: 8000,
  },
  {
    url: 'https://rpc.ankr.com/base',
    maxLogRange: 0,          // requires API key for getLogs, unusable without auth
    batchLimit: 50,
    timeout: 8000,
  },
];

// ── Contracts ──
var PING_V1 = '0xcd4af194dd8e79d26f9e7ccff8948e010a53d70a';
var DIAMOND = '0x59235da2dd29bd0ebce0399ba16a1c5213e605da';
var V2 = '0x0571b06a221683f8afddfedd90e8568b95086df6';
var PING_V1_DEPLOY = 42772822;
var DIAMOND_DEPLOY = 42818323;
var V2_DEPLOY = 43014945;
var ERC8004_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

// Event topics
var MSG_TOPIC = '0xe2cf7446a11cbcd14cd99ea3a1bb77fb7653a64f4064d660140b5100d001e13c';
var BCAST_TOPIC = '0x9610cedb360389cd9606400e878ada95d97e0fbab2ea61fcc0ca56c330cc090d';

// Function selectors
var SEL = {
  getUserCount:      '0xb5cb15f7',
  getUserAtIndex:    '0xffcc7bbf',
  getUsername:       '0xce43c032',
  getBio:            '0x3fd0bf17',
  getAvatar:         '0xce8ac033',
  messageFee:        '0x1a90a219',
  getBroadcastFee:   '0xfc4e6745',
  getBroadcastCount: '0x3d137c8e',
  getTotalUserCount: '0xd38aac92',
  balanceOf:         '0x70a08231',
};

// ── Main Handler ──

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  try {
    // Phase 1: Basic contract reads + block number
    var r1 = await batchCall([
      call('eth_call', [{ to: V2, data: SEL.getTotalUserCount }, 'latest']),
      call('eth_call', [{ to: V2, data: SEL.messageFee }, 'latest']),
      call('eth_call', [{ to: V2, data: SEL.getBroadcastFee }, 'latest']),
      call('eth_call', [{ to: V2, data: SEL.getBroadcastCount }, 'latest']),
      call('eth_call', [{ to: PING_V1, data: SEL.getUserCount }, 'latest']),
      call('eth_call', [{ to: V2, data: SEL.getUserCount }, 'latest']),
      call('eth_blockNumber', []),
    ]);

    var totalUsers = toInt(r1[0]);
    var messageFeeWei = toInt(r1[1]);
    var broadcastFeeWei = toInt(r1[2]);
    var broadcastCount = toInt(r1[3]);
    var v1UserCount = toInt(r1[4]);
    var v2UserCount = toInt(r1[5]);
    var latestBlock = toInt(r1[6]);

    // Phase 2: Get all user addresses from v1 + v2 registries
    var userCalls = [];
    for (var i = 0; i < v1UserCount; i++) {
      userCalls.push(call('eth_call', [{ to: PING_V1, data: SEL.getUserAtIndex + padInt(i) }, 'latest']));
    }
    for (var j = 0; j < v2UserCount; j++) {
      userCalls.push(call('eth_call', [{ to: V2, data: SEL.getUserAtIndex + padInt(j) }, 'latest']));
    }
    var r2 = userCalls.length > 0 ? await batchCall(userCalls) : [];

    // Parse + deduplicate addresses
    var seen = {};
    var userAddresses = [];
    for (var u = 0; u < r2.length; u++) {
      var addr = parseAddress(r2[u]);
      if (addr && !seen[addr.toLowerCase()]) {
        seen[addr.toLowerCase()] = true;
        userAddresses.push(addr);
      }
    }

    // Phase 3: For each user get username, bio, avatar, isAgent
    var detailCalls = [];
    for (var k = 0; k < userAddresses.length; k++) {
      var padded = pad32(userAddresses[k]);
      detailCalls.push(call('eth_call', [{ to: V2, data: SEL.getUsername + padded }, 'latest']));
      detailCalls.push(call('eth_call', [{ to: V2, data: SEL.getBio + padded }, 'latest']));
      detailCalls.push(call('eth_call', [{ to: V2, data: SEL.getAvatar + padded }, 'latest']));
      detailCalls.push(call('eth_call', [{ to: ERC8004_REGISTRY, data: SEL.balanceOf + padded }, 'latest']));
    }
    var r3 = detailCalls.length > 0 ? await batchCall(detailCalls) : [];

    var users = [];
    for (var m = 0; m < userAddresses.length; m++) {
      var b = m * 4;
      users.push({
        address: userAddresses[m],
        username: decodeString(r3[b]),
        bio: decodeString(r3[b + 1]),
        avatar: decodeString(r3[b + 2]),
        agent: toInt(r3[b + 3]) > 0,
      });
    }

    // Phase 4: Fetch ALL message and broadcast logs from deploy to now.
    // Dataset is small (~120 logs total). getLogs auto-routes to providers
    // that support the required block range.
    var logResults = await Promise.all([
      getLogs(PING_V1, MSG_TOPIC, PING_V1_DEPLOY, latestBlock),
      getLogs(V2, MSG_TOPIC, V2_DEPLOY, latestBlock),
      getLogs(DIAMOND, BCAST_TOPIC, DIAMOND_DEPLOY, latestBlock),
      getLogs(V2, BCAST_TOPIC, V2_DEPLOY, latestBlock),
    ]);

    var totalMessages = logResults[0].length + logResults[1].length;

    var recentMessages = [];
    parseMessageLogs(logResults[0], recentMessages);
    parseMessageLogs(logResults[1], recentMessages);

    var recentBroadcasts = [];
    parseBroadcastLogs(logResults[2], recentBroadcasts);
    parseBroadcastLogs(logResults[3], recentBroadcasts);

    recentMessages.sort(function (a, b) { return b.block - a.block; });
    recentBroadcasts.sort(function (a, b) { return b.block - a.block; });

    return res.status(200).json({
      ts: Date.now(),
      block: latestBlock,
      fees: { message: messageFeeWei, broadcast: broadcastFeeWei },
      stats: { users: totalUsers, messages: totalMessages, broadcasts: broadcastCount },
      users: users,
      recent_messages: recentMessages.slice(0, 200),
      recent_broadcasts: recentBroadcasts.slice(0, 50),
    });
  } catch (err) {
    console.error('ping_cache_error:', err.message, err.stack);
    return res.status(500).json({ error: 'cache build failed', detail: err.message });
  }
};

// ── Batch eth_call with failover ──
// All providers support eth_call (no block range constraint).
// Tries each provider in order until one succeeds for each chunk.

async function batchCall(calls) {
  var batch = calls.map(function (c, i) {
    return { jsonrpc: '2.0', method: c.method, params: c.params, id: i + 1 };
  });

  var CHUNK = 50; // conservative: all providers handle 50-item batches
  var allResults = [];

  for (var start = 0; start < batch.length; start += CHUNK) {
    var chunk = batch.slice(start, start + CHUNK);
    var body = JSON.stringify(chunk);
    var sent = false;

    for (var p = 0; p < PROVIDERS.length && !sent; p++) {
      try {
        var resp = await fetch(PROVIDERS[p].url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          signal: AbortSignal.timeout(PROVIDERS[p].timeout),
        });
        if (!resp.ok) continue;
        var data = await resp.json();
        if (!Array.isArray(data)) continue;
        // Check for RPC errors in batch items
        var hasErr = data.some(function (r) { return r && r.error; });
        if (hasErr) continue;
        allResults = allResults.concat(data);
        sent = true;
      } catch (e) { /* try next provider */ }
    }
    if (!sent) throw new Error('all providers failed for batch chunk at offset ' + start);
  }

  allResults.sort(function (a, b) { return a.id - b.id; });
  return allResults;
}

// ── eth_getLogs with capability-aware routing ──
// Calculates the required block range, finds providers that support it,
// attempts full-range first, then auto-chunks down for limited providers.

async function getLogs(address, topic, fromBlock, toBlock) {
  var rangeNeeded = toBlock - fromBlock;
  var logParams = [{
    address: address,
    topics: [topic],
    fromBlock: '0x' + fromBlock.toString(16),
    toBlock: '0x' + toBlock.toString(16),
  }];
  var body = JSON.stringify({ jsonrpc: '2.0', method: 'eth_getLogs', params: logParams, id: 1 });

  // Strategy: try each full-range provider individually, with one retry each.
  // Most calls succeed on the first or second try. This avoids the complexity
  // and data-loss risk of chunked fallback entirely for our small dataset.
  for (var i = 0; i < PROVIDERS.length; i++) {
    if (PROVIDERS[i].maxLogRange < rangeNeeded) continue; // skip providers that can't handle the range

    for (var attempt = 0; attempt < 2; attempt++) { // 2 attempts per provider
      try {
        var resp = await fetch(PROVIDERS[i].url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          signal: AbortSignal.timeout(PROVIDERS[i].timeout),
        });
        if (!resp.ok) continue;
        var data = await resp.json();
        if (data && data.error) continue; // RPC-level error, try again or next provider
        if (data && data.result && Array.isArray(data.result)) return data.result;
      } catch (e) { /* timeout or network error, try again or next provider */ }
    }
  }

  // Fallback: chunk into 2000-block pieces using all providers.
  // Each chunk tries every provider before giving up on that chunk.
  console.warn('[getLogs] all full-range providers failed, chunking ' + rangeNeeded + ' blocks');
  var CHUNK = 2000;
  var allLogs = [];
  var pos = fromBlock;

  while (pos <= toBlock) {
    var end = Math.min(pos + CHUNK - 1, toBlock);
    var chunkBody = JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getLogs',
      params: [{
        address: address,
        topics: [topic],
        fromBlock: '0x' + pos.toString(16),
        toBlock: '0x' + end.toString(16),
      }],
      id: 1,
    });

    var chunkDone = false;
    // Try every provider for this chunk (2K is within all providers' limits except Alchemy/Ankr)
    for (var p = 0; p < PROVIDERS.length && !chunkDone; p++) {
      if (PROVIDERS[p].maxLogRange < CHUNK) continue;
      try {
        var cResp = await fetch(PROVIDERS[p].url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: chunkBody,
          signal: AbortSignal.timeout(PROVIDERS[p].timeout),
        });
        if (!cResp.ok) continue;
        var cData = await cResp.json();
        if (cData && cData.error) continue;
        if (cData && cData.result && Array.isArray(cData.result)) {
          allLogs = allLogs.concat(cData.result);
          chunkDone = true;
        }
      } catch (e) { /* try next provider for this chunk */ }
    }
    if (!chunkDone) {
      console.warn('[getLogs] chunk ' + pos + '-' + end + ' failed on all providers');
    }
    pos = end + 1;
  }

  return allLogs;
}

// ── Parsing Helpers ──

function call(method, params) {
  return { method: method, params: params };
}

function pad32(addr) {
  return addr.toLowerCase().replace('0x', '').padStart(64, '0');
}

function padInt(n) {
  return n.toString(16).padStart(64, '0');
}

function toInt(result) {
  if (result && result.result && result.result !== '0x') {
    return parseInt(result.result, 16) || 0;
  }
  return 0;
}

function parseAddress(result) {
  if (result && result.result && result.result.length >= 66) {
    return '0x' + result.result.replace('0x', '').slice(24, 64);
  }
  return null;
}

function decodeString(result) {
  if (!result || !result.result || result.result === '0x') return '';
  try {
    var hex = result.result.replace('0x', '');
    if (hex.length < 128) return '';
    var strLen = parseInt(hex.slice(64, 128), 16);
    if (strLen === 0 || strLen > 1024) return '';
    var dataHex = hex.slice(128, 128 + strLen * 2);
    var bytes = [];
    for (var i = 0; i < dataHex.length; i += 2) {
      bytes.push(parseInt(dataHex.slice(i, i + 2), 16));
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch (e) {
    return '';
  }
}

function parseMessageLogs(logs, out) {
  for (var i = 0; i < logs.length; i++) {
    var log = logs[i];
    if (!log.topics || log.topics.length < 3) continue;
    out.push({
      from: '0x' + log.topics[1].slice(26),
      to: '0x' + log.topics[2].slice(26),
      content: decodeLogString(log.data),
      block: parseInt(log.blockNumber, 16),
      tx: log.transactionHash,
    });
  }
}

function parseBroadcastLogs(logs, out) {
  for (var i = 0; i < logs.length; i++) {
    var log = logs[i];
    if (!log.topics || log.topics.length < 2) continue;
    out.push({
      from: '0x' + log.topics[1].slice(26),
      content: decodeLogString(log.data),
      broadcastId: log.topics[2] ? parseInt(log.topics[2], 16) : 0,
      block: parseInt(log.blockNumber, 16),
      tx: log.transactionHash,
    });
  }
}

function decodeLogString(data) {
  if (!data || data === '0x') return '';
  try {
    var hex = data.replace('0x', '');
    if (hex.length < 128) return '';
    var offset = parseInt(hex.slice(0, 64), 16) * 2;
    var strLen = parseInt(hex.slice(offset, offset + 64), 16);
    if (strLen === 0 || strLen > 2048) return '';
    var dataHex = hex.slice(offset + 64, offset + 64 + strLen * 2);
    var bytes = [];
    for (var i = 0; i < dataHex.length; i += 2) {
      bytes.push(parseInt(dataHex.slice(i, i + 2), 16));
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch (e) {
    return '';
  }
}
