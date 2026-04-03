/* Advisory Partner Dashboard: Tasks endpoint.
   GET   /api/partners/tasks                           — list tasks (optional ?session_id=N&status=X)
   PATCH /api/partners/tasks?id=N&action=status        — update task status
   PATCH /api/partners/tasks?id=N&action=notes         — add note to task */

var db = require('../_lib/partners-db');
var auth = require('../_lib/partners-auth');

var VALID_STATUSES = ['pending', 'in_progress', 'completed', 'blocked'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var user = auth.extractUser(req);
    if (!user) return res.status(401).json({ error: 'not authenticated' });

    // Resolve project: explicit query param or first from JWT
    var projectId = req.query.project_id || user.project_ids[0];
    if (!auth.userHasProject(user, projectId)) {
      return res.status(403).json({ error: 'no access to this project' });
    }

    if (req.method === 'GET') {
      var filters = {};
      if (req.query.session_id) filters.session_id = parseInt(req.query.session_id);
      if (req.query.status) filters.status = req.query.status;
      var tasks = await db.getTasksByProject(projectId, filters);
      return res.json({ tasks: tasks });
    }

    if (req.method === 'PATCH') {
      var taskId = parseInt(req.query.id);
      var action = req.query.action;
      if (!taskId || !action) return res.status(400).json({ error: 'missing id or action query param' });

      // Verify the task belongs to this project
      var task = await db.getTaskById(taskId);
      if (!task || task.project_id !== projectId) {
        return res.status(404).json({ error: 'task not found' });
      }

      if (action === 'status') {
        var { status } = req.body || {};
        if (!status || !VALID_STATUSES.includes(status)) {
          return res.status(400).json({ error: 'invalid status. must be: ' + VALID_STATUSES.join(', ') });
        }
        var updated = await db.updateTaskStatus(taskId, status);
        return res.json({ task: updated });
      }

      if (action === 'notes') {
        var { note } = req.body || {};
        if (!note || !note.trim()) {
          return res.status(400).json({ error: 'note is required' });
        }
        var updated = await db.updateTaskNotes(taskId, note.trim());
        return res.json({ task: updated });
      }

      return res.status(400).json({ error: 'unknown action. use ?action=status or ?action=notes' });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('[partners/tasks] error:', err.message);
    return res.status(500).json({ error: 'internal error' });
  }
};
