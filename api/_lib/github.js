/* Shared GitHub activity fetchers for SIBYL x402 endpoints */

var ghHeaders = function() {
  var h = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'SIBYL-Agent-20880' };
  if (process.env.GITHUB_TOKEN) h['Authorization'] = 'token ' + process.env.GITHUB_TOKEN;
  return h;
};

async function fetchGitHubActivity(username) {
  try {
    var events = [];
    for (var page = 1; page <= 3; page++) {
      var url = 'https://api.github.com/users/' + encodeURIComponent(username)
        + '/events?per_page=100&page=' + page;

      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 5000);
      var resp = await fetch(url, {
        headers: ghHeaders(),
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
        headers: ghHeaders(),
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
    commits_per_week: Math.round(commits / 4.3 * 10) / 10,
    pushes_per_week: Math.round(pushes.length / 4.3 * 10) / 10
  };
}

// Auto-discover GitHub handle from npm registry
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

module.exports = {
  fetchGitHubActivity: fetchGitHubActivity,
  processGitHubEvents: processGitHubEvents,
  discoverGitHubFromNpm: discoverGitHubFromNpm
};
