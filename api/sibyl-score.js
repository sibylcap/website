/* SIBYL Score API — comprehensive token scoring endpoint.
   Returns a 0-100 score across 4 free on-chain categories: contract safety,
   builder conviction, liquidity & exit, market traction. Tier classification
   from "exceptional" to "avoid". (sibyl-score-v2: X/social scoring removed;
   it returns as a paid tier once the x402->X-credits rail exists.)

   Payment: x402 ($0.05 USDC per call). Free with ?demo=true (rate-limited).

   Usage:
     GET /api/sibyl-score?token=0x...                                        (paid, $0.05 USDC)
     GET /api/sibyl-score?token=0x...&github=user                            (paid, + open-source builder signal)
     GET /api/sibyl-score?token=0x...&demo=true                              (free, same output)

   Params:
     token   (required) — ERC-20 contract address on Base
     github  (optional) — GitHub username or org (scores open-source builder activity)
     demo    (optional) — bypass payment gate
*/

var x402 = require('./_x402');
var RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
var RPC_FALLBACKS = [RPC, 'https://mainnet.base.org', 'https://base.llamarpc.com'];
var X_BEARER = process.env.X_BEARER_TOKEN || '';
var PRICE_USD = 0.05;

var DEAD_ADDRESSES = [
  '0x000000000000000000000000000000000000dead',
  '0x0000000000000000000000000000000000000000',
  '0x0000000000000000000000000000000000000001'
];

var ERC8004_FEEDBACK = {
  message: 'Rate this response on-chain via ERC-8004 Reputation Registry',
  contract: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  agentId: 20880,
  method: 'giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'
};

var DISCOVERY_OPTS = {
  input: { token: '0x...', github: 'user' },
  inputSchema: {
    properties: {
      token: { type: 'string', description: 'ERC-20 contract address on Base' },
      github: { type: 'string', description: 'GitHub username or org (optional, scores open-source builder activity)' }
    },
    required: ['token']
  },
  output: {
    example: {
      sibyl_score: 73,
      sibyl_max: 100,
      tier: 'high_conviction',
      categories: {
        contract_safety: { score: 21, max: 25 },
        builder_conviction: { score: 9, max: 13 },
        liquidity_exit: { score: 14, max: 17 },
        market_traction: { score: 15, max: 20 }
      }
    }
  }
};

var DESCRIPTION = 'SIBYL Score: 0-100 token scoring from free on-chain signals across contract safety, builder conviction, liquidity depth, and market traction (24h volume, buy pressure, trade count). tier classification from exceptional to avoid.';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, X-PAYMENT-TX');
  res.setHeader('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE');

  if (req.method === 'OPTIONS') return res.status(200).end();

  var token = (req.query.token || '').toLowerCase();
  if (!token || !/^0x[a-f0-9]{40}$/.test(token)) {
    if (!req.query.demo && !req.headers['x-payment'] && !req.headers['x-payment-tx']) {
      return x402.discovery(req, res, {
        priceUsd: PRICE_USD,
        description: DESCRIPTION,
        discovery: DISCOVERY_OPTS
      });
    }
    return res.status(400).json({ error: 'invalid token address. use ?token=0x...' });
  }

  var twitter = (req.query.twitter || '').replace(/^@/, '').toLowerCase();
  var github = (req.query.github || '').toLowerCase();

  var paid = await x402.gate(req, res, {
    priceUsd: PRICE_USD,
    description: DESCRIPTION,
    discovery: DISCOVERY_OPTS
  });
  if (!paid) return;

  var isDemo = req.query.demo === 'true';

  try {
    // ── PHASE 1: parallel core data fetches ──
    var fetches = [
      fetchDexScreener(token),
      fetchBytecode(token),
      fetchTotalSupply(token)
    ];
    var results = await Promise.all(fetches);
    var dexData = results[0];
    var bytecodeResult = results[1];
    var totalSupply = results[2];
    // X / social signals DISABLED (free-onchain-v2, 2026-06-04): no X-API funding rail yet, so
    // the score uses only FREE on-chain + DexScreener data. social_traction + community_health
    // are collapsed into one free "Market Traction" category and builder's X shipping sub-score
    // is retired. The X-derived social score returns as a paid tier once the x402->X-credits
    // rail exists (Acer). The fetchX* functions below are kept as dead code for that revival.
    var xBuilderData = null, xMentionData = null, xProfileData = null, xOrganicData = null;

    // ── PHASE 2: GitHub (provided or auto-discovered) ──
    if (!github && dexData && dexData.pairs && dexData.pairs.length > 0) {
      var symForNpm = (dexData.pairs[0].baseToken && dexData.pairs[0].baseToken.symbol) || '';
      var nameForNpm = (dexData.pairs[0].baseToken && dexData.pairs[0].baseToken.name) || '';
      var npmResult = await discoverGitHubFromNpm(symForNpm, nameForNpm);
      if (npmResult && npmResult.handle) github = npmResult.handle;
    }

    var ghData = null;
    if (github) ghData = await fetchGitHubActivity(github);

    // ── COMPUTE ── (X organic-reach phase removed; free scoring only)
    var result = computeScore(
      token, dexData, bytecodeResult, totalSupply,
      xBuilderData, xMentionData, xProfileData, xOrganicData,
      ghData, twitter, github, isDemo
    );

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(result);
  } catch (err) {
    console.error('sibyl_score_error:', err.message, err.stack);
    return res.status(500).json({ error: 'scoring failed' });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// SCORING ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

function computeScore(tokenAddr, dexData, bytecodeResult, totalSupply, xBuilderData, xMentionData, xProfileData, xOrganicData, ghData, twitter, github, isDemo) {
  var flags = [];
  var dataSources = ['dexscreener', 'base-rpc'];
  if (github) dataSources.push('github-api');

  // ── Parse DexScreener data ──
  var mc = 0, fdv = 0, liquidity = 0, vol24h = 0, priceUsd = 0;
  var tokenSymbol = 'UNKNOWN', tokenName = 'Unknown';
  var pairAge = 0, pairCount = 0;
  var hasDex = false;
  var primaryPair = null;
  var basePairs = [];

  if (dexData && dexData.pairs && dexData.pairs.length > 0) {
    hasDex = true;
    basePairs = dexData.pairs
      .filter(function(p) { return p.chainId === 'base'; })
      .sort(function(a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
    if (basePairs.length === 0) {
      basePairs = dexData.pairs.sort(function(a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
    }
    primaryPair = basePairs[0];
    pairCount = basePairs.length;
    mc = primaryPair.marketCap || primaryPair.fdv || 0;
    fdv = primaryPair.fdv || 0;
    liquidity = (primaryPair.liquidity && primaryPair.liquidity.usd) || 0;
    vol24h = (primaryPair.volume && primaryPair.volume.h24) || 0;
    tokenSymbol = (primaryPair.baseToken && primaryPair.baseToken.symbol) || 'UNKNOWN';
    tokenName = (primaryPair.baseToken && primaryPair.baseToken.name) || 'Unknown';
    pairAge = primaryPair.pairCreatedAt ? (Date.now() - primaryPair.pairCreatedAt) / 86400000 : 0;
    priceUsd = parseFloat(primaryPair.priceUsd) || 0;
  }

  // ═══ CATEGORY 1: CONTRACT SAFETY (0-25) ═══
  var safetyScore = 0;
  var safetySignals = [];
  var bytecode = bytecodeResult ? bytecodeResult.code : null;
  var bytecodeLen = bytecode ? (bytecode.length - 2) / 2 : 0; // hex bytes

  // 1a. Ownership (0-8)
  if (bytecode && bytecode.length > 2) {
    var hasOwner = bytecode.indexOf('8da5cb5b') !== -1; // owner()
    var hasRenounce = bytecode.indexOf('715018a6') !== -1; // renounceOwnership()
    var hasUpgrade = bytecode.indexOf('3659cfe6') !== -1 || // upgradeTo(address)
                     bytecode.indexOf('4f1ef286') !== -1 || // upgradeToAndCall(address,bytes)
                     bytecode.indexOf('f851a440') !== -1;   // admin() — transparent proxy
    var hasDelegateCall = bytecode.indexOf('5c60da1b') !== -1; // implementation()

    if (hasUpgrade || hasDelegateCall) {
      safetyScore += 0;
      safetySignals.push('ownership: proxy/upgradeable pattern detected (0/8)');
      flags.push('WARNING: upgradeable proxy contract. owner can change logic.');
    } else if (hasOwner && hasRenounce) {
      // Could be renounced — check on-chain owner
      var ownerAddr = bytecodeResult ? bytecodeResult.owner : null;
      if (ownerAddr && DEAD_ADDRESSES.indexOf(ownerAddr.toLowerCase()) !== -1) {
        safetyScore += 8;
        safetySignals.push('ownership: renounced to ' + ownerAddr.slice(0, 10) + '... (8/8)');
      } else if (ownerAddr === null) {
        safetyScore += 5;
        safetySignals.push('ownership: renounceOwnership present, owner check inconclusive (5/8)');
      } else {
        safetyScore += 4;
        safetySignals.push('ownership: owner exists at ' + ownerAddr.slice(0, 10) + '..., renounce available (4/8)');
      }
    } else if (hasOwner) {
      safetyScore += 2;
      safetySignals.push('ownership: owner function exists, no renounce selector (2/8)');
    } else {
      safetyScore += 6;
      safetySignals.push('ownership: no owner() selector found (6/8)');
    }
  } else {
    safetySignals.push('ownership: no bytecode at address (0/8)');
    flags.push('DANGER: no contract bytecode found.');
  }

  // 1b. Mint risk (0-7)
  if (bytecode && bytecode.length > 2) {
    var hasMintAddrAmt = bytecode.indexOf('40c10f19') !== -1; // mint(address,uint256)
    var hasMintAmt = bytecode.indexOf('a0712d68') !== -1;     // mint(uint256)
    var hasMaxSupply = bytecode.indexOf('d5abeb01') !== -1;    // maxSupply()
    var hasCap = bytecode.indexOf('355274ea') !== -1;          // cap()

    if (!hasMintAddrAmt && !hasMintAmt) {
      safetyScore += 7;
      safetySignals.push('mint risk: no mint function selector (7/7)');
    } else if (hasMaxSupply || hasCap) {
      safetyScore += 4;
      safetySignals.push('mint risk: mint exists but supply cap present (4/7)');
    } else {
      safetyScore += 0;
      safetySignals.push('mint risk: unlimited mint capability (0/7)');
      flags.push('DANGER: uncapped mint function detected.');
    }
  } else {
    safetySignals.push('mint risk: no bytecode (0/7)');
  }

  // 1c. LP status (0-6)
  var lpStatusScore = 0;
  if (hasDex && primaryPair) {
    var lpLocked = false;
    var lpBurned = false;

    // DexScreener sometimes includes liquidity lock info
    if (primaryPair.labels && primaryPair.labels.indexOf('burned') !== -1) {
      lpBurned = true;
    }
    // Check liquidity info field if available
    if (primaryPair.info && primaryPair.info.locks) {
      lpLocked = true;
    }

    if (lpBurned) {
      lpStatusScore = 6;
      safetySignals.push('LP status: burned (6/6)');
    } else if (lpLocked) {
      lpStatusScore = 4;
      safetySignals.push('LP status: locked (4/6)');
    } else if (liquidity > 50000) {
      lpStatusScore = 2;
      safetySignals.push('LP status: unlocked but substantial (2/6)');
    } else if (liquidity > 0) {
      lpStatusScore = 1;
      safetySignals.push('LP status: unlocked, thin liquidity (1/6)');
      flags.push('WARNING: LP not locked or burned.');
    } else {
      lpStatusScore = 0;
      safetySignals.push('LP status: no liquidity data (0/6)');
    }
  } else {
    safetySignals.push('LP status: no DEX pairs found (0/6)');
  }
  safetyScore += lpStatusScore;

  // 1d. Fork profile (0-4)
  if (bytecode && bytecode.length > 2) {
    if (bytecodeLen > 5000) {
      safetyScore += 4;
      safetySignals.push('fork profile: substantial custom bytecode (' + fmt(bytecodeLen) + ' bytes) (4/4)');
    } else if (bytecodeLen > 1000) {
      safetyScore += 3;
      safetySignals.push('fork profile: moderate bytecode (' + fmt(bytecodeLen) + ' bytes) (3/4)');
    } else if (bytecodeLen > 500) {
      safetyScore += 2;
      safetySignals.push('fork profile: standard bytecode (' + bytecodeLen + ' bytes) (2/4)');
    } else {
      safetyScore += 1;
      safetySignals.push('fork profile: minimal/proxy bytecode (' + bytecodeLen + ' bytes) (1/4)');
    }
  } else {
    safetySignals.push('fork profile: no bytecode (0/4)');
  }

  // ═══ CATEGORY 2: BUILDER CONVICTION (0-25) ═══
  var builderScore = 0;
  var builderSignals = [];
  var xOk = xBuilderData && !xBuilderData.error;
  var ghOk = ghData && !ghData.error;

  // 2a. (retired in free-onchain-v2) X "shipping velocity" sub-score removed — no X-API
  // budget. Builder conviction now scores from open-source activity (github) + on-chain
  // contract maturity only.

  // 2b. Code activity (0-8)
  if (ghOk) {
    var cpw = ghData.commits_per_week || 0;
    var activeDays = ghData.active_days || 0;

    if (cpw >= 10 && activeDays >= 10) { builderScore += 8; builderSignals.push(cpw + ' commits/week, ' + activeDays + '/30 active days — strong open-source (8/8)'); }
    else if (cpw >= 4)                 { builderScore += 6; builderSignals.push(cpw + ' commits/week, ' + activeDays + '/30 active days — active repo (6/8)'); }
    else if (cpw >= 1 || activeDays > 0) { builderScore += 4; builderSignals.push(cpw + ' commits/week, ' + activeDays + '/30 active days — some activity (4/8)'); }
    else                               { builderScore += 2; builderSignals.push('github account exists but no commits in 30 days (2/8)'); }
  } else if (github) {
    builderSignals.push('GitHub data unavailable: ' + (ghData ? ghData.error : 'fetch failed') + ' (0/8)');
  } else {
    builderSignals.push('no github handle provided (0/8)');
  }

  // 2c. Contract maturity (0-5)
  if (hasDex) {
    if (pairAge >= 90)      { builderScore += 5; builderSignals.push(Math.floor(pairAge) + 'd pair age — established (5/5)'); }
    else if (pairAge >= 60) { builderScore += 4; builderSignals.push(Math.floor(pairAge) + 'd pair age — maturing (4/5)'); }
    else if (pairAge >= 30) { builderScore += 3; builderSignals.push(Math.floor(pairAge) + 'd pair age — survived first month (3/5)'); }
    else if (pairAge >= 14) { builderScore += 2; builderSignals.push(Math.floor(pairAge) + 'd pair age — young (2/5)'); }
    else if (pairAge >= 7)  { builderScore += 1; builderSignals.push(Math.floor(pairAge) + 'd pair age — very new (1/5)'); }
    else                    { builderScore += 0; builderSignals.push(pairAge.toFixed(1) + 'd pair age — newborn (0/5)'); flags.push('CAUTION: pair less than 7 days old.'); }
  } else {
    builderSignals.push('no DEX pair age data (0/5)');
  }

  // ═══ CATEGORY 3: LIQUIDITY & EXIT (0-20) ═══
  var liqScore = 0;
  var liqSignals = [];

  // 3a. Depth (0-5)
  if (hasDex) {
    if (liquidity >= 500000)      { liqScore += 5; liqSignals.push('$' + fmt(liquidity) + ' total liquidity — deep (5/5)'); }
    else if (liquidity >= 200000) { liqScore += 4; liqSignals.push('$' + fmt(liquidity) + ' total liquidity — solid (4/5)'); }
    else if (liquidity >= 50000)  { liqScore += 3; liqSignals.push('$' + fmt(liquidity) + ' total liquidity — moderate (3/5)'); }
    else if (liquidity >= 10000)  { liqScore += 1; liqSignals.push('$' + fmt(liquidity) + ' total liquidity — thin (1/5)'); }
    else                          { liqScore += 0; liqSignals.push('$' + fmt(liquidity) + ' total liquidity — dangerous (0/5)'); flags.push('DANGER: liquidity below $10K.'); }
  } else {
    liqSignals.push('no liquidity data available (0/5)');
  }

  // 3b. Exit impact (0-7) — constant-product AMM simulation
  if (hasDex && primaryPair && liquidity > 0) {
    // Estimate reserves from liquidity. In a constant-product pool,
    // total liquidity ~= 2 * reserve_quote_side. We simulate selling $10K of tokens.
    var reserveQuote = liquidity / 2; // approximate quote-side reserve in USD
    var reserveBase = reserveQuote;   // balanced pool: both sides equal in USD value

    // Selling $10K worth of token into the pool
    var sellAmountUsd = 10000;
    if (reserveBase > 0 && reserveQuote > 0) {
      // dy = reserveQuote * dx / (reserveBase + dx)
      var dy = reserveQuote * sellAmountUsd / (reserveBase + sellAmountUsd);
      // Ideal output at spot price = sellAmountUsd (since both sides in USD)
      var priceImpactPct = (1 - dy / sellAmountUsd) * 100;

      if (priceImpactPct < 1)       { liqScore += 7; liqSignals.push('exit impact: ' + priceImpactPct.toFixed(2) + '% at $10K sell — negligible (7/7)'); }
      else if (priceImpactPct < 3)  { liqScore += 5; liqSignals.push('exit impact: ' + priceImpactPct.toFixed(2) + '% at $10K sell — acceptable (5/7)'); }
      else if (priceImpactPct < 5)  { liqScore += 3; liqSignals.push('exit impact: ' + priceImpactPct.toFixed(2) + '% at $10K sell — significant (3/7)'); }
      else if (priceImpactPct < 10) { liqScore += 1; liqSignals.push('exit impact: ' + priceImpactPct.toFixed(2) + '% at $10K sell — heavy (1/7)'); }
      else                          { liqScore += 0; liqSignals.push('exit impact: ' + priceImpactPct.toFixed(2) + '% at $10K sell — destructive (0/7)'); flags.push('WARNING: >10% price impact on $10K sell.'); }
    } else {
      liqSignals.push('exit impact: cannot compute, zero reserves (0/7)');
    }
  } else {
    liqSignals.push('exit impact: no pool data (0/7)');
  }

  // 3c. LP concentration (0-5) — pair count as proxy
  if (hasDex) {
    if (pairCount >= 4)      { liqScore += 5; liqSignals.push(pairCount + ' trading pairs — well distributed (5/5)'); }
    else if (pairCount >= 3) { liqScore += 4; liqSignals.push(pairCount + ' trading pairs — distributed (4/5)'); }
    else if (pairCount >= 2) { liqScore += 3; liqSignals.push(pairCount + ' trading pairs — moderate (3/5)'); }
    else                     { liqScore += 1; liqSignals.push(pairCount + ' trading pair — concentrated (1/5)'); }
  } else {
    liqSignals.push('LP concentration: no pairs found (0/5)');
  }

  // ═══ CATEGORY 4: SOCIAL TRACTION (0-15) ═══
  var socialScore = 0;
  var socialSignals = [];

  // 4a. Mention velocity (0-6)
  var mentionOk = xMentionData && !xMentionData.error;
  if (mentionOk) {
    var mentions = xMentionData.count || 0;

    if (mentions >= 50)      { socialScore += 6; socialSignals.push(mentions + ' mentions in 7d — trending (6/6)'); }
    else if (mentions >= 20) { socialScore += 5; socialSignals.push(mentions + ' mentions in 7d — active (5/6)'); }
    else if (mentions >= 10) { socialScore += 4; socialSignals.push(mentions + ' mentions in 7d — moderate (4/6)'); }
    else if (mentions >= 5)  { socialScore += 2; socialSignals.push(mentions + ' mentions in 7d — low (2/6)'); }
    else                     { socialScore += 0; socialSignals.push(mentions + ' mentions in 7d — minimal (0/6)'); }
  } else if (twitter) {
    socialSignals.push('mention velocity: data unavailable (0/6)');
  } else {
    socialSignals.push('mention velocity: no twitter handle (0/6)');
  }

  // 4b. Growth trajectory (0-6) — follower count bands
  var profileOk = xProfileData && !xProfileData.error;
  if (profileOk) {
    var followers = xProfileData.followers || 0;

    if (followers >= 10000)     { socialScore += 6; socialSignals.push(fmt(followers) + ' followers — strong reach (6/6)'); }
    else if (followers >= 5000) { socialScore += 5; socialSignals.push(fmt(followers) + ' followers — growing (5/6)'); }
    else if (followers >= 1000) { socialScore += 4; socialSignals.push(fmt(followers) + ' followers — building (4/6)'); }
    else if (followers >= 500)  { socialScore += 2; socialSignals.push(fmt(followers) + ' followers — small (2/6)'); }
    else                        { socialScore += 1; socialSignals.push(fmt(followers) + ' followers — nascent (1/6)'); }
  } else if (twitter) {
    socialSignals.push('growth trajectory: profile data unavailable (0/6)');
  } else {
    socialSignals.push('growth trajectory: no twitter handle (0/6)');
  }

  // 4c. Engagement quality (0-5) — avg (replies+quotes)/(likes+1)
  if (xOk && xBuilderData.engagement_detail) {
    var ed = xBuilderData.engagement_detail;
    var engagementRatio = ed.avg_engagement_quality || 0;

    if (engagementRatio > 0.3)       { socialScore += 6; socialSignals.push('engagement quality: ' + engagementRatio.toFixed(3) + ' reply+quote/like ratio — exceptional (6/6)'); }
    else if (engagementRatio > 0.2)  { socialScore += 5; socialSignals.push('engagement quality: ' + engagementRatio.toFixed(3) + ' reply+quote/like ratio — strong (5/6)'); }
    else if (engagementRatio > 0.1)  { socialScore += 4; socialSignals.push('engagement quality: ' + engagementRatio.toFixed(3) + ' reply+quote/like ratio — healthy (4/6)'); }
    else if (engagementRatio > 0.05) { socialScore += 2; socialSignals.push('engagement quality: ' + engagementRatio.toFixed(3) + ' reply+quote/like ratio — passive (2/6)'); }
    else                             { socialScore += 0; socialSignals.push('engagement quality: ' + engagementRatio.toFixed(3) + ' reply+quote/like ratio — dead (0/6)'); }
  } else if (twitter) {
    socialSignals.push('engagement quality: insufficient data (0/5)');
  } else {
    socialSignals.push('engagement quality: no twitter handle (0/5)');
  }

  // ═══ CATEGORY 5: COMMUNITY HEALTH (0-17) ═══
  var commScore = 0;
  var commSignals = [];

  // 5a. Engagement rate (0-7) — avg (replies + quotes) per post / follower count
  if (xOk && profileOk && xBuilderData.engagement_detail) {
    var ed2 = xBuilderData.engagement_detail;
    var avgInteractions = ed2.avg_replies_quotes || 0;
    var followerCount = xProfileData.followers || 1;
    var engRate = avgInteractions / followerCount * 100;

    if (engRate >= 5)        { commScore += 7; commSignals.push('engagement rate: ' + engRate.toFixed(2) + '% — exceptional (7/7)'); }
    else if (engRate >= 3)   { commScore += 6; commSignals.push('engagement rate: ' + engRate.toFixed(2) + '% — strong (6/7)'); }
    else if (engRate >= 1)   { commScore += 4; commSignals.push('engagement rate: ' + engRate.toFixed(2) + '% — healthy (4/7)'); }
    else if (engRate >= 0.5) { commScore += 2; commSignals.push('engagement rate: ' + engRate.toFixed(2) + '% — thin (2/7)'); }
    else                     { commScore += 0; commSignals.push('engagement rate: ' + engRate.toFixed(2) + '% — dead (0/7)'); }
  } else if (twitter) {
    commSignals.push('engagement rate: insufficient data (0/7)');
  } else {
    commSignals.push('engagement rate: no twitter handle (0/7)');
  }

  // 5b. Organic reach (0-6)
  var organicOk = xOrganicData && !xOrganicData.error;
  if (organicOk) {
    var organicCount = xOrganicData.count || 0;

    if (organicCount >= 20)     { commScore += 6; commSignals.push(organicCount + ' organic mentions (excl. project) — strong word-of-mouth (6/6)'); }
    else if (organicCount >= 10) { commScore += 4; commSignals.push(organicCount + ' organic mentions — moderate word-of-mouth (4/6)'); }
    else if (organicCount >= 5)  { commScore += 2; commSignals.push(organicCount + ' organic mentions — some word-of-mouth (2/6)'); }
    else                         { commScore += 0; commSignals.push(organicCount + ' organic mentions — no word-of-mouth (0/6)'); }
  } else if (twitter) {
    commSignals.push('organic reach: data unavailable (0/6)');
  } else {
    commSignals.push('organic reach: no twitter handle (0/6)');
  }

  // 5c. Follower-to-engagement ratio (0-4)
  if (xOk && profileOk && xBuilderData.engagement_detail) {
    var ed3 = xBuilderData.engagement_detail;
    var avgTotal = ed3.avg_replies_quotes_retweets || 0;
    var fCount = xProfileData.followers || 1;
    var fer = avgTotal > 0 ? fCount / avgTotal : 9999;

    if (fer < 100)       { commScore += 4; commSignals.push('follower/engagement ratio: ' + Math.round(fer) + ':1 — healthy (4/4)'); }
    else if (fer < 500)  { commScore += 2; commSignals.push('follower/engagement ratio: ' + Math.round(fer) + ':1 — thin (2/4)'); }
    else                 { commScore += 0; commSignals.push('follower/engagement ratio: ' + Math.round(fer) + ':1 — dead (0/4)'); }
  } else if (twitter) {
    commSignals.push('follower/engagement ratio: insufficient data (0/4)');
  } else {
    commSignals.push('follower/engagement ratio: no twitter handle (0/4)');
  }

  // ═══ CATEGORY 4: MARKET TRACTION (0-20) — FREE on-chain / DEX signals only (free-onchain-v2) ═══
  // Replaces the X-derived social_traction + community_health. Measures real trading activity +
  // buy pressure from DexScreener data we already fetch. No X API, no per-call cost. (The old
  // social/community blocks above run harmlessly with no X data and are excluded from the output;
  // Acer rebuilds a real social score behind a paid tier once the x402->X-credits rail exists.)
  var tractionScore = 0;
  var tractionSignals = [];
  if (hasDex && primaryPair) {
    // 4a. 24h trading volume (0-7) — is anyone actually trading it
    var vol24 = parseFloat((primaryPair.volume && primaryPair.volume.h24) || 0) || 0;
    if (vol24 >= 500000)      { tractionScore += 7; tractionSignals.push('$' + fmt(vol24) + ' 24h volume — high activity (7/7)'); }
    else if (vol24 >= 100000) { tractionScore += 5; tractionSignals.push('$' + fmt(vol24) + ' 24h volume — active (5/7)'); }
    else if (vol24 >= 20000)  { tractionScore += 3; tractionSignals.push('$' + fmt(vol24) + ' 24h volume — moderate (3/7)'); }
    else if (vol24 >= 2000)   { tractionScore += 1; tractionSignals.push('$' + fmt(vol24) + ' 24h volume — thin (1/7)'); }
    else                      { tractionSignals.push('$' + fmt(vol24) + ' 24h volume — negligible (0/7)'); }
    // 4b. Buy/sell pressure (0-7) — accumulation vs distribution over 24h txns
    var _tx = (primaryPair.txns && primaryPair.txns.h24) || {};
    var _buys = _tx.buys || 0, _sells = _tx.sells || 0, _tot = _buys + _sells;
    if (_tot >= 20) {
      var buyPct = _buys / _tot * 100;
      if (buyPct >= 60)      { tractionScore += 7; tractionSignals.push(Math.round(buyPct) + '% buys (' + _buys + 'B/' + _sells + 'S 24h) — strong accumulation (7/7)'); }
      else if (buyPct >= 52) { tractionScore += 5; tractionSignals.push(Math.round(buyPct) + '% buys (' + _buys + 'B/' + _sells + 'S 24h) — net buying (5/7)'); }
      else if (buyPct >= 45) { tractionScore += 4; tractionSignals.push(Math.round(buyPct) + '% buys (' + _buys + 'B/' + _sells + 'S 24h) — balanced (4/7)'); }
      else if (buyPct >= 38) { tractionScore += 2; tractionSignals.push(Math.round(buyPct) + '% buys (' + _buys + 'B/' + _sells + 'S 24h) — net selling (2/7)'); }
      else                   { tractionSignals.push(Math.round(buyPct) + '% buys (' + _buys + 'B/' + _sells + 'S 24h) — heavy distribution (0/7)'); }
    } else {
      tractionSignals.push(_tot + ' txns in 24h — too few to read pressure (0/7)');
    }
    // 4c. Trade participation (0-6) — total 24h trade count (breadth of activity)
    if (_tot >= 500)      { tractionScore += 6; tractionSignals.push(_tot + ' trades in 24h — busy (6/6)'); }
    else if (_tot >= 100) { tractionScore += 4; tractionSignals.push(_tot + ' trades in 24h — steady (4/6)'); }
    else if (_tot >= 20)  { tractionScore += 2; tractionSignals.push(_tot + ' trades in 24h — light (2/6)'); }
    else if (_tot >= 1)   { tractionScore += 1; tractionSignals.push(_tot + ' trades in 24h — quiet (1/6)'); }
    else                  { tractionSignals.push('no trades in 24h (0/6)'); }
  } else {
    tractionSignals.push('no DEX data — cannot assess market traction (0/20)');
  }

  // ═══ AGGREGATE (free-onchain-v2: free signals only, normalized to 0-100) ═══
  var rawScore = safetyScore + builderScore + liqScore + tractionScore;
  var rawMax = 25 + 13 + 17 + 20; // safety + builder(github+maturity) + liquidity + market-traction = 75
  var sibylScore = Math.round(rawScore / rawMax * 100);
  var sibylMax = 100;

  var tier;
  if (sibylScore >= 85)      tier = 'exceptional';
  else if (sibylScore >= 70) tier = 'high_conviction';
  else if (sibylScore >= 55) tier = 'promising';
  else if (sibylScore >= 40) tier = 'caution';
  else if (sibylScore >= 25) tier = 'high_risk';
  else                       tier = 'avoid';

  // ═══ SUMMARY ═══
  var dangerCount = flags.filter(function(f) { return f.startsWith('DANGER'); }).length;
  var warningCount = flags.filter(function(f) { return f.startsWith('WARNING'); }).length;

  var parts = [];
  parts.push(tokenSymbol + ' SIBYL Score: ' + sibylScore + '/100 (' + tier + ').');
  parts.push('safety: ' + safetyScore + '/25, builder: ' + builderScore + '/13, liquidity: ' + liqScore + '/17, market traction: ' + tractionScore + '/20 (free on-chain signals, normalized to 100).');
  if (hasDex) parts.push('MC: $' + fmt(mc) + ', liquidity: $' + fmt(liquidity) + '.');
  if (dangerCount > 0) parts.push(dangerCount + ' critical flag(s).');
  if (warningCount > 0) parts.push(warningCount + ' warning(s).');

  if (!github) {
    parts.push('provide ?github=user to score open-source builder activity.');
  }

  return {
    agent: 'SIBYL #20880',
    version: 'sibyl-score-v2',
    token: tokenAddr,
    symbol: tokenSymbol,
    name: tokenName,
    chain: 'base',
    timestamp: new Date().toISOString(),
    sibyl_score: sibylScore,
    sibyl_max: sibylMax,
    tier: tier,
    categories: {
      contract_safety: { score: safetyScore, max: 25, signals: safetySignals },
      builder_conviction: { score: builderScore, max: 13, signals: builderSignals },
      liquidity_exit: { score: liqScore, max: 17, signals: liqSignals },
      market_traction: { score: tractionScore, max: 20, signals: tractionSignals }
    },
    scoring: 'free-onchain-v2: X/social disabled (no API budget); market_traction from DexScreener; full social score returns as a paid tier later',
    flags: flags,
    summary: parts.join(' '),
    data_sources: dataSources,
    demo: isDemo,
    feedback: ERC8004_FEEDBACK
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// DATA FETCHERS
// ═══════════════════════════════════════════════════════════════════════════════

// ── DexScreener ──

async function fetchDexScreener(token) {
  try {
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 8000);
    var resp = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + token, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error('DexScreener: ' + resp.status);
    return resp.json();
  } catch (err) {
    console.error('dex_fetch_error:', err.message);
    return null;
  }
}

// ── Bytecode + Owner ──

async function fetchBytecode(token) {
  for (var i = 0; i < RPC_FALLBACKS.length; i++) {
    try {
      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 5000);
      var resp = await fetch(RPC_FALLBACKS[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { jsonrpc: '2.0', method: 'eth_getCode', params: [token, 'latest'], id: 1 },
          { jsonrpc: '2.0', method: 'eth_call', params: [{ to: token, data: '0x8da5cb5b' }, 'latest'], id: 2 }
        ]),
        signal: controller.signal
      });
      clearTimeout(timeout);

      var results = await resp.json();
      if (!Array.isArray(results)) results = [results];

      var codeResult = results.find(function(r) { return r.id === 1; });
      var ownerResult = results.find(function(r) { return r.id === 2; });

      var code = (codeResult && codeResult.result && codeResult.result !== '0x') ? codeResult.result : null;
      var owner = null;
      if (ownerResult && ownerResult.result && ownerResult.result !== '0x' && ownerResult.result.length >= 66) {
        owner = '0x' + ownerResult.result.slice(26).toLowerCase();
      }

      return { code: code, owner: owner };
    } catch (e) {
      continue;
    }
  }
  return { code: null, owner: null };
}

// ── Total supply ──

async function fetchTotalSupply(token) {
  for (var i = 0; i < RPC_FALLBACKS.length; i++) {
    try {
      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 5000);
      var batch = [
        { jsonrpc: '2.0', method: 'eth_call', params: [{ to: token, data: '0x18160ddd' }, 'latest'], id: 1 },
        { jsonrpc: '2.0', method: 'eth_call', params: [{ to: token, data: '0x313ce567' }, 'latest'], id: 2 }
      ];
      var resp = await fetch(RPC_FALLBACKS[i], {
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

// ── X API: Builder Activity (from:handle, 7d) ──

async function fetchXBuilderActivity(handle) {
  var bearer = getBearer();
  if (!bearer) return { error: 'no_bearer_token' };

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
      return fetchXBuilderActivityV1(handle, bearer);
    }
    if (!resp.ok) return { error: 'x_api_' + resp.status };

    var data = await resp.json();
    var tweets = data.data || [];
    return classifyBuilderTweets(tweets, handle, 'v2');
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'x_api_timeout' };
    return { error: err.message };
  }
}

async function fetchXBuilderActivityV1(handle, bearer) {
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

    var SHIP_RE = /deploy|shipped|shipping|ship\s|push.*prod|commit\s*[a-f0-9]|merge.*PR|merged.*pull|v\d+\.\d|testnet|mainnet|smart.?contract|audit|refactor|integrat.*api|open.?source|changelog|patch|hotfix|bug.?fix|migrat|built\s|launched|released|went live|is live|now live|plugin|benchmark|schema|endpoint|published|pypi|npm|dashboard|beta|alpha|mvp|prototype|infra|architec|pipeline|framework|sdk|api\s|contract.*live|onchain|on.chain/i;
    var shipCount = recent.filter(function(t) { return SHIP_RE.test(t.text || t.full_text || ''); }).length;

    // Compute engagement detail for scoring
    var totalReplies = 0, totalQuotes = 0, totalLikes = 0, totalRetweets = 0;
    recent.forEach(function(t) {
      totalReplies += (t.reply_count || 0);
      totalLikes += (t.favorite_count || 0);
      totalRetweets += (t.retweet_count || 0);
      // v1.1 doesn't have quote_count
    });

    var n = recent.length || 1;
    var avgRepliesQuotes = totalReplies / n;
    var avgEngQuality = totalLikes > 0 ? totalReplies / (totalLikes + 1) : 0;

    return {
      handle: handle,
      period: '7d',
      total_tweets: recent.length,
      shipping_tweets: shipCount,
      tweets_per_day: r1(recent.length / 7),
      engagement_detail: {
        avg_replies_quotes: r2(avgRepliesQuotes),
        avg_replies_quotes_retweets: r2((totalReplies + totalRetweets) / n),
        avg_engagement_quality: r3(avgEngQuality)
      },
      source: 'v1.1'
    };
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'x_api_v1_timeout' };
    return { error: 'v1_' + err.message };
  }
}

function classifyBuilderTweets(tweets, handle, source) {
  var SHIP_RE = /deploy|shipped|shipping|ship\s|push.*prod|commit\s*[a-f0-9]|merge.*PR|merged.*pull|v\d+\.\d|testnet|mainnet|smart.?contract|audit|refactor|integrat.*api|open.?source|changelog|patch|hotfix|bug.?fix|migrat|built\s|launched|released|went live|is live|now live|plugin|benchmark|schema|endpoint|published|pypi|npm|dashboard|beta|alpha|mvp|prototype|infra|architec|pipeline|framework|sdk|api\s|contract.*live|onchain|on.chain/i;

  var shipCount = tweets.filter(function(t) { return SHIP_RE.test(t.text || ''); }).length;

  var totalReplies = 0, totalQuotes = 0, totalLikes = 0, totalRetweets = 0;
  tweets.forEach(function(t) {
    if (t.public_metrics) {
      totalReplies += (t.public_metrics.reply_count || 0);
      totalQuotes += (t.public_metrics.quote_count || 0);
      totalLikes += (t.public_metrics.like_count || 0);
      totalRetweets += (t.public_metrics.retweet_count || 0);
    }
  });

  var n = tweets.length || 1;
  var avgRepliesQuotes = (totalReplies + totalQuotes) / n;
  var avgEngQuality = (totalReplies + totalQuotes) / (totalLikes + 1);

  return {
    handle: handle,
    period: '7d',
    total_tweets: tweets.length,
    shipping_tweets: shipCount,
    tweets_per_day: r1(tweets.length / 7),
    engagement_detail: {
      avg_replies_quotes: r2(avgRepliesQuotes),
      avg_replies_quotes_retweets: r2((totalReplies + totalQuotes + totalRetweets) / n),
      avg_engagement_quality: r3(avgEngQuality)
    },
    source: source
  };
}

// ── X API: Mention Velocity (symbol mentions in 7d) ──

async function fetchXMentionVelocity(handle) {
  var bearer = getBearer();
  if (!bearer) return { error: 'no_bearer_token' };

  try {
    // Search for mentions of the handle (not from the handle itself)
    var query = '@' + handle + ' -from:' + handle;
    var url = 'https://api.twitter.com/2/tweets/search/recent'
      + '?query=' + encodeURIComponent(query)
      + '&max_results=100';

    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 8000);
    var resp = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + bearer },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!resp.ok) return { error: 'x_mention_' + resp.status };

    var data = await resp.json();
    var count = (data.meta && data.meta.result_count) || 0;
    return { count: count };
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'x_mention_timeout' };
    return { error: err.message };
  }
}

// ── X API: User Profile (follower count) ──

async function fetchXUserProfile(handle) {
  var bearer = getBearer();
  if (!bearer) return { error: 'no_bearer_token' };

  try {
    // v2 user lookup
    var url = 'https://api.twitter.com/2/users/by/username/' + encodeURIComponent(handle)
      + '?user.fields=public_metrics';

    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 8000);
    var resp = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + bearer },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (resp.status === 403 || resp.status === 401 || resp.status === 429) {
      return fetchXUserProfileV1(handle, bearer);
    }
    if (!resp.ok) return { error: 'x_profile_' + resp.status };

    var data = await resp.json();
    if (data.data && data.data.public_metrics) {
      return { followers: data.data.public_metrics.followers_count || 0 };
    }
    return { error: 'no_profile_data' };
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'x_profile_timeout' };
    return { error: err.message };
  }
}

async function fetchXUserProfileV1(handle, bearer) {
  try {
    var url = 'https://api.twitter.com/1.1/users/show.json?screen_name=' + encodeURIComponent(handle);

    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 8000);
    var resp = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + bearer },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!resp.ok) return { error: 'x_profile_v1_' + resp.status };

    var data = await resp.json();
    return { followers: data.followers_count || 0 };
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'x_profile_v1_timeout' };
    return { error: err.message };
  }
}

// ── X API: Organic Reach ($TOKEN OR @handle -from:handle) ──

async function fetchXOrganicReach(symbol, handle) {
  var bearer = getBearer();
  if (!bearer) return { error: 'no_bearer_token' };

  try {
    var query = '$' + symbol + ' OR @' + handle + ' -from:' + handle;
    var url = 'https://api.twitter.com/2/tweets/search/recent'
      + '?query=' + encodeURIComponent(query)
      + '&max_results=100';

    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 8000);
    var resp = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + bearer },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!resp.ok) return { error: 'x_organic_' + resp.status };

    var data = await resp.json();
    var count = (data.meta && data.meta.result_count) || 0;
    return { count: count };
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'x_organic_timeout' };
    return { error: err.message };
  }
}

// ── GitHub Activity ──

async function fetchGitHubActivity(username) {
  try {
    var events = [];
    for (var page = 1; page <= 3; page++) {
      var url = 'https://api.github.com/users/' + encodeURIComponent(username)
        + '/events?per_page=100&page=' + page;

      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 5000);
      var resp = await fetch(url, {
        headers: Object.assign(
          { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'SIBYL-Agent-20880' },
          process.env.GITHUB_TOKEN ? { 'Authorization': 'token ' + process.env.GITHUB_TOKEN } : {}
        ),
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
        headers: Object.assign(
          { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'SIBYL-Agent-20880' },
          process.env.GITHUB_TOKEN ? { 'Authorization': 'token ' + process.env.GITHUB_TOKEN } : {}
        ),
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

  var commits = 0;
  pushes.forEach(function(e) {
    commits += (e.payload && e.payload.commits) ? e.payload.commits.length : 0;
  });

  var days = {};
  recent.forEach(function(e) { days[e.created_at.slice(0, 10)] = true; });

  return {
    username: username,
    period: '30d',
    total_events: recent.length,
    commits: commits,
    active_days: Object.keys(days).length,
    commits_per_week: r1(commits / 4.3)
  };
}

// ── GitHub Auto-Discovery via npm ──

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
        return { handle: match[1].toLowerCase(), source: 'npm_registry', npm_package: candidates[i] };
      }
    } catch (e) {
      continue;
    }
  }

  return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════════

function getBearer() {
  var bearer = X_BEARER;
  if (!bearer) return null;
  if (bearer.indexOf('%') !== -1) {
    try { bearer = decodeURIComponent(bearer); } catch (e) {}
  }
  return bearer;
}

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

function r1(n) { return Math.round(n * 10) / 10; }
function r2(n) { return Math.round(n * 100) / 100; }
function r3(n) { return Math.round(n * 1000) / 1000; }
