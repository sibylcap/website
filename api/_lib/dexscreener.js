/* Shared DexScreener fetchers for SIBYL x402 endpoints */

async function fetchDexScreener(token) {
  var resp = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + token, {
    headers: { 'Accept': 'application/json' }
  });
  if (!resp.ok) throw new Error('DexScreener: ' + resp.status);
  return resp.json();
}

async function fetchBoostedTokens() {
  try {
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 8000);
    var resp = await fetch('https://api.dexscreener.com/token-boosts/top/v1', {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) return [];
    return resp.json();
  } catch (e) {
    return [];
  }
}

async function fetchTokenProfiles() {
  try {
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 8000);
    var resp = await fetch('https://api.dexscreener.com/token-profiles/latest/v1', {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) return [];
    return resp.json();
  } catch (e) {
    return [];
  }
}

// Parse best Base pair from DexScreener data
function parseBestPair(dexData) {
  if (!dexData || !dexData.pairs || dexData.pairs.length === 0) return null;
  var pairs = dexData.pairs
    .filter(function(p) { return p.chainId === 'base'; })
    .sort(function(a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
  if (pairs.length === 0) {
    pairs = dexData.pairs.sort(function(a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
  }
  return { pair: pairs[0], pairCount: pairs.length };
}

module.exports = {
  fetchDexScreener: fetchDexScreener,
  fetchBoostedTokens: fetchBoostedTokens,
  fetchTokenProfiles: fetchTokenProfiles,
  parseBestPair: parseBestPair
};
