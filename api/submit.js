/* SIBYL form handler. Receives pitch, signal, and suggest submissions.
   Logs to Vercel function logs (always). Writes to Google Sheet (when enabled). */

module.exports = async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowed = origin === 'https://sibylcap.com' || origin === 'http://localhost:3000';
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://sibylcap.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  var body = req.body || {};
  var type = body.type;
  var data = body.data;
  var hp = body._hp;
  var formTime = body._t;

  // Honeypot: bots fill hidden fields
  if (hp) {
    return res.status(200).json({ ok: true });
  }

  // Timing: reject if form submitted in under 3 seconds
  if (formTime && Date.now() - formTime < 3000) {
    return res.status(200).json({ ok: true });
  }

  // Validate type
  if (!type || ['pitch', 'signal', 'suggest'].indexOf(type) === -1) {
    return res.status(400).json({ error: 'invalid type' });
  }

  // Validate data by type
  if (type === 'pitch') {
    if (!data || !data.project || !data.handle || !data.description) {
      return res.status(400).json({ error: 'missing required fields' });
    }
  } else if (type === 'signal') {
    if (!data || !data.project) {
      return res.status(400).json({ error: 'missing project' });
    }
  } else if (type === 'suggest') {
    if (!data || !data.project || !data.handle || !data.why) {
      return res.status(400).json({ error: 'missing required fields' });
    }
  }

  var timestamp = new Date().toISOString();
  var ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();

  // Always log to Vercel function logs. This works without Sheets.
  console.log(JSON.stringify({
    event: 'form_submission',
    type: type,
    data: data,
    timestamp: timestamp,
    ip: ip
  }));

  // Write to Google Sheets if configured
  try {
    var sheetId = process.env.GOOGLE_SHEET_ID;
    if (sheetId && process.env.GOOGLE_CLIENT_ID) {
      var token = await getAccessToken();
      if (token) {
        var tab, values;

        if (type === 'pitch') {
          tab = 'pitches';
          values = [[timestamp, data.project, data.handle, data.description, data.contract || '', ip]];
        } else if (type === 'signal') {
          tab = 'signals';
          values = [[timestamp, 'signal', data.project, '', '', ip]];
        } else if (type === 'suggest') {
          tab = 'signals';
          values = [[timestamp, 'suggest', data.project, data.handle, data.why, ip]];
        }

        await appendToSheet(token, sheetId, tab, values);
      }
    }
  } catch (err) {
    console.error('sheets_write_failed:', err.message);
  }

  return res.status(200).json({ ok: true });
};

async function getAccessToken() {
  var params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });

  var resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  var d = await resp.json();
  return d.access_token || null;
}

async function appendToSheet(token, sheetId, tab, values) {
  var range = encodeURIComponent(tab + '!A:F');
  var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId +
    '/values/' + range + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';

  var resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: values })
  });

  if (!resp.ok) {
    var errText = await resp.text();
    throw new Error('Sheets API ' + resp.status + ': ' + errText);
  }
}
