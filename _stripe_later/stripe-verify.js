/* Verifies a Stripe Checkout Session and proxies the paid API call.
   GET /api/stripe-verify?session_id=cs_xxx
   Returns: the API result from the proxied endpoint */

var Stripe = require('stripe');

// Map service IDs to API paths
var SERVICE_PATHS = {
  advisory: '/api/advisory',
  fund: '/api/fund',
  pingcast: '/api/pingcast',
  report: '/api/report'
};

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' });
    return;
  }

  var sessionId = req.query.session_id;
  if (!sessionId) {
    res.status(400).json({ error: 'missing session_id' });
    return;
  }

  var stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    // Retrieve the session
    var session = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify payment
    if (session.payment_status !== 'paid') {
      res.status(402).json({ error: 'payment not completed' });
      return;
    }

    // Check if already redeemed
    if (session.metadata.redeemed === 'true') {
      res.status(410).json({ error: 'session already redeemed' });
      return;
    }

    // Extract service info
    var service = session.metadata.service;
    var params = {};
    try {
      params = JSON.parse(session.metadata.params || '{}');
    } catch (e) {
      // ignore parse error, use empty params
    }

    var apiPath = SERVICE_PATHS[service];
    if (!apiPath) {
      res.status(400).json({ error: 'unknown service: ' + service });
      return;
    }

    // Mark as redeemed before proxying (prevent double-spend)
    await stripe.checkout.sessions.update(sessionId, {
      metadata: {
        service: session.metadata.service,
        params: session.metadata.params,
        redeemed: 'true'
      }
    });

    // Build query string from params
    var qs = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');

    var baseUrl = process.env.VERCEL_URL
      ? 'https://' + process.env.VERCEL_URL
      : 'https://sibylcap.com';

    var url = baseUrl + apiPath + (qs ? '?' + qs : '');

    // Proxy the request with internal bypass key
    var apiResp = await fetch(url, {
      method: 'GET',
      headers: {
        'X-INTERNAL-KEY': process.env.INTERNAL_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    var data = await apiResp.json();
    res.status(apiResp.status).json(data);

  } catch (err) {
    console.error('stripe_verify_error:', err.message);

    // If it's a Stripe error (invalid session, etc.)
    if (err.type && err.type.startsWith('Stripe')) {
      res.status(400).json({ error: 'invalid session' });
      return;
    }

    res.status(500).json({ error: 'verification failed' });
  }
};
