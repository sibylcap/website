/* Advisory Partner Dashboard: Timeline endpoint.
   GET /api/partners/timeline — returns price history + advisory milestones */

var db = require('../_lib/partners-db');
var auth = require('../_lib/partners-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  try {
    var user = auth.extractUser(req);
    if (!user) return res.status(401).json({ error: 'not authenticated' });

    var project = await db.getProjectById(user.project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });

    // Fetch milestones: sessions + task status changes
    var sessions = await db.getSessionsByProject(project.id);
    var tasks = await db.getTasksByProject(project.id);

    var milestones = [];

    // Project start
    milestones.push({
      date: project.created_at,
      type: 'start',
      label: 'Advisory started',
    });

    // Sessions
    sessions.forEach(function(s) {
      milestones.push({
        date: s.created_at,
        type: 'session',
        label: s.title,
      });
      if (s.closed_at) {
        milestones.push({
          date: s.closed_at,
          type: 'session_closed',
          label: s.title + ' completed',
        });
      }
    });

    // Completed tasks
    tasks.forEach(function(t) {
      if (t.status === 'completed') {
        milestones.push({
          date: t.updated_at,
          type: 'task_done',
          label: t.title,
        });
      }
    });

    // Sort by date
    milestones.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });

    // Fetch price history from GeckoTerminal if token_ca exists
    var prices = [];
    if (project.token_ca) {
      try {
        var url = 'https://api.geckoterminal.com/api/v2/networks/base/tokens/' + project.token_ca + '/ohlcv/day?aggregate=1&limit=90&currency=usd';
        var priceRes = await fetch(url, {
          headers: { 'Accept': 'application/json' },
        });
        if (priceRes.ok) {
          var priceData = await priceRes.json();
          var ohlcv = priceData.data && priceData.data.attributes && priceData.data.attributes.ohlcv_list;
          if (ohlcv && ohlcv.length) {
            // GeckoTerminal returns [timestamp, open, high, low, close, volume]
            // newest first, so reverse
            prices = ohlcv.map(function(c) {
              return {
                date: new Date(c[0] * 1000).toISOString(),
                open: c[1],
                high: c[2],
                low: c[3],
                close: c[4],
                volume: c[5],
              };
            }).reverse();
          }
        }
      } catch (e) {
        // Price fetch failed, continue without it
        console.error('[partners/timeline] price fetch error:', e.message);
      }
    }

    // Also try DexScreener for current price
    var currentPrice = null;
    if (project.token_ca) {
      try {
        var dexRes = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + project.token_ca);
        if (dexRes.ok) {
          var dexData = await dexRes.json();
          if (dexData.pairs && dexData.pairs.length > 0) {
            currentPrice = {
              usd: parseFloat(dexData.pairs[0].priceUsd) || null,
              change24h: dexData.pairs[0].priceChange && dexData.pairs[0].priceChange.h24 || null,
              pair: dexData.pairs[0].pairAddress,
              dexUrl: dexData.pairs[0].url,
            };
          }
        }
      } catch (e) {
        // continue
      }
    }

    return res.json({
      project_id: project.id,
      token_ca: project.token_ca,
      milestones: milestones,
      prices: prices,
      currentPrice: currentPrice,
      advisory_start: project.created_at,
    });

  } catch (err) {
    console.error('[partners/timeline] error:', err.message);
    return res.status(500).json({ error: 'internal error' });
  }
};
