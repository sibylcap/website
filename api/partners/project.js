/* Advisory Partner Dashboard: Project endpoint.
   GET /api/partners/project — returns project data with sessions and task counts */

var db = require('../_lib/partners-db');
var auth = require('../_lib/partners-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  try {
    var user = auth.extractUser(req);
    if (!user) return res.status(401).json({ error: 'not authenticated' });

    var project = await db.getProjectById(user.project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });

    var sessions = await db.getSessionsByProject(project.id);
    var taskCounts = await db.getTaskCountsByProject(project.id);

    return res.json({ project: project, sessions: sessions, taskCounts: taskCounts });
  } catch (err) {
    console.error('[partners/project] error:', err.message);
    return res.status(500).json({ error: 'internal error' });
  }
};
