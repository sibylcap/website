/* SIWE + JWT authentication for Advisory Partner Dashboard. */

var { SiweMessage } = require('siwe');
var jwt = require('jsonwebtoken');

var JWT_SECRET = process.env.ADVISORY_JWT_SECRET || 'dev-secret-change-me';
var JWT_EXPIRY = '24h';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

async function verifySiwe(message, signature) {
  var siweMessage = new SiweMessage(message);
  var result = await siweMessage.verify({ signature: signature });
  if (!result.success) return null;
  return {
    address: siweMessage.address.toLowerCase(),
    nonce: siweMessage.nonce,
  };
}

// Middleware-style: extracts user from Authorization header
function extractUser(req) {
  var auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  var decoded = verifyToken(auth.slice(7));
  if (!decoded || !decoded.address || !decoded.project_id) return null;
  return decoded;
}

// Admin key check
function isAdmin(req) {
  var key = req.headers['x-admin-key'] || '';
  var expected = process.env.ADVISORY_ADMIN_KEY || '';
  if (!expected || !key) return false;
  return key === expected;
}

module.exports = { signToken, verifyToken, verifySiwe, extractUser, isAdmin };
