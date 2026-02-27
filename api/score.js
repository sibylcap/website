/* SIBYL Token Intelligence Score API.
   Composite 0-100 score with component breakdown, flags, and actionable summary.
   Data: DexScreener (market data) + Base RPC (contract verification).
   Payment: x402 ($0.05 USDC per call). Free with ?demo=true.

   Usage:
     GET /api/score?token=0x...              (paid, $0.05 USDC)
     GET /api/score?token=0x...&demo=true    (free, same output)
*/

var x402 = require('./_x402');
var RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
var PRICE_USD = 0.05;

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

  // Payment gate
  var paid = await x402.gate(req, res, {
    priceUsd: PRICE_USD,
    description: 'SIBYL token intelligence score'
  });
  if (!paid) return;

  var isDemo = req.query.demo === 'true';

  try {
    // Fetch all data in parallel
    var results = await Promise.all([
      fetchDexScreener(token),
      checkBytecode(token),
      fetchTotalSupply(token)
    ]);

    var dexData = results[0];
    var hasCode = results[1];
    var totalSupply = results[2];

    if (!dexData || !dexData.pairs || dexData.pairs.length === 0) {
      return res.status(200).json({
        agent: 'SIBYL #20880',
        version: 'score-v1',
        token: token,
        chain: 'base',
        timestamp: new Date().toISOString(),
        score: 0,
        grade: 'F',
        error: 'no trading pairs found on Base DEXs',
        flags: ['NO_DATA: token has no DEX pairs. may not be listed, may be on another chain, or address may be wrong.'],
        recommendation: 'unverifiable. do not trade.',
        demo: isDemo
      });
    }

    // Filter to Base pairs, use highest liquidity
    var pairs = dexData.pairs
      .filter(function(p) { return p.chainId === 'base'; })
      .sort(function(a, b) {
        return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0);
      });

    if (pairs.length === 0) {
      pairs = dexData.pairs.sort(function(a, b) {
        return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0);
      });
    }

    var pair = pairs[0];
    var result = computeScore(pair, pairs.length, hasCode, totalSupply, token, isDemo);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(result);

  } catch (err) {
    console.error('score_error:', err.message, err.stack);
    return res.status(500).json({ error: 'scoring failed', detail: err.message });
  }
};

function computeScore(pair, pairCount, hasCode, totalSupply, tokenAddress, isDemo) {
  var liquidity = (pair.liquidity && pair.liquidity.usd) || 0;
  var fdv = pair.fdv || 0;
  var mc = pair.marketCap || fdv;
  var vol24h = (pair.volume && pair.volume.h24) || 0;
  var vol6h = (pair.volume && pair.volume.h6) || 0;
  var txns24h = (pair.txns && pair.txns.h24) || { buys: 0, sells: 0 };
  var txns6h = (pair.txns && pair.txns.h6) || { buys: 0, sells: 0 };
  var txns1h = (pair.txns && pair.txns.h1) || { buys: 0, sells: 0 };
  var priceChange = pair.priceChange || {};
  var pairAge = pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 86400000 : 0;
  var priceUsd = parseFloat(pair.priceUsd) || 0;
  var symbol = (pair.baseToken && pair.baseToken.symbol) || 'UNKNOWN';
  var name = (pair.baseToken && pair.baseToken.name) || 'Unknown Token';

  var components = {};
  var flags = [];
  var totalScore = 0;

  // ── 1. LIQUIDITY HEALTH (0-25) ──
  // Can you trade this without getting destroyed by slippage?
  var liqScore = 0;
  var liqSignals = [];

  if (liquidity >= 500000)      { liqScore = 25; liqSignals.push('$' + fmt(liquidity) + ' depth (excellent)'); }
  else if (liquidity >= 100000) { liqScore = 20; liqSignals.push('$' + fmt(liquidity) + ' depth (strong)'); }
  else if (liquidity >= 50000)  { liqScore = 15; liqSignals.push('$' + fmt(liquidity) + ' depth (adequate)'); }
  else if (liquidity >= 10000)  { liqScore = 10; liqSignals.push('$' + fmt(liquidity) + ' depth (thin)'); }
  else if (liquidity >= 1000)   { liqScore = 5;  liqSignals.push('$' + fmt(liquidity) + ' depth (dangerous)'); }
  else                          { liqScore = 0;  liqSignals.push('$' + fmt(liquidity) + ' depth (critical)'); }

  if (fdv > 0) {
    var depthRatio = liquidity / fdv * 100;
    liqSignals.push(depthRatio.toFixed(1) + '% depth/FDV');
    if (depthRatio < 1)      { liqScore = Math.max(0, liqScore - 5); flags.push('DANGER: liquidity is less than 1% of FDV. extreme slippage.'); }
    else if (depthRatio < 5) { liqScore = Math.max(0, liqScore - 3); }
  }

  if (liquidity < 10000) flags.push('DANGER: pool depth below $10K. do not trade size.');
  components.liquidity = { score: liqScore, max: 25, signals: liqSignals };
  totalScore += liqScore;

  // ── 2. MARKET ACTIVITY (0-20) ──
  // Is there real trading or is this dead/washed?
  var mktScore = 0;
  var mktSignals = [];

  var volMcRatio = mc > 0 ? vol24h / mc * 100 : 0;
  if (volMcRatio >= 5 && volMcRatio <= 50)       { mktScore += 10; mktSignals.push(volMcRatio.toFixed(1) + '% vol/MC (healthy)'); }
  else if (volMcRatio > 50 && volMcRatio <= 100)  { mktScore += 8;  mktSignals.push(volMcRatio.toFixed(1) + '% vol/MC (elevated)'); }
  else if (volMcRatio >= 1 && volMcRatio < 5)     { mktScore += 6;  mktSignals.push(volMcRatio.toFixed(1) + '% vol/MC (quiet)'); }
  else if (volMcRatio > 100)                      { mktScore += 3;  mktSignals.push(volMcRatio.toFixed(1) + '% vol/MC (excessive)'); flags.push('WARNING: 24h volume exceeds market cap. possible wash trading.'); }
  else                                            { mktScore += 2;  mktSignals.push(volMcRatio.toFixed(1) + '% vol/MC (dead)'); }

  var buys24 = txns24h.buys || 0;
  var sells24 = txns24h.sells || 0;
  var totalTxns = buys24 + sells24;
  var bsRatio = sells24 > 0 ? buys24 / sells24 : (buys24 > 0 ? 99 : 0);

  if (bsRatio >= 1.5)      { mktScore += 10; mktSignals.push(buys24 + '/' + sells24 + ' buy/sell (' + bsRatio.toFixed(2) + ':1, buyers dominant)'); }
  else if (bsRatio >= 1.0) { mktScore += 8;  mktSignals.push(buys24 + '/' + sells24 + ' buy/sell (' + bsRatio.toFixed(2) + ':1, positive)'); }
  else if (bsRatio >= 0.8) { mktScore += 6;  mktSignals.push(buys24 + '/' + sells24 + ' buy/sell (' + bsRatio.toFixed(2) + ':1, neutral)'); }
  else if (bsRatio >= 0.5) { mktScore += 4;  mktSignals.push(buys24 + '/' + sells24 + ' buy/sell (' + bsRatio.toFixed(2) + ':1, sell pressure)'); }
  else                     { mktScore += 2;  mktSignals.push(buys24 + '/' + sells24 + ' buy/sell (' + bsRatio.toFixed(2) + ':1, heavy selling)'); flags.push('WARNING: sells exceed buys 2:1 or worse.'); }

  if (buys24 > 10 && sells24 === 0) {
    flags.push('DANGER: zero sells with ' + buys24 + ' buys. possible honeypot.');
    mktScore = Math.max(0, mktScore - 5);
  }

  components.market = { score: mktScore, max: 20, signals: mktSignals };
  totalScore += mktScore;

  // ── 3. MATURITY (0-20) ──
  // Has this survived long enough to be meaningful?
  var matScore = 0;
  var matSignals = [];

  if (pairAge > 30)      { matScore += 10; matSignals.push(Math.floor(pairAge) + 'd age (established)'); }
  else if (pairAge > 14) { matScore += 8;  matSignals.push(Math.floor(pairAge) + 'd age (maturing)'); }
  else if (pairAge > 7)  { matScore += 6;  matSignals.push(Math.floor(pairAge) + 'd age (young)'); }
  else if (pairAge > 3)  { matScore += 4;  matSignals.push(pairAge.toFixed(1) + 'd age (very new)'); }
  else if (pairAge > 1)  { matScore += 2;  matSignals.push(pairAge.toFixed(1) + 'd age (newborn)'); flags.push('WARNING: pair less than 3 days old.'); }
  else                   { matScore += 1;  matSignals.push((pairAge * 24).toFixed(1) + 'h age (just launched)'); flags.push('DANGER: launched less than 24 hours ago.'); }

  if (totalTxns > 5000)      { matScore += 10; matSignals.push(fmt(totalTxns) + ' txns/24h (very active)'); }
  else if (totalTxns > 1000) { matScore += 8;  matSignals.push(fmt(totalTxns) + ' txns/24h (active)'); }
  else if (totalTxns > 500)  { matScore += 6;  matSignals.push(fmt(totalTxns) + ' txns/24h (moderate)'); }
  else if (totalTxns > 100)  { matScore += 4;  matSignals.push(fmt(totalTxns) + ' txns/24h (low)'); }
  else if (totalTxns > 50)   { matScore += 2;  matSignals.push(totalTxns + ' txns/24h (minimal)'); }
  else                       { matScore += 1;  matSignals.push(totalTxns + ' txns/24h (dead)'); }

  components.maturity = { score: matScore, max: 20, signals: matSignals };
  totalScore += matScore;

  // ── 4. CONTRACT INTEGRITY (0-20) ──
  // Is the smart contract real and reasonably structured?
  var conScore = 0;
  var conSignals = [];

  if (hasCode) { conScore += 8; conSignals.push('bytecode verified on Base'); }
  else { conSignals.push('no bytecode found'); flags.push('DANGER: no contract code at this address.'); }

  if (totalSupply !== null) {
    if (totalSupply <= 1e12)      { conScore += 4; conSignals.push('supply ' + fmtSupply(totalSupply) + ' (normal)'); }
    else if (totalSupply <= 1e15) { conScore += 2; conSignals.push('supply ' + fmtSupply(totalSupply) + ' (high)'); }
    else                          { conScore += 0; conSignals.push('supply ' + fmtSupply(totalSupply) + ' (extreme)'); flags.push('CAUTION: extremely high total supply.'); }
  }

  if (pairCount > 1) { conScore += 4; conSignals.push(pairCount + ' DEX pairs (distributed)'); }
  else               { conScore += 2; conSignals.push('single DEX pair'); }

  conScore += 4; conSignals.push('listed and actively trading');
  components.contract = { score: conScore, max: 20, signals: conSignals };
  totalScore += conScore;

  // ── 5. MOMENTUM (0-15) ──
  // Is the trend favorable or dangerous?
  var momScore = 0;
  var momSignals = [];

  var pc24h = priceChange.h24 || 0;
  var pc6h = priceChange.h6 || 0;
  var pc1h = priceChange.h1 || 0;

  if (pc24h >= 5 && pc24h <= 50)        { momScore += 8; momSignals.push(s(pc24h) + '% 24h (uptrend)'); }
  else if (pc24h >= -5 && pc24h < 5)    { momScore += 6; momSignals.push(s(pc24h) + '% 24h (stable)'); }
  else if (pc24h > 50 && pc24h <= 200)  { momScore += 4; momSignals.push(s(pc24h) + '% 24h (parabolic)'); flags.push('CAUTION: parabolic move. reversal risk elevated.'); }
  else if (pc24h >= -20 && pc24h < -5)  { momScore += 4; momSignals.push(s(pc24h) + '% 24h (declining)'); }
  else if (pc24h >= -50 && pc24h < -20) { momScore += 2; momSignals.push(s(pc24h) + '% 24h (bleeding)'); }
  else if (pc24h > 200)                 { momScore += 1; momSignals.push(s(pc24h) + '% 24h (extreme pump)'); flags.push('DANGER: extreme pump. very high reversal probability.'); }
  else                                  { momScore += 1; momSignals.push(s(pc24h) + '% 24h (severe decline)'); flags.push('CAUTION: severe price decline.'); }

  // Trend alignment: are 6h and 24h moving in the same direction?
  var up24 = pc24h > 0;
  var up6 = pc6h > 0;
  if (up24 && up6)       { momScore += 7; momSignals.push('6h/24h aligned positive (' + s(pc6h) + '% 6h)'); }
  else if (!up24 && up6) { momScore += 5; momSignals.push('6h recovering (' + s(pc6h) + '% 6h vs ' + s(pc24h) + '% 24h)'); }
  else if (up24 && !up6) { momScore += 4; momSignals.push('6h weakening (' + s(pc6h) + '% 6h vs ' + s(pc24h) + '% 24h)'); }
  else                   { momScore += 3; momSignals.push('6h/24h aligned negative (' + s(pc6h) + '% 6h)'); }

  components.momentum = { score: momScore, max: 15, signals: momSignals };
  totalScore += momScore;

  // ── GRADE ──
  var grade;
  if (totalScore >= 80)      grade = 'A';
  else if (totalScore >= 65) grade = 'B';
  else if (totalScore >= 50) grade = 'C';
  else if (totalScore >= 35) grade = 'D';
  else                       grade = 'F';

  // ── RECOMMENDATION ──
  var dangerCount = flags.filter(function(f) { return f.startsWith('DANGER'); }).length;
  var recommendation;
  if (totalScore >= 70 && dangerCount === 0)      { recommendation = 'favorable conditions for trading.'; }
  else if (totalScore >= 50 && dangerCount === 0) { recommendation = 'proceed with caution. review flags.'; }
  else if (totalScore >= 50)                      { recommendation = 'mixed signals. ' + dangerCount + ' critical flag(s). small size only.'; }
  else if (totalScore >= 35)                      { recommendation = 'high risk. small size only if strong conviction.'; }
  else                                            { recommendation = 'avoid. insufficient safety signals.'; }

  // ── SUMMARY ──
  var summary = buildSummary(symbol, totalScore, grade, liquidity, pairAge, bsRatio, dangerCount, pc24h);

  return {
    agent: 'SIBYL #20880',
    version: 'score-v1',
    token: tokenAddress,
    symbol: symbol,
    name: name,
    chain: 'base',
    timestamp: new Date().toISOString(),
    price_usd: priceUsd,
    market_cap: round(mc, 0),
    fdv: round(fdv, 0),
    liquidity_usd: round(liquidity, 0),
    volume_24h: round(vol24h, 0),
    pair_age_days: round(pairAge, 2),
    score: totalScore,
    grade: grade,
    components: components,
    flags: flags,
    recommendation: recommendation,
    summary: summary,
    data_sources: ['dexscreener', 'base-rpc'],
    demo: isDemo
  };
}

function buildSummary(symbol, score, grade, liquidity, pairAge, bsRatio, dangerCount, pc24h) {
  var p = [];
  p.push(symbol + ' scores ' + score + '/100 (grade ' + grade + ').');

  if (liquidity >= 100000)     p.push('liquidity is strong.');
  else if (liquidity >= 10000) p.push('liquidity is thin but tradeable.');
  else                         p.push('liquidity is dangerously low.');

  if (bsRatio >= 1.3)      p.push('buyers in control.');
  else if (bsRatio >= 0.8) p.push('balanced market.');
  else                     p.push('sellers dominant.');

  if (pairAge < 1)      p.push('launched within 24 hours.');
  else if (pairAge < 3) p.push('very early.');
  else if (pairAge < 7) p.push('still young.');

  if (pc24h > 50)       p.push('parabolic move in progress.');
  else if (pc24h < -30) p.push('significant decline.');

  if (dangerCount > 0) p.push(dangerCount + ' critical warning(s) flagged.');

  return p.join(' ');
}

// ── DATA FETCHERS ──

async function fetchDexScreener(token) {
  var resp = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + token, {
    headers: { 'Accept': 'application/json' }
  });
  if (!resp.ok) throw new Error('DexScreener error: ' + resp.status);
  return resp.json();
}

async function checkBytecode(token) {
  try {
    var resp = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getCode', params: [token, 'latest'], id: 1 })
    });
    var data = await resp.json();
    return data.result && data.result !== '0x' && data.result.length > 2;
  } catch (e) {
    console.error('bytecode_check_failed:', e.message);
    return false;
  }
}

async function fetchTotalSupply(token) {
  try {
    var resp = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: token, data: '0x18160ddd' }, 'latest'], id: 1 })
    });
    var data = await resp.json();
    if (data.result && data.result !== '0x') {
      return parseInt(data.result, 16) / 1e18;
    }
    return null;
  } catch (e) {
    console.error('total_supply_failed:', e.message);
    return null;
  }
}

// ── FORMATTERS ──

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

function s(n) { return n >= 0 ? '+' + n.toFixed(1) : n.toFixed(1); }

function round(n, d) {
  var f = Math.pow(10, d);
  return Math.round(n * f) / f;
}
