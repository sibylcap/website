/* SIBYL Full Project Evaluation API.
   Scores projects on the three SIBYL criteria: Builder Conviction, Community Seed,
   On-Chain Proof of Work. Returns a conviction score out of 30 with tier classification.
   Payment: x402 ($0.25 USDC per call). Free with ?demo=true.

   Usage:
     GET /api/evaluate?token=0x...                                    (paid, $0.25 USDC)
     GET /api/evaluate?token=0x...&twitter=handle&github=user         (paid, full analysis)
     GET /api/evaluate?token=0x...&demo=true                          (free, same output)

   Params:
     token   (required) — ERC-20 contract address on Base
     twitter (optional) — X handle (without @)
     github  (optional) — GitHub username or org
     demo    (optional) — bypass payment gate
*/

var x402 = require('./_x402');
var RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
var X_BEARER = process.env.X_BEARER_TOKEN || '';
var PRICE_USD = 0.25;

var ERC8004_FEEDBACK = {
  message: 'Rate this response on-chain via ERC-8004 Reputation Registry',
  contract: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  agentId: 20880,
  method: 'giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT');
  res.setHeader('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE');

  if (req.method === 'OPTIONS') return res.status(200).end();

  var token = (req.query.token || '').toLowerCase();
  if (!token || !/^0x[a-f0-9]{40}$/.test(token)) {
    if (!req.query.demo && !req.headers['x-payment'] && !req.headers['x-payment-tx']) {
      return x402.discovery(req, res, {
        priceUsd: PRICE_USD,
        description: 'SIBYL full project evaluation. scores on builder conviction, community seed, and on-chain proof of work. 0-30 conviction score with tier classification.',
        discovery: {
          input: { token: '0x...', twitter: 'handle', github: 'user' },
          inputSchema: { properties: { token: { type: 'string', description: 'ERC-20 contract address on Base' }, twitter: { type: 'string', description: 'X handle without @' }, github: { type: 'string', description: 'GitHub username or org' } }, required: ['token'] },
          output: { example: { conviction_score: 24, tier: 'high_conviction', builder_conviction: {}, community_seed: {}, onchain_proof: {} } }
        }
      });
    }
    return res.status(400).json({ error: 'invalid token address. use ?token=0x...' });
  }

  var twitter = (req.query.twitter || '').replace(/^@/, '').toLowerCase();
  var github = (req.query.github || '').toLowerCase();

  var paid = await x402.gate(req, res, {
    priceUsd: PRICE_USD,
    description: 'SIBYL full project evaluation. scores on builder conviction, community seed, and on-chain proof of work. 0-30 conviction score with tier classification.',
    discovery: {
      input: { token: '0x...', twitter: 'handle', github: 'user' },
      inputSchema: { properties: { token: { type: 'string', description: 'ERC-20 contract address on Base' }, twitter: { type: 'string', description: 'X handle without @' }, github: { type: 'string', description: 'GitHub username or org' } }, required: ['token'] },
      output: { example: { conviction_score: 24, tier: 'high_conviction', builder_conviction: {}, community_seed: {}, onchain_proof: {} } }
    }
  });
  if (!paid) return;

  var isDemo = req.query.demo === 'true';

  try {
    // Fetch core data in parallel
    var fetches = [
      fetchDexScreener(token),
      checkBytecode(token),
      fetchTotalSupply(token)
    ];
    if (twitter) fetches.push(fetchXActivity(twitter));
    else fetches.push(Promise.resolve(null));

    var results = await Promise.all(fetches);
    var dexData = results[0];
    var hasCode = results[1];
    var totalSupply = results[2];
    var xData = results[3];

    // Auto-discover GitHub via npm registry if not provided (free, no auth)
    var discoveredGithub = null;
    if (!github && dexData && dexData.pairs && dexData.pairs.length > 0) {
      var symForNpm = (dexData.pairs[0].baseToken && dexData.pairs[0].baseToken.symbol) || '';
      var nameForNpm = (dexData.pairs[0].baseToken && dexData.pairs[0].baseToken.name) || '';
      var npmResult = await discoverGitHubFromNpm(symForNpm, nameForNpm);
      if (npmResult && npmResult.handle) {
        github = npmResult.handle;
        discoveredGithub = npmResult;
      }
    }

    // Fetch GitHub activity if we have a handle (provided or discovered)
    var ghData = null;
    if (github) {
      ghData = await fetchGitHubActivity(github);
    }

    var result = computeEvaluation(token, dexData, hasCode, totalSupply, xData, ghData, twitter, github, isDemo, discoveredGithub);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(result);
  } catch (err) {
    console.error('evaluate_error:', err.message, err.stack);
    return res.status(500).json({ error: 'evaluation failed' });
  }
};

// ── EVALUATION ENGINE ──

function computeEvaluation(tokenAddr, dexData, hasCode, totalSupply, xData, ghData, twitter, github, isDemo, discoveredGithub) {
  var flags = [];
  var dataSources = ['dexscreener', 'base-rpc'];
  if (twitter) dataSources.push('x-api');
  if (github) dataSources.push('github-api');

  // Parse market data from DexScreener
  var mc = 0, fdv = 0, liquidity = 0, vol24h = 0, priceUsd = 0;
  var symbol = 'UNKNOWN', name = 'Unknown';
  var pairAge = 0, pairCount = 0;
  var txns24h = { buys: 0, sells: 0 };
  var hasDex = false;

  if (dexData && dexData.pairs && dexData.pairs.length > 0) {
    hasDex = true;
    var pairs = dexData.pairs
      .filter(function(p) { return p.chainId === 'base'; })
      .sort(function(a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
    if (pairs.length === 0) {
      pairs = dexData.pairs.sort(function(a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
    }
    var pair = pairs[0];
    pairCount = pairs.length;
    mc = pair.marketCap || pair.fdv || 0;
    fdv = pair.fdv || 0;
    liquidity = (pair.liquidity && pair.liquidity.usd) || 0;
    vol24h = (pair.volume && pair.volume.h24) || 0;
    symbol = (pair.baseToken && pair.baseToken.symbol) || 'UNKNOWN';
    name = (pair.baseToken && pair.baseToken.name) || 'Unknown';
    pairAge = pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 86400000 : 0;
    priceUsd = parseFloat(pair.priceUsd) || 0;
    txns24h = (pair.txns && pair.txns.h24) || { buys: 0, sells: 0 };
  }

  // ── 1. BUILDER CONVICTION (0-10) ──
  // "Is the founder still building when no one is watching?"
  var builderScore = 0;
  var builderSignals = [];

  var xOk = xData && !xData.error;
  var ghOk = ghData && !ghData.error;

  if (xOk) {
    var shipTweets = xData.shipping_tweets || 0;
    var tpd = xData.tweets_per_day || 0;

    // Shipping signal density (0-5)
    if (shipTweets >= 8)       { builderScore += 5; builderSignals.push(shipTweets + ' shipping signals in 7d (prolific)'); }
    else if (shipTweets >= 4)  { builderScore += 4; builderSignals.push(shipTweets + ' shipping signals in 7d (active)'); }
    else if (shipTweets >= 2)  { builderScore += 3; builderSignals.push(shipTweets + ' shipping signals in 7d (moderate)'); }
    else if (shipTweets >= 1)  { builderScore += 2; builderSignals.push(shipTweets + ' shipping signal in 7d'); }
    else if (tpd > 0)         { builderScore += 1; builderSignals.push('posting but no shipping signals detected'); }
    else                       { builderSignals.push('no X activity in 7 days'); flags.push('WARNING: zero X posting in past 7 days.'); }
  } else if (twitter) {
    builderSignals.push('X data unavailable: ' + (xData ? xData.error : 'fetch failed'));
  }

  if (ghOk) {
    var cpw = ghData.commits_per_week || 0;
    var activeDays = ghData.active_days || 0;

    // Commit velocity + consistency (0-5)
    if (cpw >= 15 && activeDays >= 15) { builderScore += 5; builderSignals.push(cpw + ' commits/week, ' + activeDays + '/30 active days (relentless)'); }
    else if (cpw >= 8)                 { builderScore += 4; builderSignals.push(cpw + ' commits/week, ' + activeDays + '/30 active days (strong)'); }
    else if (cpw >= 4)                 { builderScore += 3; builderSignals.push(cpw + ' commits/week, ' + activeDays + '/30 active days (steady)'); }
    else if (cpw >= 1)                 { builderScore += 2; builderSignals.push(cpw + ' commits/week, ' + activeDays + '/30 active days (light)'); }
    else if (activeDays > 0)           { builderScore += 1; builderSignals.push('some GitHub activity but minimal commits'); }
    else                               { builderSignals.push('no GitHub commits in 30 days'); flags.push('WARNING: zero GitHub commits in past 30 days.'); }
  } else if (github) {
    builderSignals.push('GitHub data unavailable: ' + (ghData ? ghData.error : 'fetch failed'));
  }

  if (!twitter && !github) {
    builderSignals.push('no builder handles provided. provide ?twitter= and/or ?github= for full scoring.');
  } else if (!ghOk && !github) {
    builderSignals.push('no github found. provide ?github= for up to 5 additional builder conviction points.');
  }

  // ── 2. COMMUNITY SEED (0-10) ──
  // "Are there real humans who genuinely care?"
  var communityScore = 0;
  var communitySignals = [];

  if (hasDex) {
    var buys = txns24h.buys || 0;
    var sells = txns24h.sells || 0;
    var totalTxns = buys + sells;
    var bsRatio = sells > 0 ? buys / sells : (buys > 0 ? 99 : 0);

    // Transaction count as proxy for community activity (0-4)
    if (totalTxns >= 1000)     { communityScore += 4; communitySignals.push(fmt(totalTxns) + ' txns/24h (high activity)'); }
    else if (totalTxns >= 200) { communityScore += 3; communitySignals.push(fmt(totalTxns) + ' txns/24h (moderate activity)'); }
    else if (totalTxns >= 50)  { communityScore += 2; communitySignals.push(totalTxns + ' txns/24h (low activity)'); }
    else if (totalTxns > 0)    { communityScore += 1; communitySignals.push(totalTxns + ' txns/24h (minimal)'); }
    else                        { communitySignals.push('zero transactions in 24h'); flags.push('DANGER: no trading activity in 24 hours.'); }

    // Buy/sell ratio health (0-3)
    if (bsRatio >= 1.3 && bsRatio < 50)       { communityScore += 3; communitySignals.push(bsRatio.toFixed(2) + ':1 buy/sell ratio (buyers dominant)'); }
    else if (bsRatio >= 0.8 && bsRatio < 1.3) { communityScore += 2; communitySignals.push(bsRatio.toFixed(2) + ':1 buy/sell ratio (balanced)'); }
    else if (bsRatio >= 0.5)                   { communityScore += 1; communitySignals.push(bsRatio.toFixed(2) + ':1 buy/sell ratio (sell pressure)'); }
    else if (totalTxns > 0)                    { communityScore += 0; communitySignals.push(bsRatio.toFixed(2) + ':1 buy/sell ratio (heavy selling)'); flags.push('WARNING: heavy sell pressure.'); }

    if (buys > 10 && sells === 0) {
      communityScore = Math.max(0, communityScore - 2);
      flags.push('DANGER: zero sells with ' + buys + ' buys. possible honeypot.');
    }

    // Volume relative to market cap (0-3)
    var volMcRatio = mc > 0 ? vol24h / mc * 100 : 0;
    if (volMcRatio >= 5 && volMcRatio <= 50)       { communityScore += 3; communitySignals.push(volMcRatio.toFixed(1) + '% vol/MC (healthy engagement)'); }
    else if (volMcRatio >= 1 && volMcRatio < 5)    { communityScore += 2; communitySignals.push(volMcRatio.toFixed(1) + '% vol/MC (quiet)'); }
    else if (volMcRatio > 50 && volMcRatio <= 100) { communityScore += 1; communitySignals.push(volMcRatio.toFixed(1) + '% vol/MC (elevated, possible wash)'); }
    else if (volMcRatio > 100)                     { communityScore += 0; communitySignals.push(volMcRatio.toFixed(1) + '% vol/MC (excessive)'); flags.push('WARNING: volume exceeds market cap. possible wash trading.'); }
    else                                            { communityScore += 0; communitySignals.push(volMcRatio.toFixed(1) + '% vol/MC (dead)'); }
  } else {
    communitySignals.push('no trading pairs found. cannot assess community activity.');
    flags.push('NO_DATA: no DEX pairs found for this token.');
  }

  // ── 3. ON-CHAIN PROOF (0-10) ──
  // "Contracts deployed. Transactions happening. Something real exists."
  var onchainScore = 0;
  var onchainSignals = [];

  // Bytecode verified (0-3)
  if (hasCode === true)  { onchainScore += 3; onchainSignals.push('contract bytecode verified on Base'); }
  else if (hasCode === null) { onchainScore += 1; onchainSignals.push('bytecode check inconclusive (RPC timeout)'); }
  else { onchainSignals.push('no bytecode found at address'); flags.push('DANGER: no contract code at this address.'); }

  // Total supply check (0-1)
  if (totalSupply !== null && totalSupply > 0) {
    onchainScore += 1;
    onchainSignals.push('supply: ' + fmtSupply(totalSupply));
  }

  // Pair maturity (0-3)
  if (hasDex) {
    if (pairAge > 30)      { onchainScore += 3; onchainSignals.push(Math.floor(pairAge) + 'd pair age (established)'); }
    else if (pairAge > 14) { onchainScore += 2; onchainSignals.push(Math.floor(pairAge) + 'd pair age (maturing)'); }
    else if (pairAge > 3)  { onchainScore += 1; onchainSignals.push(pairAge.toFixed(1) + 'd pair age (young)'); }
    else                   { onchainScore += 0; onchainSignals.push(pairAge.toFixed(1) + 'd pair age (very new)'); flags.push('CAUTION: pair less than 3 days old.'); }
  }

  // Liquidity depth (0-2)
  if (liquidity >= 50000)      { onchainScore += 2; onchainSignals.push('$' + fmt(liquidity) + ' liquidity (strong)'); }
  else if (liquidity >= 10000) { onchainScore += 1; onchainSignals.push('$' + fmt(liquidity) + ' liquidity (thin)'); }
  else if (liquidity > 0)      { onchainScore += 0; onchainSignals.push('$' + fmt(liquidity) + ' liquidity (dangerous)'); flags.push('DANGER: liquidity below $10K.'); }

  // DEX pair distribution (0-1)
  if (pairCount > 1)     { onchainScore += 1; onchainSignals.push(pairCount + ' DEX pairs (distributed)'); }
  else if (pairCount > 0) { onchainSignals.push('single DEX pair'); }

  // ── AGGREGATE ──
  var convictionScore = builderScore + communityScore + onchainScore;
  var convictionMax = 30;

  var convictionTier;
  if (convictionScore >= 25)      convictionTier = 'high';
  else if (convictionScore >= 20) convictionTier = 'medium-high';
  else if (convictionScore >= 15) convictionTier = 'medium';
  else if (convictionScore >= 10) convictionTier = 'low';
  else                            convictionTier = 'no conviction';

  // ── PRODUCT CLARITY ──
  var productClarity = 'unknown';
  if (xOk || ghOk) {
    var hasBuilderSignals = (xOk && (xData.shipping_tweets || 0) >= 2) || (ghOk && (ghData.commits_per_week || 0) >= 2);
    var weakMarket = mc < 100000 || liquidity < 5000;
    if (hasBuilderSignals && weakMarket) {
      productClarity = 'correctable';
    } else if (hasBuilderSignals) {
      productClarity = 'clear';
    } else {
      productClarity = 'unclear';
    }
  }

  // ── RECOMMENDATION ──
  var rec;
  var dangerCount = flags.filter(function(f) { return f.startsWith('DANGER'); }).length;
  if (convictionScore >= 25 && dangerCount === 0) {
    rec = 'high conviction. meets SIBYL acquisition criteria. deep engagement warranted.';
  } else if (convictionScore >= 20 && dangerCount === 0) {
    rec = 'strong signals across criteria. worth active surveillance and potential position.';
  } else if (convictionScore >= 15) {
    rec = 'moderate conviction. builder signals present but gaps remain. monitor.';
  } else if (convictionScore >= 10) {
    rec = 'low conviction. insufficient signals for acquisition. revisit if builder activity increases.';
  } else {
    rec = 'does not pass evaluation. ' + dangerCount + ' critical flag(s).';
  }

  // ── SUMMARY ──
  var parts = [];
  parts.push(symbol + ' conviction score: ' + convictionScore + '/' + convictionMax + ' (' + convictionTier + ').');
  parts.push('builder: ' + builderScore + '/10, community: ' + communityScore + '/10, on-chain: ' + onchainScore + '/10.');
  if (hasDex) parts.push('MC: $' + fmt(mc) + ', liquidity: $' + fmt(liquidity) + '.');
  if (productClarity === 'correctable') parts.push('product clarity is correctable: builder is shipping but market has not recognized it.');
  if (dangerCount > 0) parts.push(dangerCount + ' critical flag(s).');

  return {
    agent: 'SIBYL #20880',
    version: 'evaluate-v1',
    token: tokenAddr,
    symbol: symbol,
    name: name,
    chain: 'base',
    timestamp: new Date().toISOString(),
    conviction_score: convictionScore,
    conviction_max: convictionMax,
    conviction_tier: convictionTier,
    criteria: {
      builder_conviction: { score: builderScore, max: 10, signals: builderSignals },
      community_seed: { score: communityScore, max: 10, signals: communitySignals },
      onchain_proof: { score: onchainScore, max: 10, signals: onchainSignals }
    },
    product_clarity: productClarity,
    github_discovered: discoveredGithub || null,
    note: buildNote(twitter, github, ghOk, discoveredGithub),
    flags: flags,
    recommendation: rec,
    summary: parts.join(' '),
    data_sources: dataSources,
    demo: isDemo,
    feedback: ERC8004_FEEDBACK
  };
}

// ── DATA FETCHERS ──

async function fetchDexScreener(token) {
  var resp = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + token, {
    headers: { 'Accept': 'application/json' }
  });
  if (!resp.ok) throw new Error('DexScreener: ' + resp.status);
  return resp.json();
}

async function checkBytecode(token) {
  var rpcs = [RPC, 'https://mainnet.base.org', 'https://base.llamarpc.com'];
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

async function fetchTotalSupply(token) {
  var rpcs = [RPC, 'https://mainnet.base.org', 'https://base.llamarpc.com'];
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

async function fetchXActivity(handle) {
  var bearer = X_BEARER;
  if (!bearer) return { error: 'no_bearer_token' };
  if (bearer.indexOf('%') !== -1) {
    try { bearer = decodeURIComponent(bearer); } catch (e) {}
  }

  try {
    var url = 'https://api.twitter.com/2/tweets/search/recent'
      + '?query=from:' + encodeURIComponent(handle)
      + '&max_results=100'
      + '&tweet.fields=created_at,public_metrics';

    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 8000);
    var resp = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + bearer },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (resp.status === 403 || resp.status === 401 || resp.status === 429) {
      return fetchXActivityV1(handle, bearer);
    }

    if (!resp.ok) return { error: 'x_api_' + resp.status };

    var data = await resp.json();
    var tweets = data.data || [];
    return classifyTweets(tweets, handle, 'v2');
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'x_api_timeout' };
    return { error: err.message };
  }
}

async function fetchXActivityV1(handle, bearer) {
  try {
    var url = 'https://api.twitter.com/1.1/statuses/user_timeline.json'
      + '?screen_name=' + encodeURIComponent(handle)
      + '&count=200&exclude_replies=false&include_rts=false';

    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 8000);
    var resp = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + bearer },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!resp.ok) return { error: 'x_api_v1_' + resp.status };

    var tweets = await resp.json();
    var cutoff = Date.now() - 7 * 86400000;
    var recent = tweets.filter(function(t) { return new Date(t.created_at).getTime() > cutoff; });

    var SHIP_RE = /deploy|shipped|shipping|ship\s|push.*prod|commit\s*[a-f0-9]|merge.*PR|merged.*pull|v\d+\.\d|testnet|mainnet|smart.?contract|audit|refactor|integrat.*api|open.?source|changelog|patch|hotfix|bug.?fix|migrat/i;
    var shipCount = recent.filter(function(t) { return SHIP_RE.test(t.text || t.full_text || ''); }).length;

    var engagement = 0;
    recent.forEach(function(t) { engagement += (t.favorite_count || 0) + (t.retweet_count || 0); });

    return {
      handle: handle,
      period: '7d',
      total_tweets: recent.length,
      shipping_tweets: shipCount,
      avg_engagement: recent.length > 0 ? Math.round(engagement / recent.length) : 0,
      tweets_per_day: r1(recent.length / 7),
      shipping_ratio: recent.length > 0 ? Math.round(shipCount / recent.length * 100) : 0,
      source: 'v1.1'
    };
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'x_api_v1_timeout' };
    return { error: 'v1_' + err.message };
  }
}

function classifyTweets(tweets, handle, source) {
  var SHIP_RE = /deploy|shipped|shipping|ship\s|push.*prod|commit\s*[a-f0-9]|merge.*PR|merged.*pull|v\d+\.\d|testnet|mainnet|smart.?contract|audit|refactor|integrat.*api|open.?source|changelog|patch|hotfix|bug.?fix|migrat/i;

  var shipCount = tweets.filter(function(t) { return SHIP_RE.test(t.text || ''); }).length;
  var engagement = 0;
  tweets.forEach(function(t) {
    if (t.public_metrics) {
      engagement += (t.public_metrics.like_count || 0)
        + (t.public_metrics.retweet_count || 0)
        + (t.public_metrics.reply_count || 0);
    }
  });

  return {
    handle: handle,
    period: '7d',
    total_tweets: tweets.length,
    shipping_tweets: shipCount,
    avg_engagement: tweets.length > 0 ? Math.round(engagement / tweets.length) : 0,
    tweets_per_day: r1(tweets.length / 7),
    shipping_ratio: tweets.length > 0 ? Math.round(shipCount / tweets.length * 100) : 0,
    source: source
  };
}

async function fetchGitHubActivity(username) {
  try {
    var events = [];
    for (var page = 1; page <= 3; page++) {
      var url = 'https://api.github.com/users/' + encodeURIComponent(username)
        + '/events?per_page=100&page=' + page;

      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 5000);
      var resp = await fetch(url, {
        headers: Object.assign({ 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'SIBYL-Agent-20880' }, process.env.GITHUB_TOKEN ? { 'Authorization': 'token ' + process.env.GITHUB_TOKEN } : {}),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        if (resp.status === 404) return fetchGitHubOrgActivity(username);
        if (page === 1) return { error: 'github_' + resp.status };
        break;
      }
      var batch = await resp.json();
      if (batch.length === 0) break;
      events = events.concat(batch);
    }
    return processGitHubEvents(events, username);
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'github_timeout' };
    return { error: err.message };
  }
}

async function fetchGitHubOrgActivity(orgName) {
  try {
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 5000);
    var resp = await fetch(
      'https://api.github.com/orgs/' + encodeURIComponent(orgName) + '/events?per_page=100',
      {
        headers: Object.assign({ 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'SIBYL-Agent-20880' }, process.env.GITHUB_TOKEN ? { 'Authorization': 'token ' + process.env.GITHUB_TOKEN } : {}),
        signal: controller.signal
      }
    );
    clearTimeout(timeout);
    if (!resp.ok) return { error: 'github_org_' + resp.status };
    var events = await resp.json();
    return processGitHubEvents(events, orgName);
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'github_org_timeout' };
    return { error: 'org_' + err.message };
  }
}

function processGitHubEvents(events, username) {
  var cutoff = Date.now() - 30 * 86400000;
  var recent = events.filter(function(e) { return new Date(e.created_at).getTime() > cutoff; });

  var pushes = recent.filter(function(e) { return e.type === 'PushEvent'; });
  var prs = recent.filter(function(e) { return e.type === 'PullRequestEvent'; });
  var issues = recent.filter(function(e) { return e.type === 'IssuesEvent'; });

  var commits = 0;
  pushes.forEach(function(e) {
    commits += (e.payload && e.payload.commits) ? e.payload.commits.length : 0;
  });

  var repos = {};
  recent.forEach(function(e) { if (e.repo) repos[e.repo.name] = true; });

  var days = {};
  recent.forEach(function(e) { days[e.created_at.slice(0, 10)] = true; });

  return {
    username: username,
    period: '30d',
    total_events: recent.length,
    push_events: pushes.length,
    commits: commits,
    pull_requests: prs.length,
    issues_activity: issues.length,
    repos_active: Object.keys(repos).length,
    active_days: Object.keys(days).length,
    commits_per_week: r1(commits / 4.3),
    pushes_per_week: r1(pushes.length / 4.3)
  };
}

// ── GITHUB AUTO-DISCOVERY ──

// Look up npm registry for a package matching the token symbol/name (free, no auth)
async function discoverGitHubFromNpm(symbol, name) {
  if (!symbol && !name) return null;

  // Try symbol as package name first, then lowercase name
  var candidates = [];
  if (symbol) candidates.push(symbol.toLowerCase());
  if (name) {
    var cleaned = name.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (cleaned && candidates.indexOf(cleaned) === -1) candidates.push(cleaned);
    // Also try hyphenated version of multi-word names
    var hyphenated = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (hyphenated && candidates.indexOf(hyphenated) === -1) candidates.push(hyphenated);
  }

  for (var i = 0; i < candidates.length; i++) {
    try {
      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 3000);
      var resp = await fetch('https://registry.npmjs.org/' + encodeURIComponent(candidates[i]), {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!resp.ok) continue;

      var pkg = await resp.json();
      var repoUrl = '';
      if (pkg.repository) {
        repoUrl = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository.url || '');
      }

      var match = repoUrl.match(/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)/i);
      if (match) {
        return { handle: match[1].toLowerCase(), source: 'npm_registry', npm_package: candidates[i], repo: match[1] + '/' + match[2].replace(/\.git$/, '') };
      }
    } catch (e) {
      continue;
    }
  }

  return null;
}

// ── NOTE BUILDER ──

function buildNote(twitter, github, ghOk, discoveredGithub) {
  var missing = [];
  if (!twitter) missing.push('twitter');
  if (!github && !discoveredGithub) missing.push('github');

  if (missing.length === 0 && ghOk) return null;

  if (missing.length === 2) {
    return 'builder conviction scored 0/10 without twitter or github. provide ?twitter=handle&github=user for full analysis. github alone is worth up to 5 additional points.';
  }
  if (missing.indexOf('github') !== -1) {
    return 'builder conviction is capped at 5/10 without github data. provide ?github=user for up to 5 additional points. many projects ship from private repos or orgs that differ from their project name.';
  }
  if (github && !ghOk) {
    return 'github handle "' + github + '" returned no public activity. if the repo is private, github scoring is unavailable. the builder conviction score reflects X activity only.';
  }
  return null;
}

// ── UTILS ──

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

function fmtSupply(n) {
  if (n >= 1e15) return (n / 1e15).toFixed(1) + 'Q';
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  return String(Math.round(n));
}

function r1(n) { return Math.round(n * 10) / 10; }
