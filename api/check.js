/* SIBYL Token Safety Check API.
   Quick pass/fail safety assessment with specific danger flags.
   Lighter and cheaper than /api/score. Use this for pre-trade screening.
   Payment: x402 ($0.02 USDC per call). Free with ?demo=true.

   Usage:
     GET /api/check?token=0x...              (paid, $0.02 USDC)
     GET /api/check?token=0x...&demo=true    (free, same output)
*/

var x402 = require('./_x402');
var RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
var PRICE_USD = 0.02;

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

  var paid = await x402.gate(req, res, {
    priceUsd: PRICE_USD,
    description: 'SIBYL safety check'
  });
  if (!paid) return;

  var isDemo = req.query.demo === 'true';

  try {
    var results = await Promise.all([
      fetchDexScreener(token),
      checkBytecode(token)
    ]);

    var dexData = results[0];
    var hasCode = results[1];

    var checks = {
      contract_exists: hasCode,
      has_liquidity: false,
      liquidity_above_5k: false,
      sells_occurring: false,
      not_honeypot: false,
      age_above_24h: false,
      buy_sell_ratio_healthy: false,
      volume_present: false
    };

    var warnings = [];
    var riskLevel = 'low';

    if (hasCode === null) {
      checks.contract_exists = null;
      warnings.push('bytecode check inconclusive. RPC timeout.');
    } else if (!hasCode) {
      warnings.push('no contract bytecode at this address.');
      riskLevel = 'critical';
    }

    if (!dexData || !dexData.pairs || dexData.pairs.length === 0) {
      warnings.push('no trading pairs found. token may not be listed or may be on a different chain.');
      return res.status(200).json({
        agent: 'SIBYL #20880',
        version: 'check-v1',
        token: token,
        chain: 'base',
        timestamp: new Date().toISOString(),
        safe: false,
        risk_level: 'critical',
        checks: checks,
        warnings: warnings,
        recommendation: 'cannot verify. do not trade.',
        demo: isDemo
      });
    }

    // Use highest liquidity Base pair
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
    var liquidity = (pair.liquidity && pair.liquidity.usd) || 0;
    var txns24h = (pair.txns && pair.txns.h24) || { buys: 0, sells: 0 };
    var vol24h = (pair.volume && pair.volume.h24) || 0;
    var pairAge = pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 86400000 : 0;
    var symbol = (pair.baseToken && pair.baseToken.symbol) || 'UNKNOWN';

    // Run checks
    checks.has_liquidity = liquidity > 0;
    checks.liquidity_above_5k = liquidity >= 5000;
    checks.sells_occurring = txns24h.sells > 0;
    checks.age_above_24h = pairAge >= 1;
    checks.volume_present = vol24h > 0;

    // Honeypot detection: if buys happening but no sells, likely a trap
    if (txns24h.sells > 0) {
      checks.not_honeypot = true;
    } else if (txns24h.buys === 0) {
      checks.not_honeypot = true; // no activity either way, not enough data
    } else {
      checks.not_honeypot = false; // buys but no sells
    }

    // Buy/sell ratio
    var bsRatio = txns24h.sells > 0 ? txns24h.buys / txns24h.sells : 0;
    checks.buy_sell_ratio_healthy = bsRatio >= 0.5;

    // Generate warnings based on failed checks
    if (!checks.has_liquidity) {
      warnings.push('zero liquidity pool.');
      riskLevel = elevate(riskLevel, 'critical');
    } else if (!checks.liquidity_above_5k) {
      warnings.push('liquidity $' + Math.round(liquidity) + '. below $5K minimum for safe trading.');
      riskLevel = elevate(riskLevel, 'high');
    }

    if (!checks.not_honeypot) {
      warnings.push(txns24h.buys + ' buys, 0 sells. classic honeypot pattern.');
      riskLevel = elevate(riskLevel, 'critical');
    }

    if (!checks.age_above_24h) {
      warnings.push('pair age ' + (pairAge * 24).toFixed(1) + ' hours. insufficient history.');
      riskLevel = elevate(riskLevel, 'medium');
    }

    if (!checks.buy_sell_ratio_healthy && txns24h.sells > 0) {
      warnings.push('extreme sell pressure: ' + txns24h.buys + ' buys vs ' + txns24h.sells + ' sells.');
      riskLevel = elevate(riskLevel, 'high');
    }

    if (!checks.volume_present) {
      warnings.push('zero 24h volume.');
      riskLevel = elevate(riskLevel, 'high');
    }

    // Overall assessment
    var safe = riskLevel === 'low' || riskLevel === 'medium';
    var failedChecks = Object.keys(checks).filter(function(k) { return !checks[k]; });

    var recommendation;
    if (riskLevel === 'critical')    { recommendation = 'do not trade.'; }
    else if (riskLevel === 'high')   { recommendation = 'high risk. avoid unless strong conviction and small size.'; }
    else if (riskLevel === 'medium') { recommendation = 'moderate risk. proceed with caution.'; }
    else                             { recommendation = 'no critical issues detected. standard diligence applies.'; }

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({
      agent: 'SIBYL #20880',
      version: 'check-v1',
      token: token,
      symbol: symbol,
      chain: 'base',
      timestamp: new Date().toISOString(),
      safe: safe,
      risk_level: riskLevel,
      checks: checks,
      failed_checks: failedChecks,
      warnings: warnings,
      recommendation: recommendation,
      data_sources: ['dexscreener', 'base-rpc'],
      demo: isDemo
    });

  } catch (err) {
    console.error('check_error:', err.message, err.stack);
    return res.status(500).json({ error: 'safety check failed' });
  }
};

function elevate(current, proposed) {
  var levels = { low: 0, medium: 1, high: 2, critical: 3 };
  return levels[proposed] > levels[current] ? proposed : current;
}

async function fetchDexScreener(token) {
  var resp = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + token, {
    headers: { 'Accept': 'application/json' }
  });
  if (!resp.ok) throw new Error('DexScreener error: ' + resp.status);
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
      if (data.result === '0x') return false; // definitive: no code
    } catch (e) {
      continue; // try next RPC
    }
  }
  return null; // inconclusive, all RPCs failed
}
