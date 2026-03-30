/* Advisory Partner Dashboard: Attachments endpoint.
   GET  /api/partners/attachments?task_id=N           — list attachments for a task
   GET  /api/partners/attachments?id=N&download=1     — download a file
   POST /api/partners/attachments                     — upload a file (base64) */

var db = require('../_lib/partners-db');
var auth = require('../_lib/partners-auth');

var MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var user = auth.extractUser(req);
    if (!user) return res.status(401).json({ error: 'not authenticated' });

    if (req.method === 'GET') {
      // Download a specific file
      if (req.query.id && req.query.download) {
        var att = await db.getAttachmentById(parseInt(req.query.id));
        if (!att || att.project_id !== user.project_id) {
          return res.status(404).json({ error: 'not found' });
        }
        var buf = Buffer.from(att.data, 'base64');
        res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', 'inline; filename="' + att.filename + '"');
        res.setHeader('Content-Length', buf.length);
        return res.send(buf);
      }

      // List attachments for a task
      var taskId = parseInt(req.query.task_id);
      if (!taskId) return res.status(400).json({ error: 'task_id required' });
      var task = await db.getTaskById(taskId);
      if (!task || task.project_id !== user.project_id) {
        return res.status(404).json({ error: 'task not found' });
      }
      var attachments = await db.getAttachmentsByTask(taskId);
      return res.json({ attachments: attachments });
    }

    if (req.method === 'POST') {
      var { task_id, filename, mime_type, data } = req.body || {};
      if (!task_id || !filename || !data) {
        return res.status(400).json({ error: 'task_id, filename, and data (base64) required' });
      }

      var task = await db.getTaskById(parseInt(task_id));
      if (!task || task.project_id !== user.project_id) {
        return res.status(404).json({ error: 'task not found' });
      }

      // Validate size
      var sizeBytes = Math.ceil(data.length * 0.75);
      if (sizeBytes > MAX_FILE_SIZE) {
        return res.status(400).json({ error: 'file too large. max 5MB.' });
      }

      var att = await db.createAttachment({
        task_id: parseInt(task_id),
        project_id: user.project_id,
        filename: filename.slice(0, 255),
        mime_type: (mime_type || 'application/octet-stream').slice(0, 100),
        size_bytes: sizeBytes,
        data: data,
        uploaded_by: user.address,
      });
      return res.json({ attachment: att });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('[partners/attachments] error:', err.message);
    return res.status(500).json({ error: 'internal error' });
  }
};
