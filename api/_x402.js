/* x402 payment gate — REBUILD (sandbox candidate, NOT deployed).
   Fixes found 2026-06-03 against the live sibyl-score endpoint:
     [F1] advertised network "eip155:8453" -> SDK throws "Unsupported network". FIX: advertise "base".
     [F2] advertised x402Version 2 -> x402 lib supports only v1. FIX: advertise 1.
     [F3] facilitator POST body was { payment:<base64> } -> facilitator wants
          { x402Version, paymentPayload:<decoded>, paymentRequirements }. FIX: decode + reshape.
     [F4] FACILITATOR url x402.org/facilitator now 308-redirects. FIX: config constant, operator picks.
     [F5] ACCEPT-EITHER: tolerate network base|eip155:8453 and x402Version 1|2 on input.
     [F6] paid responses were not no-store -> replay/cache risk. FIX: Cache-Control no-store set by gate.
   Direct-tx (X-PAYMENT-TX) + replay (_replay.js) logic preserved unchanged.
   OPEN DECISION (operator/Acer): which facilitator settles (Coinbase CDP w/ keys, or self-host
   settler w/ a gas wallet). Until chosen, the standard X-PAYMENT path verifies shape but may not
   settle; the direct-tx path is the working path today. */

var replay = require('./_replay');

var USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
var BANKR_WALLET = '0xe3e14118238b5693c854674f7c276136a2dd311f';
// [F4] operator decision pending. CDP facilitator needs keys; self-host needs a gas wallet.
var FACILITATOR = process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator';
var BASE_RPC = 'https://mainnet.base.org';
var TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
var DIRECT_TX_MAX_AGE_SECONDS = 120;

var DEMO_LIMIT = 1;
var DEMO_WINDOW_MS = 24 * 60 * 60 * 1000;
var demoTracking = {};

// [F1][F5] canonical short network names; tolerate CAIP-2 on input.
function normalizeNetwork(n) {
  if (n === 'eip155:8453') return 'base';
  if (n === 'eip155:84532') return 'base-sepolia';
  return n || 'base';
}

function getClientIp(req) {
  var h = req.headers || {};
  var ip = h['x-real-ip']
        || (h['x-vercel-forwarded-for'] || '').split(',')[0].trim()
        || (h['x-forwarded-for'] || '').split(',')[0].trim();
  return (ip || 'unknown').toLowerCase();
}

// Build the payment requirement we advertise + verify against.
function buildRequirements(req, opts) {
  var priceUnits = Math.round(opts.priceUsd * 1e6);
  return {
    scheme: 'exact',
    network: 'base',                       // [F1] was 'eip155:8453'
    maxAmountRequired: String(priceUnits),
    asset: USDC_BASE,
    payTo: BANKR_WALLET,
    resource: 'https://sibylcap.com' + (req.url || ''),
    description: opts.description || 'SIBYL intelligence endpoint',
    maxTimeoutSeconds: 600,
    extra: { name: 'USD Coin', version: '2' }   // USDC EIP-712 domain name/version (unchanged)
  };
}

function build402Body(requirements, opts, req) {
  var response = {
    x402Version: 1,                        // [F2] was 2
    accepts: [requirements],
    error: 'payment required',
    agent: {
      id: 20880,
      registry: 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      identityWallet: '0x4069ef1afC8A9b2a29117A3740fCAB2912499fBe',
      paymentWallet: BANKR_WALLET,
      walletNote: 'Identity and payment wallets are intentionally separate. Verify at: https://sibylcap.com/.well-known/agent-registration.json'
    }
  };
  // Direct-tx hint so integrators know the simpler path exists.
  response.alt = {
    directTx: {
      header: 'X-PAYMENT-TX',
      instructions: 'Send maxAmountRequired (USDC, 6dp) to payTo on Base, then resend with header X-PAYMENT-TX:<txHash> within ' + DIRECT_TX_MAX_AGE_SECONDS + 's. Single-use.'
    }
  };
  if (opts.discovery) {
    var method = (req.method || 'GET').toUpperCase();
    var isBodyMethod = method === 'POST' || method === 'PUT' || method === 'PATCH';
    var inputInfo = isBodyMethod
      ? { type: 'http', method: method, body: opts.discovery.input || {}, bodyType: 'json' }
      : { type: 'http', method: method, queryParams: opts.discovery.input || {} };
    response.extensions = { bazaar: { info: { input: inputInfo, inputSchema: opts.discovery.inputSchema || {}, output: opts.discovery.output || {} },
      schema: { type: 'object', properties: { input: { type: 'object' }, inputSchema: { type: 'object' }, output: { type: 'object' } } } } };
  }
  return response;
}

async function gate(req, res, opts) {
  // [F6] paid endpoint responses must never be cached or replay-served.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  if (req.query && req.query.demo === 'true') {
    var ip = getClientIp(req);
    var now = Date.now();
    if (!demoTracking[ip] || now - demoTracking[ip].start > DEMO_WINDOW_MS) demoTracking[ip] = { start: now, count: 0 };
    demoTracking[ip].count++;
    if (demoTracking[ip].count > DEMO_LIMIT) { res.status(429).json({ error: 'demo limit reached. 1 free request per 24 hours. pay with x402 for unlimited access.' }); return false; }
    return true;
  }

  var priceUnits = Math.round(opts.priceUsd * 1e6);

  // --- Direct USDC transfer path (X-PAYMENT-TX) — preserved, the working path today ---
  var txHash = req.headers['x-payment-tx'];
  if (txHash) {
    try {
      var batchResp = await fetch(BASE_RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] },
          { jsonrpc: '2.0', id: 3, method: 'eth_getTransactionByHash', params: [txHash] }
        ]) });
      var batchJson = await batchResp.json();
      var receiptWrap = Array.isArray(batchJson) ? batchJson.find(function (r) { return r.id === 1; }) : batchJson;
      var txWrap = Array.isArray(batchJson) ? batchJson.find(function (r) { return r.id === 3; }) : null;
      var receipt = receiptWrap ? receiptWrap.result : null;
      var txData = txWrap ? txWrap.result : null;
      if (!receipt) { res.status(402).json({ error: 'transaction not found. it may still be confirming.' }); return false; }
      if (receipt.status !== '0x1') { res.status(402).json({ error: 'transaction reverted on-chain' }); return false; }

      var bankrPadded = '0x' + BANKR_WALLET.slice(2).toLowerCase().padStart(64, '0');
      var validTransfer = false, transferredValue = 0;
      for (var i = 0; i < (receipt.logs || []).length; i++) {
        var log = receipt.logs[i];
        if (log.address.toLowerCase() === USDC_BASE.toLowerCase() && log.topics && log.topics.length >= 3 &&
            log.topics[0] === TRANSFER_TOPIC && log.topics[2].toLowerCase() === bankrPadded) {
          var tv = parseInt(log.data, 16);
          if (tv >= priceUnits) { validTransfer = true; transferredValue = tv; break; }
        }
      }
      if (!validTransfer) { res.status(402).json({ error: 'no valid USDC transfer to SIBYL found in this transaction' }); return false; }

      var blockResp = await fetch(BASE_RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: [receipt.blockNumber, false] }) });
      var block = (await blockResp.json()).result;
      if (block) {
        var nowSec = Math.floor(Date.now() / 1000);
        if (nowSec - parseInt(block.timestamp, 16) > DIRECT_TX_MAX_AGE_SECONDS) { res.status(402).json({ error: 'transaction too old (>' + DIRECT_TX_MAX_AGE_SECONDS + ' seconds). submit a fresh transfer.' }); return false; }
      }

      var fromAddr = txData ? txData.from : null;
      var nonceHex = txData ? txData.nonce : null;
      var isFresh;
      try {
        isFresh = await replay.markTxUsed(txHash, { resource: 'https://sibylcap.com' + (req.url || ''), fromAddr: fromAddr, nonce: nonceHex, amountUsdc: transferredValue / 1e6 });
      } catch (dbErr) {
        // [F6-related] replay DB MUST be reachable. Fail CLOSED (was 503 — keep, do not allow on db error).
        console.error('x402_replay_db_error:', dbErr.message);
        res.status(503).json({ error: 'payment verification unavailable, retry shortly' });
        return false;
      }
      if (!isFresh) { res.status(402).json({ error: 'transaction already used for a prior request' }); return false; }

      if (fromAddr && nonceHex !== null && nonceHex !== undefined) {
        try { var nf = await replay.markNonceUsed(fromAddr, nonceHex, txHash); if (!nf) { res.status(402).json({ error: 'payment nonce already used for a prior request' }); return false; } }
        catch (e2) { console.error('x402_nonce_db_error:', e2.message); }
      }
      console.log('x402_direct_payment: verified tx', txHash, 'for', transferredValue / 1e6, 'USDC from', fromAddr);
      return true;
    } catch (err) { console.error('x402_tx_verify_error:', err.message); res.status(500).json({ error: 'transaction verification failed' }); return false; }
  }

  // --- Standard x402 facilitator path (X-PAYMENT) ---
  var payment = req.headers['x-payment'];
  var requirements = buildRequirements(req, opts);

  if (!payment) { res.status(402).json(build402Body(requirements, opts, req)); return false; }

  try {
    // [F3][F5] decode the base64 header into a payload object; normalize network + version.
    var paymentPayload;
    try { paymentPayload = JSON.parse(Buffer.from(payment, 'base64').toString('utf8')); }
    catch (e) { res.status(402).json({ error: 'malformed X-PAYMENT header (expected base64 JSON)', accepts: [requirements] }); return false; }
    if (paymentPayload && paymentPayload.network) paymentPayload.network = normalizeNetwork(paymentPayload.network);
    paymentPayload.x402Version = 1;        // [F5] tolerate v2 input, settle as v1

    var facBody = JSON.stringify({ x402Version: 1, paymentPayload: paymentPayload, paymentRequirements: requirements });

    var verifyResp = await fetch(FACILITATOR + '/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: facBody });
    if (!verifyResp.ok) { console.error('x402_verify_failed:', verifyResp.status, await verifyResp.text()); res.status(402).json({ error: 'payment verification failed', accepts: [requirements] }); return false; }
    var verifyData = await verifyResp.json();
    if (verifyData && verifyData.isValid === false) { res.status(402).json({ error: 'payment invalid: ' + (verifyData.invalidReason || 'unknown'), accepts: [requirements] }); return false; }

    var settleResp = await fetch(FACILITATOR + '/settle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: facBody });
    if (!settleResp.ok) { console.error('x402_settle_failed:', settleResp.status, await settleResp.text()); res.status(402).json({ error: 'payment settlement failed', accepts: [requirements] }); return false; }
    res.setHeader('X-PAYMENT-RESPONSE', JSON.stringify(await settleResp.json()));
    return true;
  } catch (err) { console.error('x402_gate_error:', err.message); res.status(500).json({ error: 'payment processing error' }); return false; }
}

function discovery(req, res, opts) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  var requirements = buildRequirements(req, opts);
  requirements.resource = 'https://sibylcap.com' + (req.url || '').split('?')[0];
  res.status(402).json(build402Body(requirements, opts, req));
}

module.exports = { gate: gate, discovery: discovery, normalizeNetwork: normalizeNetwork, buildRequirements: buildRequirements };
