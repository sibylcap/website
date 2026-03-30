/* Creates a Stripe Checkout Session for x402 service payment.
   POST /api/stripe-session
   Body: { service: "check", params: { token: "0x..." } }
   Returns: { url: "https://checkout.stripe.com/..." } */

var Stripe = require('stripe');

// Service prices in USD cents
var PRICES = {
  advisory: 50,
  fund: 100,
  pingcast: 200,
  report: 500
};

// Friendly names for Stripe line items
var NAMES = {
  advisory: 'Advisory Session',
  fund: 'ETH On-Ramp',
  pingcast: 'Pingcast Broadcast',
  report: 'Intelligence Report'
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  var stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  var body = req.body;
  if (!body || !body.service) {
    res.status(400).json({ error: 'missing service' });
    return;
  }

  var service = body.service;
  var priceCents = PRICES[service];

  if (!priceCents) {
    res.status(400).json({ error: 'service not eligible for card payment. minimum $0.50.' });
    return;
  }

  // Pingcast dynamic pricing: base $2 but could be higher
  if (service === 'pingcast' && body.priceCents && body.priceCents >= 200) {
    priceCents = body.priceCents;
  }

  var params = body.params || {};

  try {
    var session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: NAMES[service] || 'SIBYL x402 Service',
            description: 'sibylcap.com/x402'
          },
          unit_amount: priceCents
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: 'https://sibylcap.com/x402?stripe_session={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://sibylcap.com/x402',
      metadata: {
        service: service,
        params: JSON.stringify(params),
        redeemed: 'false'
      }
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('stripe_session_error:', err.message);
    res.status(500).json({ error: 'failed to create checkout session' });
  }
};
