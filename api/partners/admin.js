/* Advisory Partner Dashboard: Admin endpoints (SIBYL writes here).
   All routes require X-Admin-Key header matching ADVISORY_ADMIN_KEY env var.

   GET  /api/partners/admin?action=projects                    — list all projects
   GET  /api/partners/admin?action=updates&project_id=X        — get recent task updates for a project
   POST /api/partners/admin?action=create-project              — register a partner
   POST /api/partners/admin?action=create-session              — create advisory session
   POST /api/partners/admin?action=create-task                 — create a task
   POST /api/partners/admin?action=update-task                 — update any task field
   POST /api/partners/admin?action=update-session              — update session status/summary
   POST /api/partners/admin?action=send-message                — send message as SIBYL */

var db = require('../_lib/partners-db');
var auth = require('../_lib/partners-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!auth.isAdmin(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  try {
    var action = req.query.action;

    // ── GET routes ──────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      if (action === 'projects') {
        var projects = await db.getAllProjects();
        var result = [];
        for (var p of projects) {
          var counts = await db.getTaskCountsByProject(p.id);
          result.push(Object.assign({}, p, { taskCounts: counts }));
        }
        return res.json({ projects: result });
      }

      if (action === 'updates') {
        var pid = req.query.project_id;
        if (!pid) return res.status(400).json({ error: 'project_id required' });
        var tasks = await db.getTasksByProject(pid);
        var messages = await db.getMessages(pid, { limit: 20 });
        var founderMessages = messages.filter(function(m) { return m.sender !== 'sibyl'; });
        var recentTasks = tasks.filter(function(t) {
          return t.updated_at && new Date(t.updated_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        });
        return res.json({ recentTasks: recentTasks, founderMessages: founderMessages });
      }

      return res.status(400).json({ error: 'unknown action' });
    }

    // ── POST routes ─────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      var body = req.body || {};

      if (action === 'create-project') {
        if (!body.id || !body.name || !body.wallet) {
          return res.status(400).json({ error: 'id, name, and wallet are required' });
        }
        var project = await db.createProject(body);
        return res.json({ project: project });
      }

      if (action === 'create-session') {
        if (!body.project_id || !body.title) {
          return res.status(400).json({ error: 'project_id and title are required' });
        }
        var session = await db.createSession(body);
        return res.json({ session: session });
      }

      if (action === 'create-task') {
        if (!body.session_id || !body.project_id || !body.title) {
          return res.status(400).json({ error: 'session_id, project_id, and title are required' });
        }
        var task = await db.createTask(body);
        return res.json({ task: task });
      }

      if (action === 'update-task') {
        if (!body.id) return res.status(400).json({ error: 'task id is required' });
        var updated = await db.adminUpdateTask(body.id, body);
        return res.json({ task: updated });
      }

      if (action === 'update-session') {
        if (!body.id) return res.status(400).json({ error: 'session id is required' });
        var updated = await db.updateSession(body.id, body);
        return res.json({ session: updated });
      }

      if (action === 'send-message') {
        if (!body.project_id || !body.body) {
          return res.status(400).json({ error: 'project_id and body are required' });
        }
        var msg = await db.createMessage({
          project_id: body.project_id,
          sender: 'sibyl',
          body: body.body,
        });
        return res.json({ message: msg });
      }

      return res.status(400).json({ error: 'unknown action' });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('[partners/admin] error:', err.message);
    return res.status(500).json({ error: 'internal error' });
  }
};
