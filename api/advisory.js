/* SIBYL Single-Session Advisory API.
   Premium endpoint: full evaluation + narrative read + structured advisory output.
   Combines conviction scoring with narrative positioning to generate actionable guidance.
   Payment: x402 ($1.00 USDC per call). Free with ?demo=true.

   Usage:
     GET /api/advisory?token=0x...&twitter=handle&github=user         (paid, $1.00 USDC)
     GET /api/advisory?token=0x...&twitter=handle&demo=true           (free, same output)

   Params:
     token       (required) — ERC-20 contract address on Base
     twitter     (recommended) — X handle (without @)
     github      (recommended) — GitHub username or org
     description (optional) — one-sentence product description
     demo        (optional) — bypass payment gate
*/

var x402 = require('./_x402');
var RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
var X_BEARER = process.env.X_BEARER_TOKEN || '';
var PRICE_USD = 0.50;

// Narrative classification patterns (same as narrative.js)
var NARRATIVES = {
  ai_agents: { label: 'AI / Agents', re: /\bai\b|agent|gpt|llm|neural|brain|cogni|intelli|autono|machine.?learn|deep.?learn|model|predict|inference|sentient|synthetic/i },
  defi: { label: 'DeFi', re: /\bdefi\b|swap|lend|borrow|yield|vault|stake|liquid|amm|pool|perp|leverag|margin|collateral|bridge|wrap|farm/i },
  meme: { label: 'Meme', re: /doge|pepe|shib|wojak|chad|moon|rocket|inu|cat|frog|bear|bull|ape|monkey|bonk|floki|elon|trump|maga|based|cope|seethe|wagmi|ngmi|gm\b|ser\b|anon\b|degen/i },
  gaming: { label: 'Gaming / Metaverse', re: /game|play|guild|quest|arena|battle|rpg|nft.?game|metaverse|virtual|world|land|avatar|character|level|loot/i },
  social: { label: 'Social / NFT', re: /social|nft|art|creator|collect|community|dao|govern|vote|member|club|access|pass|mint|gallery|culture/i },
  infra: { label: 'Infrastructure', re: /infra|protocol|layer|chain|rollup|oracle|index|api|sdk|tool|dev|framework|node|validator|relay|rpc|data|storage/i },
  rwa: { label: 'RWA / Payments', re: /\brwa\b|real.?world|tokeniz|asset|property|equity|bond|treasury|payment|pay|transfer|remit|stable|dollar|usd|euro|gold/i }
};
var NARRATIVE_KEYS = Object.keys(NARRATIVES);

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

  var twitter = (req.query.twitter || '').replace(/^@/, '').toLowerCase();
  var github = (req.query.github || '').toLowerCase();
  var description = (req.query.description || '').trim();

  var paid = await x402.gate(req, res, {
    priceUsd: PRICE_USD,
    description: 'SIBYL single-session advisory. premium: full evaluation + narrative positioning + structured advisory output with actionable recommendations.',
    discovery: {
      input: { token: '0x...', twitter: 'handle', github: 'user', description: 'one-sentence product description' },
      inputSchema: { properties: { token: { type: 'string', description: 'ERC-20 contract address on Base' }, twitter: { type: 'string', description: 'X handle without @' }, github: { type: 'string', description: 'GitHub username or org' }, description: { type: 'string', description: 'one-sentence product description' } }, required: ['token'] },
      output: { example: { evaluation: {}, narrative_position: {}, advisory: { recommendation: '...', action_items: [] } } }
    }
  });
  if (!paid) return;

  var isDemo = req.query.demo === 'true';

  try {
    // Fetch core data in parallel
    var fetches = [
      // Evaluation data
      fetchDexScreener(token),
      checkBytecode(token),
      fetchTotalSupply(token),
      twitter ? fetchXActivity(twitter) : Promise.resolve(null),
      // Narrative data
      fetchBoostedTokens(),
      fetchTokenProfiles()
    ];

    var results = await Promise.all(fetches);
    var dexData = results[0];
    var hasCode = results[1];
    var totalSupply = results[2];
    var xData = results[3];
    var boosted = results[4];
    var profiles = results[5];

    // Auto-discover GitHub via npm registry if not provided (free, no auth)
    if (!github && dexData && dexData.pairs && dexData.pairs.length > 0) {
      var symForNpm = (dexData.pairs[0].baseToken && dexData.pairs[0].baseToken.symbol) || '';
      var nameForNpm = (dexData.pairs[0].baseToken && dexData.pairs[0].baseToken.name) || '';
      var npmResult = await discoverGitHubFromNpm(symForNpm, nameForNpm);
      if (npmResult && npmResult.handle) {
        github = npmResult.handle;
      }
    }

    // Fetch GitHub activity if we have a handle (provided or discovered)
    var ghData = null;
    if (github) {
      ghData = await fetchGitHubActivity(github);
    }

    var result = computeAdvisory(
      token, dexData, hasCode, totalSupply, xData, ghData,
      boosted, profiles,
      twitter, github, description, isDemo
    );

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(result);
  } catch (err) {
    console.error('advisory_error:', err.message, err.stack);
    return res.status(500).json({ error: 'advisory session failed' });
  }
};

// ── ADVISORY ENGINE ──

function computeAdvisory(tokenAddr, dexData, hasCode, totalSupply, xData, ghData, boosted, profiles, twitter, github, description, isDemo) {
  var flags = [];
  var dataSources = ['dexscreener', 'base-rpc'];
  if (twitter) dataSources.push('x-api');
  if (github) dataSources.push('github-api');

  // ── EVALUATION ──
  var evaluation = computeEvaluation(tokenAddr, dexData, hasCode, totalSupply, xData, ghData, twitter, github, flags);

  // ── NARRATIVE POSITION ──
  var narrativePosition = computeNarrativePosition(tokenAddr, dexData, boosted, profiles);

  // ── ADVISORY OUTPUT ──
  var advisory = generateAdvisory(evaluation, narrativePosition, xData, ghData, description, flags);

  // ── SUMMARY ──
  var parts = [];
  parts.push(evaluation.symbol + ': ' + evaluation.conviction_score + '/30 conviction (' + evaluation.conviction_tier + ').');
  parts.push('narrative: ' + narrativePosition.category_label + ' (' + narrativePosition.alignment + ' alignment).');
  parts.push('priority: ' + advisory.priority + '.');
  parts.push(advisory.recommendation);

  return {
    agent: 'SIBYL #20880',
    version: 'advisory-v1',
    token: tokenAddr,
    symbol: evaluation.symbol,
    chain: 'base',
    timestamp: new Date().toISOString(),
    evaluation: {
      conviction_score: evaluation.conviction_score,
      conviction_tier: evaluation.conviction_tier,
      criteria: evaluation.criteria
    },
    narrative_position: {
      category: narrativePosition.category,
      category_label: narrativePosition.category_label,
      alignment: narrativePosition.alignment,
      signal: narrativePosition.signal
    },
    advisory: advisory,
    flags: flags,
    summary: parts.join(' '),
    data_sources: dataSources,
    demo: isDemo
  };
}

// ── EVALUATION COMPONENT ──

function computeEvaluation(tokenAddr, dexData, hasCode, totalSupply, xData, ghData, twitter, github, flags) {
  var mc = 0, fdv = 0, liquidity = 0, vol24h = 0;
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
    txns24h = (pair.txns && pair.txns.h24) || { buys: 0, sells: 0 };
  }

  var xOk = xData && !xData.error;
  var ghOk = ghData && !ghData.error;

  // Builder Conviction (0-10)
  var builderScore = 0;
  var builderSignals = [];

  if (xOk) {
    var shipTweets = xData.shipping_tweets || 0;
    var tpd = xData.tweets_per_day || 0;
    if (shipTweets >= 8)       { builderScore += 5; builderSignals.push(shipTweets + ' shipping signals in 7d (prolific)'); }
    else if (shipTweets >= 4)  { builderScore += 4; builderSignals.push(shipTweets + ' shipping signals in 7d (active)'); }
    else if (shipTweets >= 2)  { builderScore += 3; builderSignals.push(shipTweets + ' shipping signals in 7d (moderate)'); }
    else if (shipTweets >= 1)  { builderScore += 2; builderSignals.push(shipTweets + ' shipping signal in 7d'); }
    else if (tpd > 0)         { builderScore += 1; builderSignals.push('posting but no shipping signals'); }
    else                       { builderSignals.push('no X activity in 7d'); flags.push('WARNING: zero X posting in past 7 days.'); }
  } else if (twitter) {
    builderSignals.push('X data unavailable: ' + (xData ? xData.error : 'fetch failed'));
  }

  if (ghOk) {
    var cpw = ghData.commits_per_week || 0;
    var activeDays = ghData.active_days || 0;
    if (cpw >= 15 && activeDays >= 15) { builderScore += 5; builderSignals.push(cpw + ' commits/week, ' + activeDays + '/30 active days (relentless)'); }
    else if (cpw >= 8)                 { builderScore += 4; builderSignals.push(cpw + ' commits/week, ' + activeDays + '/30 active days (strong)'); }
    else if (cpw >= 4)                 { builderScore += 3; builderSignals.push(cpw + ' commits/week, ' + activeDays + '/30 active days (steady)'); }
    else if (cpw >= 1)                 { builderScore += 2; builderSignals.push(cpw + ' commits/week, ' + activeDays + '/30 active days (light)'); }
    else if (activeDays > 0)           { builderScore += 1; builderSignals.push('some GitHub activity but minimal commits'); }
    else                               { builderSignals.push('no GitHub commits in 30d'); flags.push('WARNING: zero GitHub commits in past 30 days.'); }
  } else if (github) {
    builderSignals.push('GitHub data unavailable: ' + (ghData ? ghData.error : 'fetch failed'));
  }

  if (!twitter && !github) {
    builderSignals.push('no builder handles provided. provide ?twitter= and/or ?github= for full scoring.');
  }

  // Community Seed (0-10)
  var communityScore = 0;
  var communitySignals = [];

  if (hasDex) {
    var buys = txns24h.buys || 0;
    var sells = txns24h.sells || 0;
    var totalTxns = buys + sells;
    var bsRatio = sells > 0 ? buys / sells : (buys > 0 ? 99 : 0);

    if (totalTxns >= 1000)     { communityScore += 4; communitySignals.push(fmt(totalTxns) + ' txns/24h (high)'); }
    else if (totalTxns >= 200) { communityScore += 3; communitySignals.push(fmt(totalTxns) + ' txns/24h (moderate)'); }
    else if (totalTxns >= 50)  { communityScore += 2; communitySignals.push(totalTxns + ' txns/24h (low)'); }
    else if (totalTxns > 0)    { communityScore += 1; communitySignals.push(totalTxns + ' txns/24h (minimal)'); }
    else                        { communitySignals.push('zero transactions in 24h'); flags.push('DANGER: no trading activity.'); }

    if (bsRatio >= 1.3 && bsRatio < 50)       { communityScore += 3; communitySignals.push(bsRatio.toFixed(2) + ':1 buy/sell (buyers dominant)'); }
    else if (bsRatio >= 0.8 && bsRatio < 1.3) { communityScore += 2; communitySignals.push(bsRatio.toFixed(2) + ':1 buy/sell (balanced)'); }
    else if (bsRatio >= 0.5)                   { communityScore += 1; communitySignals.push(bsRatio.toFixed(2) + ':1 buy/sell (sell pressure)'); }
    else if (totalTxns > 0)                    { communitySignals.push(bsRatio.toFixed(2) + ':1 buy/sell (heavy selling)'); }

    if (buys > 10 && sells === 0) {
      communityScore = Math.max(0, communityScore - 2);
      flags.push('DANGER: zero sells. possible honeypot.');
    }

    var volMcRatio = mc > 0 ? vol24h / mc * 100 : 0;
    if (volMcRatio >= 5 && volMcRatio <= 50)       { communityScore += 3; communitySignals.push(volMcRatio.toFixed(1) + '% vol/MC (healthy)'); }
    else if (volMcRatio >= 1 && volMcRatio < 5)    { communityScore += 2; communitySignals.push(volMcRatio.toFixed(1) + '% vol/MC (quiet)'); }
    else if (volMcRatio > 50 && volMcRatio <= 100) { communityScore += 1; communitySignals.push(volMcRatio.toFixed(1) + '% vol/MC (elevated)'); }
    else if (volMcRatio > 100)                     { communitySignals.push(volMcRatio.toFixed(1) + '% vol/MC (excessive)'); flags.push('WARNING: possible wash trading.'); }
    else                                            { communitySignals.push(volMcRatio.toFixed(1) + '% vol/MC (dead)'); }
  } else {
    communitySignals.push('no DEX data available.');
    flags.push('NO_DATA: no DEX pairs found.');
  }

  // On-Chain Proof (0-10)
  var onchainScore = 0;
  var onchainSignals = [];

  if (hasCode === true)      { onchainScore += 3; onchainSignals.push('bytecode verified on Base'); }
  else if (hasCode === null) { onchainScore += 1; onchainSignals.push('bytecode check inconclusive'); }
  else                       { onchainSignals.push('no bytecode found'); flags.push('DANGER: no contract code.'); }

  if (totalSupply !== null && totalSupply > 0) {
    onchainScore += 1;
    onchainSignals.push('supply: ' + fmtSupply(totalSupply));
  }

  if (hasDex) {
    if (pairAge > 30)      { onchainScore += 3; onchainSignals.push(Math.floor(pairAge) + 'd pair age (established)'); }
    else if (pairAge > 14) { onchainScore += 2; onchainSignals.push(Math.floor(pairAge) + 'd pair age (maturing)'); }
    else if (pairAge > 3)  { onchainScore += 1; onchainSignals.push(pairAge.toFixed(1) + 'd pair age (young)'); }
    else                   { onchainSignals.push(pairAge.toFixed(1) + 'd pair age (very new)'); flags.push('CAUTION: pair less than 3 days old.'); }
  }

  if (liquidity >= 50000)      { onchainScore += 2; onchainSignals.push('$' + fmt(liquidity) + ' liquidity (strong)'); }
  else if (liquidity >= 10000) { onchainScore += 1; onchainSignals.push('$' + fmt(liquidity) + ' liquidity (thin)'); }
  else if (liquidity > 0)      { onchainSignals.push('$' + fmt(liquidity) + ' liquidity (dangerous)'); flags.push('DANGER: liquidity below $10K.'); }

  if (pairCount > 1) { onchainScore += 1; onchainSignals.push(pairCount + ' DEX pairs'); }

  var convictionScore = builderScore + communityScore + onchainScore;
  var convictionTier;
  if (convictionScore >= 25)      convictionTier = 'high';
  else if (convictionScore >= 20) convictionTier = 'medium-high';
  else if (convictionScore >= 15) convictionTier = 'medium';
  else if (convictionScore >= 10) convictionTier = 'low';
  else                            convictionTier = 'no conviction';

  return {
    symbol: symbol,
    name: name,
    mc: mc,
    fdv: fdv,
    liquidity: liquidity,
    vol24h: vol24h,
    pairAge: pairAge,
    hasDex: hasDex,
    conviction_score: convictionScore,
    conviction_tier: convictionTier,
    criteria: {
      builder_conviction: { score: builderScore, max: 10, signals: builderSignals },
      community_seed: { score: communityScore, max: 10, signals: communitySignals },
      onchain_proof: { score: onchainScore, max: 10, signals: onchainSignals }
    },
    xOk: xData && !xData.error,
    ghOk: ghData && !ghData.error,
    xData: xData,
    ghData: ghData
  };
}

// ── NARRATIVE POSITION COMPONENT ──

function computeNarrativePosition(tokenAddr, dexData, boosted, profiles) {
  // Classify the token
  var symbol = 'UNKNOWN';
  var name = 'Unknown';

  if (dexData && dexData.pairs && dexData.pairs.length > 0) {
    var pairs = dexData.pairs
      .filter(function(p) { return p.chainId === 'base'; })
      .sort(function(a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
    if (pairs.length === 0) {
      pairs = dexData.pairs.sort(function(a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
    }
    if (pairs.length > 0) {
      symbol = (pairs[0].baseToken && pairs[0].baseToken.symbol) || 'UNKNOWN';
      name = (pairs[0].baseToken && pairs[0].baseToken.name) || 'Unknown';
    }
  }

  var combined = (symbol + ' ' + name).toLowerCase();
  var category = 'other';
  var categoryLabel = 'Unclassified';

  for (var i = 0; i < NARRATIVE_KEYS.length; i++) {
    if (NARRATIVES[NARRATIVE_KEYS[i]].re.test(combined)) {
      category = NARRATIVE_KEYS[i];
      categoryLabel = NARRATIVES[NARRATIVE_KEYS[i]].label;
      break;
    }
  }

  // Count how many boosted/profiled tokens share this narrative
  var narrativePeers = 0;
  var totalBaseBoosted = 0;

  if (boosted && Array.isArray(boosted)) {
    boosted.forEach(function(t) {
      if (t.chainId === 'base') {
        totalBaseBoosted++;
        var tc = ((t.symbol || '') + ' ' + (t.description || '')).toLowerCase();
        for (var j = 0; j < NARRATIVE_KEYS.length; j++) {
          if (NARRATIVES[NARRATIVE_KEYS[j]].re.test(tc) && NARRATIVE_KEYS[j] === category) {
            narrativePeers++;
            break;
          }
        }
      }
    });
  }

  if (profiles && Array.isArray(profiles)) {
    profiles.forEach(function(t) {
      if (t.chainId === 'base') {
        totalBaseBoosted++;
        var tc = ((t.symbol || '') + ' ' + (t.description || '')).toLowerCase();
        for (var j = 0; j < NARRATIVE_KEYS.length; j++) {
          if (NARRATIVES[NARRATIVE_KEYS[j]].re.test(tc) && NARRATIVE_KEYS[j] === category) {
            narrativePeers++;
            break;
          }
        }
      }
    });
  }

  // Determine alignment based on peer density
  var alignment;
  var peerRatio = totalBaseBoosted > 0 ? narrativePeers / totalBaseBoosted : 0;
  if (peerRatio >= 0.25)      alignment = 'strong';
  else if (peerRatio >= 0.10) alignment = 'moderate';
  else if (narrativePeers > 0) alignment = 'weak';
  else                          alignment = 'counter';

  var signal;
  if (alignment === 'strong') {
    signal = symbol + ' sits in the dominant Base narrative (' + categoryLabel + '). ' + narrativePeers + ' of ' + totalBaseBoosted + ' trending tokens share this category.';
  } else if (alignment === 'moderate') {
    signal = symbol + ' is in an active narrative (' + categoryLabel + '). ' + narrativePeers + ' peers trending. not dominant but present.';
  } else if (alignment === 'weak') {
    signal = symbol + ' classified as ' + categoryLabel + '. minimal trending presence. narrative is not carrying momentum right now.';
  } else {
    signal = symbol + ' has no narrative peers in current trending data. positioning is counter-narrative or unclassified.';
  }

  return {
    category: category,
    category_label: categoryLabel,
    alignment: alignment,
    narrative_peers: narrativePeers,
    total_trending: totalBaseBoosted,
    signal: signal
  };
}

// ── ADVISORY GENERATION ──

function generateAdvisory(evaluation, narrativePosition, xData, ghData, description, flags) {
  var xOk = evaluation.xOk;
  var ghOk = evaluation.ghOk;

  // Product Clarity Assessment
  var clarityStatus = 'needs_work';
  var clarityNote = '';

  if (description && description.length > 10) {
    clarityStatus = 'clear';
    clarityNote = 'founder-provided description: "' + description + '"';
  } else if (xOk && (xData.shipping_tweets || 0) >= 3 && ghOk && (ghData.commits_per_week || 0) >= 5) {
    clarityStatus = 'clear';
    clarityNote = 'strong builder signals across both X and GitHub suggest active product development.';
  } else if (xOk && (xData.shipping_tweets || 0) >= 1) {
    clarityStatus = 'needs_work';
    clarityNote = 'shipping signals detected on X but insufficient density to confirm product clarity. the builder is working but the narrative may not be landing.';
  } else if (ghOk && (ghData.commits_per_week || 0) >= 2) {
    clarityStatus = 'needs_work';
    clarityNote = 'GitHub shows active development but no public shipping narrative on X. the work exists but the market does not see it.';
  } else {
    clarityStatus = 'needs_work';
    clarityNote = 'insufficient data to assess product clarity. provide twitter and github handles for full analysis.';
  }

  // Positioning
  var positioning = '';
  if (narrativePosition.alignment === 'strong') {
    positioning = evaluation.symbol + ' has strong narrative tailwind in ' + narrativePosition.category_label + ' on Base. ';
    if (evaluation.conviction_score >= 20) {
      positioning += 'combined with ' + evaluation.conviction_tier + ' conviction, this is a favorable position. capture the momentum.';
    } else {
      positioning += 'narrative is working for you. conviction score needs to catch up. focus on shipping velocity.';
    }
  } else if (narrativePosition.alignment === 'moderate') {
    positioning = evaluation.symbol + ' sits in the ' + narrativePosition.category_label + ' narrative, which has moderate Base presence. ';
    positioning += 'not the dominant meta but active enough to benefit from category rotation.';
  } else if (narrativePosition.alignment === 'weak') {
    positioning = evaluation.symbol + ' is in ' + narrativePosition.category_label + ' which has minimal trending presence on Base right now. ';
    positioning += 'you are building ahead of the narrative or the narrative has moved elsewhere. either way, current positioning does not have tailwind.';
  } else {
    positioning = evaluation.symbol + ' does not map to any trending narrative category on Base. ';
    positioning += 'this is either a category-creation play or a positioning problem. if the latter, reframe the product around an active narrative.';
  }

  // Recommendation (one specific, actionable thing)
  var recommendation = '';
  var priority = 'medium';
  var dangerCount = flags.filter(function(f) { return f.startsWith('DANGER'); }).length;

  if (dangerCount >= 2) {
    recommendation = 'address critical flags before any other action. ' + dangerCount + ' danger signals must be resolved: liquidity, honeypot risk, or contract issues.';
    priority = 'high';
  } else if (evaluation.conviction_score >= 20 && narrativePosition.alignment === 'strong') {
    recommendation = 'position is strong. focus on community expansion. the builder conviction and narrative alignment are there. ship a public update thread on X documenting what was built this week and tag the Base ecosystem.';
    priority = 'medium';
  } else if (evaluation.conviction_score >= 15 && clarityStatus === 'needs_work') {
    recommendation = 'builder signals exist but the market is not seeing them. write one clear sentence describing what this product does and pin it. ship a public build log on X. the product is real. the narrative is missing.';
    priority = 'high';
  } else if (evaluation.conviction_score >= 15 && narrativePosition.alignment === 'counter') {
    recommendation = 'the product has conviction but zero narrative tailwind. reframe positioning toward the dominant ' + (narrativePosition.category_label !== 'Unclassified' ? 'narrative on Base' : 'meta') + ' or lean into the contrarian angle explicitly. silent positioning against the meta loses.';
    priority = 'high';
  } else if (evaluation.criteria.builder_conviction.score <= 3 && evaluation.criteria.community_seed.score >= 5) {
    recommendation = 'community signals outpace builder signals. the market believes in something the builder is not visibly shipping. close this gap: public commits, deploy announcements, weekly build logs.';
    priority = 'high';
  } else if (evaluation.criteria.builder_conviction.score >= 5 && evaluation.criteria.community_seed.score <= 3) {
    recommendation = 'builder is shipping hard but the community is not growing. distribution problem. find 5 people who genuinely need this product. get them using it. organic adoption beats marketing spend.';
    priority = 'high';
  } else if (evaluation.liquidity < 10000 && evaluation.hasDex) {
    recommendation = 'liquidity is critically thin. any size trade will cause massive slippage. prioritize LP provision or find a liquidity partner before any marketing push.';
    priority = 'high';
  } else if (!xOk && !ghOk) {
    recommendation = 'insufficient data for specific guidance. provide twitter and github handles for a complete advisory session. without builder signal data, recommendations are limited to on-chain and market analysis.';
    priority = 'low';
  } else {
    recommendation = 'maintain current trajectory. no urgent issues. next focus: increase shipping velocity visibility and explore partnerships within the ' + narrativePosition.category_label + ' category on Base.';
    priority = 'medium';
  }

  return {
    product_clarity: {
      status: clarityStatus,
      note: clarityNote
    },
    positioning: positioning,
    recommendation: recommendation,
    priority: priority
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
      var timeout = setTimeout(function() { controller.abort(); }, 3000);
      var resp = await fetch(rpcs[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: token, data: '0x18160ddd' }, 'latest'], id: 1 }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      var data = await resp.json();
      if (data.result && data.result !== '0x') {
        return parseInt(data.result, 16) / 1e18;
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
      engagement += (t.public_metrics.like_count || 0) + (t.public_metrics.retweet_count || 0) + (t.public_metrics.reply_count || 0);
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

// ── GITHUB AUTO-DISCOVERY (npm only, free, no auth) ──

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
