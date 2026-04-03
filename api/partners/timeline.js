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

    // Resolve project: explicit query param or first from JWT
    var projectId = req.query.project_id || user.project_ids[0];
    if (!auth.userHasProject(user, projectId)) {
      return res.status(403).json({ error: 'no access to this project' });
    }

    var project = await db.getProjectById(projectId);
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
        var parseOhlcv = function(list) {
          if (!list || !list.length) return [];
          return list.map(function(c) {
            return { date: new Date(c[0] * 1000).toISOString(), open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] };
          }).reverse();
        };

        var fetchOhlcv = async function(url) {
          var r = await fetch(url, { headers: { 'Accept': 'application/json' } });
          if (!r.ok) return [];
          var d = await r.json();
          return parseOhlcv(d.data && d.data.attributes && d.data.attributes.ohlcv_list);
        };

        // 1. Try token-level daily OHLCV
        prices = await fetchOhlcv('https://api.geckoterminal.com/api/v2/networks/base/tokens/' + project.token_ca + '/ohlcv/day?aggregate=1&limit=90&currency=usd');

        // 2. If empty, discover top pool and try daily then hourly
        if (prices.length === 0) {
          var poolsRes = await fetch('https://api.geckoterminal.com/api/v2/networks/base/tokens/' + project.token_ca + '/pools?page=1', { headers: { 'Accept': 'application/json' } });
          if (poolsRes.ok) {
            var poolsData = await poolsRes.json();
            var pools = poolsData.data || [];
            if (pools.length > 0) {
              var poolAddr = pools[0].attributes && pools[0].attributes.address;
              if (poolAddr) {
                // Try daily first
                prices = await fetchOhlcv('https://api.geckoterminal.com/api/v2/networks/base/pools/' + poolAddr + '/ohlcv/day?aggregate=1&limit=90&currency=usd');
                // Fall back to hourly (last 7 days = 168 hours)
                if (prices.length === 0) {
                  prices = await fetchOhlcv('https://api.geckoterminal.com/api/v2/networks/base/pools/' + poolAddr + '/ohlcv/hour?aggregate=1&limit=168&currency=usd');
                }
                // Fall back to 4-hour (last 30 days = 180 candles)
                if (prices.length === 0) {
                  prices = await fetchOhlcv('https://api.geckoterminal.com/api/v2/networks/base/pools/' + poolAddr + '/ohlcv/hour?aggregate=4&limit=180&currency=usd');
                }
              }
            }
          }
        }
      } catch (e) {
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
