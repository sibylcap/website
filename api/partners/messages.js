/* Advisory Partner Dashboard: Messages endpoint.
   GET  /api/partners/messages              — list messages (optional ?limit=50&before=ID)
   POST /api/partners/messages              — send a message */

var db = require('../_lib/partners-db');
var auth = require('../_lib/partners-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var user = auth.extractUser(req);
    if (!user) return res.status(401).json({ error: 'not authenticated' });

    if (req.method === 'GET') {
      var opts = {};
      if (req.query.limit) opts.limit = Math.min(parseInt(req.query.limit) || 50, 100);
      if (req.query.before) opts.before = parseInt(req.query.before);
      var messages = await db.getMessages(user.project_id, opts);
      return res.json({ messages: messages });
    }

    if (req.method === 'POST') {
      var { body } = req.body || {};
      if (!body || !body.trim()) {
        return res.status(400).json({ error: 'message body is required' });
      }
      var msg = await db.createMessage({
        project_id: user.project_id,
        sender: user.address,
        body: body.trim(),
      });
      return res.json({ message: msg });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('[partners/messages] error:', err.message);
    return res.status(500).json({ error: 'internal error' });
  }
};
