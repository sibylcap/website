/* Shared X/Twitter activity fetchers for SIBYL x402 endpoints */

var constants = require('./constants');

async function fetchXActivity(handle) {
  var bearer = constants.X_BEARER;
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

    var SHIP_RE = constants.SHIP_RE;
    var shipCount = recent.filter(function(t) { return SHIP_RE.test(t.text || t.full_text || ''); }).length;

    var engagement = 0;
    recent.forEach(function(t) { engagement += (t.favorite_count || 0) + (t.retweet_count || 0); });

    return {
      handle: handle,
      period: '7d',
      total_tweets: recent.length,
      shipping_tweets: shipCount,
      avg_engagement: recent.length > 0 ? Math.round(engagement / recent.length) : 0,
      tweets_per_day: Math.round(recent.length / 7 * 10) / 10,
      shipping_ratio: recent.length > 0 ? Math.round(shipCount / recent.length * 100) : 0,
      source: 'v1.1'
    };
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'x_api_v1_timeout' };
    return { error: 'v1_' + err.message };
  }
}

function classifyTweets(tweets, handle, source) {
  var SHIP_RE = constants.SHIP_RE;
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
    tweets_per_day: Math.round(tweets.length / 7 * 10) / 10,
    shipping_ratio: tweets.length > 0 ? Math.round(shipCount / tweets.length * 100) : 0,
    source: source
  };
}

// Version that also returns shipping tweet details (for report.js)
async function fetchXActivityWithTweets(handle) {
  var bearer = constants.X_BEARER;
  if (!bearer) return { error: 'no_bearer_token' };
  if (bearer.indexOf('%') !== -1) {
    try { bearer = decodeURIComponent(bearer); } catch (e) {}
  }

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

    var SHIP_RE = constants.SHIP_RE;
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
      tweets_per_day: Math.round(recent.length / 7 * 10) / 10,
      shipping_ratio: recent.length > 0 ? Math.round(shipMatches.length / recent.length * 100) : 0,
      shipping_tweet_details: details, source: 'v1.1'
    };
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'x_api_v1_timeout' };
    return { error: 'v1_' + err.message };
  }
}

function classifyWithDetails(tweets, handle, source) {
  var SHIP_RE = constants.SHIP_RE;
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
    tweets_per_day: Math.round(tweets.length / 7 * 10) / 10,
    shipping_ratio: tweets.length > 0 ? Math.round(shipMatches.length / tweets.length * 100) : 0,
    shipping_tweet_details: details, source: source
  };
}

module.exports = {
  fetchXActivity: fetchXActivity,
  fetchXActivityWithTweets: fetchXActivityWithTweets,
  classifyTweets: classifyTweets
};
