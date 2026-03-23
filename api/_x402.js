/* x402 payment gate for SIBYL intelligence endpoints.
   Implements HTTP 402 Payment Required protocol.
   No dependencies. USDC on Base via Coinbase CDP facilitator. */

var USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
var BANKR_WALLET = '0xe3e14118238b5693c854674f7c276136a2dd311f';
var FACILITATOR = 'https://x402.org/facilitator';
var BASE_RPC = 'https://mainnet.base.org';
var TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Track used tx hashes to prevent replay (resets on cold start, acceptable for Vercel)
var usedTxHashes = new Set();
// Track used from+nonce pairs to prevent cross-endpoint replay
var usedNonces = new Set();

// Demo rate limiter: 1 request per IP per 24 hours (resets on cold start)
var DEMO_LIMIT = 1;
var DEMO_WINDOW_MS = 24 * 60 * 60 * 1000;
var demoTracking = {};

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
    var ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
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
    if (usedTxHashes.has(txHash.toLowerCase())) {
      res.status(402).json({ error: 'transaction already used for a prior request' });
      return false;
    }

    try {
      // Fetch tx receipt from Base RPC
      var receiptResp = await fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] })
      });
      var receiptJson = await receiptResp.json();
      var receipt = receiptJson.result;

      if (!receipt) {
        res.status(402).json({ error: 'transaction not found. it may still be confirming.' });
        return false;
      }
      if (receipt.status !== '0x1') {
        res.status(402).json({ error: 'transaction reverted on-chain' });
        return false;
      }

      // Find USDC Transfer event to BANKR_WALLET with sufficient value
      var bankrPadded = '0x' + BANKR_WALLET.slice(2).toLowerCase().padStart(64, '0');
      var validTransfer = false;

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
            break;
          }
        }
      }

      if (!validTransfer) {
        res.status(402).json({ error: 'no valid USDC transfer to SIBYL found in this transaction' });
        return false;
      }

      // Check recency: tx must be < 2 minutes old (tightened from 5 min)
      var blockResp = await fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: [receipt.blockNumber, false] },
          { jsonrpc: '2.0', id: 3, method: 'eth_getTransactionByHash', params: [txHash] }
        ])
      });
      var batchJson = await blockResp.json();
      var blockResult = Array.isArray(batchJson) ? batchJson.find(function(r) { return r.id === 2; }) : batchJson;
      var txResult = Array.isArray(batchJson) ? batchJson.find(function(r) { return r.id === 3; }) : null;
      var block = blockResult ? blockResult.result : null;

      if (block) {
        var blockTime = parseInt(block.timestamp, 16);
        var now = Math.floor(Date.now() / 1000);
        if (now - blockTime > 120) {
          res.status(402).json({ error: 'transaction too old (>2 minutes). submit a fresh transfer.' });
          return false;
        }
      }

      // Check from+nonce uniqueness to prevent cross-endpoint replay
      if (txResult && txResult.result) {
        var txData = txResult.result;
        var nonceKey = (txData.from || '').toLowerCase() + ':' + txData.nonce;
        if (usedNonces.has(nonceKey)) {
          res.status(402).json({ error: 'transaction nonce already used for a prior request' });
          return false;
        }
        usedNonces.add(nonceKey);
      }

      // Mark as used, allow request through
      usedTxHashes.add(txHash.toLowerCase());
      console.log('x402_direct_payment: verified tx', txHash, 'for', priceUnits / 1e6, 'USDC');
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
