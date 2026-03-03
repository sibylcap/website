/* SIBYL Intelligence Report API.
   Generates branded SVG intelligence report, emails to requester.
   Payment: x402 ($5.00 USDC). Preview with ?demo=true.

   GET /api/report?token=0x...&email=user@example.com                 (paid, $5 USDC)
   GET /api/report?token=0x...&twitter=handle&github=user&email=...   (paid, full)
   GET /api/report?token=0x...&demo=true                              (free, JSON only)

   Params:
     token   (required) — ERC-20 contract address on Base
     email   (required for paid) — Delivery address for SVG report
     twitter (optional) — X handle (without @)
     github  (optional) — GitHub username or org
     demo    (optional) — bypass payment, JSON preview only
*/

var x402 = require('./_x402');
var RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
var X_BEARER = process.env.X_BEARER_TOKEN || '';
var PRICE_USD = 5.00;
var SHIP_RE = /deploy|ship|launch|release|update|commit|push|build|fix|refactor|merge|v\d|beta|alpha|testnet|mainnet|live|audit|contract|integrat/i;

var ERC8004_FEEDBACK = {
  message: 'Rate this response on-chain via ERC-8004 Reputation Registry',
  contract: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  agentId: 20880,
  method: 'giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'
};

// Rate limit: 1 report per email per hour (resets on cold start)
var EMAIL_WINDOW_MS = 60 * 60 * 1000;
var emailTracking = {};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT');
  res.setHeader('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE');

  if (req.method === 'OPTIONS') return res.status(200).end();

  var token = (req.query.token || '').toLowerCase();
  if (!token || !/^0x[a-f0-9]{40}$/.test(token)) {
    return res.status(400).json({ error: 'invalid token address. use ?token=0x...' });
  }

  var isDemo = req.query.demo === 'true';
  var email = (req.query.email || '').trim();
  var twitter = (req.query.twitter || '').replace(/^@/, '').toLowerCase();
  var github = (req.query.github || '').toLowerCase();

  if (!isDemo && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return res.status(400).json({ error: 'valid email required. use ?email=user@example.com' });
  }

  if (!isDemo && email) {
    var now = Date.now();
    var key = email.toLowerCase();
    if (emailTracking[key] && now - emailTracking[key] < EMAIL_WINDOW_MS) {
      return res.status(429).json({ error: 'rate limit: 1 report per email per hour.' });
    }
  }

  var paid = await x402.gate(req, res, {
    priceUsd: PRICE_USD,
    description: 'SIBYL intelligence report. branded SVG evaluation delivered to your email. scores builder conviction, community seed, and on-chain proof of work. $5 USDC.',
    discovery: {
      input: { token: '0x...', email: 'user@example.com', twitter: 'handle', github: 'user' },
      inputSchema: {
        properties: {
          token: { type: 'string', description: 'ERC-20 contract address on Base' },
          email: { type: 'string', description: 'Email address for report delivery' },
          twitter: { type: 'string', description: 'X handle without @' },
          github: { type: 'string', description: 'GitHub username or org' }
        },
        required: ['token', 'email']
      },
      output: { example: { status: 'delivered', report: { score: 24, tier: 'high_conviction' } } }
    }
  });
  if (!paid) return;

  try {
    var fetches = [
      fetchDexScreener(token),
      checkBytecodeWithSize(token),
      fetchTotalSupply(token)
    ];
    if (twitter) fetches.push(fetchXActivityWithTweets(twitter));
    else fetches.push(Promise.resolve(null));

    var results = await Promise.all(fetches);
    var dexData = results[0];
    var bytecodeInfo = results[1];
    var totalSupply = results[2];
    var xData = results[3];

    if (!github && dexData && dexData.pairs && dexData.pairs.length > 0) {
      var sym = (dexData.pairs[0].baseToken && dexData.pairs[0].baseToken.symbol) || '';
      var nm = (dexData.pairs[0].baseToken && dexData.pairs[0].baseToken.name) || '';
      var npmResult = await discoverGitHubFromNpm(sym, nm);
      if (npmResult && npmResult.handle) github = npmResult.handle;
    }

    var ghData = null;
    if (github) ghData = await fetchGitHubActivity(github);

    var evalResult = computeReport(token, dexData, bytecodeInfo, totalSupply, xData, ghData, twitter, github);

    if (isDemo) {
      return res.status(200).json({
        status: 'preview',
        demo: true,
        report: evalResult,
        note: 'demo mode: JSON preview only. pay $5 USDC via x402 and provide ?email= for the full SVG report.',
        feedback: ERC8004_FEEDBACK
      });
    }

    var svg = generateReportSVG(evalResult);
    var emailResult = await sendReportEmail(email, evalResult, svg);
    emailTracking[email.toLowerCase()] = Date.now();

    var response = {
      status: emailResult.success ? 'delivered' : 'delivery_failed',
      email: email,
      report: {
        token: evalResult.token,
        symbol: evalResult.symbol,
        name: evalResult.name,
        score: evalResult.conviction_score,
        tier: evalResult.conviction_tier,
        market_cap: evalResult.market.mc,
        builder_conviction: evalResult.scores.builder,
        community_seed: evalResult.scores.community,
        onchain_proof: evalResult.scores.onchain,
        product_clarity: evalResult.scores.clarity
      },
      feedback: ERC8004_FEEDBACK
    };

    if (!emailResult.success) {
      response.svg_base64 = Buffer.from(svg).toString('base64');
      response.email_error = emailResult.error;
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error('report_error:', err.message, err.stack);
    return res.status(500).json({ error: 'report generation failed' });
  }
};

// ── EVALUATION ENGINE ──

function computeReport(tokenAddr, dexData, bytecodeInfo, totalSupply, xData, ghData, twitter, github) {
  var mc = 0, fdv = 0, liquidity = 0, vol24h = 0, priceUsd = 0, change24h = 0;
  var symbol = 'UNKNOWN', name = 'Unknown';
  var pairAge = 0, pairCount = 0;
  var buys = 0, sells = 0, totalTxns = 0;
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
    var txns24h = (pair.txns && pair.txns.h24) || { buys: 0, sells: 0 };
    buys = txns24h.buys || 0;
    sells = txns24h.sells || 0;
    totalTxns = buys + sells;
    change24h = (pair.priceChange && pair.priceChange.h24) ? parseFloat(pair.priceChange.h24) : 0;
  }

  var hasCode = bytecodeInfo ? bytecodeInfo.hasCode : null;
  var bytecodeSize = bytecodeInfo ? bytecodeInfo.size : 0;
  var xOk = xData && !xData.error;
  var ghOk = ghData && !ghData.error;

  // ── BUILDER CONVICTION (0-10) ──
  // Inactivity is weighted heavily. 5+ days of silence in this market is a red flag.
  var builderScore = 0;
  var xInactive = true;
  var ghInactive = true;

  if (xOk) {
    var shipTweets = xData.shipping_tweets || 0;
    var tpd = xData.tweets_per_day || 0;
    if (shipTweets >= 8)       builderScore += 5;
    else if (shipTweets >= 4)  builderScore += 4;
    else if (shipTweets >= 2)  builderScore += 3;
    else if (shipTweets >= 1)  builderScore += 2;
    else if (tpd > 0)         builderScore += 1;
    xInactive = (shipTweets === 0 && tpd < 0.2);
  }

  if (ghOk) {
    var cpw = ghData.commits_per_week || 0;
    var activeDays = ghData.active_days || 0;
    if (cpw >= 15 && activeDays >= 15)  builderScore += 5;
    else if (cpw >= 8)                  builderScore += 4;
    else if (cpw >= 4)                  builderScore += 3;
    else if (cpw >= 1)                  builderScore += 2;
    else if (activeDays > 0)            builderScore += 1;
    ghInactive = (cpw < 1 && activeDays < 3);
  }

  // Heavy penalty: if both X and GitHub are inactive (and we have data), cap builder score at 1.
  // 5 days of silence in this market is uninvestable.
  var fullyInactive = false;
  if (xOk && ghOk && xInactive && ghInactive) {
    builderScore = Math.min(builderScore, 1);
    fullyInactive = true;
  } else if (xOk && !github && xInactive) {
    builderScore = Math.min(builderScore, 1);
    fullyInactive = true;
  } else if (!twitter && ghOk && ghInactive) {
    builderScore = Math.min(builderScore, 1);
    fullyInactive = true;
  }

  // ── COMMUNITY SEED (0-10) ──
  var communityScore = 0;
  if (hasDex) {
    var bsRatio = sells > 0 ? buys / sells : (buys > 0 ? 99 : 0);

    if (totalTxns >= 1000)      communityScore += 4;
    else if (totalTxns >= 200)  communityScore += 3;
    else if (totalTxns >= 50)   communityScore += 2;
    else if (totalTxns > 0)     communityScore += 1;

    if (bsRatio >= 1.3 && bsRatio < 50)       communityScore += 3;
    else if (bsRatio >= 0.8 && bsRatio < 1.3) communityScore += 2;
    else if (bsRatio >= 0.5)                   communityScore += 1;

    if (buys > 10 && sells === 0) communityScore = Math.max(0, communityScore - 2);

    var volMcRatio = mc > 0 ? vol24h / mc * 100 : 0;
    if (volMcRatio >= 5 && volMcRatio <= 50)       communityScore += 3;
    else if (volMcRatio >= 1 && volMcRatio < 5)    communityScore += 2;
    else if (volMcRatio > 50 && volMcRatio <= 100) communityScore += 1;
  }

  // ── ON-CHAIN PROOF (0-10) ──
  var onchainScore = 0;
  if (hasCode === true)       onchainScore += 3;
  else if (hasCode === null)  onchainScore += 1;

  if (totalSupply !== null && totalSupply > 0) onchainScore += 1;

  if (hasDex) {
    if (pairAge > 30)       onchainScore += 3;
    else if (pairAge > 14)  onchainScore += 2;
    else if (pairAge > 3)   onchainScore += 1;

    if (liquidity >= 50000)       onchainScore += 2;
    else if (liquidity >= 10000)  onchainScore += 1;

    if (pairCount > 1) onchainScore += 1;
  }

  // ── PRODUCT CLARITY (0-5, correctable) ──
  var clarityScore = 0;
  if (twitter) clarityScore += 1;
  if (github) clarityScore += 1;
  if (name && name.length > 1 && !/^0x[a-f0-9]+$/i.test(name)) clarityScore += 1;
  if (xOk && (xData.shipping_tweets || 0) >= 2) clarityScore += 1;
  if (ghOk && (ghData.commits_per_week || 0) >= 2) clarityScore += 1;

  // ── TOTAL ──
  var convictionScore = builderScore + communityScore + onchainScore;
  var tier;
  if (convictionScore >= 25)      tier = 'high_conviction';
  else if (convictionScore >= 20) tier = 'medium_high';
  else if (convictionScore >= 15) tier = 'medium';
  else if (convictionScore >= 10) tier = 'low';
  else                            tier = 'no_conviction';

  // ── STRENGTHS & CONCERNS ──
  var strengths = [];
  var concerns = [];

  if (builderScore >= 7) strengths.push('Active builder with shipping signals');
  if (builderScore >= 4 && builderScore < 7) strengths.push('Moderate builder activity detected');
  if (fullyInactive) concerns.push('Builder inactive. uninvestable until activity resumes');
  else if (builderScore <= 3 && (twitter || github)) concerns.push('Low shipping activity in past 7 days');
  if (xOk && xData.tweets_per_day < 0.2 && twitter) concerns.push('Near-zero X posting. 5+ days silence is a red flag');

  if (liquidity > 50000) strengths.push('Healthy liquidity pool');
  if (liquidity > 0 && liquidity < 5000) concerns.push('Very low liquidity');
  if (mc > 100000) strengths.push('Established market cap');
  if (change24h < -20) concerns.push('Significant price decline (' + change24h.toFixed(1) + '%)');
  if (hasCode === true) strengths.push('Contract verified on Base');
  if (hasCode === false) concerns.push('Contract not verified');
  if (pairAge > 0 && pairAge < 7) concerns.push('Very new token (< 7 days)');
  if (pairAge > 30) strengths.push('Established pair (' + Math.floor(pairAge) + ' days)');
  if (ghOk && (ghData.commits || 0) > 0) strengths.push('Active GitHub repository');
  if (ghOk && ghInactive) concerns.push('GitHub gone quiet. no commits in recent weeks');
  if (communityScore >= 7) strengths.push('Strong community engagement');
  if (buys > 10 && sells === 0) concerns.push('Possible honeypot (zero sells)');
  if (vol24h > 50000) strengths.push('High trading volume');
  if (!twitter && !github) concerns.push('No builder handles provided. cannot assess conviction');

  var timeline = [];
  if (xData && xData.shipping_tweet_details) {
    timeline = xData.shipping_tweet_details.slice(0, 6);
  }

  return {
    token: tokenAddr, symbol: symbol, name: name, chain: 'base',
    date: new Date().toISOString().slice(0, 10),
    conviction_score: convictionScore, conviction_tier: tier,
    scores: { builder: builderScore, community: communityScore, onchain: onchainScore, clarity: clarityScore },
    market: { price: priceUsd, mc: mc, fdv: fdv, liquidity: liquidity, volume_24h: vol24h, change_24h: change24h, txns_24h: { buys: buys, sells: sells } },
    onchain: { has_code: hasCode, bytecode_size: bytecodeSize, total_supply: totalSupply, pair_age_days: Math.floor(pairAge) },
    timeline: timeline, strengths: strengths, concerns: concerns,
    twitter: twitter || null, github: github || null
  };
}

// ── DATA FETCHERS ──

async function fetchDexScreener(token) {
  var resp = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + token, { headers: { 'Accept': 'application/json' } });
  if (!resp.ok) throw new Error('DexScreener: ' + resp.status);
  return resp.json();
}

async function checkBytecodeWithSize(token) {
  var rpcs = [RPC, 'https://mainnet.base.org', 'https://base.llamarpc.com'];
  for (var i = 0; i < rpcs.length; i++) {
    try {
      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 3000);
      var resp = await fetch(rpcs[i], {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getCode', params: [token, 'latest'], id: 1 }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      var data = await resp.json();
      if (data.result && data.result !== '0x' && data.result.length > 2) {
        return { hasCode: true, size: Math.floor((data.result.length - 2) / 2) };
      }
      if (data.result === '0x') return { hasCode: false, size: 0 };
    } catch (e) { continue; }
  }
  return { hasCode: null, size: 0 };
}

async function fetchTotalSupply(token) {
  var rpcs = [RPC, 'https://mainnet.base.org', 'https://base.llamarpc.com'];
  for (var i = 0; i < rpcs.length; i++) {
    try {
      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 3000);
      var resp = await fetch(rpcs[i], {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: token, data: '0x18160ddd' }, 'latest'], id: 1 }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      var data = await resp.json();
      if (data.result && data.result !== '0x') return parseInt(data.result, 16) / 1e18;
    } catch (e) { continue; }
  }
  return null;
}

async function fetchXActivityWithTweets(handle) {
  var bearer = X_BEARER;
  if (!bearer) return { error: 'no_bearer_token' };
  if (bearer.indexOf('%') !== -1) { try { bearer = decodeURIComponent(bearer); } catch (e) {} }

  try {
    var url = 'https://api.twitter.com/2/tweets/search/recent'
      + '?query=from:' + encodeURIComponent(handle)
      + '&max_results=100&tweet.fields=created_at,public_metrics';
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 8000);
    var resp = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + bearer },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (resp.status === 403 || resp.status === 401 || resp.status === 429) {
      return fetchXWithTweetsV1(handle, bearer);
    }
    if (!resp.ok) return { error: 'x_api_' + resp.status };

    var data = await resp.json();
    var tweets = data.data || [];
    return classifyWithDetails(tweets, handle, 'v2');
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'x_api_timeout' };
    return { error: err.message };
  }
}

async function fetchXWithTweetsV1(handle, bearer) {
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
    var shipMatches = recent.filter(function(t) { return SHIP_RE.test(t.text || t.full_text || ''); });
    var engagement = 0;
    recent.forEach(function(t) { engagement += (t.favorite_count || 0) + (t.retweet_count || 0); });

    var details = shipMatches.slice(0, 6).map(function(t) {
      return { date: new Date(t.created_at).toISOString().slice(0, 10), text: (t.text || t.full_text || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() };
    });

    return {
      handle: handle, period: '7d', total_tweets: recent.length, shipping_tweets: shipMatches.length,
      avg_engagement: recent.length > 0 ? Math.round(engagement / recent.length) : 0,
      tweets_per_day: r1(recent.length / 7),
      shipping_ratio: recent.length > 0 ? Math.round(shipMatches.length / recent.length * 100) : 0,
      shipping_tweet_details: details, source: 'v1.1'
    };
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'x_api_v1_timeout' };
    return { error: 'v1_' + err.message };
  }
}

function classifyWithDetails(tweets, handle, source) {
  var shipMatches = tweets.filter(function(t) { return SHIP_RE.test(t.text || ''); });
  var engagement = 0;
  tweets.forEach(function(t) {
    if (t.public_metrics) engagement += (t.public_metrics.like_count || 0) + (t.public_metrics.retweet_count || 0) + (t.public_metrics.reply_count || 0);
  });
  var details = shipMatches.slice(0, 6).map(function(t) {
    return { date: t.created_at ? t.created_at.slice(0, 10) : 'unknown', text: (t.text || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() };
  });
  return {
    handle: handle, period: '7d', total_tweets: tweets.length, shipping_tweets: shipMatches.length,
    avg_engagement: tweets.length > 0 ? Math.round(engagement / tweets.length) : 0,
    tweets_per_day: r1(tweets.length / 7),
    shipping_ratio: tweets.length > 0 ? Math.round(shipMatches.length / tweets.length * 100) : 0,
    shipping_tweet_details: details, source: source
  };
}

async function fetchGitHubActivity(username) {
  try {
    var events = [];
    for (var page = 1; page <= 3; page++) {
      var url = 'https://api.github.com/users/' + encodeURIComponent(username) + '/events?per_page=100&page=' + page;
      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 5000);
      var resp = await fetch(url, {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'SIBYL-Agent-20880' },
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
    var resp = await fetch('https://api.github.com/orgs/' + encodeURIComponent(orgName) + '/events?per_page=100', {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'SIBYL-Agent-20880' },
      signal: controller.signal
    });
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
  var commits = 0;
  pushes.forEach(function(e) { commits += (e.payload && e.payload.commits) ? e.payload.commits.length : 0; });
  var days = {};
  recent.forEach(function(e) { days[e.created_at.slice(0, 10)] = true; });
  return {
    username: username, period: '30d', total_events: recent.length,
    push_events: pushes.length, commits: commits, active_days: Object.keys(days).length,
    commits_per_week: r1(commits / 4.3), pushes_per_week: r1(pushes.length / 4.3)
  };
}

async function discoverGitHubFromNpm(symbol, name) {
  if (!symbol && !name) return null;
  var candidates = [];
  if (symbol) candidates.push(symbol.toLowerCase());
  if (name) {
    var cleaned = name.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (cleaned && candidates.indexOf(cleaned) === -1) candidates.push(cleaned);
    var hyphenated = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (hyphenated && candidates.indexOf(hyphenated) === -1) candidates.push(hyphenated);
  }
  for (var i = 0; i < candidates.length; i++) {
    try {
      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 3000);
      var resp = await fetch('https://registry.npmjs.org/' + encodeURIComponent(candidates[i]), {
        headers: { 'Accept': 'application/json' }, signal: controller.signal
      });
      clearTimeout(timeout);
      if (!resp.ok) continue;
      var pkg = await resp.json();
      var repoUrl = '';
      if (pkg.repository) repoUrl = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository.url || '');
      var match = repoUrl.match(/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)/i);
      if (match) return { handle: match[1].toLowerCase(), source: 'npm_registry', npm_package: candidates[i] };
    } catch (e) { continue; }
  }
  return null;
}

// ── SVG GENERATION ──

function generateReportSVG(data) {
  var esc = function(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var W = 900, H = 1200;
  var BG = '#0a0a0f', GOLD = '#c4a862', RED = '#e85a5a', GREEN = '#4ade80', DIM = '#555', WHITE = '#e0e0e0', DARKBG = '#111118';
  var LM = 60, CW = W - 120;
  var L = [];

  L.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">');
  L.push('<defs><style>');
  L.push('text { font-family: "SF Mono","Fira Code","Cascadia Code",Consolas,"Liberation Mono",monospace; }');
  L.push('.hdr { fill:' + GOLD + '; font-size:24px; font-weight:700; letter-spacing:4px; }');
  L.push('.dt { fill:' + DIM + '; font-size:13px; }');
  L.push('.ttl { fill:' + WHITE + '; font-size:28px; font-weight:700; }');
  L.push('.sub { fill:' + DIM + '; font-size:13px; letter-spacing:2px; }');
  L.push('.sb { fill:' + WHITE + '; font-size:54px; font-weight:700; }');
  L.push('.sm { fill:' + DIM + '; font-size:20px; }');
  L.push('.tr { fill:' + GOLD + '; font-size:14px; letter-spacing:2px; }');
  L.push('.lb { fill:' + DIM + '; font-size:11px; letter-spacing:1px; }');
  L.push('.vl { fill:' + WHITE + '; font-size:16px; font-weight:600; }');
  L.push('.bl { fill:' + WHITE + '; font-size:13px; }');
  L.push('.bs { fill:' + GOLD + '; font-size:13px; font-weight:600; }');
  L.push('.sc { fill:' + GOLD + '; font-size:12px; letter-spacing:3px; font-weight:600; }');
  L.push('.td { fill:' + DIM + '; font-size:11px; }');
  L.push('.tt { fill:' + WHITE + '; font-size:11px; }');
  L.push('.sg { fill:' + GREEN + '; font-size:11px; }');
  L.push('.cn { fill:' + RED + '; font-size:11px; }');
  L.push('.ft { fill:' + DIM + '; font-size:10px; }');
  L.push('.fb { fill:' + GOLD + '; font-size:14px; font-weight:700; letter-spacing:3px; }');
  L.push('</style></defs>');

  // Background
  L.push('<rect width="' + W + '" height="' + H + '" fill="' + BG + '"/>');

  // Header
  L.push('<text x="' + LM + '" y="42" class="hdr">SIBYL INTELLIGENCE</text>');
  L.push('<text x="' + (W - LM) + '" y="42" class="dt" text-anchor="end">' + esc(data.date) + '</text>');
  L.push('<line x1="' + LM + '" y1="55" x2="' + (W - LM) + '" y2="55" stroke="' + GOLD + '" stroke-width="0.5" opacity="0.4"/>');

  // Title
  var displayName = esc(data.name);
  if (displayName.length > 30) displayName = displayName.slice(0, 30) + '...';
  L.push('<text x="' + LM + '" y="95" class="ttl">' + displayName + ' (' + esc(data.symbol) + ')</text>');
  L.push('<text x="' + LM + '" y="115" class="sub">BASE CHAIN</text>');
  var truncAddr = data.token.slice(0, 6) + '...' + data.token.slice(-4);
  L.push('<text x="' + (LM + 120) + '" y="115" class="sub">' + esc(truncAddr) + '</text>');

  // Score circle
  var cx = W / 2, cy = 225;
  var radius = 65, circ = 2 * Math.PI * radius;
  var scoreRatio = data.conviction_score / 30;
  var offset = circ * (1 - scoreRatio);
  var sColor = data.conviction_score >= 20 ? GREEN : (data.conviction_score >= 10 ? GOLD : RED);

  L.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="' + DARKBG + '" stroke-width="8"/>');
  L.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="' + sColor + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>');
  L.push('<text x="' + cx + '" y="' + (cy + 8) + '" class="sb" text-anchor="middle">' + data.conviction_score + '</text>');
  L.push('<text x="' + cx + '" y="' + (cy + 30) + '" class="sm" text-anchor="middle">/30</text>');
  var tierDisplay = data.conviction_tier.replace(/_/g, ' ').toUpperCase();
  L.push('<text x="' + cx + '" y="' + (cy + radius + 30) + '" class="tr" text-anchor="middle">' + esc(tierDisplay) + '</text>');

  // Market data row
  var my = 345;
  L.push('<line x1="' + LM + '" y1="' + (my - 15) + '" x2="' + (W - LM) + '" y2="' + (my - 15) + '" stroke="' + GOLD + '" stroke-width="0.5" opacity="0.2"/>');
  var cols = [
    { label: 'PRICE', value: '$' + fmtPrice(data.market.price) },
    { label: 'MARKET CAP', value: '$' + fmt(data.market.mc) },
    { label: 'LIQUIDITY', value: '$' + fmt(data.market.liquidity) },
    { label: 'VOLUME 24H', value: '$' + fmt(data.market.volume_24h) },
    { label: '24H CHANGE', value: (data.market.change_24h >= 0 ? '+' : '') + data.market.change_24h.toFixed(1) + '%', color: data.market.change_24h >= 0 ? GREEN : RED }
  ];
  var colW = CW / cols.length;
  for (var i = 0; i < cols.length; i++) {
    var colX = LM + i * colW + colW / 2;
    L.push('<text x="' + colX + '" y="' + my + '" class="lb" text-anchor="middle">' + cols[i].label + '</text>');
    var vs = cols[i].color ? ' style="fill:' + cols[i].color + ';"' : '';
    L.push('<text x="' + colX + '" y="' + (my + 22) + '" class="vl" text-anchor="middle"' + vs + '>' + esc(cols[i].value) + '</text>');
  }

  // Scorecard bars
  var by = 405;
  L.push('<text x="' + LM + '" y="' + by + '" class="sc">SCORECARD</text>');
  by += 25;
  var bars = [
    { label: 'Builder Conviction', score: data.scores.builder, max: 10, color: GOLD },
    { label: 'Community Seed', score: data.scores.community, max: 10, color: GOLD },
    { label: 'On-Chain Proof of Work', score: data.scores.onchain, max: 10, color: GOLD },
    { label: 'Product Clarity (correctable)', score: data.scores.clarity, max: 5, color: data.scores.clarity <= 2 ? RED : GOLD }
  ];
  var barMaxW = 340, barH = 16, barX = LM + 280;
  for (var b = 0; b < bars.length; b++) {
    var barY = by + b * 38;
    L.push('<text x="' + LM + '" y="' + (barY + 12) + '" class="bl">' + esc(bars[b].label) + '</text>');
    L.push('<rect x="' + barX + '" y="' + barY + '" width="' + barMaxW + '" height="' + barH + '" rx="3" fill="' + DARKBG + '"/>');
    var fillW = Math.round((bars[b].score / bars[b].max) * barMaxW);
    if (fillW > 0) L.push('<rect x="' + barX + '" y="' + barY + '" width="' + fillW + '" height="' + barH + '" rx="3" fill="' + bars[b].color + '" opacity="0.8"/>');
    L.push('<text x="' + (barX + barMaxW + 15) + '" y="' + (barY + 12) + '" class="bs">' + bars[b].score + '/' + bars[b].max + '</text>');
  }

  // On-chain section
  var oy = by + 4 * 38 + 15;
  L.push('<line x1="' + LM + '" y1="' + oy + '" x2="' + (W - LM) + '" y2="' + oy + '" stroke="' + GOLD + '" stroke-width="0.5" opacity="0.2"/>');
  oy += 20;
  L.push('<text x="' + LM + '" y="' + oy + '" class="sc">ON-CHAIN</text>');
  oy += 22;
  var codeColor = data.onchain.has_code === true ? GREEN : (data.onchain.has_code === false ? RED : GOLD);
  var codeLabel = data.onchain.has_code === true ? 'VERIFIED' : (data.onchain.has_code === false ? 'NOT FOUND' : 'INCONCLUSIVE');
  L.push('<circle cx="' + (LM + 6) + '" cy="' + (oy - 4) + '" r="4" fill="' + codeColor + '"/>');
  L.push('<text x="' + (LM + 18) + '" y="' + oy + '" class="tt">Contract: ' + codeLabel + '</text>');
  if (data.onchain.bytecode_size > 0) L.push('<text x="' + (LM + 240) + '" y="' + oy + '" class="td">' + fmt(data.onchain.bytecode_size) + ' bytes</text>');
  if (data.onchain.pair_age_days > 0) L.push('<text x="' + (LM + 400) + '" y="' + oy + '" class="td">Pair age: ' + data.onchain.pair_age_days + 'd</text>');
  if (data.onchain.total_supply) L.push('<text x="' + (LM + 560) + '" y="' + oy + '" class="td">Supply: ' + fmtSupply(data.onchain.total_supply) + '</text>');

  // Timeline
  var ty = oy + 30;
  L.push('<line x1="' + LM + '" y1="' + ty + '" x2="' + (W - LM) + '" y2="' + ty + '" stroke="' + GOLD + '" stroke-width="0.5" opacity="0.2"/>');
  ty += 20;
  L.push('<text x="' + LM + '" y="' + ty + '" class="sc">SHIPPING TIMELINE</text>');
  ty += 20;
  if (data.timeline.length === 0) {
    L.push('<circle cx="' + (LM + 6) + '" cy="' + (ty - 4) + '" r="4" fill="' + RED + '"/>');
    L.push('<text x="' + (LM + 18) + '" y="' + ty + '" class="cn">No shipping signals detected in past 7 days</text>');
    ty += 20;
  } else {
    for (var t = 0; t < data.timeline.length; t++) {
      var tw = data.timeline[t];
      L.push('<circle cx="' + (LM + 6) + '" cy="' + (ty - 4) + '" r="4" fill="' + GREEN + '"/>');
      L.push('<text x="' + (LM + 18) + '" y="' + ty + '" class="td">' + esc(tw.date) + '</text>');
      var txt = tw.text.length > 80 ? tw.text.slice(0, 77) + '...' : tw.text;
      L.push('<text x="' + (LM + 105) + '" y="' + ty + '" class="tt">' + esc(txt) + '</text>');
      ty += 28;
    }
  }

  // Strengths and concerns
  var sy = ty + 10;
  L.push('<line x1="' + LM + '" y1="' + sy + '" x2="' + (W - LM) + '" y2="' + sy + '" stroke="' + GOLD + '" stroke-width="0.5" opacity="0.2"/>');
  sy += 20;
  var halfW = CW / 2;
  L.push('<text x="' + LM + '" y="' + sy + '" class="sc">STRENGTHS</text>');
  L.push('<text x="' + (LM + halfW + 20) + '" y="' + sy + '" class="sc">CONCERNS</text>');
  sy += 22;
  var maxItems = Math.max(data.strengths.length, data.concerns.length, 1);
  if (maxItems > 6) maxItems = 6;
  for (var si = 0; si < maxItems; si++) {
    if (si < data.strengths.length) {
      var sText = data.strengths[si].length > 38 ? data.strengths[si].slice(0, 35) + '...' : data.strengths[si];
      L.push('<circle cx="' + (LM + 6) + '" cy="' + (sy - 4) + '" r="3" fill="' + GREEN + '"/>');
      L.push('<text x="' + (LM + 16) + '" y="' + sy + '" class="sg">' + esc(sText) + '</text>');
    }
    if (si < data.concerns.length) {
      var cxPos = LM + halfW + 20;
      var cText = data.concerns[si].length > 38 ? data.concerns[si].slice(0, 35) + '...' : data.concerns[si];
      L.push('<circle cx="' + (cxPos + 6) + '" cy="' + (sy - 4) + '" r="3" fill="' + RED + '"/>');
      L.push('<text x="' + (cxPos + 16) + '" y="' + sy + '" class="cn">' + esc(cText) + '</text>');
    }
    sy += 22;
  }

  // Footer
  var fy = H - 50;
  L.push('<line x1="' + LM + '" y1="' + (fy - 15) + '" x2="' + (W - LM) + '" y2="' + (fy - 15) + '" stroke="' + GOLD + '" stroke-width="0.5" opacity="0.2"/>');
  L.push('<text x="' + LM + '" y="' + fy + '" class="fb">SIBYL</text>');
  L.push('<text x="' + (LM + 80) + '" y="' + fy + '" class="ft">sibylcap.com</text>');
  L.push('<text x="' + (W - LM) + '" y="' + fy + '" class="ft" text-anchor="end">' + esc(data.token) + '</text>');

  L.push('</svg>');
  return L.join('\n');
}

// ── EMAIL DELIVERY ──

async function sendReportEmail(toEmail, evalResult, svg) {
  var clientId = process.env.GOOGLE_CLIENT_ID;
  var clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  var refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return { success: false, error: 'email_not_configured' };

  try {
    var authRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        refresh_token: refreshToken, grant_type: 'refresh_token'
      })
    });
    var auth = await authRes.json();
    if (!auth.access_token) return { success: false, error: 'auth_failed' };

    var filename = 'SIBYL_' + evalResult.symbol + '_Report.svg';
    var svgBase64 = Buffer.from(svg).toString('base64');
    var boundary = 'sibyl_report_' + Date.now();
    var tierLabel = evalResult.conviction_tier.replace(/_/g, ' ');

    var bodyText = [
      'SIBYL Intelligence Report: ' + evalResult.symbol,
      '',
      'Score: ' + evalResult.conviction_score + '/30 (' + tierLabel + ')',
      'Builder Conviction: ' + evalResult.scores.builder + '/10',
      'Community Seed: ' + evalResult.scores.community + '/10',
      'On-Chain Proof: ' + evalResult.scores.onchain + '/10',
      'Product Clarity: ' + evalResult.scores.clarity + '/5 (correctable)',
      '',
      'Full report attached.',
      '',
      '- SIBYL'
    ].join('\r\n');

    var rawEmail = [
      'From: sibylcap@gmail.com',
      'To: ' + toEmail,
      'Bcc: tradingtulips@gmail.com',
      'Subject: SIBYL Intelligence Report: ' + evalResult.symbol + ' (' + evalResult.conviction_score + '/30)',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary=' + boundary,
      '',
      '--' + boundary,
      'Content-Type: text/plain; charset=utf-8',
      '',
      bodyText,
      '',
      '--' + boundary,
      'Content-Type: image/svg+xml; name="' + filename + '"',
      'Content-Disposition: attachment; filename="' + filename + '"',
      'Content-Transfer-Encoding: base64',
      '',
      svgBase64,
      '',
      '--' + boundary + '--'
    ].join('\r\n');

    var encodedEmail = Buffer.from(rawEmail).toString('base64url');
    var sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encodedEmail })
    });
    var result = await sendRes.json();
    if (result.id) return { success: true, messageId: result.id };
    return { success: false, error: result.error ? result.error.message : 'send_failed' };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
function fmtPrice(n) {
  if (n === 0) return '0.00';
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  if (n >= 0.000001) return n.toFixed(8).replace(/0+$/, '');
  return n.toExponential(2);
}
function r1(n) { return Math.round(n * 10) / 10; }
