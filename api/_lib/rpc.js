/* Shared Base RPC utilities for SIBYL x402 endpoints */

var constants = require('./constants');

async function checkBytecode(token) {
  var rpcs = constants.RPC_FALLBACKS;
  for (var i = 0; i < rpcs.length; i++) {
    try {
      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 3000);
      var resp = await fetch(rpcs[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getCode', params: [token, 'latest'], id: 1 }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      var data = await resp.json();
      if (data.result && data.result !== '0x' && data.result.length > 2) return true;
      if (data.result === '0x') return false;
    } catch (e) {
      continue;
    }
  }
  return null;
}

// Returns { hasCode: bool|null, size: number }
async function checkBytecodeWithSize(token) {
  var rpcs = constants.RPC_FALLBACKS;
  for (var i = 0; i < rpcs.length; i++) {
    try {
      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 3000);
      var resp = await fetch(rpcs[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getCode', params: [token, 'latest'], id: 1 }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      var data = await resp.json();
      if (data.result && data.result !== '0x' && data.result.length > 2) {
        return { hasCode: true, size: Math.floor((data.result.length - 2) / 2) };
      }
      if (data.result === '0x') return { hasCode: false, size: 0 };
    } catch (e) {
      continue;
    }
  }
  return { hasCode: null, size: 0 };
}

// Decimal-aware total supply fetch (batches totalSupply + decimals in one RPC call)
async function fetchTotalSupply(token) {
  var rpcs = constants.RPC_FALLBACKS;
  for (var i = 0; i < rpcs.length; i++) {
    try {
      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 5000);
      var batch = [
        { jsonrpc: '2.0', method: 'eth_call', params: [{ to: token, data: '0x18160ddd' }, 'latest'], id: 1 },
        { jsonrpc: '2.0', method: 'eth_call', params: [{ to: token, data: '0x313ce567' }, 'latest'], id: 2 }
      ];
      var resp = await fetch(rpcs[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        signal: controller.signal
      });
      clearTimeout(timeout);
      var results = await resp.json();
      if (!Array.isArray(results)) results = [results];
      var supplyResult = results.find(function(r) { return r.id === 1; });
      var decimalsResult = results.find(function(r) { return r.id === 2; });
      if (supplyResult && supplyResult.result && supplyResult.result !== '0x') {
        var decimals = 18;
        if (decimalsResult && decimalsResult.result && decimalsResult.result !== '0x') {
          decimals = parseInt(decimalsResult.result, 16);
          if (decimals < 0 || decimals > 77) decimals = 18;
        }
        return parseInt(supplyResult.result, 16) / Math.pow(10, decimals);
      }
    } catch (e) {
      continue;
    }
  }
  return null;
}

module.exports = {
  checkBytecode: checkBytecode,
  checkBytecodeWithSize: checkBytecodeWithSize,
  fetchTotalSupply: fetchTotalSupply
};
