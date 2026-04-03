/* SIWE + JWT authentication for Advisory Partner Dashboard. */

var { SiweMessage } = require('siwe');
var jwt = require('jsonwebtoken');
var { ethers } = require('ethers');

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
  // Try standard SIWE parser first
  try {
    var siweMessage = new SiweMessage(message);
    var result = await siweMessage.verify({ signature: signature });
    if (!result.success) return null;
    return {
      address: siweMessage.address.toLowerCase(),
      nonce: siweMessage.nonce,
    };
  } catch (e) {
    // Fallback: manually parse EIP-4361 message and verify signature
    try {
      var recovered = ethers.verifyMessage(message, signature);
      // Extract address and nonce from message text
      var lines = message.split('\n');
      var address = null;
      var nonce = null;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (/^0x[a-fA-F0-9]{40}$/.test(line)) address = line;
        if (line.startsWith('Nonce: ')) nonce = line.slice(7).trim();
      }
      if (!address || !nonce) return null;
      if (recovered.toLowerCase() !== address.toLowerCase()) return null;
      return { address: address.toLowerCase(), nonce: nonce };
    } catch (e2) {
      return null;
    }
  }
}

// Middleware-style: extracts user from Authorization header
// Supports both old (single project_id) and new (project_ids array) JWT format
function extractUser(req) {
  var auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  var decoded = verifyToken(auth.slice(7));
  if (!decoded || !decoded.address) return null;
  // Normalize: ensure project_ids array exists
  if (!decoded.project_ids && decoded.project_id) {
    decoded.project_ids = [decoded.project_id];
  }
  if (!decoded.project_ids || decoded.project_ids.length === 0) return null;
  return decoded;
}

// Check if user has access to a specific project
function userHasProject(user, projectId) {
  if (!user || !user.project_ids) return false;
  return user.project_ids.indexOf(projectId) !== -1;
}

// Admin key check
function isAdmin(req) {
  var key = req.headers['x-admin-key'] || '';
  var expected = process.env.ADVISORY_ADMIN_KEY || '';
  if (!expected || !key) return false;
  return key === expected;
}

module.exports = { signToken, verifyToken, verifySiwe, extractUser, userHasProject, isAdmin };
