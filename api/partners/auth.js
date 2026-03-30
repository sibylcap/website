/* Advisory Partner Dashboard: Auth endpoints.
   POST /api/partners/auth?action=nonce  — get a SIWE nonce
   POST /api/partners/auth?action=verify — verify SIWE signature, get JWT
   GET  /api/partners/auth               — get current session (me) */

var db = require('../_lib/partners-db');
var auth = require('../_lib/partners-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET: return current session
    if (req.method === 'GET') {
      var user = auth.extractUser(req);
      if (!user) return res.status(401).json({ error: 'not authenticated' });
      var project = await db.getProjectById(user.project_id);
      if (!project) return res.status(401).json({ error: 'project not found' });
      return res.json({ address: user.address, project: project });
    }

    // POST: nonce or verify
    if (req.method === 'POST') {
      var action = req.query.action;

      if (action === 'nonce') {
        var { address } = req.body || {};
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
          return res.status(400).json({ error: 'invalid address' });
        }
        // Check wallet is a registered partner
        var project = await db.getProjectByWallet(address);
        if (!project) {
          return res.status(403).json({ error: 'wallet not registered as a partner' });
        }
        var nonce = await db.createNonce(address);
        return res.json({ nonce: nonce });
      }

      if (action === 'verify') {
        var { message, signature } = req.body || {};
        if (!message || !signature) {
          return res.status(400).json({ error: 'missing message or signature' });
        }
        var result = await auth.verifySiwe(message, signature);
        if (!result) {
          return res.status(401).json({ error: 'invalid signature' });
        }
        // Check nonce
        var nonceRecord = await db.consumeNonce(result.nonce);
        if (!nonceRecord) {
          return res.status(401).json({ error: 'invalid or expired nonce' });
        }
        // Check wallet is registered
        var project = await db.getProjectByWallet(result.address);
        if (!project) {
          return res.status(403).json({ error: 'wallet not registered as a partner' });
        }
        var token = auth.signToken({ address: result.address, project_id: project.id });
        return res.json({ token: token, project: project });
      }

      return res.status(400).json({ error: 'unknown action. use ?action=nonce or ?action=verify' });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('[partners/auth] error:', err.message, err.stack);
    return res.status(500).json({ error: 'internal error', detail: err.message });
  }
};
