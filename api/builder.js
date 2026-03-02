/* SIBYL Builder Value Score API.
   Compares builder shipping velocity (X posts + GitHub commits) to market cap.
   Identifies undervalued builders: those creating more value than the token reflects.
   Payment: x402 ($0.10 USDC per call). Free with ?demo=true.

   Usage:
     GET /api/builder?token=0x...&twitter=handle&github=user           (paid, $0.10 USDC)
     GET /api/builder?token=0x...&twitter=handle&github=user&demo=true (free, same output)

   At least one of twitter or github is required. Both recommended for full analysis.
*/

var x402 = require('./_x402');
var PRICE_USD = 0.10;
var X_BEARER = process.env.X_BEARER_TOKEN || '';

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
  var twitter = (req.query.twitter || '').replace(/^@/, '').toLowerCase();
  var github = (req.query.github || '').toLowerCase();

  if (!token || !/^0x[a-f0-9]{40}$/.test(token)) {
    return res.status(400).json({ error: 'invalid token address. use ?token=0x...' });
  }
  if (!twitter && !github) {
    return res.status(400).json({ error: 'provide at least one: ?twitter=handle or ?github=user' });
  }

  var paid = await x402.gate(req, res, {
    priceUsd: PRICE_USD,
    description: 'SIBYL builder value score. compares shipping velocity (X posts + GitHub commits) to market cap to find undervalued builders.',
    discovery: {
      input: { token: '0x...', twitter: 'handle', github: 'user' },
      inputSchema: { properties: { token: { type: 'string', description: 'ERC-20 contract address on Base' }, twitter: { type: 'string', description: 'X handle without @' }, github: { type: 'string', description: 'GitHub username or org' } }, required: ['token'] },
      output: { example: { builder_score: 93, grade: 'A', value_rating: 'deeply_undervalued', x_activity: {}, github_activity: {} } }
    }
  });
  if (!paid) return;

  var isDemo = req.query.demo === 'true';

  try {
    var fetches = [fetchDexScreener(token)];
    fetches.push(twitter ? fetchXActivity(twitter) : Promise.resolve(null));
    fetches.push(github ? fetchGitHubActivity(github) : Promise.resolve(null));

    var results = await Promise.all(fetches);
    var result = computeScore(token, results[0], results[1], results[2], twitter, github, isDemo);

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.status(200).json(result);
  } catch (err) {
    console.error('builder_error:', err.message, err.stack);
    return res.status(500).json({ error: 'builder score failed' });
  }
};

// ── SCORING ENGINE ──

function computeScore(tokenAddr, dexData, xData, ghData, twitter, github, isDemo) {
  var components = {};
  var flags = [];
  var rawTotal = 0;
  var maxPossible = 0;

  // Parse market data
  var mc = 0, liquidity = 0, vol24h = 0, symbol = 'UNKNOWN', name = 'Unknown';
  var pairAge = 0, priceUsd = 0, fdv = 0;
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
    mc = pair.marketCap || pair.fdv || 0;
    fdv = pair.fdv || 0;
    liquidity = (pair.liquidity && pair.liquidity.usd) || 0;
    vol24h = (pair.volume && pair.volume.h24) || 0;
    symbol = (pair.baseToken && pair.baseToken.symbol) || 'UNKNOWN';
    name = (pair.baseToken && pair.baseToken.name) || 'Unknown';
    pairAge = pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 86400000 : 0;
    priceUsd = parseFloat(pair.priceUsd) || 0;
  }

  // ── 1. X ACTIVITY (0-25) ──
  var xOk = xData && !xData.error;
  if (xOk) {
    maxPossible += 25;
    var xs = scoreXActivity(xData);
    components.x_activity = xs.component;
    rawTotal += xs.score;
    flags = flags.concat(xs.flags);
  } else {
    components.x_activity = {
      score: null, max: 25,
      signals: [xData ? 'unavailable: ' + xData.error : 'not provided']
    };
  }

  // ── 2. GITHUB ACTIVITY (0-25) ──
  var ghOk = ghData && !ghData.error;
  if (ghOk) {
    maxPossible += 25;
    var gs = scoreGitHubActivity(ghData);
    components.github_activity = gs.component;
    rawTotal += gs.score;
    flags = flags.concat(gs.flags);
  } else {
    components.github_activity = {
      score: null, max: 25,
      signals: [ghData ? 'unavailable: ' + ghData.error : 'not provided']
    };
  }

  // ── 3. MARKET POSITION (0-20) ──
  if (hasDex) {
    maxPossible += 20;
    var ms = scoreMarket(mc, liquidity, vol24h);
    components.market_position = ms.component;
    rawTotal += ms.score;
    flags = flags.concat(ms.flags);
  } else {
    components.market_position = {
      score: null, max: 20,
      signals: ['no trading pairs found on Base DEXs']
    };
    flags.push('WARNING: no DEX data. token may not be listed on Base.');
  }

  // ── 4. VALUE RATIO (0-30) ──
  // Core metric: normalized builder activity vs market cap
  var activitySources = (xOk ? 1 : 0) + (ghOk ? 1 : 0);
  var valueRating = 'insufficient_data';

  if (hasDex && activitySources > 0) {
    maxPossible += 30;
    // Normalize activity to 0-100 scale
    var activityNorm = 0;
    if (xOk) activityNorm += (components.x_activity.score / 25) * 50;
    if (ghOk) activityNorm += (components.github_activity.score / 25) * 50;
    // If only one source available, scale to full range
    if (activitySources === 1) activityNorm = Math.min(100, activityNorm * 2);

    var vr = scoreValueRatio(activityNorm, mc);
    components.value_ratio = vr.component;
    rawTotal += vr.score;
    valueRating = vr.rating;
    flags = flags.concat(vr.flags);
  } else {
    components.value_ratio = {
      score: null, max: 30,
      signals: ['insufficient data. provide both builder handles and a listed token for full analysis.']
    };
  }

  // Normalize to 0-100
  var finalScore = maxPossible > 0 ? Math.round(rawTotal / maxPossible * 100) : 0;

  var grade;
  if (finalScore >= 80) grade = 'A';
  else if (finalScore >= 65) grade = 'B';
  else if (finalScore >= 50) grade = 'C';
  else if (finalScore >= 35) grade = 'D';
  else grade = 'F';

  // Recommendation
  var rec;
  if (valueRating === 'deeply_undervalued') rec = 'builder is shipping far harder than the market recognizes. strong investigate signal.';
  else if (valueRating === 'undervalued') rec = 'builder activity exceeds market pricing. worth a closer look.';
  else if (valueRating === 'slightly_undervalued') rec = 'mild value gap. builder is slightly ahead of market recognition.';
  else if (valueRating === 'fair') rec = 'market roughly reflects current builder output.';
  else if (valueRating === 'slightly_overvalued') rec = 'market pricing ahead of visible builder activity. caution.';
  else if (valueRating === 'overvalued') rec = 'limited builder activity for this market cap. narrative risk.';
  else if (valueRating === 'severely_overvalued') rec = 'near-zero builder activity at this valuation. avoid.';
  else rec = 'insufficient data for value assessment. provide both twitter and github for full analysis.';

  // Summary line
  var summary = symbol + ' builder score: ' + finalScore + '/100 (grade ' + grade + '). value rating: ' + valueRating.replace(/_/g, ' ') + '.';
  if (ghOk && ghData.commits > 0) summary += ' ' + ghData.commits + ' commits in 30d.';
  if (xOk && xData.shipping_tweets > 0) summary += ' ' + xData.shipping_tweets + ' shipping tweets in 7d.';
  if (hasDex) summary += ' MC: $' + fmt(mc) + '.';

  return {
    agent: 'SIBYL #20880',
    version: 'builder-v1',
    token: tokenAddr,
    symbol: symbol,
    name: name,
    chain: 'base',
    timestamp: new Date().toISOString(),
    price_usd: priceUsd,
    market_cap: Math.round(mc),
    fdv: Math.round(fdv),
    liquidity_usd: Math.round(liquidity),
    volume_24h: Math.round(vol24h),
    pair_age_days: r1(pairAge),
    builder_score: finalScore,
    grade: grade,
    value_rating: valueRating,
    components: components,
    raw_data: {
      x: xOk ? xData : null,
      github: ghOk ? ghData : null
    },
    flags: flags,
    recommendation: rec,
    summary: summary,
    data_sources: ['dexscreener', twitter ? 'x-api' : null, github ? 'github-api' : null].filter(Boolean),
    demo: isDemo,
    feedback: ERC8004_FEEDBACK
  };
}

// ── COMPONENT SCORERS ──

function scoreXActivity(d) {
  var score = 0;
  var signals = [];
  var flags = [];
  var tpd = d.tweets_per_day || 0;
  var ship = d.shipping_tweets || 0;
  var total = d.total_tweets || 0;
  var shipPct = d.shipping_ratio || 0;

  // Posting frequency (0-12)
  if (tpd >= 3)        { score += 12; signals.push(tpd + ' tweets/day (high output)'); }
  else if (tpd >= 1.5) { score += 10; signals.push(tpd + ' tweets/day (active)'); }
  else if (tpd >= 0.5) { score += 7;  signals.push(tpd + ' tweets/day (moderate)'); }
  else if (tpd > 0)    { score += 4;  signals.push(tpd + ' tweets/day (quiet)'); }
  else                  { score += 0;  signals.push('no tweets in 7 days'); flags.push('WARNING: zero X posting in past 7 days.'); }

  // Shipping signal density (0-13)
  if (ship >= 10)      { score += 13; signals.push(ship + ' shipping signals (' + shipPct + '% of posts)'); }
  else if (ship >= 5)  { score += 10; signals.push(ship + ' shipping signals (' + shipPct + '% of posts)'); }
  else if (ship >= 2)  { score += 7;  signals.push(ship + ' shipping signals (' + shipPct + '% of posts)'); }
  else if (ship >= 1)  { score += 4;  signals.push(ship + ' shipping signal (' + shipPct + '% of posts)'); }
  else if (total > 0)  { score += 1;  signals.push('posting but no shipping signals detected'); }
  else                  { score += 0; }

  return { score: score, component: { score: score, max: 25, signals: signals }, flags: flags };
}

function scoreGitHubActivity(d) {
  var score = 0;
  var signals = [];
  var flags = [];
  var cpw = d.commits_per_week || 0;
  var days = d.active_days || 0;
  var repos = d.repos_active || 0;

  // Commit velocity (0-12)
  if (cpw >= 20)       { score += 12; signals.push(cpw + ' commits/week (prolific)'); }
  else if (cpw >= 10)  { score += 10; signals.push(cpw + ' commits/week (strong)'); }
  else if (cpw >= 5)   { score += 8;  signals.push(cpw + ' commits/week (steady)'); }
  else if (cpw >= 2)   { score += 5;  signals.push(cpw + ' commits/week (moderate)'); }
  else if (cpw > 0)    { score += 3;  signals.push(cpw + ' commits/week (minimal)'); }
  else                  { score += 0;  signals.push('no commits in 30 days'); flags.push('WARNING: zero GitHub commits in past 30 days.'); }

  // Consistency: active days out of 30 (0-8)
  var pct = Math.round(days / 30 * 100);
  if (days >= 20)      { score += 8; signals.push(days + '/30 active days (' + pct + '%)'); }
  else if (days >= 12) { score += 6; signals.push(days + '/30 active days (' + pct + '%)'); }
  else if (days >= 5)  { score += 4; signals.push(days + '/30 active days (' + pct + '%)'); }
  else if (days > 0)   { score += 2; signals.push(days + '/30 active days (' + pct + '%)'); }
  else                  { score += 0; }

  // Repo breadth (0-5)
  if (repos >= 5)      { score += 5; signals.push(repos + ' active repos'); }
  else if (repos >= 3) { score += 4; signals.push(repos + ' active repos'); }
  else if (repos >= 2) { score += 3; signals.push(repos + ' active repos'); }
  else if (repos >= 1) { score += 2; signals.push(repos + ' active repo'); }
  else                  { score += 0; }

  return { score: score, component: { score: score, max: 25, signals: signals }, flags: flags };
}

function scoreMarket(mc, liq, vol) {
  var score = 0;
  var signals = [];
  var flags = [];

  // MC tier (0-8)
  if (mc >= 5000000)      { score += 8; signals.push('$' + fmt(mc) + ' MC (established)'); }
  else if (mc >= 1000000) { score += 7; signals.push('$' + fmt(mc) + ' MC (mid)'); }
  else if (mc >= 250000)  { score += 5; signals.push('$' + fmt(mc) + ' MC (low)'); }
  else if (mc >= 50000)   { score += 3; signals.push('$' + fmt(mc) + ' MC (micro)'); }
  else                     { score += 1; signals.push('$' + fmt(mc) + ' MC (nano)'); }

  // Liquidity (0-6)
  if (liq >= 100000)     { score += 6; signals.push('$' + fmt(liq) + ' liquidity'); }
  else if (liq >= 25000) { score += 5; signals.push('$' + fmt(liq) + ' liquidity'); }
  else if (liq >= 5000)  { score += 3; signals.push('$' + fmt(liq) + ' liquidity (thin)'); }
  else                    { score += 1; signals.push('$' + fmt(liq) + ' liquidity (dangerous)'); flags.push('DANGER: liquidity below $5K.'); }

  // Volume (0-6)
  if (vol >= 50000)      { score += 6; signals.push('$' + fmt(vol) + ' 24h vol'); }
  else if (vol >= 10000) { score += 4; signals.push('$' + fmt(vol) + ' 24h vol'); }
  else if (vol >= 1000)  { score += 2; signals.push('$' + fmt(vol) + ' 24h vol (low)'); }
  else                    { score += 0; signals.push('$' + fmt(vol) + ' 24h vol (dead)'); }

  return { score: score, component: { score: score, max: 20, signals: signals }, flags: flags };
}

function scoreValueRatio(activityNorm, mc) {
  var signals = [];
  var flags = [];
  var score = 0;
  var rating = 'insufficient_data';

  // Log-scaled MC: $100K=5, $1M=6, $10M=7
  var mcLog = mc > 0 ? Math.log10(mc) : 0;
  // Value ratio: builder activity per log-unit of market cap
  // High activity + low MC = high ratio = undervalued
  var ratio = mcLog > 0 ? activityNorm / mcLog : 0;

  signals.push('activity index: ' + Math.round(activityNorm) + '/100');
  signals.push('market cap: $' + fmt(mc));
  signals.push('value ratio: ' + ratio.toFixed(1));

  if (ratio >= 14)       { score = 30; rating = 'deeply_undervalued'; signals.push('shipping velocity far exceeds market recognition'); }
  else if (ratio >= 11)  { score = 25; rating = 'undervalued'; signals.push('strong builder output relative to market cap'); }
  else if (ratio >= 8)   { score = 20; rating = 'slightly_undervalued'; signals.push('builder activity ahead of market pricing'); }
  else if (ratio >= 6)   { score = 15; rating = 'fair'; signals.push('market roughly reflects builder output'); }
  else if (ratio >= 4)   { score = 10; rating = 'slightly_overvalued'; signals.push('market pricing ahead of visible output'); }
  else if (ratio >= 2)   { score = 5;  rating = 'overvalued'; signals.push('limited visible output for this valuation'); flags.push('WARNING: builder activity does not justify current market cap.'); }
  else                    { score = 0;  rating = 'severely_overvalued'; signals.push('near-zero output at this valuation'); flags.push('DANGER: minimal builder activity. high narrative risk.'); }

  return { score: score, component: { score: score, max: 30, signals: signals }, rating: rating, flags: flags };
}

// ── DATA FETCHERS ──

async function fetchDexScreener(token) {
  var resp = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + token, {
    headers: { 'Accept': 'application/json' }
  });
  if (!resp.ok) throw new Error('DexScreener: ' + resp.status);
  return resp.json();
}

async function fetchXActivity(handle) {
  var bearer = X_BEARER;
  if (!bearer) return { error: 'no_bearer_token' };
  // Decode if URL-encoded (some tokens contain %3D for =)
  if (bearer.indexOf('%') !== -1) {
    try { bearer = decodeURIComponent(bearer); } catch (e) {}
  }

  try {
    // Try v2 search/recent (requires Basic tier or higher)
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
      // Tier doesn't support search. Try v1.1 fallback.
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
    // Filter to last 7 days
    var cutoff = Date.now() - 7 * 86400000;
    var recent = tweets.filter(function(t) { return new Date(t.created_at).getTime() > cutoff; });

    var SHIP_RE = /deploy|ship|launch|release|update|commit|push|build|fix|refactor|merge|v\d|beta|alpha|testnet|mainnet|live|audit|contract|integrat/i;
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
  var SHIP_RE = /deploy|ship|launch|release|update|commit|push|build|fix|refactor|merge|v\d|beta|alpha|testnet|mainnet|live|audit|contract|integrat/i;

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
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'SIBYL-Agent-20880' },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        if (resp.status === 404) {
          // Might be an org, not a user
          return fetchGitHubOrgActivity(username);
        }
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
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'SIBYL-Agent-20880' },
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

// ── UTILS ──

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

function r1(n) { return Math.round(n * 10) / 10; }
