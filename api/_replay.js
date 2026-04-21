/* Persistent replay-prevention + credit accounting.
   Uses Vercel Postgres (advisory_POSTGRES_URL — same Neon DB as partners-db).
   All inserts are atomic via ON CONFLICT DO NOTHING.

   Tables:
     x402_used_payments        — one row per consumed USDC tx_hash
     x402_used_nonces          — one row per consumed (from, nonce) pair
     pingcast_free_credits_used — one row per redeemed referral credit

   SECURITY NOTES:
   - markTxUsed returns true ONLY on first consumption. Subsequent calls return false.
     Caller MUST reject request if false. Atomicity kills cross-cold-start replay
     (previous in-memory Set reset on Vercel Lambda cycling).
   - Referral credit count is sourced from this table, NOT from parsing on-chain
     broadcast content. The old content-string-prefix check was spoofable — anyone
     could burn another user's credits by prefixing [ref|victim] in a paid broadcast.
     Moving to server-side accounting closes that gap.
   - Historical referral redemptions (pre-migration) are NOT backfilled. Any user
     who consumed free credits before 2026-04-21 may observe a one-time re-grant.
     This is an acceptable trade since the old counter was untrusted anyway. */

var { createPool } = require('@vercel/postgres');

var pool = createPool({
  connectionString: process.env.advisory_POSTGRES_URL || process.env.POSTGRES_URL,
});
var sql = pool.sql.bind(pool);

var _initialized = false;

async function ensureSchema() {
  if (_initialized) return;

  await sql`
    CREATE TABLE IF NOT EXISTS x402_used_payments (
      tx_hash     TEXT PRIMARY KEY,
      resource    TEXT NOT NULL,
      from_addr   TEXT,
      nonce       TEXT,
      amount_usdc NUMERIC,
      used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_x402_used_at ON x402_used_payments(used_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS x402_used_nonces (
      from_nonce_key TEXT PRIMARY KEY,
      tx_hash        TEXT NOT NULL,
      used_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS pingcast_free_credits_used (
      tx_hash   TEXT PRIMARY KEY,
      username  TEXT NOT NULL,
      used_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pfc_username ON pingcast_free_credits_used(LOWER(username))`;

  _initialized = true;
}

/**
 * Atomically claim a tx_hash as consumed.
 * @param {string} txHash - 0x-prefixed tx hash (case-insensitive; lowered in storage)
 * @param {object} metadata - { resource, fromAddr, nonce, amountUsdc }
 * @returns {Promise<boolean>} true if newly claimed (fresh). false if already used (replay).
 */
async function markTxUsed(txHash, metadata) {
  await ensureSchema();
  var m = metadata || {};
  var { rows } = await sql`
    INSERT INTO x402_used_payments (tx_hash, resource, from_addr, nonce, amount_usdc)
    VALUES (
      ${txHash.toLowerCase()},
      ${m.resource || ''},
      ${m.fromAddr ? m.fromAddr.toLowerCase() : null},
      ${m.nonce || null},
      ${m.amountUsdc || null}
    )
    ON CONFLICT (tx_hash) DO NOTHING
    RETURNING tx_hash
  `;
  return rows.length > 0;
}

/**
 * Atomically claim a (from, nonce) pair as consumed. Belt-and-suspenders defense
 * against the extremely rare case where the same (from, nonce) pair maps to
 * multiple tx_hashes (e.g., L2 reorg, mempool replacement).
 * @param {string} fromAddr
 * @param {string|number} nonce
 * @param {string} txHash
 * @returns {Promise<boolean>} true if newly claimed (fresh). false if already used.
 */
async function markNonceUsed(fromAddr, nonce, txHash) {
  await ensureSchema();
  var key = (fromAddr || '').toLowerCase() + ':' + String(nonce);
  var { rows } = await sql`
    INSERT INTO x402_used_nonces (from_nonce_key, tx_hash)
    VALUES (${key}, ${txHash.toLowerCase()})
    ON CONFLICT (from_nonce_key) DO NOTHING
    RETURNING from_nonce_key
  `;
  return rows.length > 0;
}

/**
 * Record a successful free Pingcast redemption.
 * @param {string} username
 * @param {string} txHash - broadcast tx hash (the free broadcast itself)
 */
async function recordReferralUse(username, txHash) {
  await ensureSchema();
  await sql`
    INSERT INTO pingcast_free_credits_used (tx_hash, username)
    VALUES (${txHash.toLowerCase()}, ${username})
    ON CONFLICT (tx_hash) DO NOTHING
  `;
}

/**
 * Authoritative count of free Pingcasts redeemed by this username.
 * @param {string} username
 * @returns {Promise<number>}
 */
async function countReferralUsed(username) {
  await ensureSchema();
  var { rows } = await sql`
    SELECT COUNT(*)::int AS n
    FROM pingcast_free_credits_used
    WHERE LOWER(username) = LOWER(${username})
  `;
  return rows[0] ? rows[0].n : 0;
}

module.exports = {
  markTxUsed: markTxUsed,
  markNonceUsed: markNonceUsed,
  recordReferralUse: recordReferralUse,
  countReferralUsed: countReferralUsed,
};
