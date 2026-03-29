/* Database helpers for the Advisory Partner Dashboard.
   Uses Vercel Postgres (auto-configured via POSTGRES_URL env var).
   Schema auto-creates on first call. */

var { createPool, sql: defaultSql } = require('@vercel/postgres');

// Vercel Postgres store uses advisory_ prefix for env vars
var pool = createPool({ connectionString: process.env.advisory_POSTGRES_URL || process.env.POSTGRES_URL });
var sql = pool.sql.bind(pool);

var _initialized = false;

async function ensureSchema() {
  if (_initialized) return;
  await sql`
    CREATE TABLE IF NOT EXISTS partner_projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      wallet      TEXT NOT NULL,
      token_ca    TEXT,
      status      TEXT NOT NULL DEFAULT 'active',
      conviction  TEXT,
      score       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_pp_wallet ON partner_projects(LOWER(wallet))`;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_sessions (
      id          SERIAL PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES partner_projects(id),
      title       TEXT NOT NULL,
      summary     TEXT,
      status      TEXT NOT NULL DEFAULT 'open',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at   TIMESTAMPTZ
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_tasks (
      id          SERIAL PRIMARY KEY,
      session_id  INTEGER NOT NULL REFERENCES partner_sessions(id),
      project_id  TEXT NOT NULL REFERENCES partner_projects(id),
      title       TEXT NOT NULL,
      description TEXT,
      status      TEXT NOT NULL DEFAULT 'pending',
      owner       TEXT NOT NULL DEFAULT 'founder',
      notes       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_messages (
      id          SERIAL PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES partner_projects(id),
      sender      TEXT NOT NULL,
      body        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_nonces (
      nonce       TEXT PRIMARY KEY,
      wallet      TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      used        BOOLEAN NOT NULL DEFAULT FALSE
    )`;

  _initialized = true;
}

// ── Projects ────────────────────────────────────────────────────────────────

async function getProjectByWallet(wallet) {
  await ensureSchema();
  var { rows } = await sql`SELECT * FROM partner_projects WHERE LOWER(wallet) = LOWER(${wallet}) LIMIT 1`;
  return rows[0] || null;
}

async function getProjectById(id) {
  await ensureSchema();
  var { rows } = await sql`SELECT * FROM partner_projects WHERE id = ${id} LIMIT 1`;
  return rows[0] || null;
}

async function getAllProjects() {
  await ensureSchema();
  var { rows } = await sql`SELECT * FROM partner_projects ORDER BY created_at DESC`;
  return rows;
}

async function createProject({ id, name, wallet, token_ca, conviction, score }) {
  await ensureSchema();
  await sql`
    INSERT INTO partner_projects (id, name, wallet, token_ca, conviction, score)
    VALUES (${id}, ${name}, ${wallet.toLowerCase()}, ${token_ca || null}, ${conviction || null}, ${score || null})`;
  return getProjectById(id);
}

// ── Sessions ────────────────────────────────────────────────────────────────

async function getSessionsByProject(projectId) {
  await ensureSchema();
  var { rows } = await sql`SELECT * FROM partner_sessions WHERE project_id = ${projectId} ORDER BY created_at DESC`;
  return rows;
}

async function getSessionById(id) {
  await ensureSchema();
  var { rows } = await sql`SELECT * FROM partner_sessions WHERE id = ${id} LIMIT 1`;
  return rows[0] || null;
}

async function createSession({ project_id, title, summary }) {
  await ensureSchema();
  var { rows } = await sql`
    INSERT INTO partner_sessions (project_id, title, summary)
    VALUES (${project_id}, ${title}, ${summary || null})
    RETURNING *`;
  return rows[0];
}

async function updateSession(id, fields) {
  await ensureSchema();
  if (fields.status === 'closed') {
    await sql`UPDATE partner_sessions SET status = 'closed', closed_at = NOW() WHERE id = ${id}`;
  } else if (fields.status) {
    await sql`UPDATE partner_sessions SET status = ${fields.status} WHERE id = ${id}`;
  }
  if (fields.summary !== undefined) {
    await sql`UPDATE partner_sessions SET summary = ${fields.summary} WHERE id = ${id}`;
  }
  return getSessionById(id);
}

// ── Tasks ───────────────────────────────────────────────────────────────────

async function getTasksByProject(projectId, filters) {
  await ensureSchema();
  if (filters && filters.session_id && filters.status) {
    var { rows } = await sql`SELECT * FROM partner_tasks WHERE project_id = ${projectId} AND session_id = ${filters.session_id} AND status = ${filters.status} ORDER BY created_at ASC`;
    return rows;
  }
  if (filters && filters.session_id) {
    var { rows } = await sql`SELECT * FROM partner_tasks WHERE project_id = ${projectId} AND session_id = ${filters.session_id} ORDER BY created_at ASC`;
    return rows;
  }
  if (filters && filters.status) {
    var { rows } = await sql`SELECT * FROM partner_tasks WHERE project_id = ${projectId} AND status = ${filters.status} ORDER BY created_at ASC`;
    return rows;
  }
  var { rows } = await sql`SELECT * FROM partner_tasks WHERE project_id = ${projectId} ORDER BY created_at ASC`;
  return rows;
}

async function getTaskById(id) {
  await ensureSchema();
  var { rows } = await sql`SELECT * FROM partner_tasks WHERE id = ${id} LIMIT 1`;
  return rows[0] || null;
}

async function createTask({ session_id, project_id, title, description, owner }) {
  await ensureSchema();
  var { rows } = await sql`
    INSERT INTO partner_tasks (session_id, project_id, title, description, owner)
    VALUES (${session_id}, ${project_id}, ${title}, ${description || null}, ${owner || 'founder'})
    RETURNING *`;
  return rows[0];
}

async function updateTaskStatus(id, status) {
  await ensureSchema();
  await sql`UPDATE partner_tasks SET status = ${status}, updated_at = NOW() WHERE id = ${id}`;
  return getTaskById(id);
}

async function updateTaskNotes(id, note) {
  await ensureSchema();
  var task = await getTaskById(id);
  if (!task) return null;
  var ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
  var existing = task.notes || '';
  var updated = existing ? existing + '\n\n[' + ts + '] ' + note : '[' + ts + '] ' + note;
  await sql`UPDATE partner_tasks SET notes = ${updated}, updated_at = NOW() WHERE id = ${id}`;
  return getTaskById(id);
}

async function adminUpdateTask(id, fields) {
  await ensureSchema();
  if (fields.status) await sql`UPDATE partner_tasks SET status = ${fields.status}, updated_at = NOW() WHERE id = ${id}`;
  if (fields.description !== undefined) await sql`UPDATE partner_tasks SET description = ${fields.description}, updated_at = NOW() WHERE id = ${id}`;
  if (fields.notes !== undefined) await sql`UPDATE partner_tasks SET notes = ${fields.notes}, updated_at = NOW() WHERE id = ${id}`;
  if (fields.title) await sql`UPDATE partner_tasks SET title = ${fields.title}, updated_at = NOW() WHERE id = ${id}`;
  return getTaskById(id);
}

async function getTaskCountsByProject(projectId) {
  await ensureSchema();
  var { rows } = await sql`SELECT status, COUNT(*)::int as count FROM partner_tasks WHERE project_id = ${projectId} GROUP BY status`;
  var counts = { pending: 0, in_progress: 0, completed: 0, blocked: 0 };
  for (var r of rows) counts[r.status] = r.count;
  return counts;
}

// ── Messages ────────────────────────────────────────────────────────────────

async function getMessages(projectId, opts) {
  await ensureSchema();
  var limit = (opts && opts.limit) || 50;
  if (opts && opts.before) {
    var { rows } = await sql`SELECT * FROM partner_messages WHERE project_id = ${projectId} AND id < ${opts.before} ORDER BY created_at ASC LIMIT ${limit}`;
    return rows;
  }
  var { rows } = await sql`SELECT * FROM partner_messages WHERE project_id = ${projectId} ORDER BY created_at ASC LIMIT ${limit}`;
  return rows;
}

async function createMessage({ project_id, sender, body }) {
  await ensureSchema();
  var { rows } = await sql`
    INSERT INTO partner_messages (project_id, sender, body)
    VALUES (${project_id}, ${sender}, ${body})
    RETURNING *`;
  return rows[0];
}

// ── Nonces ──────────────────────────────────────────────────────────────────

async function createNonce(wallet) {
  await ensureSchema();
  var nonce = crypto.randomUUID();
  await sql`INSERT INTO partner_nonces (nonce, wallet) VALUES (${nonce}, ${wallet.toLowerCase()})`;
  await sql`DELETE FROM partner_nonces WHERE used = FALSE AND created_at < NOW() - INTERVAL '5 minutes'`;
  return nonce;
}

async function consumeNonce(nonce) {
  await ensureSchema();
  var { rows } = await sql`SELECT * FROM partner_nonces WHERE nonce = ${nonce} AND used = FALSE LIMIT 1`;
  if (!rows[0]) return null;
  await sql`UPDATE partner_nonces SET used = TRUE WHERE nonce = ${nonce}`;
  return rows[0];
}

module.exports = {
  getProjectByWallet, getProjectById, getAllProjects, createProject,
  getSessionsByProject, getSessionById, createSession, updateSession,
  getTasksByProject, getTaskById, createTask, updateTaskStatus, updateTaskNotes, adminUpdateTask, getTaskCountsByProject,
  getMessages, createMessage,
  createNonce, consumeNonce,
};
