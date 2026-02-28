/* SIBYL Base Narrative Read API.
   Reads the current Base chain meta by analyzing trending/boosted tokens on DexScreener.
   Classifies tokens into narrative categories, ranks by momentum.
   Optionally maps a specific token to its narrative position.
   Payment: x402 ($0.25 USDC per call). Free with ?demo=true.

   Usage:
     GET /api/narrative                          (paid, $0.25 USDC)
     GET /api/narrative?token=0x...              (paid, with token positioning)
     GET /api/narrative?demo=true                (free, same output)
*/

var x402 = require('./_x402');
var PRICE_USD = 0.10;

// Narrative classification patterns
var NARRATIVES = {
  ai_agents: {
    label: 'AI / Agents',
    re: /\bai\b|agent|gpt|llm|neural|brain|cogni|intelli|autono|machine.?learn|deep.?learn|model|predict|inference|sentient|synthetic/i
  },
  defi: {
    label: 'DeFi',
    re: /\bdefi\b|swap|lend|borrow|yield|vault|stake|liquid|amm|pool|perp|leverag|margin|collateral|bridge|wrap|farm/i
  },
  meme: {
    label: 'Meme',
    re: /doge|pepe|shib|wojak|chad|moon|rocket|inu|cat|frog|bear|bull|ape|monkey|bonk|floki|elon|trump|maga|based|cope|seethe|wagmi|ngmi|gm\b|ser\b|anon\b|degen/i
  },
  gaming: {
    label: 'Gaming / Metaverse',
    re: /game|play|guild|quest|arena|battle|rpg|nft.?game|metaverse|virtual|world|land|avatar|character|level|loot/i
  },
  social: {
    label: 'Social / NFT',
    re: /social|nft|art|creator|collect|community|dao|govern|vote|member|club|access|pass|mint|gallery|culture/i
  },
  infra: {
    label: 'Infrastructure',
    re: /infra|protocol|layer|chain|rollup|oracle|index|api|sdk|tool|dev|framework|node|validator|relay|rpc|data|storage/i
  },
  rwa: {
    label: 'RWA / Payments',
    re: /\brwa\b|real.?world|tokeniz|asset|property|equity|bond|treasury|payment|pay|transfer|remit|stable|dollar|usd|euro|gold/i
  }
};

var NARRATIVE_KEYS = Object.keys(NARRATIVES);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT');
  res.setHeader('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE');

  if (req.method === 'OPTIONS') return res.status(200).end();

  var token = (req.query.token || '').toLowerCase();
  if (token && !/^0x[a-f0-9]{40}$/.test(token)) {
    return res.status(400).json({ error: 'invalid token address. use ?token=0x... or omit for general narrative read.' });
  }

  var paid = await x402.gate(req, res, {
    priceUsd: PRICE_USD,
    description: 'SIBYL Base narrative read'
  });
  if (!paid) return;

  var isDemo = req.query.demo === 'true';

  try {
    // Fetch trending data from DexScreener
    var fetches = [
      fetchBoostedTokens(),
      fetchTokenProfiles(),
      fetchBaseTrending()
    ];
    if (token) fetches.push(fetchTokenData(token));
    else fetches.push(Promise.resolve(null));

    var results = await Promise.all(fetches);
    var boosted = results[0];
    var profiles = results[1];
    var trending = results[2];
    var tokenData = results[3];

    var result = computeNarrative(boosted, profiles, trending, token, tokenData, isDemo);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(result);
  } catch (err) {
    console.error('narrative_error:', err.message, err.stack);
    return res.status(500).json({ error: 'narrative read failed' });
  }
};

// ── NARRATIVE ENGINE ──

function computeNarrative(boosted, profiles, trending, token, tokenData, isDemo) {
  // Combine all token signals into a unified list
  var allTokens = [];

  // Process boosted tokens (filtered to Base)
  if (boosted && Array.isArray(boosted)) {
    boosted.forEach(function(t) {
      if (t.chainId === 'base') {
        allTokens.push({
          address: (t.tokenAddress || '').toLowerCase(),
          symbol: t.symbol || '',
          name: t.description || t.symbol || '',
          source: 'boosted',
          amount: t.amount || 0
        });
      }
    });
  }

  // Process token profiles (filtered to Base)
  if (profiles && Array.isArray(profiles)) {
    profiles.forEach(function(t) {
      if (t.chainId === 'base') {
        allTokens.push({
          address: (t.tokenAddress || '').toLowerCase(),
          symbol: t.symbol || '',
          name: t.description || t.symbol || '',
          source: 'profile',
          amount: 0
        });
      }
    });
  }

  // Process trending pairs (filtered to Base)
  if (trending && trending.pairs && Array.isArray(trending.pairs)) {
    trending.pairs.forEach(function(p) {
      if (p.chainId === 'base' && p.baseToken) {
        allTokens.push({
          address: (p.baseToken.address || '').toLowerCase(),
          symbol: p.baseToken.symbol || '',
          name: p.baseToken.name || '',
          source: 'trending',
          volume: (p.volume && p.volume.h24) || 0,
          liquidity: (p.liquidity && p.liquidity.usd) || 0,
          priceChange24h: (p.priceChange && p.priceChange.h24) || 0,
          txns: (p.txns && p.txns.h24) || { buys: 0, sells: 0 }
        });
      }
    });
  }

  // Classify each token into a narrative
  var categories = {};
  NARRATIVE_KEYS.forEach(function(key) {
    categories[key] = {
      label: NARRATIVES[key].label,
      tokens: [],
      totalVolume: 0,
      totalLiquidity: 0,
      avgPriceChange: 0,
      count: 0,
      boostCount: 0
    };
  });
  categories.other = {
    label: 'Other / Unclassified',
    tokens: [],
    totalVolume: 0,
    totalLiquidity: 0,
    avgPriceChange: 0,
    count: 0,
    boostCount: 0
  };

  // Deduplicate by address
  var seen = {};
  var uniqueTokens = [];
  allTokens.forEach(function(t) {
    var key = t.address || t.symbol;
    if (!seen[key]) {
      seen[key] = t;
      uniqueTokens.push(t);
    } else {
      // Merge data
      if (t.volume) seen[key].volume = t.volume;
      if (t.liquidity) seen[key].liquidity = t.liquidity;
      if (t.priceChange24h) seen[key].priceChange24h = t.priceChange24h;
      if (t.source === 'boosted') seen[key].source = 'boosted';
    }
  });

  uniqueTokens.forEach(function(t) {
    var combined = (t.symbol + ' ' + t.name).toLowerCase();
    var classified = false;

    for (var i = 0; i < NARRATIVE_KEYS.length; i++) {
      var key = NARRATIVE_KEYS[i];
      if (NARRATIVES[key].re.test(combined)) {
        categories[key].tokens.push(t.symbol || t.address);
        categories[key].totalVolume += (t.volume || 0);
        categories[key].totalLiquidity += (t.liquidity || 0);
        categories[key].avgPriceChange += (t.priceChange24h || 0);
        categories[key].count++;
        if (t.source === 'boosted') categories[key].boostCount++;
        classified = true;
        break;
      }
    }

    if (!classified) {
      categories.other.tokens.push(t.symbol || t.address);
      categories.other.totalVolume += (t.volume || 0);
      categories.other.totalLiquidity += (t.liquidity || 0);
      categories.other.avgPriceChange += (t.priceChange24h || 0);
      categories.other.count++;
      if (t.source === 'boosted') categories.other.boostCount++;
    }
  });

  // Compute averages
  var allKeys = NARRATIVE_KEYS.concat(['other']);
  allKeys.forEach(function(key) {
    var cat = categories[key];
    if (cat.count > 0) {
      cat.avgPriceChange = r1(cat.avgPriceChange / cat.count);
    }
  });

  // Rank categories by a composite momentum score
  // (volume weight + boost weight + token count)
  var ranked = allKeys
    .filter(function(key) { return categories[key].count > 0; })
    .map(function(key) {
      var cat = categories[key];
      var momentumScore = 0;
      momentumScore += Math.min(cat.totalVolume / 100000, 10); // volume signal capped at 10
      momentumScore += cat.boostCount * 3; // boosted tokens are strong signal
      momentumScore += cat.count * 1; // raw token count
      momentumScore += cat.avgPriceChange > 0 ? Math.min(cat.avgPriceChange / 10, 5) : Math.max(cat.avgPriceChange / 10, -5);
      return { key: key, momentum: r1(momentumScore), cat: cat };
    })
    .sort(function(a, b) { return b.momentum - a.momentum; });

  // Determine dominant, emerging, fading
  var dominant = null;
  var emerging = [];
  var fading = [];

  if (ranked.length > 0) {
    var top = ranked[0];
    dominant = {
      narrative: top.key,
      label: top.cat.label,
      momentum_score: top.momentum,
      signals: buildCategorySignals(top.cat)
    };

    // Emerging: positive momentum, not dominant
    for (var i = 1; i < ranked.length; i++) {
      var r = ranked[i];
      if (r.momentum > 2 && emerging.length < 3) {
        emerging.push({
          narrative: r.key,
          label: r.cat.label,
          momentum_score: r.momentum,
          signals: buildCategorySignals(r.cat)
        });
      } else if (r.momentum <= 2 || (r.cat.avgPriceChange < -5)) {
        fading.push({
          narrative: r.key,
          label: r.cat.label,
          momentum_score: r.momentum,
          signals: buildCategorySignals(r.cat)
        });
      }
    }
  }

  // Token position (if requested)
  var tokenPosition = null;
  if (token && tokenData && tokenData.pairs && tokenData.pairs.length > 0) {
    var basePairs = tokenData.pairs
      .filter(function(p) { return p.chainId === 'base'; })
      .sort(function(a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
    if (basePairs.length === 0) {
      basePairs = tokenData.pairs.sort(function(a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
    }
    var tp = basePairs[0];
    var tSymbol = (tp.baseToken && tp.baseToken.symbol) || 'UNKNOWN';
    var tName = (tp.baseToken && tp.baseToken.name) || 'Unknown';
    var tCombined = (tSymbol + ' ' + tName).toLowerCase();

    var tNarrative = 'other';
    var tLabel = 'Unclassified';
    for (var j = 0; j < NARRATIVE_KEYS.length; j++) {
      if (NARRATIVES[NARRATIVE_KEYS[j]].re.test(tCombined)) {
        tNarrative = NARRATIVE_KEYS[j];
        tLabel = NARRATIVES[NARRATIVE_KEYS[j]].label;
        break;
      }
    }

    // Determine alignment with current meta
    var alignment = 'weak';
    if (dominant && tNarrative === dominant.narrative) alignment = 'strong';
    else if (emerging.some(function(e) { return e.narrative === tNarrative; })) alignment = 'moderate';
    else if (fading.some(function(f) { return f.narrative === tNarrative; })) alignment = 'counter';

    var tVol = (tp.volume && tp.volume.h24) || 0;
    var tLiq = (tp.liquidity && tp.liquidity.usd) || 0;
    var tPc = (tp.priceChange && tp.priceChange.h24) || 0;

    tokenPosition = {
      token: token,
      symbol: tSymbol,
      name: tName,
      narrative: tNarrative,
      narrative_label: tLabel,
      alignment: alignment,
      volume_24h: Math.round(tVol),
      liquidity_usd: Math.round(tLiq),
      price_change_24h: r1(tPc),
      signal: buildPositionSignal(alignment, tLabel, tSymbol, dominant)
    };
  }

  return {
    agent: 'SIBYL #20880',
    version: 'narrative-v1',
    chain: 'base',
    timestamp: new Date().toISOString(),
    tokens_analyzed: uniqueTokens.length,
    meta: {
      dominant: dominant,
      emerging: emerging,
      fading: fading
    },
    token_position: tokenPosition,
    data_sources: ['dexscreener'],
    demo: isDemo
  };
}

function buildCategorySignals(cat) {
  var signals = [];
  signals.push(cat.count + ' active token(s) on Base');
  if (cat.totalVolume > 0) signals.push('$' + fmt(cat.totalVolume) + ' combined 24h volume');
  if (cat.totalLiquidity > 0) signals.push('$' + fmt(cat.totalLiquidity) + ' combined liquidity');
  if (cat.avgPriceChange !== 0) signals.push(s(cat.avgPriceChange) + '% avg 24h price change');
  if (cat.boostCount > 0) signals.push(cat.boostCount + ' boosted token(s)');
  if (cat.tokens.length > 0) {
    var display = cat.tokens.slice(0, 5);
    if (cat.tokens.length > 5) display.push('...');
    signals.push('tokens: ' + display.join(', '));
  }
  return signals;
}

function buildPositionSignal(alignment, label, symbol, dominant) {
  if (alignment === 'strong') {
    return symbol + ' sits in the dominant narrative (' + label + '). maximum narrative tailwind.';
  } else if (alignment === 'moderate') {
    return symbol + ' sits in an emerging narrative (' + label + '). rising attention, not yet dominant.';
  } else if (alignment === 'counter') {
    return symbol + ' is in a fading narrative (' + label + '). narrative headwind.' + (dominant ? ' current meta favors ' + dominant.label + '.' : '');
  } else {
    return symbol + ' classified as ' + label + '. no strong narrative alignment detected.' + (dominant ? ' current meta favors ' + dominant.label + '.' : '');
  }
}

// ── DATA FETCHERS ──

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
    console.error('narrative_boost_fetch_error:', e.message);
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
    console.error('narrative_profile_fetch_error:', e.message);
    return [];
  }
}

async function fetchBaseTrending() {
  try {
    // Use DexScreener search for high-volume Base pairs
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 8000);
    var resp = await fetch('https://api.dexscreener.com/latest/dex/pairs/base', {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) return { pairs: [] };
    return resp.json();
  } catch (e) {
    console.error('narrative_trending_fetch_error:', e.message);
    return { pairs: [] };
  }
}

async function fetchTokenData(token) {
  var resp = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + token, {
    headers: { 'Accept': 'application/json' }
  });
  if (!resp.ok) return null;
  return resp.json();
}

// ── UTILS ──

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

function s(n) { return n >= 0 ? '+' + n.toFixed(1) : n.toFixed(1); }

function r1(n) { return Math.round(n * 10) / 10; }
