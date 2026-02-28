/* x402 payment gate for SIBYL intelligence endpoints.
   Implements HTTP 402 Payment Required protocol.
   No dependencies. USDC on Base via Coinbase CDP facilitator. */

var USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
var BANKR_WALLET = '0xe3e14118238b5693c854674f7c276136a2dd311f';
var FACILITATOR = 'https://x402.org/facilitator';

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
 * @param {object} opts - { priceUsd: number, description: string }
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

  var payment = req.headers['x-payment'];
  var priceUnits = Math.round(opts.priceUsd * 1e6); // USDC has 6 decimals

  var requirements = {
    scheme: 'exact',
    network: 'eip155:8453',
    maxAmountRequired: String(priceUnits),
    asset: USDC_BASE,
    payTo: BANKR_WALLET,
    resource: 'https://sibylcap.com' + req.url,
    description: opts.description || 'SIBYL intelligence endpoint'
  };

  if (!payment) {
    res.status(402).json({
      x402Version: 1,
      accepts: [requirements],
      error: 'payment required',
      agent: {
        id: 20880,
        registry: 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
        identityWallet: '0x4069ef1afC8A9b2a29117A3740fCAB2912499fBe',
        paymentWallet: BANKR_WALLET,
        walletNote: 'Identity and payment wallets are intentionally separate. The identity wallet (self-custody) holds the ERC-8004 NFT. The payment wallet (Bankr-managed) receives x402 fees. Verify at: https://sibylcap.com/.well-known/agent-registration.json'
      }
    });
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

module.exports = { gate };
