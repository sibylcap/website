/* x402 payment gate for SIBYL intelligence endpoints.
   Implements HTTP 402 Payment Required protocol.
   USDC on Base via Coinbase CDP facilitator, with direct-tx fallback path.

   REPLAY PROTECTION: Used tx_hash + (from, nonce) pairs are persisted in Neon
   Postgres via _replay.js. Atomic INSERT ON CONFLICT semantics — a second
   attempt on the same tx_hash fails deterministically, across Vercel cold
   starts. Previously used in-memory Sets that reset on Lambda cycling. */

var replay = require('./_replay');

var USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
var BANKR_WALLET = '0xe3e14118238b5693c854674f7c276136a2dd311f';
var FACILITATOR = 'https://x402.org/facilitator';
var BASE_RPC = 'https://mainnet.base.org';
var TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Recency window for direct-tx payments. Tight = small race window.
var DIRECT_TX_MAX_AGE_SECONDS = 120;

// Demo rate limiter: 1 request per client IP per 24 hours.
// In-memory tracking resets on cold start (acceptable — demo payload is small).
// IP sourced from Vercel-trusted headers: x-real-ip (primary), then
// x-vercel-forwarded-for (fallback), then x-forwarded-for (local dev only).
// x-forwarded-for is client-spoofable and never the primary source on Vercel.
var DEMO_LIMIT = 1;
var DEMO_WINDOW_MS = 24 * 60 * 60 * 1000;
var demoTracking = {};

function getClientIp(req) {
  var h = req.headers || {};
  var ip = h['x-real-ip']
        || (h['x-vercel-forwarded-for'] || '').split(',')[0].trim()
        || (h['x-forwarded-for'] || '').split(',')[0].trim();
  return (ip || 'unknown').toLowerCase();
}

/**
 * Payment gate. Call at top of handler.
 * Returns true if request should proceed (paid or demo).
 * Returns false if 402 response was sent (caller should return immediately).
 *
 * @param {object} req - Vercel request
 * @param {object} res - Vercel response
 * @param {object} opts - { priceUsd, description, discovery }
 *   discovery (optional): { input, inputSchema, output } for Bazaar listing
 * @returns {Promise<boolean>}
 */
async function gate(req, res, opts) {
  // Demo mode bypasses payment but is rate-limited per IP.
  if (req.query && req.query.demo === 'true') {
    var ip = getClientIp(req);
    var now = Date.now();
    if (!demoTracking[ip] || now - demoTracking[ip].start > DEMO_WINDOW_MS) {
      demoTracking[ip] = { start: now, count: 0 };
    }
    demoTracking[ip].count++;
    if (demoTracking[ip].count > DEMO_LIMIT) {
      res.status(429).json({ error: 'demo limit reached. 1 free request per 24 hours. pay with x402 for unlimited access.' });
      return false;
    }
    return true;
  }

  var priceUnits = Math.round(opts.priceUsd * 1e6); // USDC has 6 decimals

  // Direct USDC transfer verification (human payment gateway)
  var txHash = req.headers['x-payment-tx'];
  if (txHash) {
    try {
      // 1. Fetch tx receipt + tx data (batched). Needed for amount, block, nonce.
      var batchResp = await fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] },
          { jsonrpc: '2.0', id: 3, method: 'eth_getTransactionByHash', params: [txHash] }
        ])
      });
      var batchJson = await batchResp.json();
      var receiptWrap = Array.isArray(batchJson) ? batchJson.find(function(r) { return r.id === 1; }) : batchJson;
      var txWrap = Array.isArray(batchJson) ? batchJson.find(function(r) { return r.id === 3; }) : null;
      var receipt = receiptWrap ? receiptWrap.result : null;
      var txData = txWrap ? txWrap.result : null;

      if (!receipt) {
        res.status(402).json({ error: 'transaction not found. it may still be confirming.' });
        return false;
      }
      if (receipt.status !== '0x1') {
        res.status(402).json({ error: 'transaction reverted on-chain' });
        return false;
      }

      // 2. Find USDC Transfer event to BANKR_WALLET with sufficient value
      var bankrPadded = '0x' + BANKR_WALLET.slice(2).toLowerCase().padStart(64, '0');
      var validTransfer = false;
      var transferredValue = 0;

      for (var i = 0; i < (receipt.logs || []).length; i++) {
        var log = receipt.logs[i];
        if (
          log.address.toLowerCase() === USDC_BASE.toLowerCase() &&
          log.topics && log.topics.length >= 3 &&
          log.topics[0] === TRANSFER_TOPIC &&
          log.topics[2].toLowerCase() === bankrPadded
        ) {
          var transferValue = parseInt(log.data, 16);
          if (transferValue >= priceUnits) {
            validTransfer = true;
            transferredValue = transferValue;
            break;
          }
        }
      }

      if (!validTransfer) {
        res.status(402).json({ error: 'no valid USDC transfer to SIBYL found in this transaction' });
        return false;
      }

      // 3. Check recency. Fetch block timestamp for the receipt's block.
      var blockResp = await fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: [receipt.blockNumber, false] })
      });
      var blockJson = await blockResp.json();
      var block = blockJson.result;

      if (block) {
        var blockTime = parseInt(block.timestamp, 16);
        var nowSec = Math.floor(Date.now() / 1000);
        if (nowSec - blockTime > DIRECT_TX_MAX_AGE_SECONDS) {
          res.status(402).json({ error: 'transaction too old (>' + DIRECT_TX_MAX_AGE_SECONDS + ' seconds). submit a fresh transfer.' });
          return false;
        }
      }

      // 4. ATOMIC CLAIM. Persistent replay prevention across cold starts.
      //    markTxUsed returns false if tx_hash was already consumed.
      var fromAddr = txData ? txData.from : null;
      var nonceHex = txData ? txData.nonce : null;
      var isFresh;
      try {
        isFresh = await replay.markTxUsed(txHash, {
          resource: 'https://sibylcap.com' + (req.url || ''),
          fromAddr: fromAddr,
          nonce: nonceHex,
          amountUsdc: transferredValue / 1e6,
        });
      } catch (dbErr) {
        console.error('x402_replay_db_error:', dbErr.message);
        res.status(503).json({ error: 'payment verification unavailable, retry shortly' });
        return false;
      }
      if (!isFresh) {
        res.status(402).json({ error: 'transaction already used for a prior request' });
        return false;
      }

      // 5. Belt-and-suspenders: (from, nonce) pair uniqueness.
      if (fromAddr && nonceHex !== null && nonceHex !== undefined) {
        try {
          var nonceFresh = await replay.markNonceUsed(fromAddr, nonceHex, txHash);
          if (!nonceFresh) {
            // tx_hash was claimed above, but (from, nonce) was already used elsewhere.
            // Unusual — indicates a reorg or hash collision. Reject conservatively.
            res.status(402).json({ error: 'payment nonce already used for a prior request' });
            return false;
          }
        } catch (dbErr) {
          // Nonce check is defense-in-depth only. Log and continue since tx_hash
          // claim already succeeded atomically.
          console.error('x402_nonce_db_error:', dbErr.message);
        }
      }

      console.log('x402_direct_payment: verified tx', txHash, 'for', transferredValue / 1e6, 'USDC from', fromAddr);
      return true;

    } catch (err) {
      console.error('x402_tx_verify_error:', err.message);
      res.status(500).json({ error: 'transaction verification failed' });
      return false;
    }
  }

  var payment = req.headers['x-payment'];

  var requirements = {
    scheme: 'exact',
    network: 'eip155:8453',
    maxAmountRequired: String(priceUnits),
    asset: USDC_BASE,
    payTo: BANKR_WALLET,
    resource: 'https://sibylcap.com' + req.url,
    description: opts.description || 'SIBYL intelligence endpoint',
    maxTimeoutSeconds: 600,
    extra: { name: 'USD Coin', version: '2' }
  };

  if (!payment) {
    var response = {
      x402Version: 2,
      accepts: [requirements],
      error: 'payment required',
      agent: {
        id: 20880,
        registry: 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
        identityWallet: '0x4069ef1afC8A9b2a29117A3740fCAB2912499fBe',
        paymentWallet: BANKR_WALLET,
        walletNote: 'Identity and payment wallets are intentionally separate. The identity wallet (self-custody) holds the ERC-8004 NFT. The payment wallet (Bankr-managed) receives x402 fees. Verify at: https://sibylcap.com/.well-known/agent-registration.json'
      }
    };

    // Bazaar discovery extension: makes this endpoint discoverable by facilitator catalogs
    if (opts.discovery) {
      var method = (req.method || 'GET').toUpperCase();
      var isBodyMethod = method === 'POST' || method === 'PUT' || method === 'PATCH';
      var inputInfo = isBodyMethod
        ? { type: 'http', method: method, body: opts.discovery.input || {}, bodyType: 'json' }
        : { type: 'http', method: method, queryParams: opts.discovery.input || {} };
      response.extensions = {
        bazaar: {
          info: {
            input: inputInfo,
            inputSchema: opts.discovery.inputSchema || {},
            output: opts.discovery.output || {}
          },
          schema: {
            type: 'object',
            properties: {
              input: { type: 'object' },
              inputSchema: { type: 'object' },
              output: { type: 'object' }
            }
          }
        }
      };
    }

    res.status(402).json(response);
    return false;
  }

  // Verify and settle with facilitator
  try {
    var verifyResp = await fetch(FACILITATOR + '/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment: payment, paymentRequirements: requirements })
    });

    if (!verifyResp.ok) {
      var verifyErr = await verifyResp.text();
      console.error('x402_verify_failed:', verifyResp.status, verifyErr);
      res.status(402).json({ error: 'payment verification failed', accepts: [requirements] });
      return false;
    }

    var settleResp = await fetch(FACILITATOR + '/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment: payment, paymentRequirements: requirements })
    });

    if (!settleResp.ok) {
      var settleErr = await settleResp.text();
      console.error('x402_settle_failed:', settleResp.status, settleErr);
      res.status(402).json({ error: 'payment settlement failed', accepts: [requirements] });
      return false;
    }

    var settleData = await settleResp.json();
    res.setHeader('X-PAYMENT-RESPONSE', JSON.stringify(settleData));
    return true;

  } catch (err) {
    console.error('x402_gate_error:', err.message);
    res.status(500).json({ error: 'payment processing error' });
    return false;
  }
}

/**
 * Return a 402 discovery response without checking for payment.
 * Use when required params are missing and no payment/demo attempt is active.
 * This ensures x402 scanners and health checkers see a live endpoint.
 *
 * @param {object} req - Vercel request
 * @param {object} res - Vercel response
 * @param {object} opts - { priceUsd, description, discovery }
 */
function discovery(req, res, opts) {
  var priceUnits = Math.round(opts.priceUsd * 1e6);

  var requirements = {
    scheme: 'exact',
    network: 'eip155:8453',
    maxAmountRequired: String(priceUnits),
    asset: USDC_BASE,
    payTo: BANKR_WALLET,
    resource: 'https://sibylcap.com' + (req.url || '').split('?')[0],
    description: opts.description || 'SIBYL intelligence endpoint',
    maxTimeoutSeconds: 600,
    extra: { name: 'USD Coin', version: '2' }
  };

  var response = {
    x402Version: 2,
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

  if (opts.discovery) {
    var method = (req.method || 'GET').toUpperCase();
    var isBodyMethod = method === 'POST' || method === 'PUT' || method === 'PATCH';
    var inputInfo = isBodyMethod
      ? { type: 'http', method: method, body: opts.discovery.input || {}, bodyType: 'json' }
      : { type: 'http', method: method, queryParams: opts.discovery.input || {} };
    response.extensions = {
      bazaar: {
        info: {
          input: inputInfo,
          inputSchema: opts.discovery.inputSchema || {},
          output: opts.discovery.output || {}
        },
        schema: {
          type: 'object',
          properties: {
            input: { type: 'object' },
            inputSchema: { type: 'object' },
            output: { type: 'object' }
          }
        }
      }
    };
  }

  res.status(402).json(response);
}

module.exports = { gate, discovery };
