/* ============================================
   Ping v2 : app.js
   Live feed + multi-window workspace
   ============================================ */

(function () {
  'use strict';

  // ---- Frame-busting (clickjacking protection) ----
  if (window.top !== window.self) { window.top.location = window.self.location; }

  // ---- Config ----
  var CONTRACT_ADDRESS = '0xcd4af194dd8e79d26f9e7ccff8948e010a53d70a';
  // Alchemy + Tatum: fast contract reads (getUsername, getUserCount, isAgent, getBlockNumber)
  // Both free tiers limit getLogs to tiny ranges — useless for log fetching
  var ALCHEMY_URL = 'https://base-mainnet.g.alchemy.com/v2/RgNU6uKPEDG6b7LI14nKs';
  var TATUM_URL = 'https://base-mainnet.gateway.tatum.io/v4/t-69adc61b8b7c2d93b6192185-48fba70dc11e4944b605e028';

  // Public RPCs: used for getLogs (block range queries) and as fallback for reads
  var LOG_RPC_STACK = [
    'https://base.gateway.tenderly.co',
    'https://mainnet.base.org',
    'https://base.drpc.org',
    'https://base.publicnode.com'
  ];
  var RPC_STACK = [ALCHEMY_URL, TATUM_URL].concat(LOG_RPC_STACK);
  var RPC_URL = RPC_STACK[0];
  var _rpcIndex = 0;
  var _rpcFailCounts = {};
  var _logRpcIndex = 0;
  var _logRpcFailCounts = {};
  var CHAIN_ID = 8453;
  var CHAIN_ID_HEX = '0x2105';
  var BASESCAN = 'https://basescan.org';
  var ERC8004_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
  var DEPLOY_BLOCK = 42772822;
  var LOG_CHUNK = 5000;
  var CHUNK_DELAY = 200;
  var FEED_CYCLE_MS = 5000;
  var FEED_STAGGER_MS = 1800;

  // ---- Server-side cache API (replaces 100+ browser RPC calls with 1 fetch) ----
  var CACHE_API_URL = 'https://sibylcap.com/api/ping-cache';

  // ---- Diamond (Pingcast) Config ----
  var DIAMOND_ADDRESS = '0x59235da2dd29bd0ebce0399ba16a1c5213e605da';
  var DIAMOND_DEPLOY_BLOCK = 42818323;
  var SIBYL_ADDRESS = '0x4069ef1afC8A9b2a29117A3740fCAB2912499fBe'.toLowerCase();
  var PINGCAST_RELAY = '0xb91d82EBE1b90117B6C6c5990104B350d3E2f9e6'.toLowerCase();
  var SIBYL_ERC8004_ID = 20880;

  // ---- Ping v2 Diamond (canonical for all new operations) ----
  var V2_ADDRESS = '0x0571b06a221683f8afddfedd90e8568b95086df6';
  var V2_DEPLOY_BLOCK = 43014945;

  // ---- Referral Contract ----
  var REFERRAL_ADDRESS = '0x0f1a7dcb6409149721f0c187e01d0107b2dd94e0';
  var REFERRAL_ABI = [
    'function recordReferral(address referrer) external',
    'function referredBy(address) external view returns (address)',
    'function referralCount(address) external view returns (uint256)',
    'function getReferrerCount() external view returns (uint256)',
    'function getLeaderboard(uint256 offset, uint256 limit) external view returns (address[] referrers, uint256[] counts)'
  ];

  // ---- Points / Multiplier Contract ----
  var POINTS_ADDRESS = '0x9fbb26db3ea347720bcb5731c79ba343e5086982';
  var POINTS_ABI = [
    'function claim() external',
    'function getMultiplier(address user) external view returns (uint256)',
    'function getStatus(address user) external view returns (uint256 number, uint256 multiplier)',
    'function getMultipliers(address[] users) external view returns (uint256[] numbers, uint256[] multipliers)',
    'function totalClaimed() external view returns (uint256)',
    'function registrationNumber(address) external view returns (uint256)'
  ];

  var TIER_LABELS = { 5: 'Pioneer (5x)', 3: 'Early (3x)', 2: 'Builder (2x)', 1: '1x' };
  var TIER_LABELS_AGENT = { 5: 'Pioneer Agent (5x)', 3: 'Early Agent (3x)', 2: 'Builder Agent (2x)', 1: '1x' };
  // Human tiers: gold, silver, bronze
  var TIER_COLORS = { 5: '#ffd700', 3: '#c0c0c0', 2: '#cd7f32', 1: 'var(--text-2)' };
  // Agent tiers: cyan, electric blue, violet
  var TIER_COLORS_AGENT = { 5: '#00e5ff', 3: '#448aff', 2: '#b388ff', 1: 'var(--text-2)' };

  function getTierLabel(mult, addr) {
    var isAg = addr && S.agentCache[addr.toLowerCase()];
    return (isAg ? TIER_LABELS_AGENT : TIER_LABELS)[mult] || (mult + 'x');
  }

  function getTierColor(mult, addr) {
    var isAg = addr && S.agentCache[addr.toLowerCase()];
    return (isAg ? TIER_COLORS_AGENT : TIER_COLORS)[mult] || 'var(--text-2)';
  }

  // Robot head SVG for agent badges (ERC-8004 verified)
  var ROBOT_SVG_PATH = 'M12 2a1 1 0 0 1 1 1v2h3a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-1v2h1a1 1 0 0 1 0 2H8a1 1 0 0 1 0-2h1v-2H8a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h3V3a1 1 0 0 1 1-1zM9 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z';
  function agentSvg(size) { return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="currentColor"><path d="' + ROBOT_SVG_PATH + '"/></svg>'; }

  // ---- Sound system (Web Audio API, no external files) ----
  var _audioCtx = null;
  function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
  }

  // Click: 3 rapid micro-clicks, mechanical keypress feel
  function playSwoosh() {
    try {
      var ctx = getAudioCtx();
      var t = ctx.currentTime;
      var sampleRate = ctx.sampleRate;
      var clicks = [0, 0.064, 0.144];
      var freqs = [3200, 2800, 3500];
      clicks.forEach(function (offset, i) {
        var clickLen = Math.floor(sampleRate * 0.012);
        var buf = ctx.createBuffer(1, clickLen, sampleRate);
        var data = buf.getChannelData(0);
        for (var j = 0; j < clickLen; j++) {
          var env = Math.exp(-j / (clickLen * 0.08));
          data[j] = (Math.random() * 2 - 1) * env;
        }
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = freqs[i];
        bp.Q.value = 3;
        var gain = ctx.createGain();
        gain.gain.value = 0.35 + (i * 0.05);
        src.connect(bp);
        bp.connect(gain);
        gain.connect(ctx.destination);
        src.start(t + offset);
        src.stop(t + offset + 0.012);
      });
    } catch (e) { /* silent fail */ }
  }

  // Ping: three-tone ascending chime with subtle reverb
  function playPing() {
    try {
      var ctx = getAudioCtx();
      var t = ctx.currentTime;
      var reverbLen = Math.floor(ctx.sampleRate * 0.6);
      var reverbBuf = ctx.createBuffer(1, reverbLen, ctx.sampleRate);
      var reverbData = reverbBuf.getChannelData(0);
      for (var i = 0; i < reverbLen; i++) {
        reverbData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (reverbLen * 0.15));
      }
      var reverb = ctx.createConvolver();
      reverb.buffer = reverbBuf;
      var dry = ctx.createGain();
      dry.gain.value = 0.7;
      var wet = ctx.createGain();
      wet.gain.value = 0.3;
      // First tone — A5
      var osc1 = ctx.createOscillator();
      var gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.value = 880;
      gain1.gain.setValueAtTime(0.25, t);
      gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      osc1.connect(gain1);
      gain1.connect(dry);
      gain1.connect(reverb);
      osc1.start(t);
      osc1.stop(t + 0.2);
      // Second tone — E6
      var osc2 = ctx.createOscillator();
      var gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = 1320;
      gain2.gain.setValueAtTime(0.001, t);
      gain2.gain.setValueAtTime(0.3, t + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
      osc2.connect(gain2);
      gain2.connect(dry);
      gain2.connect(reverb);
      osc2.start(t + 0.1);
      osc2.stop(t + 0.4);
      // Third tone — B6
      var osc3 = ctx.createOscillator();
      var gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.value = 1976;
      gain3.gain.setValueAtTime(0.001, t);
      gain3.gain.setValueAtTime(0.12, t + 0.18);
      gain3.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
      osc3.connect(gain3);
      gain3.connect(dry);
      gain3.connect(reverb);
      osc3.start(t + 0.18);
      osc3.stop(t + 0.5);
      dry.connect(ctx.destination);
      reverb.connect(wet);
      wet.connect(ctx.destination);
    } catch (e) { /* silent fail */ }
  }

  var BROADCAST_ABI = [
    'function broadcast(string content) payable',
    'function getBroadcastFee() view returns (uint256)',
    'function getBroadcastCount() view returns (uint256)',
    'function getBroadcastPricing() view returns (uint256 baseFee, uint256 tierFee, uint256 usersPerTier, uint256 currentUsers, uint256 currentTier, uint256 currentFee)',
    'event Broadcast(address indexed sender, string content, uint256 indexed broadcastId)'
  ];

  // ---- ABI (v1 — historical reads only) ----
  var ABI = [
    'function register(string calldata username) external',
    'function sendMessage(address to, string calldata content) external payable',
    'function getUsername(address wallet) external view returns (string)',
    'function getAddress(string calldata username) external view returns (address)',
    'function getUserCount() external view returns (uint256)',
    'function getUserAtIndex(uint256 index) external view returns (address)',
    'function setBio(string calldata bio) external',
    'function getBio(address wallet) external view returns (string)',
    'function messageFee() external view returns (uint256)',
    'event UserRegistered(address indexed wallet, string username)',
    'event MessageSent(address indexed from, address indexed to, string content)',
    'event BioUpdated(address indexed wallet, string bio)'
  ];

  // ---- ABI (v2 Diamond — all new reads and writes) ----
  var V2_ABI = [
    'function register(string username) external',
    'function sendMessage(address to, string content) external payable',
    'function getUsername(address wallet) external view returns (string)',
    'function getAddress(string username) external view returns (address)',
    'function getUserCount() external view returns (uint256)',
    'function getUserAtIndex(uint256 index) external view returns (address)',
    'function getTotalUserCount() external view returns (uint256)',
    'function isRegistered(address wallet) external view returns (bool)',
    'function setBio(string bio) external',
    'function getBio(address wallet) external view returns (string)',
    'function setAvatar(string avatar) external',
    'function getAvatar(address wallet) external view returns (string)',
    'function messageFee() external view returns (uint256)',
    'function broadcast(string content) external payable',
    'function getBroadcastFee() external view returns (uint256)',
    'function getBroadcastCount() external view returns (uint256)',
    'function getBroadcastPricing() external view returns (uint256 baseFee, uint256 tierFee, uint256 usersPerTier, uint256 totalUsers, uint256 currentTier, uint256 currentFee)',
    'event UserRegistered(address indexed wallet, string username)',
    'event MessageSent(address indexed from, address indexed to, string content)',
    'event BioUpdated(address indexed wallet, string bio)',
    'event AvatarUpdated(address indexed wallet, string avatar)',
    'event Broadcast(address indexed sender, string content, uint256 indexed broadcastId)'
  ];

  var ERC8004_ABI = ['function balanceOf(address owner) external view returns (uint256)'];

  // ---- ERC-8004 Reputation Registry ----
  var REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';
  var REPUTATION_ABI = [
    'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external',
    'function getFeedbackCount(uint256 agentId) external view returns (uint256)',
    'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)'
  ];
  var ERC8004_ID_ABI = ['function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)'];

  // ---- State ----
  var S = {
    connected: false,
    connecting: false,
    registering: false,
    address: null,
    username: null,
    provider: null,
    signer: null,
    contract: null,
    readContract: null,
    readProvider: null,
    erc8004: null,
    allMessages: [],
    conversations: {},
    usernameCache: {},
    agentCache: {},
    bioCache: {},
    avatarCache: {},
    directoryUsers: [],
    // Windows
    openWindows: {},
    windowZCounter: 10,
    windowCascadeIndex: 0,
    dragState: null,
    resizeState: null,
    // Feed
    feedMessages: [],
    feedTimers: [],
    feedIndices: [0, 0, 0],
    cachedApiMessages: null,
    cachedApiBlock: 0,
    // Drawer
    drawerMode: null, // 'directory' | 'profile'
    profileTarget: null,
    // Autocomplete
    acHighlight: -1,
    acResults: [],
    directoryLoaded: false,
    // Dropdown
    dropdownOpen: false,
    messageFee: 0n,
    // Polling
    lastSyncBlock: 0,
    pollTimer: null,
    pollBusy: false,
    loggedOut: localStorage.getItem('ping_logged_out') === '1',
    // Referral + Points
    referrer: localStorage.getItem('ping_referrer') || null,
    referralContract: null,
    referralReadContract: null,
    pointsReadContract: null,
    // v2 Diamond
    v2Contract: null,
    v2ReadContract: null,
    // Pingcast (legacy)
    diamondContract: null,
    diamondReadContract: null,
    broadcastMessages: [],
    broadcastFee: null,
    freePingcastCredits: 0,  // available free Pingcasts from referrals
    lastBroadcastSyncBlock: 0,
    // Pingcast Feed Strip (mail view)
    pfsBroadcasts: [],
    pfsIndices: [0, 0],
    pfsTimers: []
  };

  // ---- Helpers ----

  // Parse broadcast content to detect x402 vs system broadcasts
  // x402 format: "[x402|Name] message"
  // System (SIBYL): no bracket prefix, sender is SIBYL_ADDRESS
  // Legacy format: "[Name] message" (pre-x402 tag, treated as system if from SIBYL)
  function parseBroadcastOrigin(msg) {
    var content = msg.content || '';
    var fromSibyl = msg.from && msg.from.toLowerCase() === SIBYL_ADDRESS;
    var fromRelay = msg.from && msg.from.toLowerCase() === PINGCAST_RELAY;

    // x402 tagged (from relay wallet or content-tagged)
    var x402Match = content.match(/^\[x402\|([^\]]+)\]\s*/);
    if (x402Match) {
      return {
        type: 'x402',
        senderName: x402Match[1],
        displayContent: content.substring(x402Match[0].length),
        verified: false,
        badge: 'x402'
      };
    }

    // Referral free Pingcast: [ref|Name] message
    var refMatch = content.match(/^\[ref\|([^\]]+)\]\s*/);
    if (refMatch) {
      return {
        type: 'referral',
        senderName: refMatch[1],
        displayContent: content.substring(refMatch[0].length),
        verified: false,
        badge: 'referral'
      };
    }

    // From relay wallet without x402 tag = still a relay broadcast (legacy or direct)
    if (fromRelay) {
      return {
        type: 'x402',
        senderName: 'Pingcast',
        displayContent: content,
        verified: false,
        badge: 'x402'
      };
    }

    // From SIBYL = verified system broadcast (with or without bracket prefix)
    if (fromSibyl) {
      return {
        type: 'system',
        senderName: 'SIBYL',
        displayContent: content,
        verified: true,
        badge: '#' + SIBYL_ERC8004_ID
      };
    }

    // From anyone else = native broadcast (registered user broadcasting directly)
    return {
      type: 'native',
      senderName: null, // resolve via getUsername
      displayContent: content,
      verified: false,
      badge: null
    };
  }

  function truncAddr(a) { return a ? a.slice(0, 6) + '...' + a.slice(-4) : ''; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function toast(msg, type) {
    var c = document.getElementById('toast-container');
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      el.style.transition = 'all 0.3s';
      setTimeout(function () { el.remove(); }, 300);
    }, 3500);
  }

  function $(id) { return document.getElementById(id); }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ============================================
  // LOCAL STORAGE CACHE LAYER
  // ============================================

  var CACHE_VERSION = 2;
  var PROFILE_TTL = 3600000;  // 1 hour
  var FEED_TTL = 300000;      // 5 minutes
  var STATS_TTL = 300000;     // 5 minutes

  function cacheGet(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data._v !== CACHE_VERSION) { localStorage.removeItem(key); return null; }
      return data;
    } catch (e) { return null; }
  }

  function cacheSet(key, data) {
    try {
      data._v = CACHE_VERSION;
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      // localStorage full — clear old caches and retry once
      try {
        ['ping_feed', 'ping_stats', 'ping_profiles', 'ping_directory'].forEach(function (k) {
          localStorage.removeItem(k);
        });
        data._v = CACHE_VERSION;
        localStorage.setItem(key, JSON.stringify(data));
      } catch (e2) { /* give up silently */ }
    }
  }

  function cacheMsgKey() {
    return 'ping_msgs_' + (S.address || '').slice(0, 10).toLowerCase();
  }

  // Per-address profile message cache
  function profileMsgKey(addr) {
    return 'ping_prof_' + addr.slice(0, 10).toLowerCase();
  }

  function saveProfileMsgCache(addr, messages, lastBlock) {
    if (!addr || !messages.length) return;
    cacheSet(profileMsgKey(addr), {
      lastBlock: lastBlock,
      messages: messages.map(function (m) {
        return { from: m.from, to: m.to, content: m.content, block: m.block, tx: m.tx, idx: m.idx };
      })
    });
  }

  function loadProfileMsgCache(addr) {
    var data = cacheGet(profileMsgKey(addr));
    if (data && data.lastBlock && Array.isArray(data.messages) && data.messages.length) {
      return data;
    }
    return null;
  }

  // Save messages to localStorage
  function saveMsgCache() {
    if (!S.address || !S.allMessages.length) return;
    cacheSet(cacheMsgKey(), {
      lastBlock: S.lastSyncBlock,
      messages: S.allMessages
    });
  }

  // Load messages from localStorage
  function loadMsgCache() {
    var data = cacheGet(cacheMsgKey());
    if (data && data.lastBlock && Array.isArray(data.messages) && data.messages.length) {
      return data;
    }
    return null;
  }

  // Save profile data (username/agent/bio/avatar) to localStorage
  function saveProfileCache() {
    var profiles = {};
    var now = Date.now();
    var keys = Object.keys(S.usernameCache);
    keys.forEach(function (k) {
      profiles[k] = {
        ts: now,
        name: S.usernameCache[k] || '',
        agent: S.agentCache[k] !== undefined ? S.agentCache[k] : null,
        bio: S.bioCache[k] !== undefined ? S.bioCache[k] : null,
        avatar: S.avatarCache[k] !== undefined ? S.avatarCache[k] : null
      };
    });
    // Also save keys that are in agent/bio/avatar cache but not username
    [S.agentCache, S.bioCache, S.avatarCache].forEach(function (cache, idx) {
      Object.keys(cache).forEach(function (k) {
        if (!profiles[k]) profiles[k] = { ts: now };
        if (idx === 0) profiles[k].agent = cache[k];
        if (idx === 1) profiles[k].bio = cache[k];
        if (idx === 2) profiles[k].avatar = cache[k];
      });
    });
    cacheSet('ping_profiles', profiles);
  }

  // Warm in-memory caches from localStorage
  function warmProfileCache() {
    var data = cacheGet('ping_profiles');
    if (!data) return;
    var now = Date.now();
    Object.keys(data).forEach(function (k) {
      if (k === '_v') return;
      var p = data[k];
      if (!p || !p.ts || (now - p.ts > PROFILE_TTL)) return;
      if (p.name) S.usernameCache[k] = p.name;
      if (p.agent !== undefined && p.agent !== null) S.agentCache[k] = p.agent;
      if (p.bio !== undefined && p.bio !== null) S.bioCache[k] = p.bio;
      if (p.avatar !== undefined && p.avatar !== null) S.avatarCache[k] = p.avatar;
    });
  }

  // ---- RPC Failover ----

  // Rotate the read provider (Alchemy + public RPCs)
  function rotateRpc() {
    var prev = RPC_STACK[_rpcIndex];
    _rpcFailCounts[prev] = (_rpcFailCounts[prev] || 0) + 1;
    var tried = 0;
    do {
      _rpcIndex = (_rpcIndex + 1) % RPC_STACK.length;
      tried++;
    } while (tried < RPC_STACK.length && (_rpcFailCounts[RPC_STACK[_rpcIndex]] || 0) >= 5);
    RPC_URL = RPC_STACK[_rpcIndex];
    console.log('[rpc] read rotated to', RPC_URL, '(was', prev, 'fails:', _rpcFailCounts[prev] + ')');
    _reinitContracts();
  }

  // Rotate the log provider (public RPCs only, no Alchemy free tier)
  function rotateLogRpc() {
    var prev = LOG_RPC_STACK[_logRpcIndex];
    _logRpcFailCounts[prev] = (_logRpcFailCounts[prev] || 0) + 1;
    var tried = 0;
    do {
      _logRpcIndex = (_logRpcIndex + 1) % LOG_RPC_STACK.length;
      tried++;
    } while (tried < LOG_RPC_STACK.length && (_logRpcFailCounts[LOG_RPC_STACK[_logRpcIndex]] || 0) >= 5);
    S.logProvider = new ethers.JsonRpcProvider(LOG_RPC_STACK[_logRpcIndex]);
    console.log('[rpc] log rotated to', LOG_RPC_STACK[_logRpcIndex], '(was', prev, 'fails:', _logRpcFailCounts[prev] + ')');
  }

  // Periodically reset fail counts so recovered RPCs get retried
  setInterval(function () { _rpcFailCounts = {}; _logRpcFailCounts = {}; }, 120000);

  function _reinitContracts() {
    S.readProvider = new ethers.JsonRpcProvider(RPC_URL);
    S.logProvider = new ethers.JsonRpcProvider(LOG_RPC_STACK[_logRpcIndex]);
    S.readContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, S.readProvider);
    S.erc8004 = new ethers.Contract(ERC8004_REGISTRY, ERC8004_ABI, S.readProvider);
    S.diamondReadContract = new ethers.Contract(DIAMOND_ADDRESS, BROADCAST_ABI, S.readProvider);
    S.v2ReadContract = new ethers.Contract(V2_ADDRESS, V2_ABI, S.readProvider);
    S.referralReadContract = new ethers.Contract(REFERRAL_ADDRESS, REFERRAL_ABI, S.readProvider);
    S.pointsReadContract = new ethers.Contract(POINTS_ADDRESS, POINTS_ABI, S.readProvider);
  }

  // Wrap any promise-returning fn: on failure, rotate RPC and retry once
  function withFailover(fn) {
    return fn().catch(function (err) {
      var msg = (err && err.message) || '';
      if (msg.indexOf('could not coalesce') > -1) throw err; // ethers internal, not RPC
      rotateRpc();
      return fn();
    });
  }

  // ---- Init Providers ----

  function initRead() {
    _reinitContracts();
    warmProfileCache();
    captureReferral();
  }

  // ---- Referral capture ----
  function captureReferral() {
    var params = new URLSearchParams(window.location.search);
    var ref = params.get('ref');
    if (ref && ref.length >= 3) {
      localStorage.setItem('ping_referrer', ref);
      S.referrer = ref;
      // Clean URL without reload
      var clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
    // Show referral banner on register page if referrer exists
    if (S.referrer) {
      var banner = $('referral-banner');
      var refName = $('ref-name');
      if (banner && refName) {
        refName.textContent = '@' + S.referrer;
        banner.style.display = '';
      }
    }
  }

  // ---- Contract Reads ----

  // All reads route through v2 Diamond (which has v1 fallback on-chain)
  function getUsername(addr) {
    var k = addr.toLowerCase();
    if (S.usernameCache[k]) return Promise.resolve(S.usernameCache[k]);
    return S.v2ReadContract.getUsername(addr).then(function (n) {
      if (n) S.usernameCache[k] = n;
      return n || '';
    }).catch(function (err) {
      err._rpcFailed = true;
      throw err;
    });
  }

  /** Safe getUsername for display contexts (feed, sidebar) where RPC failure is not critical */
  function getUsernameSafe(addr) {
    return getUsername(addr).catch(function () { return ''; });
  }

  function getAddress(name) {
    return S.v2ReadContract['getAddress(string)'](name).catch(function () { return ethers.ZeroAddress; });
  }

  function getUserCount() {
    return S.v2ReadContract.getTotalUserCount().then(function (c) { return Number(c); }).catch(function () { return 0; });
  }

  function getUserAtIndex(i) {
    // v2 getUserAtIndex only covers v2-registered users.
    // For directory, we need both. Try v1 first (has most users), then v2.
    return S.readContract.getUserAtIndex(i).catch(function () { return null; });
  }

  function isAgent(addr) {
    var k = addr.toLowerCase();
    if (S.agentCache[k] !== undefined) return Promise.resolve(S.agentCache[k]);
    return S.erc8004.balanceOf(addr).then(function (b) {
      var r = Number(b) > 0;
      S.agentCache[k] = r;
      return r;
    }).catch(function () { S.agentCache[k] = false; return false; });
  }

  function getBio(addr) {
    var k = addr.toLowerCase();
    if (S.bioCache[k] !== undefined) return Promise.resolve(S.bioCache[k]);
    return S.v2ReadContract.getBio(addr).then(function (b) {
      S.bioCache[k] = b || '';
      return b || '';
    }).catch(function () { S.bioCache[k] = ''; return ''; });
  }

  function getAvatar(addr) {
    var k = addr.toLowerCase();
    if (S.avatarCache[k] !== undefined) return Promise.resolve(S.avatarCache[k]);
    return S.v2ReadContract.getAvatar(addr).then(function (a) {
      S.avatarCache[k] = a || '';
      return a || '';
    }).catch(function () { S.avatarCache[k] = ''; return ''; });
  }

  // ---- Wallet ----

  function connectWallet() {
    if (!window.ethereum) { toast('No wallet detected. Install MetaMask.', 'error'); return; }
    if (S.connecting || S.connected) return;
    S.connecting = true;

    S.provider = new ethers.BrowserProvider(window.ethereum);
    S.provider.send('eth_requestAccounts', [])
      .then(function () { return S.provider.getNetwork(); })
      .then(function (net) {
        if (Number(net.chainId) !== CHAIN_ID) {
          return window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: CHAIN_ID_HEX }]
          }).catch(function (err) {
            if (err.code === 4902) {
              return window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: CHAIN_ID_HEX,
                  chainName: 'Base',
                  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                  rpcUrls: [RPC_URL],
                  blockExplorerUrls: [BASESCAN]
                }]
              });
            }
            throw err;
          }).then(function () { S.provider = new ethers.BrowserProvider(window.ethereum); });
        }
      })
      .then(function () { return S.provider.getSigner(); })
      .then(function (signer) {
        S.signer = signer;
        return signer.getAddress();
      })
      .then(function (addr) {
        S.address = addr;
        S.connected = true;
        S.connecting = false;
        S.loggedOut = false;
        localStorage.removeItem('ping_logged_out');
        S.contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, S.signer);
        S.diamondContract = new ethers.Contract(DIAMOND_ADDRESS, BROADCAST_ABI, S.signer);
        S.v2Contract = new ethers.Contract(V2_ADDRESS, V2_ABI, S.signer);
        updateConnectBtn();
        return S.v2Contract.messageFee().then(function (fee) {
          S.messageFee = fee;
        }).then(function () {
          return checkRegistration();
        });
      })
      .catch(function (e) {
        S.connecting = false;
        toast('Connection failed: ' + (e.message || e), 'error');
      });
  }

  function disconnectWallet() {
    stopPolling();
    stopPfsTimers();
    S.connected = false;
    S.connecting = false;
    S.registering = false;
    S.loggedOut = true;
    localStorage.setItem('ping_logged_out', '1');
    S.address = null;
    S.username = null;
    S.contract = null;
    S.diamondContract = null;
    S.v2Contract = null;
    S.signer = null;
    S.provider = null;
    S.allMessages = [];
    S.conversations = {};
    S.openWindows = {};
    S.windowCascadeIndex = 0;
    S.usernameCache = {};
    S.agentCache = {};
    S.bioCache = {};
    S.avatarCache = {};
    S.directoryUsers = [];
    S.directoryLoaded = false;
    S.messageFee = 0n;
    S.lastSyncBlock = 0;
    S.lastBroadcastSyncBlock = 0;
    updateConnectBtn();
    closeDropdown();
    showView('landing');
  }

  function updateConnectBtn() {
    var btn = $('btn-connect');
    if (S.connected) {
      btn.classList.add('connected');
      var panelAddr = $('wallet-panel-addr');
      if (panelAddr) panelAddr.textContent = S.address.slice(0, 6) + '...' + S.address.slice(-6);

      // Show avatar + username if registered, fallback to truncated address
      var label = btn.querySelector('span:last-child');
      var avatarEl = btn.querySelector('.btn-connect-avatar');

      if (S.username) {
        label.textContent = S.username;
        if (!avatarEl) {
          avatarEl = document.createElement('span');
          avatarEl.className = 'btn-connect-avatar';
          btn.insertBefore(avatarEl, btn.querySelector('.btn-connect-dot'));
        }
        var initial = S.username.charAt(0).toUpperCase();
        getAvatar(S.address).then(function (url) {
          if (url) {
            avatarEl.innerHTML = '<img src="' + escHtml(url) + '" alt="">';
          } else {
            avatarEl.textContent = initial;
          }
        }).catch(function () {
          avatarEl.textContent = initial;
        });
        // Hide the dot when showing avatar
        var dot = btn.querySelector('.btn-connect-dot');
        if (dot) dot.style.display = 'none';
      } else {
        label.textContent = truncAddr(S.address);
      }
    } else {
      btn.querySelector('span:last-child').textContent = 'Launch Ping';
      btn.classList.remove('connected');
      var dot = btn.querySelector('.btn-connect-dot');
      if (dot) dot.style.display = '';
      var avatarEl = btn.querySelector('.btn-connect-avatar');
      if (avatarEl) avatarEl.remove();
    }
  }

  function checkRegistration() {
    if (S.registering) return Promise.resolve();
    return getUsername(S.address).then(function (name) {
      if (name) { S.username = name; showMail(); }
      else { showView('register'); }
    }).catch(function (e) {
      if (e._rpcFailed) {
        toast('Network error. Please try again.', 'error');
        showView('landing');
      } else {
        showView('register');
      }
    });
  }

  // ---- Wallet Dropdown ----

  function toggleDropdown() {
    if (!S.connected) { connectWallet(); return; }
    S.dropdownOpen = !S.dropdownOpen;
    $('wallet-dropdown').classList.toggle('open', S.dropdownOpen);
  }

  function closeDropdown() {
    S.dropdownOpen = false;
    $('wallet-dropdown').classList.remove('open');
  }

  // ---- Views ----

  function showView(name) {
    ['landing', 'register', 'mail'].forEach(function (v) {
      var el = $('view-' + v);
      if (el) el.style.display = v === name ? '' : 'none';
    });
    var footer = $('site-footer');
    if (footer) footer.style.display = name === 'landing' ? '' : 'none';
    // Show mobile nav only in mail view
    var mobileNav = $('mobile-nav');
    if (mobileNav) mobileNav.classList.toggle('in-mail', name === 'mail');
    if (name === 'landing') {
      stopFeedTimers();
      stopPolling();
      stopPfsTimers();
      loadFeed();
    }
  }

  function showMail() {
    showView('mail');
    updateConnectBtn();
    $('user-name').textContent = S.username;
    $('user-addr').textContent = truncAddr(S.address);
    var userAv = $('user-avatar');
    getAvatar(S.address).then(function (url) {
      if (url) {
        userAv.innerHTML = '<img src="' + escHtml(url) + '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
      } else {
        userAv.textContent = S.username.charAt(0).toUpperCase();
      }
    }).catch(function () {
      userAv.textContent = S.username.charAt(0).toUpperCase();
    });
    isAgent(S.address).then(function (a) { $('user-badge').style.display = a ? '' : 'none'; });
    // Check early adopter claim status
    checkClaimBanner();
    loadSidebarConversations().then(function () {
      // Check for pending inbound messages on login
      var myAddr = S.address.toLowerCase();
      var pending = 0;
      Object.keys(S.conversations).forEach(function (key) {
        var msgs = S.conversations[key].messages;
        if (msgs.length) {
          var last = msgs[msgs.length - 1];
          if (last.to && last.to.toLowerCase() === myAddr) pending++;
        }
      });
      if (pending > 0) {
        playPing();
        toast(pending + ' conversation' + (pending > 1 ? 's' : '') + ' with unread messages', 'success');
      }
      // On mobile, auto-open inbox so user sees conversations immediately
      if (window.innerWidth <= 768 && Object.keys(S.conversations).length > 0) {
        toggleMobileConvos();
      }
    }).catch(function () {});
    preloadDirectory();
    startPolling();
    loadMailPingcastFeed();
  }

  // ============================================
  // LIVE FEED
  // ============================================

  // ---- Cache API hydration: populate all in-memory caches from server response ----
  function hydrateFromCacheApi(data) {
    if (data.users && data.users.length) {
      data.users.forEach(function (u) {
        var k = u.address.toLowerCase();
        if (u.username) S.usernameCache[k] = u.username;
        S.agentCache[k] = !!u.agent;
        if (u.bio !== undefined) S.bioCache[k] = u.bio || '';
        if (u.avatar !== undefined) S.avatarCache[k] = u.avatar || '';
      });
      // Hydrate directory so preloadDirectoryFresh() doesn't fire 400+ RPC calls
      S.directoryUsers = data.users.map(function (u) {
        return {
          address: u.address,
          name: u.username || '',
          agent: !!u.agent,
          bio: u.bio || '',
          avatar: u.avatar || ''
        };
      });
      S.directoryLoaded = true;
      cacheSet('ping_directory', { ts: Date.now(), users: S.directoryUsers });
    }
    // Store all messages from cache API for instant profile rendering
    if (data.recent_messages && data.recent_messages.length) {
      S.cachedApiMessages = data.recent_messages;
      S.cachedApiBlock = data.block || 0;
    }
    saveProfileCache();
  }

  // ---- Build feed items from cache API response ----
  function buildFeedFromCache(data) {
    var items = [];
    if (data.recent_messages) {
      data.recent_messages.forEach(function (m) {
        items.push({ type: 'message', from: m.from, to: m.to, block: m.block, tx: m.tx, idx: 0 });
      });
    }
    if (data.recent_broadcasts) {
      data.recent_broadcasts.forEach(function (b) {
        items.push({ type: 'broadcast', from: b.from, to: 'broadcast', content: b.content || '', broadcastId: b.broadcastId || 0, block: b.block, tx: b.tx, idx: 0 });
      });
    }
    items.sort(function (a, b) { return b.block - a.block; });
    return items;
  }

  function loadFeed() {
    // Check local feed cache first for instant render
    var feedCache = cacheGet('ping_feed');
    if (feedCache && feedCache.items && (Date.now() - feedCache.ts < FEED_TTL)) {
      S.feedMessages = feedCache.items;
      S.broadcastMessages = feedCache.broadcasts || [];
      initFeedSlots();
      startFeedCycle();
      loadPingcastTicker();
      // Refresh from cache API in background
      setTimeout(function () { loadFeedFromApi(true); }, 500);
      return;
    }
    loadFeedFromApi(false);
  }

  // Primary path: fetch from server-side cache API (1 request vs 80+ RPC calls)
  function loadFeedFromApi(isBackground) {
    fetch(CACHE_API_URL, { signal: AbortSignal.timeout(8000) })
      .then(function (resp) {
        if (!resp.ok) throw new Error('cache api ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        hydrateFromCacheApi(data);
        var items = buildFeedFromCache(data);
        S.broadcastMessages = items.filter(function (m) { return m.type === 'broadcast'; });
        S.feedMessages = items.slice(0, 50);

        // Update stats from cache too
        if (data.stats) {
          var su = $('stat-users'); var sm = $('stat-messages');
          if (su) su.textContent = data.stats.users || 0;
          if (sm) sm.textContent = data.stats.messages || 0;
          cacheSet('ping_stats', { ts: Date.now(), users: data.stats.users || 0, messages: data.stats.messages || 0 });
        }

        cacheSet('ping_feed', { ts: Date.now(), items: S.feedMessages, broadcasts: S.broadcastMessages });

        if (!isBackground) {
          initFeedSlots();
          startFeedCycle();
          loadPingcastTicker();
        } else {
          for (var i = 0; i < 3 && i < S.feedMessages.length; i++) {
            renderFeedCard(i, S.feedMessages[S.feedIndices[i] || 0]);
          }
        }
      })
      .catch(function (err) {
        console.warn('[cache-api] failed, falling back to direct RPC:', err.message);
        loadFeedFreshRpc(isBackground);
      });
  }

  // Fallback: direct RPC log fetching (only used when cache API is down)
  function loadFeedFreshRpc(isBackground) {
    var topicMsg = ethers.id('MessageSent(address,address,string)');
    var topicReg = ethers.id('UserRegistered(address,string)');
    var topicBio = ethers.id('BioUpdated(address,string)');

    var topicBcast = ethers.id('Broadcast(address,string,uint256)');

    withFailover(function () { return S.readProvider.getBlockNumber(); }).then(function (cur) {
      var fromBlock = Math.max(DEPLOY_BLOCK, cur - 50000);
      var diamondFrom = Math.max(DIAMOND_DEPLOY_BLOCK, cur - 50000);
      var v2From = Math.max(V2_DEPLOY_BLOCK, cur - 50000);
      return Promise.all([
        fetchLogsChunked([topicMsg], fromBlock, cur),
        fetchLogsChunked([topicReg], fromBlock, cur),
        fetchLogsChunked([topicBio], fromBlock, cur),
        fetchDiamondLogsChunked([topicBcast], diamondFrom, cur),
        // v2 logs
        fetchV2LogsChunked([topicMsg], v2From, cur),
        fetchV2LogsChunked([topicReg], v2From, cur),
        fetchV2LogsChunked([topicBio], v2From, cur),
        fetchV2LogsChunked([topicBcast], v2From, cur)
      ]);
    }).then(function (results) {
      // Merge v1 + v2 logs by type
      results[0] = results[0].concat(results[4] || []);
      results[1] = results[1].concat(results[5] || []);
      results[2] = results[2].concat(results[6] || []);
      results[3] = results[3].concat(results[7] || []);
      var iface = new ethers.Interface(ABI);
      var bcastIface = new ethers.Interface(BROADCAST_ABI);
      var items = [];

      // Parse MessageSent
      results[0].forEach(function (log) {
        try {
          var p = iface.parseLog({ topics: log.topics, data: log.data });
          if (p.name !== 'MessageSent') return;
          items.push({
            type: 'message',
            from: p.args[0],
            to: p.args[1],
            block: log.blockNumber,
            tx: log.transactionHash,
            idx: log.index
          });
        } catch (e) {}
      });

      // Parse UserRegistered
      results[1].forEach(function (log) {
        try {
          var p = iface.parseLog({ topics: log.topics, data: log.data });
          if (p.name !== 'UserRegistered') return;
          items.push({
            type: 'register',
            wallet: p.args[0],
            username: p.args[1],
            block: log.blockNumber,
            tx: log.transactionHash,
            idx: log.index
          });
        } catch (e) {}
      });

      // Parse BioUpdated
      results[2].forEach(function (log) {
        try {
          var p = iface.parseLog({ topics: log.topics, data: log.data });
          if (p.name !== 'BioUpdated') return;
          items.push({
            type: 'bio',
            wallet: p.args[0],
            block: log.blockNumber,
            tx: log.transactionHash,
            idx: log.index
          });
        } catch (e) {}
      });

      // Parse Broadcasts (Pingcasts)
      results[3].forEach(function (log) {
        try {
          var p = bcastIface.parseLog({ topics: log.topics, data: log.data });
          if (p.name !== 'Broadcast') return;
          items.push({
            type: 'broadcast',
            from: p.args[0],
            content: p.args[1],
            broadcastId: Number(p.args[2]),
            block: log.blockNumber,
            tx: log.transactionHash,
            idx: log.index
          });
        } catch (e) {}
      });

      // Store broadcasts separately for the ticker
      S.broadcastMessages = items.filter(function (m) { return m.type === 'broadcast'; });

      items.sort(function (a, b) { return b.block - a.block; });
      S.feedMessages = items.slice(0, 50);

      // Resolve usernames and agent status for all addresses
      var addrs = {};
      S.feedMessages.forEach(function (m) {
        if (m.from) addrs[m.from.toLowerCase()] = true;
        if (m.to && m.to !== 'broadcast') addrs[m.to.toLowerCase()] = true;
        if (m.wallet) addrs[m.wallet.toLowerCase()] = true;
      });
      var resolves = Object.keys(addrs).map(function (a) {
        return Promise.all([getUsernameSafe(a), isAgent(a)]);
      });
      return Promise.all(resolves).then(function () {
        // Save to cache
        cacheSet('ping_feed', {
          ts: Date.now(),
          items: S.feedMessages,
          broadcasts: S.broadcastMessages
        });
        saveProfileCache();
        if (!isBackground) {
          initFeedSlots();
          startFeedCycle();
          loadPingcastTicker();
        } else {
          // Background refresh — re-render current slots
          for (var i = 0; i < 3 && i < S.feedMessages.length; i++) {
            renderFeedCard(i, S.feedMessages[S.feedIndices[i] || 0]);
          }
        }
      });
    }).catch(function () {
      // Feed stays at placeholder or cached version
    });
  }

  function initFeedSlots() {
    if (S.feedMessages.length === 0) return;
    for (var i = 0; i < 3; i++) {
      var idx = i % S.feedMessages.length;
      S.feedIndices[i] = idx;
      renderFeedCard(i, S.feedMessages[idx]);
    }
  }

  function renderFeedCard(slotIndex, msg) {
    var slot = $('feed-slot-' + slotIndex);
    if (!slot) return;
    var card = slot.querySelector('.feed-card');
    var inner = card.querySelector('.feed-card-inner');
    var routeEl = card.querySelector('.feed-card-route');
    var types = card.querySelectorAll('.feed-card-type');
    var statusEl = card.querySelector('.feed-card-status');
    var shortTx = msg.tx ? msg.tx.slice(0, 10) + '...' + msg.tx.slice(-6) : '';
    var txLink = msg.tx ? ' <a href="' + BASESCAN + '/tx/' + encodeURIComponent(msg.tx) + '" target="_blank" rel="noopener" class="feed-tx-link">' + shortTx + '</a>' : '';

    inner.classList.remove('is-agent');

    if (msg.type === 'message') {
      var fromName = S.usernameCache[msg.from.toLowerCase()] || truncAddr(msg.from);
      var toName = S.usernameCache[msg.to.toLowerCase()] || truncAddr(msg.to);
      var fromIsAgent = S.agentCache[msg.from.toLowerCase()];
      var toIsAgent = S.agentCache[msg.to.toLowerCase()];

      if (fromIsAgent || toIsAgent) inner.classList.add('is-agent');

      card.querySelector('.feed-card-from').textContent = fromName;
      card.querySelector('.feed-card-to').textContent = toName;
      routeEl.style.display = '';

      if (types[0]) {
        types[0].textContent = fromIsAgent ? 'AGENT' : 'HUMAN';
        types[0].className = 'feed-card-type ' + (fromIsAgent ? 'type-agent' : 'type-human');
      }
      if (types[1]) {
        types[1].textContent = toIsAgent ? 'AGENT' : 'HUMAN';
        types[1].className = 'feed-card-type ' + (toIsAgent ? 'type-agent' : 'type-human');
      }

      statusEl.innerHTML = 'Message Sent' + txLink;

    } else if (msg.type === 'register') {
      var walletIsAgent = S.agentCache[msg.wallet.toLowerCase()];
      var walletName = msg.username || S.usernameCache[msg.wallet.toLowerCase()] || truncAddr(msg.wallet);

      if (walletIsAgent) inner.classList.add('is-agent');

      card.querySelector('.feed-card-from').textContent = walletName;
      card.querySelector('.feed-card-to').textContent = '';
      routeEl.style.display = '';

      if (types[0]) {
        types[0].textContent = walletIsAgent ? 'AGENT' : 'HUMAN';
        types[0].className = 'feed-card-type ' + (walletIsAgent ? 'type-agent' : 'type-human');
      }
      if (types[1]) {
        types[1].textContent = '';
        types[1].className = 'feed-card-type';
      }

      // Hide the arrow and second user for registration events
      var arrow = routeEl.querySelector('svg');
      var secondUser = routeEl.querySelectorAll('.feed-card-user')[1];
      if (arrow) arrow.style.display = 'none';
      if (secondUser) secondUser.style.display = 'none';

      statusEl.innerHTML = (walletIsAgent ? 'Agent' : 'Human') + ' Registered' + txLink;

    } else if (msg.type === 'bio') {
      var bioIsAgent = S.agentCache[msg.wallet.toLowerCase()];
      var bioName = S.usernameCache[msg.wallet.toLowerCase()] || truncAddr(msg.wallet);

      if (bioIsAgent) inner.classList.add('is-agent');

      card.querySelector('.feed-card-from').textContent = bioName;
      card.querySelector('.feed-card-to').textContent = '';
      routeEl.style.display = '';

      if (types[0]) {
        types[0].textContent = bioIsAgent ? 'AGENT' : 'HUMAN';
        types[0].className = 'feed-card-type ' + (bioIsAgent ? 'type-agent' : 'type-human');
      }
      if (types[1]) {
        types[1].textContent = '';
        types[1].className = 'feed-card-type';
      }

      var arrow = routeEl.querySelector('svg');
      var secondUser = routeEl.querySelectorAll('.feed-card-user')[1];
      if (arrow) arrow.style.display = 'none';
      if (secondUser) secondUser.style.display = 'none';

      statusEl.innerHTML = 'Bio Updated' + txLink;

    } else if (msg.type === 'broadcast') {
      var origin = parseBroadcastOrigin(msg);
      var bcastIsAgent = S.agentCache[msg.from.toLowerCase()];
      var bcastName = origin.senderName || S.usernameCache[msg.from.toLowerCase()] || truncAddr(msg.from);

      if (bcastIsAgent) inner.classList.add('is-agent');
      inner.classList.add('is-pingcast');
      if (origin.type === 'system') inner.classList.add('is-system-broadcast');
      if (origin.type === 'x402') inner.classList.add('is-x402-broadcast');

      card.querySelector('.feed-card-from').textContent = bcastName;
      card.querySelector('.feed-card-to').textContent = 'ALL';
      routeEl.style.display = '';

      if (types[0]) {
        if (origin.type === 'system') {
          types[0].textContent = 'SYSTEM';
          types[0].className = 'feed-card-type type-system';
        } else if (origin.type === 'x402') {
          types[0].textContent = 'x402';
          types[0].className = 'feed-card-type type-x402';
        } else if (origin.type === 'referral') {
          types[0].textContent = 'REFERRAL';
          types[0].className = 'feed-card-type type-referral';
        } else {
          types[0].textContent = 'PINGCAST';
          types[0].className = 'feed-card-type type-pingcast';
        }
      }
      if (types[1]) {
        if (origin.verified) {
          types[1].textContent = origin.badge;
          types[1].className = 'feed-card-type type-verified';
        } else if (origin.badge === 'x402') {
          types[1].textContent = 'PAID';
          types[1].className = 'feed-card-type type-x402-paid';
        } else if (origin.badge === 'referral') {
          types[1].textContent = 'FREE';
          types[1].className = 'feed-card-type type-referral-free';
        } else {
          types[1].textContent = '';
          types[1].className = 'feed-card-type';
        }
      }

      // Show arrow pointing to ALL
      var arrow = routeEl.querySelector('svg');
      var secondUser = routeEl.querySelectorAll('.feed-card-user')[1];
      if (arrow) arrow.style.display = '';
      if (secondUser) secondUser.style.display = '';

      var displayContent = origin.displayContent;
      var preview = displayContent.length > 60 ? displayContent.substring(0, 60) + '...' : displayContent;
      statusEl.innerHTML = escHtml(preview) + txLink;
    }

    card.querySelector('.feed-card-block').textContent = 'block ' + msg.block.toLocaleString();

    // Reset hidden elements for message cards (in case card was previously used for register/bio)
    if (msg.type === 'message') {
      var arrow = routeEl.querySelector('svg');
      var secondUser = routeEl.querySelectorAll('.feed-card-user')[1];
      if (arrow) arrow.style.display = '';
      if (secondUser) secondUser.style.display = '';
    }
  }

  function cycleFeedSlot(slotIndex) {
    if (S.feedMessages.length < 2) return;
    var slot = $('feed-slot-' + slotIndex);
    if (!slot) return;
    var card = slot.querySelector('.feed-card');

    // Fade out
    card.classList.add('fade-out');
    card.classList.remove('fade-in');

    setTimeout(function () {
      // Advance index
      S.feedIndices[slotIndex] = (S.feedIndices[slotIndex] + 3) % S.feedMessages.length;
      renderFeedCard(slotIndex, S.feedMessages[S.feedIndices[slotIndex]]);
      // Fade in
      card.classList.remove('fade-out');
      card.classList.add('fade-in');
    }, 500);
  }

  function startFeedCycle() {
    stopFeedTimers();
    if (S.feedMessages.length < 2) return;
    for (var i = 0; i < 3; i++) {
      (function (idx) {
        var timer = setInterval(function () { cycleFeedSlot(idx); }, FEED_CYCLE_MS);
        S.feedTimers.push(timer);
        // Initial stagger
        setTimeout(function () { cycleFeedSlot(idx); }, FEED_STAGGER_MS * idx + 2000);
      })(i);
    }
  }

  function stopFeedTimers() {
    S.feedTimers.forEach(function (t) { clearInterval(t); });
    S.feedTimers = [];
  }

  // ============================================
  // MESSAGE LOADING
  // ============================================

  function fetchLogsChunked(topics, from, to) {
    var all = [];
    var chunks = [];
    for (var f = from; f <= to; f += LOG_CHUNK) {
      chunks.push({ from: f, to: Math.min(f + LOG_CHUNK - 1, to) });
    }
    var idx = 0;
    var retries = 0;
    var totalRetries = 0;
    var MAX_TOTAL_RETRIES = LOG_RPC_STACK.length * 3;
    function next() {
      if (idx >= chunks.length) return Promise.resolve(all);
      var c = chunks[idx++];
      return S.logProvider.getLogs({
        address: CONTRACT_ADDRESS,
        topics: topics,
        fromBlock: c.from,
        toBlock: c.to
      }).then(function (logs) {
        if (logs.length) all = all.concat(logs);
        retries = 0;
        return sleep(CHUNK_DELAY);
      }).then(next).catch(function (err) {
        retries++;
        totalRetries++;
        if (totalRetries >= MAX_TOTAL_RETRIES) {
          console.warn('getLogs: max retries reached, returning partial results');
          return Promise.resolve(all);
        }
        if (retries >= 3) { rotateLogRpc(); retries = 0; }
        console.warn('getLogs chunk failed (' + retries + '/3), retrying:', err.message);
        return sleep(500).then(function () {
          idx--; // retry same chunk
          return next();
        });
      });
    }
    return next();
  }

  function fetchDiamondLogsChunked(topics, from, to) {
    var all = [];
    var chunks = [];
    for (var f = from; f <= to; f += LOG_CHUNK) {
      chunks.push({ from: f, to: Math.min(f + LOG_CHUNK - 1, to) });
    }
    var idx = 0;
    var retries = 0;
    var totalRetries = 0;
    var MAX_TOTAL_RETRIES = LOG_RPC_STACK.length * 3;
    function next() {
      if (idx >= chunks.length) return Promise.resolve(all);
      var c = chunks[idx++];
      return S.logProvider.getLogs({
        address: DIAMOND_ADDRESS,
        topics: topics,
        fromBlock: c.from,
        toBlock: c.to
      }).then(function (logs) {
        if (logs.length) all = all.concat(logs);
        retries = 0;
        return sleep(CHUNK_DELAY);
      }).then(next).catch(function (err) {
        retries++;
        totalRetries++;
        if (totalRetries >= MAX_TOTAL_RETRIES) {
          console.warn('Diamond getLogs: max retries reached, returning partial results');
          return Promise.resolve(all);
        }
        if (retries >= 3) { rotateLogRpc(); retries = 0; }
        console.warn('Diamond getLogs chunk failed (' + retries + '/3):', err.message);
        return sleep(500).then(function () { idx--; return next(); });
      });
    }
    return next();
  }

  function fetchV2LogsChunked(topics, from, to) {
    var all = [];
    var chunks = [];
    for (var f = from; f <= to; f += LOG_CHUNK) {
      chunks.push({ from: f, to: Math.min(f + LOG_CHUNK - 1, to) });
    }
    var idx = 0;
    var retries = 0;
    var totalRetries = 0;
    var MAX_TOTAL_RETRIES = LOG_RPC_STACK.length * 3;
    function next() {
      if (idx >= chunks.length) return Promise.resolve(all);
      var c = chunks[idx++];
      return S.logProvider.getLogs({
        address: V2_ADDRESS,
        topics: topics,
        fromBlock: c.from,
        toBlock: c.to
      }).then(function (logs) {
        if (logs.length) all = all.concat(logs);
        retries = 0;
        return sleep(CHUNK_DELAY);
      }).then(next).catch(function (err) {
        retries++;
        totalRetries++;
        if (totalRetries >= MAX_TOTAL_RETRIES) {
          console.warn('V2 getLogs: max retries reached, returning partial results');
          return Promise.resolve(all);
        }
        if (retries >= 3) { rotateLogRpc(); retries = 0; }
        console.warn('V2 getLogs chunk failed (' + retries + '/3):', err.message);
        return sleep(500).then(function () { idx--; return next(); });
      });
    }
    return next();
  }

  function parseBroadcastLogs(logs) {
    var iface = new ethers.Interface(BROADCAST_ABI);
    return logs.map(function (log) {
      try {
        var p = iface.parseLog({ topics: log.topics, data: log.data });
        if (p.name !== 'Broadcast') return null;
        return {
          from: p.args[0],
          to: 'broadcast',
          content: p.args[1],
          broadcastId: Number(p.args[2]),
          block: log.blockNumber,
          tx: log.transactionHash,
          idx: log.index,
          isBroadcast: true
        };
      } catch (e) { return null; }
    }).filter(Boolean);
  }

  function parseLogs(logs) {
    var iface = new ethers.Interface(ABI);
    return logs.map(function (log) {
      try {
        var p = iface.parseLog({ topics: log.topics, data: log.data });
        if (p.name !== 'MessageSent') return null;
        return {
          from: p.args[0],
          to: p.args[1],
          content: p.args[2],
          block: log.blockNumber,
          tx: log.transactionHash,
          idx: log.index
        };
      } catch (e) { return null; }
    }).filter(Boolean);
  }

  function fullScanMessages() {
    var addr = S.address;
    var padded = ethers.zeroPadValue(addr, 32);
    var topic0 = ethers.id('MessageSent(address,address,string)');
    var topicBcast = ethers.id('Broadcast(address,string,uint256)');

    return withFailover(function () { return S.readProvider.getBlockNumber(); }).then(function (cur) {
      var from = DEPLOY_BLOCK;
      return Promise.all([
        fetchLogsChunked([topic0, padded], from, cur),
        fetchLogsChunked([topic0, null, padded], from, cur),
        fetchDiamondLogsChunked([topicBcast], DIAMOND_DEPLOY_BLOCK, cur),
        fetchV2LogsChunked([topic0, padded], V2_DEPLOY_BLOCK, cur),
        fetchV2LogsChunked([topic0, null, padded], V2_DEPLOY_BLOCK, cur),
        fetchV2LogsChunked([topicBcast], V2_DEPLOY_BLOCK, cur)
      ]).then(function (r) { return { logs: r, blockNum: cur }; });
    }).then(function (result) {
      var allMsgLogs = result.logs[0].concat(result.logs[1]).concat(result.logs[3]).concat(result.logs[4]);
      var msgs = parseLogs(allMsgLogs);
      var allBcastLogs = result.logs[2].concat(result.logs[5]);
      var broadcasts = parseBroadcastLogs(allBcastLogs);

      var seen = {};
      var unique = [];
      msgs.forEach(function (m) {
        var key = m.tx + '-' + m.idx;
        if (!seen[key]) { seen[key] = true; unique.push(m); }
      });
      broadcasts.forEach(function (b) {
        var key = b.tx + '-' + b.idx;
        if (!seen[key]) { seen[key] = true; unique.push(b); }
      });
      unique.sort(function (a, b) { return a.block - b.block; });
      S.allMessages = unique;
      S.lastSyncBlock = result.blockNum;
      saveMsgCache();
      return unique;
    });
  }

  function deltaSync() {
    if (!S.address || !S.lastSyncBlock) return;
    var addr = S.address;
    var padded = ethers.zeroPadValue(addr, 32);
    var topic0 = ethers.id('MessageSent(address,address,string)');
    var topicBcast = ethers.id('Broadcast(address,string,uint256)');
    var fromBlock = S.lastSyncBlock + 1;

    withFailover(function () { return S.readProvider.getBlockNumber(); }).then(function (cur) {
      if (cur < fromBlock) return;
      return Promise.all([
        fetchLogsChunked([topic0, padded], fromBlock, cur),
        fetchLogsChunked([topic0, null, padded], fromBlock, cur),
        fetchDiamondLogsChunked([topicBcast], Math.max(fromBlock, DIAMOND_DEPLOY_BLOCK), cur),
        fetchV2LogsChunked([topic0, padded], Math.max(fromBlock, V2_DEPLOY_BLOCK), cur),
        fetchV2LogsChunked([topic0, null, padded], Math.max(fromBlock, V2_DEPLOY_BLOCK), cur),
        fetchV2LogsChunked([topicBcast], Math.max(fromBlock, V2_DEPLOY_BLOCK), cur)
      ]).then(function (r) {
        var allMsgLogs = r[0].concat(r[1]).concat(r[3]).concat(r[4]);
        var newMsgs = parseLogs(allMsgLogs);
        var allBcastLogs = r[2].concat(r[5]);
        var newBcasts = parseBroadcastLogs(allBcastLogs);

        var existingKeys = {};
        S.allMessages.forEach(function (m) { existingKeys[m.tx + '-' + m.idx] = true; });

        var fresh = [];
        newMsgs.concat(newBcasts).forEach(function (m) {
          var key = m.tx + '-' + m.idx;
          if (!existingKeys[key]) { fresh.push(m); existingKeys[key] = true; }
        });

        S.lastSyncBlock = cur;

        if (fresh.length) {
          S.allMessages = S.allMessages.concat(fresh);
          S.allMessages.sort(function (a, b) { return a.block - b.block; });

          // Merge into conversations
          var myAddr = S.address.toLowerCase();
          fresh.forEach(function (m) {
            if (m.isBroadcast || m.to === 'broadcast') {
              var sk = m.from.toLowerCase();
              if (!S.conversations[sk]) S.conversations[sk] = { address: m.from, messages: [] };
              S.conversations[sk].messages.push(m);
            } else {
              var other = m.from.toLowerCase() === myAddr ? m.to : m.from;
              var key = other.toLowerCase();
              if (!S.conversations[key]) S.conversations[key] = { address: other, messages: [] };
              S.conversations[key].messages.push(m);
            }
          });

          refreshSidebar();

          var inbound = fresh.filter(function (m) { return !m.isBroadcast && m.to && m.to.toLowerCase() === myAddr; });
          if (inbound.length) {
            playPing();
            toast(inbound.length + ' new message' + (inbound.length > 1 ? 's' : ''), 'success');
          }
        }

        saveMsgCache();
        saveProfileCache();
      });
    }).catch(function () {});
  }

  function loadAllMessages() {
    // Check localStorage cache first
    var cached = loadMsgCache();
    if (cached) {
      S.allMessages = cached.messages;
      S.lastSyncBlock = cached.lastBlock;
      // Schedule background delta sync
      setTimeout(deltaSync, 100);
      return Promise.resolve(cached.messages);
    }
    // Priority 2: use cache API messages if available (instant, no RPC)
    if (S.cachedApiMessages && S.address) {
      var addrLower = S.address.toLowerCase();
      var filtered = S.cachedApiMessages.filter(function (m) {
        return m.from.toLowerCase() === addrLower || m.to.toLowerCase() === addrLower;
      }).map(function (m, i) {
        return { from: m.from, to: m.to, content: m.content || '', block: m.block, tx: m.tx, idx: i };
      });
      filtered.sort(function (a, b) { return a.block - b.block; });
      S.allMessages = filtered;
      S.lastSyncBlock = S.cachedApiBlock || 0;
      saveMsgCache();
      // Background delta sync to catch anything after cache API snapshot
      setTimeout(deltaSync, 100);
      return Promise.resolve(filtered);
    }
    // No cache: full scan
    return fullScanMessages();
  }

  // ============================================
  // POLLING FOR NEW MESSAGES
  // ============================================

  var POLL_INTERVAL_MS = 30000; // 30 seconds

  function pollNewMessages() {
    if (S.pollBusy || !S.connected || !S.address) return;
    S.pollBusy = true;

    var addr = S.address;
    var padded = ethers.zeroPadValue(addr, 32);
    var topic0 = ethers.id('MessageSent(address,address,string)');
    var fromBlock = S.lastSyncBlock + 1;

    withFailover(function () { return withFailover(function () { return S.readProvider.getBlockNumber(); }); }).then(function (cur) {
      if (!cur || cur < fromBlock) { S.pollBusy = false; return; }

      return Promise.all([
        fetchLogsChunked([topic0, padded], fromBlock, cur),
        fetchLogsChunked([topic0, null, padded], fromBlock, cur),
        fetchV2LogsChunked([topic0, padded], Math.max(fromBlock, V2_DEPLOY_BLOCK), cur),
        fetchV2LogsChunked([topic0, null, padded], Math.max(fromBlock, V2_DEPLOY_BLOCK), cur)
      ]).then(function (r) {
        S.lastSyncBlock = cur;
        var all = r[0].concat(r[1]).concat(r[2]).concat(r[3]);
        var newMsgs = parseLogs(all);
        if (!newMsgs.length) { S.pollBusy = false; return; }

        // Deduplicate against existing messages
        var existingKeys = {};
        S.allMessages.forEach(function (m) { existingKeys[m.tx + '-' + m.idx] = true; });

        var fresh = [];
        newMsgs.forEach(function (m) {
          var key = m.tx + '-' + m.idx;
          if (!existingKeys[key]) { fresh.push(m); existingKeys[key] = true; }
        });

        if (!fresh.length) { S.pollBusy = false; return; }

        // Merge into allMessages
        S.allMessages = S.allMessages.concat(fresh);
        S.allMessages.sort(function (a, b) { return a.block - b.block; });

        // Merge into conversations
        var myAddr = S.address.toLowerCase();
        var affectedKeys = {};

        fresh.forEach(function (m) {
          var other = m.from.toLowerCase() === myAddr ? m.to : m.from;
          var key = other.toLowerCase();
          affectedKeys[key] = true;
          if (!S.conversations[key]) S.conversations[key] = { address: other, messages: [] };
          S.conversations[key].messages.push(m);
        });

        // Re-render sidebar
        refreshSidebar();

        // Re-render affected open windows
        Object.keys(affectedKeys).forEach(function (key) {
          if (S.openWindows[key]) renderWindowMessages(key);
        });

        // Notification
        var inbound = fresh.filter(function (m) { return m.to.toLowerCase() === myAddr; });
        if (inbound.length) {
          playPing();
          toast(inbound.length + ' new message' + (inbound.length > 1 ? 's' : ''), 'success');
        }

        saveMsgCache();
        saveProfileCache();
        S.pollBusy = false;
      });
    }).catch(function () {
      S.pollBusy = false;
    });
  }

  function refreshSidebar() {
    var list = $('sidebar-conversations');
    var convos = S.conversations;
    var keys = Object.keys(convos);

    if (!keys.length) return;

    keys.sort(function (a, b) {
      var la = convos[a].messages[convos[a].messages.length - 1].block;
      var lb = convos[b].messages[convos[b].messages.length - 1].block;
      return lb - la;
    });

    var resolves = keys.map(function (k) {
      var addr = convos[k].address;
      return Promise.all([getUsernameSafe(addr), isAgent(addr), getAvatar(addr)]).then(function (r) {
        return { key: k, address: addr, name: r[0], agent: r[1], avatar: r[2] };
      });
    });

    Promise.all(resolves).then(function (infos) {
      list.innerHTML = '';
      infos.forEach(function (info) {
        var convo = convos[info.key];
        var last = convo.messages[convo.messages.length - 1];
        var hasBroadcasts = convo.messages.some(function (m) { return m.isBroadcast || m.to === 'broadcast'; });

        var el = document.createElement('div');
        el.className = 'sidebar-convo-item';
        el.setAttribute('data-addr', info.key);

        if (S.openWindows[info.key]) el.classList.add('active');

        var avClass = 'sidebar-convo-avatar' + (info.agent ? ' is-agent' : '') + (hasBroadcasts ? ' is-pingcast' : '');
        var initial = info.name ? info.name.charAt(0).toUpperCase() : '?';
        var avContent = info.avatar
          ? '<img src="' + escHtml(info.avatar) + '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">'
          : initial;
        var lastOrigin = (last.isBroadcast || last.to === 'broadcast') ? parseBroadcastOrigin(last) : null;
        var previewPrefix = lastOrigin ? (lastOrigin.type === 'system' ? '[SYSTEM] ' : lastOrigin.type === 'x402' ? '[x402] ' : '[PINGCAST] ') : '';

        el.innerHTML =
          '<div class="' + avClass + '">' + avContent + '</div>' +
          '<div class="sidebar-convo-body">' +
            '<span class="sidebar-convo-name">' + escHtml(info.name || truncAddr(info.address)) +
              (hasBroadcasts ? ' <span class="sidebar-pingcast-tag">PC</span>' : '') +
            '</span>' +
            '<span class="sidebar-convo-preview">' + escHtml(previewPrefix + last.content.substring(0, 50) + (last.content.length > 50 ? '...' : '')) + '</span>' +
          '</div>' +
          (convo.messages.length > 1 ? '<div class="sidebar-convo-count">' + convo.messages.length + '</div>' : '');

        el.addEventListener('click', function () { openWindow(info.address, info.name, info.agent); });
        list.appendChild(el);
      });
    });
  }

  function startPolling() {
    stopPolling();
    S.pollTimer = setInterval(pollNewMessages, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (S.pollTimer) { clearInterval(S.pollTimer); S.pollTimer = null; }
  }

  // ============================================
  // CONVERSATIONS
  // ============================================

  function buildConversations(msgs) {
    var convos = {};
    var myAddr = S.address.toLowerCase();

    msgs.forEach(function (m) {
      // Broadcasts land under the sender's address as a pseudo-conversation
      if (m.isBroadcast || m.to === 'broadcast') {
        var senderKey = m.from.toLowerCase();
        if (!convos[senderKey]) convos[senderKey] = { address: m.from, messages: [] };
        convos[senderKey].messages.push(m);
        return;
      }

      var other = m.from.toLowerCase() === myAddr ? m.to : m.from;
      var key = other.toLowerCase();
      if (!convos[key]) convos[key] = { address: other, messages: [] };
      convos[key].messages.push(m);
    });

    S.conversations = convos;
    return convos;
  }

  function loadSidebarConversations() {
    var list = $('sidebar-conversations');
    list.innerHTML = '<div class="empty-state-sm"><div class="spinner"></div></div>';

    return loadAllMessages().then(function (msgs) {
      var convos = buildConversations(msgs);
      var keys = Object.keys(convos);

      if (keys.length === 0) {
        list.innerHTML = '<div class="empty-state-sm"><p>No messages yet</p></div>';
        return;
      }

      keys.sort(function (a, b) {
        var la = convos[a].messages[convos[a].messages.length - 1].block;
        var lb = convos[b].messages[convos[b].messages.length - 1].block;
        return lb - la;
      });

      // Phase 1: render immediately from in-memory/localStorage caches
      var needsResolve = [];
      var infos = keys.map(function (k) {
        var addr = convos[k].address;
        var lk = addr.toLowerCase();
        var name = S.usernameCache[lk] || '';
        var agent = S.agentCache[lk] !== undefined ? S.agentCache[lk] : false;
        var avatar = S.avatarCache[lk] !== undefined ? S.avatarCache[lk] : '';
        // Track which ones still need RPC resolution
        if (!S.usernameCache[lk] || S.agentCache[lk] === undefined || S.avatarCache[lk] === undefined) {
          needsResolve.push({ key: k, address: addr });
        }
        return { key: k, address: addr, name: name, agent: agent, avatar: avatar };
      });

      renderSidebarFromInfos(list, convos, infos);

      // Phase 2: resolve missing profiles in background, re-render if anything changed
      if (needsResolve.length) {
        var resolvePromises = needsResolve.map(function (item) {
          return Promise.all([getUsernameSafe(item.address), isAgent(item.address), getAvatar(item.address)]).then(function (r) {
            return { key: item.key, address: item.address, name: r[0], agent: r[1], avatar: r[2] };
          });
        });
        Promise.all(resolvePromises).then(function (resolved) {
          var changed = false;
          resolved.forEach(function (r) {
            var existing = infos.find(function (i) { return i.key === r.key; });
            if (existing && (existing.name !== r.name || existing.agent !== r.agent || existing.avatar !== r.avatar)) {
              existing.name = r.name;
              existing.agent = r.agent;
              existing.avatar = r.avatar;
              changed = true;
            }
          });
          if (changed) renderSidebarFromInfos(list, convos, infos);
          saveProfileCache();
        }).catch(function () {});
      }
    }).catch(function (e) {
      list.innerHTML = '<div class="empty-state-sm"><p>Failed to load</p></div>';
    });
  }

  function renderSidebarFromInfos(list, convos, infos) {
    list.innerHTML = '';
    infos.forEach(function (info) {
      var convo = convos[info.key];
      var last = convo.messages[convo.messages.length - 1];
      var hasBroadcasts = convo.messages.some(function (m) { return m.isBroadcast || m.to === 'broadcast'; });

      var el = document.createElement('div');
      el.className = 'sidebar-convo-item';
      el.setAttribute('data-addr', info.key);

      if (S.openWindows[info.key]) el.classList.add('active');

      var avClass = 'sidebar-convo-avatar' + (info.agent ? ' is-agent' : '') + (hasBroadcasts ? ' is-pingcast' : '');
      var initial = info.name ? info.name.charAt(0).toUpperCase() : '?';
      var avContent = info.avatar
        ? '<img src="' + escHtml(info.avatar) + '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">'
        : initial;
      var lastOrigin = (last.isBroadcast || last.to === 'broadcast') ? parseBroadcastOrigin(last) : null;
      var previewPrefix = lastOrigin ? (lastOrigin.type === 'system' ? '[SYSTEM] ' : lastOrigin.type === 'x402' ? '[x402] ' : '[PINGCAST] ') : '';

      el.innerHTML =
        '<div class="' + avClass + '">' + avContent + '</div>' +
        '<div class="sidebar-convo-body">' +
          '<span class="sidebar-convo-name">' + escHtml(info.name || truncAddr(info.address)) +
            (hasBroadcasts ? ' <span class="sidebar-pingcast-tag">PC</span>' : '') +
          '</span>' +
          '<span class="sidebar-convo-preview">' + escHtml(previewPrefix + last.content.substring(0, 50) + (last.content.length > 50 ? '...' : '')) + '</span>' +
        '</div>' +
        (convo.messages.length > 1 ? '<div class="sidebar-convo-count">' + convo.messages.length + '</div>' : '');

      el.addEventListener('click', function () { openWindow(info.address, info.name, info.agent); });
      list.appendChild(el);
    });
  }

  // ============================================
  // MULTI-WINDOW WORKSPACE
  // ============================================

  function openWindow(addr, name, isAgentFlag) {
    var key = addr.toLowerCase();

    // If window already exists, toggle: close if focused, focus if not
    if (S.openWindows[key]) {
      if (S.openWindows[key].el.classList.contains('focused')) {
        closeWindow(key);
      } else {
        focusWindow(key);
      }
      return;
    }

    // Hide empty state
    $('workspace-empty').classList.add('hidden');

    // Mark sidebar active
    var sidebarItem = document.querySelector('.sidebar-convo-item[data-addr="' + key + '"]');
    if (sidebarItem) sidebarItem.classList.add('active');

    // Calculate cascade position
    var workspace = $('workspace');
    var wRect = workspace.getBoundingClientRect();
    var offsetX = 30 + (S.windowCascadeIndex * 30) % Math.max(wRect.width - 450, 60);
    var offsetY = 30 + (S.windowCascadeIndex * 30) % Math.max(wRect.height - 510, 60);
    S.windowCascadeIndex++;

    // Create window element
    var win = document.createElement('div');
    win.className = 'msg-window focused';
    win.setAttribute('data-addr', key);
    if (!isMobile) {
      win.style.left = offsetX + 'px';
      win.style.top = offsetY + 'px';
    }
    win.style.zIndex = ++S.windowZCounter;

    var displayName = name || truncAddr(addr);
    var initial = name ? name.charAt(0).toUpperCase() : '?';
    var avClass = 'win-avatar' + (isAgentFlag ? ' is-agent' : '');

    var isMobile = window.innerWidth <= 768;
    win.innerHTML =
      '<div class="win-titlebar">' +
        (isMobile ? '<button class="win-back"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>' : '') +
        '<div class="' + avClass + '" data-win-avatar>' + initial + '</div>' +
        '<div class="win-info">' +
          '<span class="win-name">' + escHtml(displayName) + '</span>' +
          '<span class="win-badges" data-win-badges>' +
            (isAgentFlag ? '<span class="badge-agent badge-agent-sm">' + agentSvg(8) + ' Agent</span>' : '') +
          '</span>' +
          '<span class="win-addr">' + truncAddr(addr) + '</span>' +
        '</div>' +
        '<div class="win-actions" data-win-actions></div>' +
        '<button class="win-close">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="win-messages"></div>' +
      '<div class="win-compose">' +
        '<div class="win-input-wrap">' +
          '<textarea placeholder="Message..." maxlength="1024" rows="1"></textarea>' +
          '<span class="win-char-count">0/1024</span>' +
        '</div>' +
        '<button class="btn-send" title="Send">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="win-resize"></div>';

    workspace.appendChild(win);

    // Store reference
    S.openWindows[key] = { el: win, addr: addr, name: displayName };

    // Enrich titlebar async: avatar, agent ID, tier badge, X link
    enrichWindowTitlebar(win, addr, isAgentFlag);

    // On mobile, close all other windows (only one at a time)
    if (isMobile) {
      Object.keys(S.openWindows).forEach(function (k) {
        if (k !== key) closeWindow(k);
      });
    } else {
      unfocusAllWindows();
    }
    win.classList.add('focused');

    // Event: titlebar drag
    var titlebar = win.querySelector('.win-titlebar');
    titlebar.addEventListener('mousedown', function (e) {
      if (e.target.closest('.win-close') || e.target.closest('.win-back')) return;
      focusWindow(key);
      startDrag(e, win);
    });
    titlebar.addEventListener('touchstart', function (e) {
      if (e.target.closest('.win-close') || e.target.closest('.win-back')) return;
      focusWindow(key);
      startDragTouch(e, win);
    }, { passive: false });

    // Event: close
    var closeBtn = win.querySelector('.win-close');
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      closeWindow(key);
    });
    closeBtn.addEventListener('touchend', function (e) {
      e.stopPropagation();
      e.preventDefault();
      closeWindow(key);
    });

    // Event: back button (mobile)
    var backBtn = win.querySelector('.win-back');
    if (backBtn) {
      backBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        closeWindow(key);
        toggleMobileConvos();
      });
      backBtn.addEventListener('touchend', function (e) {
        e.stopPropagation();
        e.preventDefault();
        closeWindow(key);
        toggleMobileConvos();
      });
    }

    // Event: focus on click
    win.addEventListener('mousedown', function () { focusWindow(key); });

    // Event: resize
    var resizeHandle = win.querySelector('.win-resize');
    resizeHandle.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      startResize(e, win);
    });

    // Event: send message
    var textarea = win.querySelector('textarea');
    var sendBtn = win.querySelector('.btn-send');

    sendBtn.addEventListener('click', function () { sendWindowMessage(key); });
    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendWindowMessage(key); }
    });
    textarea.addEventListener('input', function () {
      autoResize(this);
      var counter = win.querySelector('.win-char-count');
      if (counter) {
        var c = this.value.length;
        counter.textContent = c + '/1024';
        counter.className = 'win-char-count' + (c >= 1024 ? ' limit' : c >= 900 ? ' near' : '');
      }
    });

    // Render messages
    renderWindowMessages(key);
  }

  function enrichWindowTitlebar(win, addr, isAgentFlag) {
    var avatarEl = win.querySelector('[data-win-avatar]');
    var badgesEl = win.querySelector('[data-win-badges]');
    var actionsEl = win.querySelector('[data-win-actions]');

    // 1. Load avatar image
    getAvatar(addr).then(function (url) {
      if (url && avatarEl) {
        avatarEl.innerHTML = '<img src="' + escHtml(url) + '" alt="" class="win-avatar-img">';
      }
    });

    // 2. Agent ID badge (ERC-8004)
    if (isAgentFlag) {
      var idContract = new ethers.Contract(ERC8004_REGISTRY, ERC8004_ID_ABI, S.readProvider);
      idContract.tokenOfOwnerByIndex(addr, 0).then(function (tokenId) {
        var id = Number(tokenId);
        if (id > 0 && badgesEl) {
          var link = document.createElement('a');
          link.href = 'https://erc8004.com/agent/' + id;
          link.target = '_blank';
          link.rel = 'noopener';
          link.className = 'win-8004-link';
          link.title = 'ERC-8004 Agent #' + id;
          link.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="' + ROBOT_SVG_PATH + '"/></svg> #' + id;
          link.addEventListener('mousedown', function (e) { e.stopPropagation(); });
          badgesEl.appendChild(link);
        }
      }).catch(function () {});
    }

    // 3. Tier badge
    S.pointsReadContract.getStatus(addr).then(function (r) {
      var num = Number(r[0] || r.number);
      var mult = Number(r[1] || r.multiplier);
      if (num > 0 && badgesEl) {
        var tierSpan = document.createElement('span');
        tierSpan.className = 'win-tier-badge';
        tierSpan.style.color = getTierColor(mult, addr);
        var label = getTierLabel(mult, addr);
        tierSpan.innerHTML = '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> #' + num;
        tierSpan.title = label;
        badgesEl.appendChild(tierSpan);
      }
    }).catch(function () {});

    // 4. X link (parse from bio)
    getBio(addr).then(function (bio) {
      if (!bio || !actionsEl) return;
      // Match @handle or x.com/handle or twitter.com/handle
      var xMatch = bio.match(/@([A-Za-z0-9_]{1,15})/) || bio.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})/);
      if (xMatch && xMatch[1]) {
        var xLink = document.createElement('a');
        xLink.href = 'https://x.com/' + xMatch[1];
        xLink.target = '_blank';
        xLink.rel = 'noopener';
        xLink.className = 'win-x-link';
        xLink.title = '@' + xMatch[1];
        xLink.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
        xLink.addEventListener('mousedown', function (e) { e.stopPropagation(); });
        actionsEl.appendChild(xLink);
      }
    });

    // 5. Profile button (opens profile drawer)
    var profBtn = document.createElement('button');
    profBtn.className = 'win-profile-btn';
    profBtn.title = 'View profile';
    profBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    profBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    profBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openProfile(addr);
    });
    if (actionsEl) actionsEl.appendChild(profBtn);

    // 6. Make avatar and name clickable to open profile
    if (avatarEl) {
      avatarEl.style.cursor = 'pointer';
      avatarEl.title = 'View profile';
      avatarEl.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      avatarEl.addEventListener('click', function (e) { e.stopPropagation(); openProfile(addr); });
    }
    var nameEl = win.querySelector('.win-name');
    if (nameEl) {
      nameEl.style.cursor = 'pointer';
      nameEl.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      nameEl.addEventListener('click', function (e) { e.stopPropagation(); openProfile(addr); });
    }
  }

  function closeWindow(key) {
    var win = S.openWindows[key];
    if (!win) return;
    // Clear drag/resize if this window is being dragged
    if (S.dragState && S.dragState.el === win.el) S.dragState = null;
    if (S.resizeState && S.resizeState.el === win.el) S.resizeState = null;
    win.el.remove();
    delete S.openWindows[key];

    // Remove active from sidebar
    var sidebarItem = document.querySelector('.sidebar-convo-item[data-addr="' + key + '"]');
    if (sidebarItem) sidebarItem.classList.remove('active');

    // Show empty state if no windows
    if (Object.keys(S.openWindows).length === 0) {
      $('workspace-empty').classList.remove('hidden');
    }
  }

  function focusWindow(key) {
    unfocusAllWindows();
    var win = S.openWindows[key];
    if (!win) return;
    win.el.style.zIndex = ++S.windowZCounter;
    win.el.classList.add('focused');
  }

  function unfocusAllWindows() {
    Object.keys(S.openWindows).forEach(function (k) {
      S.openWindows[k].el.classList.remove('focused');
    });
  }

  function renderWindowMessages(key) {
    var win = S.openWindows[key];
    if (!win) return;
    var area = win.el.querySelector('.win-messages');
    var convo = S.conversations[key];

    if (!convo || !convo.messages.length) {
      area.innerHTML = '<div class="empty-state-sm"><p>No messages yet</p></div>';
      return;
    }

    area.innerHTML = '';
    var myAddr = S.address.toLowerCase();

    convo.messages.forEach(function (m) {
      var outgoing = m.from.toLowerCase() === myAddr;
      var isBcast = m.isBroadcast || m.to === 'broadcast';
      var origin = isBcast ? parseBroadcastOrigin(m) : null;
      var bubble = document.createElement('div');
      var bcastClass = '';
      if (isBcast) {
        bcastClass = ' pingcast-bubble';
        if (origin.type === 'system') bcastClass += ' system-broadcast-bubble';
        if (origin.type === 'x402') bcastClass += ' x402-broadcast-bubble';
      }
      bubble.className = 'msg-bubble ' + (outgoing ? 'msg-outgoing' : 'msg-incoming') + bcastClass;
      var tagHtml = '';
      if (isBcast && origin.type === 'system') {
        tagHtml = '<span class="pingcast-bubble-tag system-tag" style="margin-bottom:4px;display:inline-block">SYSTEM ' + escHtml(origin.badge) + '</span><br>';
      } else if (isBcast && origin.type === 'x402') {
        tagHtml = '<span class="pingcast-bubble-tag x402-tag" style="margin-bottom:4px;display:inline-block">x402 PAID</span><br>';
      } else if (isBcast) {
        tagHtml = '<span class="pingcast-bubble-tag" style="margin-bottom:4px;display:inline-block">PINGCAST</span><br>';
      }
      var displayContent = (isBcast && origin) ? origin.displayContent : m.content;
      var contentHtml;
      if (isBcast && origin && origin.type === 'x402') {
        contentHtml =
          '<div class="pingcast-field"><span class="pingcast-field-label">Name:</span> <span class="pingcast-field-value">' + escHtml(origin.senderName) + '</span></div>' +
          '<div class="pingcast-field"><span class="pingcast-field-label">Message:</span> <span class="pingcast-field-value">' + escHtml(displayContent) + '</span></div>';
      } else {
        contentHtml = '<div>' + escHtml(displayContent) + '</div>';
      }
      bubble.innerHTML =
        tagHtml +
        contentHtml +
        '<div class="msg-meta">' +
          '<span>block ' + (m.block ? m.block.toLocaleString() : '...') + '</span>' +
          (m.tx ? '<a href="' + BASESCAN + '/tx/' + encodeURIComponent(m.tx) + '" target="_blank" rel="noopener">tx</a>' : '') +
        '</div>';
      area.appendChild(bubble);
    });

    // Defer scroll to after browser layout — fixes mobile race condition
    // where scrollHeight isn't yet calculated for newly appended bubbles
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        area.scrollTop = area.scrollHeight;
      });
    });
  }

  function ensureFee() {
    if (S.messageFee && S.messageFee > 0n) return Promise.resolve(S.messageFee);
    if (S.v2ReadContract) {
      return S.v2ReadContract.messageFee().then(function (fee) { S.messageFee = fee; return fee; });
    }
    if (!S.contract) return Promise.reject(new Error('Not connected'));
    return S.contract.messageFee().then(function (fee) { S.messageFee = fee; return fee; });
  }

  function sendWindowMessage(key) {
    var win = S.openWindows[key];
    if (!win) return;
    var textarea = win.el.querySelector('textarea');
    var body = textarea.value.trim();
    if (!body) return;
    if (body.length > 1024) { toast('Message too long (max 1024).', 'error'); return; }
    if (!S.contract) { toast('Wallet not connected.', 'error'); return; }

    var toAddr = win.addr;
    textarea.disabled = true;

    ensureFee().then(function (fee) {
      return S.v2Contract.sendMessage(toAddr, body, { value: fee });
    }).then(function (tx) {
        textarea.value = '';
        textarea.style.height = 'auto';
        var counter = win.el.querySelector('.win-char-count');
        if (counter) { counter.textContent = '0/1024'; counter.className = 'win-char-count'; }
        toast('Sending...', '');

        // Optimistic add
        var msg = { from: S.address, to: toAddr, content: body, block: 0, tx: tx.hash, idx: 0 };
        if (S.conversations[key]) S.conversations[key].messages.push(msg);
        else {
          S.conversations[key] = { address: toAddr, messages: [msg] };
        }
        renderWindowMessages(key);

        return tx.wait();
      })
      .then(function (receipt) {
        playSwoosh();
        toast('Message sent.', 'success');
        if (S.conversations[key]) {
          var last = S.conversations[key].messages[S.conversations[key].messages.length - 1];
          if (last.block === 0) last.block = receipt.blockNumber;
          renderWindowMessages(key);
        }
        // Refresh sidebar
        loadSidebarConversations();
      })
      .catch(function (e) {
        var msg = mapTxError(e);
        toast(msg, 'error');
        // Remove optimistic message on failure
        if (S.conversations[key]) {
          S.conversations[key].messages = S.conversations[key].messages.filter(function (m) { return m.block !== 0; });
          renderWindowMessages(key);
        }
      })
      .finally(function () { textarea.disabled = false; textarea.focus(); });
  }

  // ---- Error mapping ----

  var ERROR_SELECTORS = {
    '0x025dbdd4': 'Not enough ETH. You need 0.00003 ETH to send a message.',
    '0xa5070af6': 'Recipient is not registered.',
    '0xaba47339': 'You must register before sending messages.',
    '0xa7435445': 'Message too long (max 1024 characters).',
    '0x3a81d6fc': 'This address is already registered.',
    '0x6bc324ad': 'That username is taken.',
    '0x50ef3288': 'Invalid username. Use 3-32 letters, numbers, or underscores.'
  };

  function mapTxError(e) {
    var raw = e.message || e.shortMessage || String(e);

    // User cancelled in wallet
    if (raw.includes('user rejected') || raw.includes('User denied')) return 'Cancelled.';

    // Check for known custom error selectors in the error data
    var dataMatch = raw.match(/0x[0-9a-f]{8}/i);
    if (dataMatch) {
      var sel = dataMatch[0].toLowerCase();
      if (ERROR_SELECTORS[sel]) return ERROR_SELECTORS[sel];
    }

    // Also check data field directly
    if (e.data) {
      var dataSel = typeof e.data === 'string' ? e.data.slice(0, 10).toLowerCase() : '';
      if (ERROR_SELECTORS[dataSel]) return ERROR_SELECTORS[dataSel];
    }

    // Fallback
    if (raw.length > 80) return raw.substring(0, 80) + '...';
    return raw;
  }

  // ---- Drag ----

  function startDrag(e, win) {
    e.preventDefault();
    var rect = win.getBoundingClientRect();
    var wsRect = $('workspace').getBoundingClientRect();
    S.dragState = {
      el: win,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      wsRect: wsRect
    };
  }

  function startDragTouch(e, win) {
    // Disable drag on mobile — windows are stacked, not floating
    if (window.innerWidth <= 768) return;
    e.preventDefault();
    var touch = e.touches[0];
    var rect = win.getBoundingClientRect();
    var wsRect = $('workspace').getBoundingClientRect();
    S.dragState = {
      el: win,
      offsetX: touch.clientX - rect.left,
      offsetY: touch.clientY - rect.top,
      wsRect: wsRect,
      isTouch: true
    };
  }

  function onDragMove(clientX, clientY) {
    if (!S.dragState) return;
    var d = S.dragState;
    var ws = d.wsRect;
    var x = clientX - ws.left - d.offsetX;
    var y = clientY - ws.top - d.offsetY;
    x = Math.max(0, Math.min(x, ws.width - 100));
    y = Math.max(0, Math.min(y, ws.height - 40));
    d.el.style.left = x + 'px';
    d.el.style.top = y + 'px';
  }

  document.addEventListener('mousemove', function (e) { onDragMove(e.clientX, e.clientY); });
  document.addEventListener('touchmove', function (e) {
    if (S.dragState && S.dragState.isTouch) {
      e.preventDefault();
      onDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });

  document.addEventListener('mouseup', function () { S.dragState = null; S.resizeState = null; });
  document.addEventListener('touchend', function () { S.dragState = null; S.resizeState = null; });

  // ---- Resize ----

  function startResize(e, win) {
    e.preventDefault();
    S.resizeState = {
      el: win,
      startX: e.clientX,
      startY: e.clientY,
      startW: win.offsetWidth,
      startH: win.offsetHeight
    };
  }

  document.addEventListener('mousemove', function (e) {
    if (!S.resizeState) return;
    var r = S.resizeState;
    var w = Math.max(280, r.startW + (e.clientX - r.startX));
    var h = Math.max(200, r.startH + (e.clientY - r.startY));
    r.el.style.width = w + 'px';
    r.el.style.height = h + 'px';
  });

  // ============================================
  // PINGCAST TICKER + COMPOSE
  // ============================================

  function loadPingcastTicker() {
    var broadcasts = S.broadcastMessages;
    if (!broadcasts.length) return;

    var ticker = $('pingcast-ticker');
    var track = $('ticker-track');
    if (!ticker || !track) return;

    ticker.style.display = '';

    // Resolve sender names then render
    var addrs = {};
    broadcasts.forEach(function (b) { addrs[b.from.toLowerCase()] = true; });
    var resolves = Object.keys(addrs).map(function (a) {
      return getUsernameSafe(a).then(function (n) { return { addr: a, name: n }; });
    });

    Promise.all(resolves).then(function (infos) {
      var lookup = {};
      infos.forEach(function (i) { lookup[i.addr] = i.name; });

      // Build ticker items (duplicate for seamless loop)
      var html = '';
      var items = broadcasts.slice().sort(function (a, b) { return b.block - a.block; }).slice(0, 20);
      for (var pass = 0; pass < 2; pass++) {
        items.forEach(function (b) {
          var origin = parseBroadcastOrigin(b);
          var sender = origin.senderName || lookup[b.from.toLowerCase()] || truncAddr(b.from);
          var preview = origin.displayContent;
          if (preview.length > 80) preview = preview.substring(0, 80) + '...';
          var badgeHtml = origin.verified
            ? '<span class="ticker-verified">' + escHtml(origin.badge) + '</span>'
            : (origin.type === 'x402' ? '<span class="ticker-x402">x402</span>' : '');
          html += '<div class="ticker-item">' +
            '<span class="ticker-sender">' + escHtml(sender) + badgeHtml + '</span>' +
            '<span class="ticker-content">' + escHtml(preview) + '</span>' +
            '</div>';
        });
      }
      track.innerHTML = html;
    });
  }

  // ============================================
  // PINGCAST FEED STRIP (mail view header)
  // ============================================

  var PFS_CYCLE_MS = 6000;
  var PFS_STAGGER_MS = 3000;

  function loadMailPingcastFeed() {
    var strip = $('pingcast-feed-strip');
    if (!strip) return;

    // Try cache API first (broadcasts already indexed server-side)
    fetch(CACHE_API_URL, { signal: AbortSignal.timeout(8000) })
      .then(function (resp) {
        if (!resp.ok) throw new Error('cache api ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        if (data.users && !S.directoryLoaded) hydrateFromCacheApi(data);
        var broadcasts = [];
        if (data.recent_broadcasts) {
          data.recent_broadcasts.forEach(function (b) {
            broadcasts.push({
              from: b.from,
              to: 'broadcast',
              content: b.content || '',
              broadcastId: b.broadcastId || 0,
              block: b.block,
              tx: b.tx,
              idx: 0
            });
          });
        }
        if (!broadcasts.length) { strip.style.display = 'none'; return; }
        broadcasts.sort(function (a, b) { return b.block - a.block; });
        S.pfsBroadcasts = broadcasts.slice(0, 30);
        strip.style.display = '';
        initPfsSlots();
        startPfsCycle();
      })
      .catch(function () {
        // Fallback to direct RPC
        loadMailPingcastFeedRpc(strip);
      });
  }

  // Fallback: direct RPC broadcast log fetching
  function loadMailPingcastFeedRpc(strip) {
    var topicBcast = ethers.id('Broadcast(address,string,uint256)');

    withFailover(function () { return S.readProvider.getBlockNumber(); }).then(function (cur) {
      var from = Math.max(DIAMOND_DEPLOY_BLOCK, cur - 50000);
      var v2From = Math.max(V2_DEPLOY_BLOCK, cur - 50000);
      return Promise.all([
        fetchDiamondLogsChunked([topicBcast], from, cur),
        fetchV2LogsChunked([topicBcast], v2From, cur)
      ]);
    }).then(function (results) {
      var allLogs = results[0].concat(results[1]);
      var broadcasts = parseBroadcastLogs(allLogs);
      if (!broadcasts.length) { strip.style.display = 'none'; return; }

      broadcasts.sort(function (a, b) { return b.block - a.block; });
      S.pfsBroadcasts = broadcasts.slice(0, 30);

      // Resolve usernames for all senders
      var addrs = {};
      S.pfsBroadcasts.forEach(function (b) { addrs[b.from.toLowerCase()] = true; });
      var resolves = Object.keys(addrs).map(function (a) {
        return getUsernameSafe(a).then(function (n) { return { addr: a, name: n }; });
      });

      return Promise.all(resolves).then(function () {
        strip.style.display = '';
        initPfsSlots();
        startPfsCycle();
      });
    }).catch(function () {
      strip.style.display = 'none';
    });
  }

  function initPfsSlots() {
    if (!S.pfsBroadcasts.length) return;
    for (var i = 0; i < 2; i++) {
      var idx = i % S.pfsBroadcasts.length;
      S.pfsIndices[i] = idx;
      renderPfsCard(i, S.pfsBroadcasts[idx]);
    }
  }

  function renderPfsCard(slotIndex, msg) {
    var slot = $('pfs-slot-' + slotIndex);
    if (!slot) return;
    var card = slot.querySelector('.pfs-card');

    var origin = parseBroadcastOrigin(msg);
    var sender = origin.senderName || S.usernameCache[msg.from.toLowerCase()] || truncAddr(msg.from);
    var preview = origin.displayContent;
    if (preview.length > 60) preview = preview.substring(0, 60) + '...';

    var typeClass = origin.type === 'system' ? 'is-system' : origin.type === 'x402' ? 'is-x402' : origin.type === 'referral' ? 'is-referral' : 'is-native';
    var badgeClass = origin.type === 'system' ? 'badge-system' : origin.type === 'x402' ? 'badge-x402' : origin.type === 'referral' ? 'badge-referral' : 'badge-native';
    var badgeText = origin.type === 'system' ? 'SYSTEM ' + origin.badge
      : origin.type === 'x402' ? 'x402'
      : 'PINGCAST';

    var shortTx = msg.tx ? msg.tx.slice(0, 8) + '...' + msg.tx.slice(-4) : '';
    var txHtml = msg.tx
      ? '<a href="' + BASESCAN + '/tx/' + encodeURIComponent(msg.tx) + '" target="_blank" rel="noopener" class="pfs-card-tx">' + shortTx + '</a>'
      : '';

    card.innerHTML =
      '<div class="pfs-card-inner ' + typeClass + '">' +
        '<div class="pfs-card-header">' +
          '<span class="pfs-card-badge ' + badgeClass + '">' + escHtml(badgeText) + '</span>' +
          '<span class="pfs-card-name">' + escHtml(sender) + '</span>' +
        '</div>' +
        '<div class="pfs-card-msg">' + escHtml(preview) + '</div>' +
        '<div class="pfs-card-footer">' +
          '<span class="pfs-card-block">block ' + (msg.block ? msg.block.toLocaleString() : '') + '</span>' +
          txHtml +
        '</div>' +
      '</div>';
  }

  function cyclePfsSlot(slotIndex) {
    if (S.pfsBroadcasts.length < 2) return;
    var slot = $('pfs-slot-' + slotIndex);
    if (!slot) return;
    var card = slot.querySelector('.pfs-card');

    card.classList.add('fade-out');
    card.classList.remove('fade-in');

    setTimeout(function () {
      S.pfsIndices[slotIndex] = (S.pfsIndices[slotIndex] + 2) % S.pfsBroadcasts.length;
      renderPfsCard(slotIndex, S.pfsBroadcasts[S.pfsIndices[slotIndex]]);
      card.classList.remove('fade-out');
      card.classList.add('fade-in');
    }, 500);
  }

  function startPfsCycle() {
    stopPfsTimers();
    if (S.pfsBroadcasts.length < 2) return;
    for (var i = 0; i < 2; i++) {
      (function (idx) {
        var timer = setInterval(function () { cyclePfsSlot(idx); }, PFS_CYCLE_MS);
        S.pfsTimers.push(timer);
        setTimeout(function () { cyclePfsSlot(idx); }, PFS_STAGGER_MS * idx + 3000);
      })(i);
    }
  }

  function stopPfsTimers() {
    S.pfsTimers.forEach(function (t) { clearInterval(t); });
    S.pfsTimers = [];
  }

  function openPingcastModal() {
    $('pingcast-modal').style.display = '';
    $('pingcast-status').textContent = '';
    $('pingcast-status').className = 'compose-status';
    $('pingcast-body').value = '';
    $('pingcast-char-count').textContent = '0';
    $('pingcast-body').focus();

    // Reset free credit display
    $('pingcast-free-credit').style.display = 'none';
    $('pingcast-fee-display').classList.remove('has-free-credit');
    $('pingcast-send-label').textContent = 'Send Pingcast';
    S.freePingcastCredits = 0;

    // Load current fee from v2
    if (S.v2ReadContract) {
      S.v2ReadContract.getBroadcastFee().then(function (fee) {
        S.broadcastFee = fee;
        var ethVal = ethers.formatEther(fee);
        $('pingcast-fee-value').textContent = ethVal + ' ETH';
      }).catch(function () {
        $('pingcast-fee-value').textContent = 'unable to load';
      });
    }

    // Check referral credits for free Pingcast
    if (S.referralReadContract && S.address && S.username) {
      checkFreePingcastCredits();
    }
  }

  function checkFreePingcastCredits() {
    S.referralReadContract.referralCount(S.address).then(function (count) {
      var n = Number(count);
      if (n < 1) return;
      var earned = 1 + Math.floor((n - 1) / 10);

      // Count used free credits via API
      return fetch('https://sibylcap.com/api/pingcast?name=' + encodeURIComponent(S.username) + '&message=credit_check&address=' + S.address)
        .then(function () {
          // If we get a 200, there ARE credits (but we just used one, which is wrong)
          // Instead, we should check the 402 response for credits info
          // This path shouldn't happen for a credit_check
        })
        .catch(function () {})
        .then(function () {
          // Simpler: just calculate locally. Scan broadcast logs for [ref|username] tag.
          return countUsedFreeCredits(S.username);
        })
        .then(function (used) {
          var remaining = earned - used;
          if (remaining > 0) {
            S.freePingcastCredits = remaining;
            $('pingcast-free-credit').style.display = '';
            $('pingcast-free-text').textContent = remaining + ' free Pingcast' + (remaining > 1 ? 's' : '') + ' from ' + n + ' referral' + (n > 1 ? 's' : '');
            $('pingcast-fee-display').classList.add('has-free-credit');
            $('pingcast-send-label').textContent = 'Send Free Pingcast';
          }
        });
    }).catch(function (e) {
      console.log('free pingcast check failed:', e.message);
    });
  }

  function countUsedFreeCredits(username) {
    // Scan broadcast logs from Diamond for [ref|username] prefix
    var tag = '[ref|' + username + '] ';
    var BCAST_TOPIC = '0x9610cedb360389cd9606400e878ada95d97e0fbab2ea61fcc0ca56c330cc090d';
    var fromBlock = 43068000;

    return S.readProvider.getLogs({
      address: '0x59235da2dd29bd0ebce0399ba16a1c5213e605da',
      topics: [BCAST_TOPIC],
      fromBlock: fromBlock,
      toBlock: 'latest'
    }).then(function (logs) {
      var iface = new ethers.Interface([
        'event Broadcast(address indexed sender, string content, uint256 indexed broadcastId)'
      ]);
      var used = 0;
      for (var i = 0; i < logs.length; i++) {
        try {
          var parsed = iface.parseLog({ topics: logs[i].topics, data: logs[i].data });
          if (parsed && parsed.args[1] && parsed.args[1].indexOf(tag) === 0) used++;
        } catch (e) { /* skip */ }
      }
      return used;
    }).catch(function () { return 0; });
  }

  function closePingcastModal() {
    $('pingcast-modal').style.display = 'none';
  }

  function sendPingcast() {
    var body = $('pingcast-body').value;
    var status = $('pingcast-status');

    if (!body) { status.textContent = 'Enter a message.'; status.className = 'compose-status error'; return; }
    if (body.length > 1024) { status.textContent = 'Too long (max 1024).'; status.className = 'compose-status error'; return; }
    if (!S.connected || !S.signer) { status.textContent = 'Connect wallet first.'; status.className = 'compose-status error'; return; }

    // Use free referral credit if available
    if (S.freePingcastCredits > 0 && S.username && S.address) {
      status.textContent = 'Sending free Pingcast...';
      status.className = 'compose-status';

      fetch('https://sibylcap.com/api/pingcast?name=' + encodeURIComponent(S.username) +
        '&message=' + encodeURIComponent(body) +
        '&address=' + S.address)
        .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
        .then(function (resp) {
          if (resp.data.success) {
            status.textContent = 'Free Pingcast sent.';
            status.className = 'compose-status success';
            S.freePingcastCredits--;
            playSwoosh();
            toast('Free Pingcast delivered. ' + (S.freePingcastCredits > 0 ? S.freePingcastCredits + ' credit' + (S.freePingcastCredits !== 1 ? 's' : '') + ' remaining.' : 'refer more users for more.'), 'success');
            closePingcastModal();
            loadFeed();
          } else {
            // No free credits left, fall back to on-chain
            status.textContent = resp.data.error || 'No free credits. Falling back to paid...';
            status.className = 'compose-status error';
            S.freePingcastCredits = 0;
            $('pingcast-free-credit').style.display = 'none';
            $('pingcast-fee-display').classList.remove('has-free-credit');
            $('pingcast-send-label').textContent = 'Send Pingcast';
          }
        })
        .catch(function (e) {
          status.textContent = 'Free broadcast failed: ' + e.message;
          status.className = 'compose-status error';
        });
      return;
    }

    // Paid on-chain broadcast
    status.textContent = 'Loading fee...';
    status.className = 'compose-status';

    var fee;
    S.v2Contract.getBroadcastFee().then(function (f) {
      fee = f;
      status.textContent = 'Confirm in wallet...';
      return S.v2Contract.broadcast(body, { value: fee });
    }).then(function (tx) {
      status.textContent = 'Broadcasting...';
      return tx.wait();
    }).then(function () {
      status.textContent = 'Pingcast sent.';
      status.className = 'compose-status success';
      playSwoosh();
      toast('Pingcast sent to all inboxes.', 'success');
      closePingcastModal();
      loadFeed();
    }).catch(function (e) {
      var msg = mapTxError(e);
      if (msg.indexOf('0x') === 0) {
        if (msg === '0x89a6d7b6') msg = 'Not enough ETH for broadcast fee.';
        else if (msg === '0x74a21bbc') msg = 'You must be registered on Ping to broadcast.';
        else if (msg === '0x15011780') msg = 'Message too long (max 1024 characters).';
      }
      status.textContent = msg;
      status.className = 'compose-status error';
    });
  }

  function openPingcastWindow() {
    // Open a special Pingcast feed window in the workspace
    var key = '__pingcast__';

    if (S.openWindows[key]) {
      focusWindow(key);
      return;
    }

    // Hide empty state
    $('workspace-empty').classList.add('hidden');

    // Calculate cascade position
    var workspace = $('workspace');
    var wRect = workspace.getBoundingClientRect();
    var offsetX = 30 + (S.windowCascadeIndex * 30) % Math.max(wRect.width - 450, 60);
    var offsetY = 30 + (S.windowCascadeIndex * 30) % Math.max(wRect.height - 510, 60);
    S.windowCascadeIndex++;

    var isMobilePc = window.innerWidth <= 768;
    var win = document.createElement('div');
    win.className = 'msg-window focused pingcast-window';
    win.setAttribute('data-addr', key);
    if (!isMobilePc) {
      win.style.left = offsetX + 'px';
      win.style.top = offsetY + 'px';
    }
    win.style.zIndex = ++S.windowZCounter;

    win.innerHTML =
      '<div class="win-titlebar pingcast-titlebar">' +
        (isMobilePc ? '<button class="win-back"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>' : '') +
        '<div class="win-avatar pingcast-avatar">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
        '</div>' +
        '<div class="win-info">' +
          '<span class="win-name">Pingcast Feed</span>' +
          '<span class="win-addr">broadcasts to all users</span>' +
        '</div>' +
        '<button class="win-close">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="win-messages"></div>' +
      '<div class="win-compose">' +
        '<button class="btn-pingcast-compose-inline" id="btn-pingcast-inline">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
          ' Send Pingcast' +
        '</button>' +
      '</div>' +
      '<div class="win-resize"></div>';

    workspace.appendChild(win);

    S.openWindows[key] = { el: win, addr: key, name: 'Pingcast Feed' };

    // On mobile, close all other windows
    if (isMobilePc) {
      Object.keys(S.openWindows).forEach(function (k) {
        if (k !== key) closeWindow(k);
      });
    } else {
      unfocusAllWindows();
    }
    win.classList.add('focused');

    // Event: titlebar drag
    var titlebar = win.querySelector('.win-titlebar');
    titlebar.addEventListener('mousedown', function (e) {
      if (e.target.closest('.win-close') || e.target.closest('.win-back')) return;
      focusWindow(key);
      startDrag(e, win);
    });
    titlebar.addEventListener('touchstart', function (e) {
      if (e.target.closest('.win-close') || e.target.closest('.win-back')) return;
      focusWindow(key);
      startDragTouch(e, win);
    }, { passive: false });

    // Event: back button (mobile)
    var backBtnPc = win.querySelector('.win-back');
    if (backBtnPc) {
      backBtnPc.addEventListener('click', function (e) {
        e.stopPropagation(); e.preventDefault();
        closeWindow(key);
      });
      backBtnPc.addEventListener('touchend', function (e) {
        e.stopPropagation(); e.preventDefault();
        closeWindow(key);
      });
    }

    // Event: close
    var closeBtn = win.querySelector('.win-close');
    closeBtn.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); closeWindow(key); });
    closeBtn.addEventListener('touchend', function (e) { e.stopPropagation(); e.preventDefault(); closeWindow(key); });

    // Event: focus
    win.addEventListener('mousedown', function () { focusWindow(key); });

    // Event: resize
    var resizeHandle = win.querySelector('.win-resize');
    resizeHandle.addEventListener('mousedown', function (e) { e.stopPropagation(); startResize(e, win); });

    // Inline compose button
    win.querySelector('#btn-pingcast-inline').addEventListener('click', function () { openPingcastModal(); });

    // Load broadcasts into window
    loadPingcastWindowMessages(key);
  }

  function loadPingcastWindowMessages(key) {
    var win = S.openWindows[key];
    if (!win) return;
    var area = win.el.querySelector('.win-messages');
    area.innerHTML = '<div class="empty-state-sm"><div class="spinner"></div></div>';

    var topicBcast = ethers.id('Broadcast(address,string,uint256)');

    withFailover(function () { return S.readProvider.getBlockNumber(); }).then(function (cur) {
      return Promise.all([
        fetchDiamondLogsChunked([topicBcast], DIAMOND_DEPLOY_BLOCK, cur),
        fetchV2LogsChunked([topicBcast], V2_DEPLOY_BLOCK, cur)
      ]);
    }).then(function (results) {
      var broadcasts = parseBroadcastLogs(results[0].concat(results[1]));
      if (!broadcasts.length) {
        area.innerHTML = '<div class="empty-state-sm"><p>No Pingcasts yet</p></div>';
        return;
      }

      broadcasts.sort(function (a, b) { return a.block - b.block; });

      // Resolve sender names
      var addrs = {};
      broadcasts.forEach(function (b) { addrs[b.from.toLowerCase()] = true; });
      var resolves = Object.keys(addrs).map(function (a) {
        return Promise.all([getUsernameSafe(a), isAgent(a)]).then(function (r) {
          return { addr: a, name: r[0], agent: r[1] };
        });
      });

      return Promise.all(resolves).then(function (infos) {
        var lookup = {};
        var agentLookup = {};
        infos.forEach(function (i) { lookup[i.addr] = i.name; agentLookup[i.addr] = i.agent; });

        area.innerHTML = '';
        broadcasts.forEach(function (b) {
          var origin = parseBroadcastOrigin(b);
          var sender = origin.senderName || lookup[b.from.toLowerCase()] || truncAddr(b.from);
          var senderIsAgent = agentLookup[b.from.toLowerCase()];
          var bubble = document.createElement('div');
          var bClass = 'msg-bubble msg-incoming pingcast-bubble';
          if (origin.type === 'system') bClass += ' system-broadcast-bubble';
          if (origin.type === 'x402') bClass += ' x402-broadcast-bubble';
          bubble.className = bClass;
          var tagClass = 'pingcast-bubble-tag';
          var tagText = 'PINGCAST';
          if (origin.type === 'system') { tagClass += ' system-tag'; tagText = 'SYSTEM ' + origin.badge; }
          else if (origin.type === 'x402') { tagClass += ' x402-tag'; tagText = 'x402 PAID'; }

          // Structured display for x402 with Name + Message fields
          var contentHtml;
          if (origin.type === 'x402') {
            contentHtml =
              '<div class="pingcast-field"><span class="pingcast-field-label">Name:</span> <span class="pingcast-field-value">' + escHtml(origin.senderName) + '</span></div>' +
              '<div class="pingcast-field"><span class="pingcast-field-label">Message:</span> <span class="pingcast-field-value">' + escHtml(origin.displayContent) + '</span></div>';
          } else {
            contentHtml = '<div>' + escHtml(origin.displayContent) + '</div>';
          }

          bubble.innerHTML =
            '<div class="pingcast-bubble-header">' +
              '<span class="pingcast-bubble-sender' + (senderIsAgent ? ' is-agent' : '') + '">' + escHtml(sender) + '</span>' +
              '<span class="' + tagClass + '">' + escHtml(tagText) + '</span>' +
            '</div>' +
            contentHtml +
            '<div class="msg-meta">' +
              '<span>block ' + (b.block ? b.block.toLocaleString() : '...') + '</span>' +
              (b.tx ? '<a href="' + BASESCAN + '/tx/' + encodeURIComponent(b.tx) + '" target="_blank" rel="noopener">tx</a>' : '') +
            '</div>';
          area.appendChild(bubble);
        });

        area.scrollTop = area.scrollHeight;
      });
    }).catch(function () {
      area.innerHTML = '<div class="empty-state-sm"><p>Failed to load Pingcasts</p></div>';
    });
  }

  // ============================================
  // COMPOSE MODAL
  // ============================================

  function openComposeModal(prefillTo) {
    $('compose-modal').style.display = '';
    $('compose-status').textContent = '';
    $('compose-status').className = 'compose-status';
    hideAutocomplete();
    preloadDirectory();
    if (prefillTo) {
      $('compose-to').value = prefillTo;
      resolveRecipient(prefillTo);
    } else {
      $('compose-to').value = '';
      $('compose-resolve').textContent = '';
    }
    $('compose-body').value = '';
    $('char-count').textContent = '0';
    $('compose-to').focus();
  }

  function closeComposeModal() {
    $('compose-modal').style.display = 'none';
    hideAutocomplete();
  }

  function resolveRecipient(input) {
    var el = $('compose-resolve');
    input = input.trim();
    if (!input) { el.textContent = ''; el.className = 'compose-resolve'; return; }

    if (input.startsWith('0x') && input.length === 42) {
      getUsernameSafe(input).then(function (n) {
        if (n) { el.textContent = 'Resolved: ' + n; el.className = 'compose-resolve found'; }
        else { el.textContent = 'Address not registered'; el.className = 'compose-resolve not-found'; }
      });
    } else {
      getAddress(input).then(function (a) {
        if (a && a !== ethers.ZeroAddress) { el.textContent = 'Resolved: ' + truncAddr(a); el.className = 'compose-resolve found'; }
        else { el.textContent = 'Username not found'; el.className = 'compose-resolve not-found'; }
      });
    }
  }

  // ---- Autocomplete ----

  function preloadDirectory() {
    if (S.directoryLoaded) return Promise.resolve();
    // Check directory cache
    var dirCache = cacheGet('ping_directory');
    if (dirCache && dirCache.users && (Date.now() - dirCache.ts < FEED_TTL)) {
      S.directoryUsers = dirCache.users;
      S.directoryLoaded = true;
      // Refresh in background via cache API instead of 400+ RPC calls
      setTimeout(function () {
        fetch(CACHE_API_URL, { signal: AbortSignal.timeout(8000) })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
          .then(function (data) { if (data.users) hydrateFromCacheApi(data); })
          .catch(function () { preloadDirectoryFresh(); });
      }, 2000);
      return Promise.resolve();
    }
    // Try cache API first, fall back to direct RPC
    return fetch(CACHE_API_URL, { signal: AbortSignal.timeout(8000) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) { if (data.users) hydrateFromCacheApi(data); })
      .catch(function () { return preloadDirectoryFresh(); });
  }

  function preloadDirectoryFresh() {
    return Promise.all([
      S.readContract.getUserCount().then(function (c) { return Number(c); }).catch(function () { return 0; }),
      S.v2ReadContract.getUserCount().then(function (c) { return Number(c); }).catch(function () { return 0; })
    ]).then(function (counts) {
      var v1Count = counts[0];
      var v2Count = counts[1];
      if (!v1Count && !v2Count) return;
      var ps = [];
      var v1Lim = Math.min(v1Count, 200);
      for (var i = 0; i < v1Lim; i++) ps.push(S.readContract.getUserAtIndex(i).catch(function () { return null; }));
      var v2Lim = Math.min(v2Count, 200);
      for (var j = 0; j < v2Lim; j++) ps.push(S.v2ReadContract.getUserAtIndex(j).catch(function () { return null; }));
      return Promise.all(ps);
    }).then(function (addrs) {
      if (!addrs) return;
      var seen = {};
      var unique = addrs.filter(function (a) {
        if (!a) return false;
        var k = a.toLowerCase();
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      });
      var resolves = unique.map(function (a) {
        return Promise.all([getUsernameSafe(a), isAgent(a), getBio(a), getAvatar(a)]).then(function (r) {
          return { address: a, name: r[0], agent: r[1], bio: r[2], avatar: r[3] };
        });
      });
      return Promise.all(resolves);
    }).then(function (users) {
      if (!users) return;
      S.directoryUsers = users;
      S.directoryLoaded = true;
      cacheSet('ping_directory', { ts: Date.now(), users: users });
      saveProfileCache();
    }).catch(function () {});
  }

  function showAutocomplete(query) {
    var dropdown = $('autocomplete-dropdown');
    query = query.trim().replace(/^@/, '').toLowerCase();

    if (!query || query.startsWith('0x')) {
      hideAutocomplete();
      return;
    }

    var matches = S.directoryUsers.filter(function (u) {
      return u.name && u.name.toLowerCase().indexOf(query) !== -1;
    }).slice(0, 6);

    S.acResults = matches;
    S.acHighlight = -1;

    if (matches.length === 0) {
      dropdown.innerHTML = '<div class="ac-empty">No users found</div>';
      dropdown.classList.add('open');
      return;
    }

    dropdown.innerHTML = '';
    matches.forEach(function (u, i) {
      var el = document.createElement('div');
      el.className = 'ac-item';
      el.setAttribute('data-index', i);

      var avClass = 'ac-avatar' + (u.agent ? ' is-agent' : '');
      var initial = u.name.charAt(0).toUpperCase();

      // Highlight matching portion of name
      var nameHtml = highlightMatch(u.name, query);

      el.innerHTML =
        '<div class="' + avClass + '">' + initial + '</div>' +
        '<div class="ac-info">' +
          '<div class="ac-name">' + nameHtml +
            (u.agent ? ' <span class="badge-agent" style="margin-left:4px;font-size:0.5625rem;padding:1px 5px">' + agentSvg(7) + '</span>' : '') +
          '</div>' +
          '<div class="ac-addr">' + truncAddr(u.address) + '</div>' +
        '</div>';

      el.addEventListener('mousedown', function (e) {
        e.preventDefault();
        selectAutocomplete(i);
      });

      dropdown.appendChild(el);
    });

    dropdown.classList.add('open');
  }

  function highlightMatch(name, query) {
    var lower = name.toLowerCase();
    var idx = lower.indexOf(query);
    if (idx === -1) return escHtml(name);
    var before = name.substring(0, idx);
    var match = name.substring(idx, idx + query.length);
    var after = name.substring(idx + query.length);
    return escHtml(before) + '<em>' + escHtml(match) + '</em>' + escHtml(after);
  }

  function hideAutocomplete() {
    var dropdown = $('autocomplete-dropdown');
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
    S.acResults = [];
    S.acHighlight = -1;
  }

  function selectAutocomplete(index) {
    var user = S.acResults[index];
    if (!user) return;
    $('compose-to').value = user.name;
    hideAutocomplete();
    resolveRecipient(user.name);
    $('compose-body').focus();
  }

  function navigateAutocomplete(direction) {
    if (!S.acResults.length) return;
    S.acHighlight += direction;
    if (S.acHighlight < 0) S.acHighlight = S.acResults.length - 1;
    if (S.acHighlight >= S.acResults.length) S.acHighlight = 0;

    var dropdown = $('autocomplete-dropdown');
    var items = dropdown.querySelectorAll('.ac-item');
    items.forEach(function (el, i) {
      el.classList.toggle('highlighted', i === S.acHighlight);
    });

    // Scroll highlighted item into view
    if (items[S.acHighlight]) {
      items[S.acHighlight].scrollIntoView({ block: 'nearest' });
    }
  }

  function sendCompose() {
    var toInput = $('compose-to').value.trim().replace(/^@/, '');
    var body = $('compose-body').value;
    var status = $('compose-status');

    if (!toInput) { status.textContent = 'Enter a recipient.'; status.className = 'compose-status error'; return; }
    if (!body) { status.textContent = 'Enter a message.'; status.className = 'compose-status error'; return; }
    if (body.length > 1024) { status.textContent = 'Too long (max 1024).'; status.className = 'compose-status error'; return; }
    if (!S.contract) { status.textContent = 'Not connected.'; status.className = 'compose-status error'; return; }

    status.textContent = 'Resolving...';
    status.className = 'compose-status';

    var resolve = toInput.startsWith('0x') && toInput.length === 42
      ? Promise.resolve(toInput)
      : getAddress(toInput).then(function (a) { if (!a || a === ethers.ZeroAddress) throw new Error('Not found'); return a; });

    var resolvedAddr;

    resolve.then(function (addr) {
      resolvedAddr = addr;
      status.textContent = 'Loading fee...';
      return ensureFee().then(function (fee) {
        status.textContent = 'Confirm in wallet...';
        return S.v2Contract.sendMessage(addr, body, { value: fee });
      });
    }).then(function (tx) {
      status.textContent = 'Sending...';
      return tx.wait();
    }).then(function () {
      status.textContent = 'Sent.';
      status.className = 'compose-status success';
      playSwoosh();
      toast('Message sent.', 'success');
      closeComposeModal();

      // Refresh and open window for the recipient
      loadSidebarConversations().then(function () {
        Promise.all([getUsernameSafe(resolvedAddr), isAgent(resolvedAddr)]).then(function (r) {
          openWindow(resolvedAddr, r[0], r[1]);
        });
      });
    }).catch(function (e) {
      status.textContent = mapTxError(e);
      status.className = 'compose-status error';
    });
  }

  // ============================================
  // REGISTER
  // ============================================

  function registerUser() {
    var input = $('input-username').value.trim().replace(/^@/, '');
    var status = $('register-status');
    var btn = $('btn-register');

    if (!input) { status.textContent = 'Enter a username.'; status.className = 'register-status error'; return; }
    if (input.length < 3 || input.length > 32) { status.textContent = '3-32 characters.'; status.className = 'register-status error'; return; }
    if (!/^[a-zA-Z0-9_]+$/.test(input)) { status.textContent = 'Letters, numbers, underscores only.'; status.className = 'register-status error'; return; }
    if (!S.contract) { status.textContent = 'Not connected.'; status.className = 'register-status error'; return; }

    btn.disabled = true;
    $('input-username').disabled = true;
    S.registering = true;
    status.textContent = 'Checking...';
    status.className = 'register-status';

    getAddress(input).then(function (a) {
      if (a && a !== ethers.ZeroAddress) {
        status.textContent = 'Username taken.';
        status.className = 'register-status error';
        return null;
      }
      status.textContent = 'Confirm in wallet...';
      return S.v2Contract.register(input);
    }).then(function (tx) {
      if (!tx) return null;
      status.textContent = 'Registering...';
      return tx.wait();
    }).then(function (receipt) {
      if (!receipt) return;
      S.username = input;
      S.usernameCache[S.address.toLowerCase()] = input;
      status.textContent = 'Welcome, ' + input + '.';
      status.className = 'register-status success';
      toast('Registered as ' + input + '.', 'success');
      // Claim early adopter position + record referral on-chain
      claimPointsPosition();
      recordReferralOnChain();
      setTimeout(showMail, 1200);
    }).catch(function (e) {
      var msg = e.message || 'Failed';
      if (msg.includes('user rejected') || msg.includes('User denied')) msg = 'Cancelled.';
      else if (msg.includes('AlreadyRegistered')) msg = 'This wallet is already registered.';
      else if (msg.length > 80) msg = msg.substring(0, 80) + '...';
      status.textContent = msg;
      status.className = 'register-status error';
      btn.disabled = false;
      $('input-username').disabled = false;
    }).finally(function () {
      S.registering = false;
    });
  }

  // ============================================
  // REFERRAL SYSTEM
  // ============================================

  function checkClaimBanner() {
    var banner = $('sidebar-claim');
    if (!banner || !S.address) return;
    S.pointsReadContract.getStatus(S.address).then(function (r) {
      var num = Number(r[0] || r.number);
      var mult = Number(r[1] || r.multiplier);
      if (num > 0) {
        // Already claimed — show tier badge instead
        var label = getTierLabel(mult, S.address);
        banner.style.display = '';
        banner.innerHTML = '<div class="sidebar-tier-badge" style="color:' + (getTierColor(mult, S.address)) + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> #' + num + ' ' + label + '</div>';
        // Show tier badge next to username in sidebar
        var tierBadge = $('user-tier-badge');
        if (tierBadge) {
          tierBadge.style.display = '';
          tierBadge.style.color = getTierColor(mult, S.address);
          tierBadge.className = 'badge-tier' + (S.agentCache[S.address.toLowerCase()] ? ' badge-tier-agent' : '');
          tierBadge.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> #' + num + ' ' + label;
        }
      } else {
        // Not claimed — show claim button
        banner.style.display = '';
      }
    }).catch(function () {
      banner.style.display = 'none';
    });
  }

  function claimFromBanner() {
    var btn = $('btn-claim-banner');
    var txt = $('claim-banner-text');
    if (!btn || !S.signer) return;
    btn.disabled = true;
    if (txt) txt.textContent = 'Claiming...';
    var pointsContract = new ethers.Contract(POINTS_ADDRESS, POINTS_ABI, S.signer);
    pointsContract.claim().then(function (tx) {
      return tx.wait();
    }).then(function (receipt) {
      if (receipt) {
        btn.classList.add('btn-claim-success');
        if (txt) txt.textContent = 'Claimed!';
        S.pointsReadContract.getStatus(S.address).then(function (r) {
          var num = Number(r[0] || r.number);
          var mult = Number(r[1] || r.multiplier);
          var label = getTierLabel(mult, S.address);
          toast('Early adopter #' + num + '. ' + label + ' multiplier.', 'success');
          // Replace with tier badge after a moment
          setTimeout(function () { checkClaimBanner(); }, 2000);
        });
      }
    }).catch(function (e) {
      console.log('Claim failed:', e.message);
      btn.disabled = false;
      if (txt) txt.textContent = 'Claim Early Adopter Badge!';
    });
  }

  function claimPointsPosition() {
    if (!S.signer) return;
    var pointsContract = new ethers.Contract(POINTS_ADDRESS, POINTS_ABI, S.signer);
    pointsContract.claim().then(function (tx) {
      return tx.wait();
    }).then(function (receipt) {
      if (receipt) {
        // Update claim button to "Claimed!" green
        var claimBtn = document.getElementById('btn-claim-tier');
        if (claimBtn) {
          claimBtn.textContent = 'Claimed!';
          claimBtn.disabled = true;
          claimBtn.classList.add('btn-claim-success');
        }
        // Read back position and show tier
        S.pointsReadContract.getStatus(S.address).then(function (r) {
          var num = Number(r[0] || r.number);
          var mult = Number(r[1] || r.multiplier);
          var label = getTierLabel(mult, S.address);
          toast('Early adopter #' + num + '. ' + label + ' multiplier.', 'success');
          // Replace button with tier badge after a moment
          var tierEl = $('profile-tier');
          if (tierEl) {
            setTimeout(function () {
              tierEl.innerHTML = '#' + num + ' ' + label;
              tierEl.style.color = getTierColor(mult, S.address);
            }, 2000);
          }
        });
      }
    }).catch(function (e) {
      console.log('Points claim failed:', e.message);
      var claimBtn = document.getElementById('btn-claim-tier');
      if (claimBtn) {
        claimBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Claim Early Adopter Badge!';
        claimBtn.disabled = false;
      }
    });
  }

  function recordReferralOnChain() {
    if (!S.referrer || !S.signer) return;
    var refName = S.referrer;
    // Don't let someone refer themselves
    if (refName.toLowerCase() === (S.username || '').toLowerCase()) {
      localStorage.removeItem('ping_referrer');
      S.referrer = null;
      return;
    }
    // Resolve referrer username to address
    getAddress(refName).then(function (addr) {
      if (!addr || addr === ethers.ZeroAddress) return;
      // Don't refer self by address
      if (addr.toLowerCase() === S.address.toLowerCase()) return;
      var refContract = new ethers.Contract(REFERRAL_ADDRESS, REFERRAL_ABI, S.signer);
      return refContract.recordReferral(addr);
    }).then(function (tx) {
      if (!tx) return;
      return tx.wait();
    }).then(function (receipt) {
      if (receipt) {
        toast('Referral recorded on-chain.', 'success');
      }
    }).catch(function (e) {
      // Silent fail: don't block the user experience
      console.log('Referral recording failed:', e.message);
    }).finally(function () {
      localStorage.removeItem('ping_referrer');
      S.referrer = null;
    });
  }

  function loadLeaderboard() {
    var el = $('leaderboard-list');
    if (!el) return;
    el.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    S.referralReadContract.getReferrerCount().then(function (count) {
      var total = Number(count);
      if (total === 0) {
        el.innerHTML = '<div class="empty-state"><p>No referrals yet. Share your link to be first.</p></div>';
        return;
      }
      var limit = Math.min(total, 25);
      return S.referralReadContract.getLeaderboard(0, limit).then(function (result) {
        var referrers = result[0] || result.referrers;
        var counts = result[1] || result.counts;
        var entries = [];
        for (var i = 0; i < referrers.length; i++) {
          entries.push({ address: referrers[i], count: Number(counts[i]) });
        }
        // Batch fetch multipliers
        var addrs = entries.map(function (e) { return e.address; });
        // Fetch multipliers + referral events for agent bonus scoring
        var REFERRAL_TOPIC = ethers.id('ReferralRecorded(address,address)');
        return Promise.all([
          S.pointsReadContract.getMultipliers(addrs),
          S.logProvider.getLogs({
            address: REFERRAL_ADDRESS,
            topics: [REFERRAL_TOPIC],
            fromBlock: '0x' + (43068000).toString(16),
            toBlock: 'latest'
          })
        ]).then(function (res) {
          var r = res[0];
          var refLogs = res[1];
          var numbers = r[0] || r.numbers;
          var multipliers = r[1] || r.multipliers;

          // Build referrer -> [referred addresses] map from events
          var referrerMap = {};
          refLogs.forEach(function (log) {
            if (log.topics.length >= 3) {
              var referred = '0x' + log.topics[1].slice(26);
              var referrer = '0x' + log.topics[2].slice(26);
              var rk = referrer.toLowerCase();
              if (!referrerMap[rk]) referrerMap[rk] = [];
              referrerMap[rk].push(referred.toLowerCase());
            }
          });

          // Count agent referrals per referrer (agents count as 2, humans as 1)
          for (var j = 0; j < entries.length; j++) {
            entries[j].regNum = Number(numbers[j]);
            entries[j].multiplier = Number(multipliers[j]) || 1;
            var referredAddrs = referrerMap[entries[j].address.toLowerCase()] || [];
            var agentBonus = 0;
            referredAddrs.forEach(function (ra) {
              if (S.agentCache[ra]) agentBonus++;
            });
            // weighted = (humanReferrals * 1 + agentReferrals * 2) * multiplier
            entries[j].agentReferrals = agentBonus;
            entries[j].weighted = (entries[j].count + agentBonus) * entries[j].multiplier;
          }
          return entries;
        });
      }).then(function (entries) {
        // Sort by weighted score descending
        entries.sort(function (a, b) { return b.weighted - a.weighted; });
        // Resolve usernames
        return Promise.all(entries.map(function (e) {
          return getUsernameSafe(e.address).then(function (name) {
            e.name = name || (e.address.slice(0, 6) + '...' + e.address.slice(-4));
            return e;
          });
        }));
      });
    }).then(function (entries) {
      if (!entries) return;
      // Show total claimed + tier info
      S.pointsReadContract.totalClaimed().then(function (tc) {
        var tierEl = $('tier-info');
        if (tierEl) tierEl.textContent = Number(tc) + ' claimed. first 100 = 5x. first 1,000 = 3x. first 10,000 = 2x. agent referrals count double.';
      }).catch(function () {});

      var html = '<div class="leaderboard-header"><span class="lb-rank">#</span><span class="lb-name">Referrer</span><span class="lb-mult">Tier</span><span class="lb-count">Score</span></div>';
      entries.forEach(function (e, i) {
        var isAg = S.agentCache[e.address.toLowerCase()];
        var tierLabel = e.multiplier >= 5 ? (isAg ? '5x Agent' : '5x') : e.multiplier >= 3 ? (isAg ? '3x Agent' : '3x') : e.multiplier >= 2 ? (isAg ? '2x Agent' : '2x') : '1x';
        var tierColor = getTierColor(e.multiplier, e.address);
        html += '<div class="leaderboard-row' + (i === 0 ? ' lb-gold' : i === 1 ? ' lb-silver' : i === 2 ? ' lb-bronze' : '') + '">'
          + '<span class="lb-rank">' + (i + 1) + '</span>'
          + '<span class="lb-name">@' + e.name + '</span>'
          + '<span class="lb-mult" style="color:' + tierColor + '">' + tierLabel + '</span>'
          + '<span class="lb-count">' + e.weighted + ' <span class="lb-raw">(' + e.count + ')</span></span>'
          + '</div>';
      });
      el.innerHTML = html;
    }).catch(function () {
      el.innerHTML = '<div class="empty-state"><p>Could not load leaderboard.</p></div>';
    });
  }

  function getMyReferralLink() {
    if (!S.username) return '';
    return 'https://ping.sibylcap.com?ref=' + S.username;
  }

  function copyReferralLink() {
    var link = getMyReferralLink();
    if (!link) { toast('Register first.', 'error'); return; }
    navigator.clipboard.writeText(link).then(function () {
      toast('Referral link copied.', 'success');
    }).catch(function () {
      // Fallback
      var ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast('Referral link copied.', 'success');
    });
  }

  // ============================================
  // DIRECTORY DRAWER
  // ============================================

  function openDrawer(mode) {
    S.drawerMode = mode;
    $('drawer-overlay').style.display = '';
    $('drawer').style.display = '';

    if (mode === 'directory') {
      $('drawer-title').textContent = 'Directory';
      $('drawer-directory').style.display = '';
      $('drawer-profile').style.display = 'none';
      loadDirectory();
    } else if (mode === 'profile') {
      $('drawer-title').textContent = 'Profile';
      $('drawer-directory').style.display = 'none';
      $('drawer-profile').style.display = '';
    }
  }

  function closeDrawer() {
    $('drawer-overlay').style.display = 'none';
    $('drawer').style.display = 'none';
    S.drawerMode = null;
  }

  function loadDirectory() {
    var list = $('directory-list');

    // Render from cache instantly if available
    if (S.directoryLoaded && S.directoryUsers.length) {
      renderDirectory(S.directoryUsers);
      // Background refresh
      loadDirectoryFresh(true);
      return;
    }

    var dirCache = cacheGet('ping_directory');
    if (dirCache && dirCache.users && dirCache.users.length) {
      S.directoryUsers = dirCache.users;
      S.directoryLoaded = true;
      renderDirectory(dirCache.users);
      // Background refresh
      loadDirectoryFresh(true);
      return;
    }

    list.innerHTML = '<div class="empty-state"><div class="spinner"></div><p>Loading directory...</p></div>';
    loadDirectoryFresh(false);
  }

  function loadDirectoryFresh(silent) {
    // Load users from both v1 and v2 registries
    Promise.all([
      S.readContract.getUserCount().then(function (c) { return Number(c); }).catch(function () { return 0; }),
      S.v2ReadContract.getUserCount().then(function (c) { return Number(c); }).catch(function () { return 0; })
    ]).then(function (counts) {
      var v1Count = counts[0];
      var v2Count = counts[1];
      if (!v1Count && !v2Count) {
        if (!silent) $('directory-list').innerHTML = '<div class="empty-state"><p>No registered users yet.</p></div>';
        return Promise.resolve(null);
      }
      var ps = [];
      var v1Lim = Math.min(v1Count, 200);
      for (var i = 0; i < v1Lim; i++) ps.push(S.readContract.getUserAtIndex(i).catch(function () { return null; }));
      var v2Lim = Math.min(v2Count, 200);
      for (var j = 0; j < v2Lim; j++) ps.push(S.v2ReadContract.getUserAtIndex(j).catch(function () { return null; }));
      return Promise.all(ps);
    }).then(function (addrs) {
      if (!addrs) return;
      // Deduplicate
      var seen = {};
      var unique = addrs.filter(function (a) {
        if (!a) return false;
        var k = a.toLowerCase();
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      });
      var resolves = unique.map(function (a) {
        return Promise.all([getUsernameSafe(a), isAgent(a), getBio(a), getAvatar(a)]).then(function (r) {
          return { address: a, name: r[0], agent: r[1], bio: r[2], avatar: r[3] };
        });
      });
      return Promise.all(resolves);
    }).then(function (users) {
      if (!users) return;
      S.directoryUsers = users;
      S.directoryLoaded = true;
      cacheSet('ping_directory', { ts: Date.now(), users: users });
      saveProfileCache();
      // Re-render only if directory drawer is currently open
      if (S.drawerMode === 'directory') renderDirectory(users);
    }).catch(function () {
      if (!silent) $('directory-list').innerHTML = '<div class="empty-state"><p>Failed to load.</p></div>';
    });
  }

  function renderDirectory(users) {
    var list = $('directory-list');
    list.innerHTML = '';

    users.forEach(function (u) {
      var el = document.createElement('div');
      el.className = 'dir-item';
      var avClass = 'dir-avatar' + (u.agent ? ' is-agent' : '');
      var initial = u.name ? u.name.charAt(0).toUpperCase() : '?';
      var avContent = u.avatar
        ? '<img src="' + escHtml(u.avatar) + '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">'
        : initial;

      el.innerHTML =
        '<div class="' + avClass + '">' + avContent + '</div>' +
        '<div class="dir-info">' +
          '<div class="dir-name">' + escHtml(u.name || truncAddr(u.address)) +
            (u.agent ? ' <span class="badge-agent" style="margin-left:4px">' + agentSvg(8) + '</span>' : '') +
          '</div>' +
          '<div class="dir-addr">' + truncAddr(u.address) + '</div>' +
          (u.bio ? '<div class="dir-bio">' + escHtml(u.bio) + '</div>' : '') +
        '</div>' +
        '<div class="dir-actions">' +
          '<button class="dir-action dir-ping" data-action="message" title="Send Ping!">' +
            '<svg viewBox="0 0 32 32" width="20" height="20" fill="none">' +
              '<circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2"/>' +
              '<circle cx="16" cy="16" r="3" fill="currentColor"/>' +
              '<path d="M16 6v7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
              '<path d="M16 19v7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
              '<path d="M6 16h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
              '<path d="M19 16h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
            '</svg>' +
          '</button>' +
        '</div>';

      el.querySelector('[data-action="message"]').addEventListener('click', function (e) {
        e.stopPropagation();
        if (!S.connected) { toast('Connect wallet first.', 'error'); return; }
        if (!S.username) { toast('Register first.', 'error'); return; }
        closeDrawer();
        openComposeModal(u.name || u.address);
      });

      el.addEventListener('click', function () { openProfile(u.address); });
      list.appendChild(el);
    });
  }

  function filterDirectory(q) {
    if (!q) { renderDirectory(S.directoryUsers); return; }
    q = q.toLowerCase();
    renderDirectory(S.directoryUsers.filter(function (u) {
      return (u.name && u.name.toLowerCase().indexOf(q) !== -1) ||
             u.address.toLowerCase().indexOf(q) !== -1;
    }));
  }

  // ============================================
  // PROFILE DRAWER
  // ============================================

  function openProfile(addr) {
    S.profileTarget = addr;
    openDrawer('profile');

    $('profile-name').textContent = 'Loading...';
    $('profile-addr').textContent = truncAddr(addr);
    $('profile-avatar').textContent = '?';
    $('profile-badge').style.display = 'none';
    $('profile-bio-text').textContent = 'Loading...';
    $('btn-edit-bio').style.display = 'none';
    $('bio-edit-wrap').style.display = 'none';
    $('btn-edit-avatar').style.display = 'none';
    $('avatar-edit-wrap').style.display = 'none';
    $('btn-rep').style.display = 'none';
    $('rep-status').style.display = 'none';
    $('rep-status').textContent = '';
    S.profileAgentId = null;
    $('profile-messages').innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    var isOwnProfile = S.connected && S.address && addr.toLowerCase() === S.address.toLowerCase();

    Promise.all([getUsernameSafe(addr), isAgent(addr), getBio(addr), getAvatar(addr)]).then(function (r) {
      $('profile-name').textContent = r[0] || truncAddr(addr);
      var avatarEl = $('profile-avatar');
      var avatarUrl = r[3];
      if (avatarUrl) {
        avatarEl.innerHTML = '<img src="' + escHtml(avatarUrl) + '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
      } else {
        avatarEl.textContent = r[0] ? r[0].charAt(0).toUpperCase() : '?';
      }
      $('profile-badge').style.display = r[1] ? '' : 'none';
      if (r[1]) {
        avatarEl.style.background = avatarUrl ? 'transparent' : 'var(--gold-muted)';
        avatarEl.style.color = 'var(--gold)';
        // Show reputation button if this is not own profile and wallet is connected
        if (!isOwnProfile && S.connected) {
          resolveAgentId(addr).then(function (agentId) {
            if (agentId !== null) {
              S.profileAgentId = agentId;
              $('btn-rep').style.display = '';
            }
          });
        }
      } else {
        avatarEl.style.background = avatarUrl ? 'transparent' : '';
        avatarEl.style.color = '';
      }
      $('profile-bio-text').textContent = r[2] || 'No bio set.';
      if (isOwnProfile) {
        $('btn-edit-bio').style.display = '';
        $('btn-edit-avatar').style.display = '';
        // Show referral card with link
        var refCard = $('referral-card');
        if (refCard && S.username) {
          refCard.style.display = '';
          $('referral-link-input').value = getMyReferralLink();
        }
        // Show tier badge or claim button
        S.pointsReadContract.getStatus(addr).then(function (r) {
          var num = Number(r[0] || r.number);
          var mult = Number(r[1] || r.multiplier);
          var tierEl = $('profile-tier');
          if (tierEl && num > 0) {
            var label = getTierLabel(mult, addr);
            tierEl.innerHTML = '#' + num + ' ' + label;
            tierEl.style.color = getTierColor(mult, addr);
            tierEl.style.display = '';
          } else if (tierEl) {
            // Not claimed yet. Show claim button.
            tierEl.innerHTML = '<button class="btn-claim-tier" id="btn-claim-tier"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Claim Early Adopter Badge!</button>';
            tierEl.style.display = '';
            tierEl.style.color = '';
            document.getElementById('btn-claim-tier').addEventListener('click', function () {
              this.disabled = true;
              this.textContent = 'Claiming...';
              claimPointsPosition();
            });
          }
        }).catch(function () {});
      } else {
        var refCard2 = $('referral-card');
        if (refCard2) refCard2.style.display = 'none';
        var tierEl2 = $('profile-tier');
        if (tierEl2) tierEl2.style.display = 'none';
      }
    });

    // Load messages for this address — cached + incremental sync
    loadProfileMessages(addr);
  }

  // ---- Profile Message Loading (cached + incremental) ----

  function loadProfileMessages(addr) {
    var cached = loadProfileMsgCache(addr);
    var addrLower = addr.toLowerCase();

    // Priority 1: localStorage cache — render instantly
    if (cached) {
      renderProfileMessages(cached.messages);
      // Lightweight delta sync from cached block
      deltaProfileSync(addr, cached.messages, cached.lastBlock);
      return;
    }

    // Priority 2: cache API messages in memory — filter and render instantly
    if (S.cachedApiMessages) {
      var filtered = S.cachedApiMessages.filter(function (m) {
        return m.from.toLowerCase() === addrLower || m.to.toLowerCase() === addrLower;
      }).map(function (m, i) {
        return { from: m.from, to: m.to, content: m.content || '', block: m.block, tx: m.tx, idx: i };
      });
      filtered.sort(function (a, b) { return b.block - a.block; });
      renderProfileMessages(filtered);
      if (S.cachedApiBlock) {
        saveProfileMsgCache(addr, filtered, S.cachedApiBlock);
        // Delta sync from cache API block to current
        deltaProfileSync(addr, filtered, S.cachedApiBlock);
      }
      return;
    }

    // Priority 3: full RPC scan (only if cache API never loaded)
    fullProfileScan(addr);
  }

  function deltaProfileSync(addr, existingMsgs, fromBlock) {
    var padded = ethers.zeroPadValue(addr, 32);
    var topic0 = ethers.id('MessageSent(address,address,string)');
    withFailover(function () { return S.readProvider.getBlockNumber(); }).then(function (cur) {
      if (cur <= fromBlock) return;
      var from = fromBlock + 1;
      return Promise.all([
        fetchLogsChunked([topic0, padded], from, cur),
        fetchLogsChunked([topic0, null, padded], from, cur),
        fetchV2LogsChunked([topic0, padded], from, cur),
        fetchV2LogsChunked([topic0, null, padded], from, cur)
      ]).then(function (r) {
        var newLogs = parseLogs(r[0].concat(r[1]).concat(r[2]).concat(r[3]));
        if (!newLogs.length) {
          saveProfileMsgCache(addr, existingMsgs, cur);
          return;
        }
        var all = existingMsgs.concat(newLogs);
        var seen = {};
        var unique = [];
        all.forEach(function (m) {
          var key = m.tx + '-' + (m.idx || 0);
          if (!seen[key]) { seen[key] = true; unique.push(m); }
        });
        unique.sort(function (a, b) { return b.block - a.block; });
        saveProfileMsgCache(addr, unique, cur);
        renderProfileMessages(unique);
      });
    }).catch(function () { /* delta failed, existing data still showing */ });
  }

  function fullProfileScan(addr) {
    var padded = ethers.zeroPadValue(addr, 32);
    var topic0 = ethers.id('MessageSent(address,address,string)');
    withFailover(function () { return S.readProvider.getBlockNumber(); }).then(function (cur) {
      return Promise.all([
        fetchLogsChunked([topic0, padded], DEPLOY_BLOCK, cur),
        fetchLogsChunked([topic0, null, padded], DEPLOY_BLOCK, cur),
        fetchV2LogsChunked([topic0, padded], V2_DEPLOY_BLOCK, cur),
        fetchV2LogsChunked([topic0, null, padded], V2_DEPLOY_BLOCK, cur)
      ]).then(function (r) { return { logs: r, blockNum: cur }; });
    }).then(function (result) {
      var logs = parseLogs(result.logs[0].concat(result.logs[1]).concat(result.logs[2]).concat(result.logs[3]));
      var seen = {};
      var unique = [];
      logs.forEach(function (m) {
        var key = m.tx + '-' + m.idx;
        if (!seen[key]) { seen[key] = true; unique.push(m); }
      });
      unique.sort(function (a, b) { return b.block - a.block; });
      saveProfileMsgCache(addr, unique, result.blockNum);
      renderProfileMessages(unique);
    }).catch(function () {
      $('profile-messages').innerHTML = '<div class="empty-state"><p>Failed to load.</p></div>';
    });
  }

  function renderProfileMessages(messages) {
    var area = $('profile-messages');
    if (!messages.length) {
      area.innerHTML = '<div class="empty-state"><p>No messages found.</p></div>';
      return;
    }
    area.innerHTML = '';

    var addrs = [];
    messages.forEach(function (m) {
      [m.from, m.to].forEach(function (a) {
        if (addrs.indexOf(a.toLowerCase()) === -1) addrs.push(a.toLowerCase());
      });
    });

    Promise.all(addrs.map(function (a) {
      return getUsernameSafe(a).then(function (n) { return { addr: a, name: n }; });
    })).then(function (infos) {
      var lookup = {};
      infos.forEach(function (i) { lookup[i.addr] = i.name; });

      area.innerHTML = '';
      messages.forEach(function (m) {
        var fromName = lookup[m.from.toLowerCase()] || truncAddr(m.from);
        var toName = lookup[m.to.toLowerCase()] || truncAddr(m.to);

        var el = document.createElement('div');
        el.className = 'msg-bubble msg-incoming';
        el.style.maxWidth = '100%';
        el.style.alignSelf = 'stretch';
        el.innerHTML =
          '<div style="font-size:0.6875rem;color:var(--text-3);margin-bottom:4px;font-family:var(--font-mono)">' +
            escHtml(fromName) + ' &rarr; ' + escHtml(toName) +
          '</div>' +
          '<div>' + escHtml(m.content) + '</div>' +
          '<div class="msg-meta">' +
            '<span>block ' + m.block.toLocaleString() + '</span>' +
            '<a href="' + BASESCAN + '/tx/' + encodeURIComponent(m.tx) + '" target="_blank" rel="noopener">tx</a>' +
          '</div>';
        area.appendChild(el);
      });
    });
  }

  // ---- Bio Edit ----

  function startBioEdit() {
    $('btn-edit-bio').style.display = 'none';
    $('bio-edit-wrap').style.display = '';
    var currentBio = $('profile-bio-text').textContent;
    if (currentBio === 'No bio set.') currentBio = '';
    $('bio-edit-input').value = currentBio;
    $('bio-char-count').textContent = currentBio.length;
    $('bio-edit-input').focus();
  }

  function cancelBioEdit() {
    $('bio-edit-wrap').style.display = 'none';
    $('btn-edit-bio').style.display = '';
  }

  function saveBio() {
    var bio = $('bio-edit-input').value.trim();
    if (bio.length > 280) { toast('Bio too long (max 280).', 'error'); return; }
    if (!S.contract) { toast('Not connected.', 'error'); return; }

    toast('Saving bio...', '');

    S.v2Contract.setBio(bio).then(function (tx) {
      return tx.wait();
    }).then(function () {
      toast('Bio saved.', 'success');
      S.bioCache[S.address.toLowerCase()] = bio;
      $('profile-bio-text').textContent = bio || 'No bio set.';
      cancelBioEdit();
    }).catch(function (e) {
      var msg = e.message || 'Failed';
      if (msg.includes('user rejected') || msg.includes('User denied')) msg = 'Cancelled.';
      else if (msg.length > 80) msg = msg.substring(0, 80) + '...';
      toast(msg, 'error');
    });
  }

  // ---- Avatar Edit ----

  function startAvatarEdit() {
    $('btn-edit-avatar').style.display = 'none';
    $('avatar-edit-wrap').style.display = '';
    var currentAvatar = S.avatarCache[(S.address || '').toLowerCase()] || '';
    $('avatar-edit-input').value = currentAvatar;
    $('avatar-edit-input').focus();
  }

  function cancelAvatarEdit() {
    $('avatar-edit-wrap').style.display = 'none';
    $('btn-edit-avatar').style.display = '';
  }

  function saveAvatar() {
    var url = $('avatar-edit-input').value.trim();
    if (url.length > 280) { toast('URL too long (max 280).', 'error'); return; }
    if (!S.v2Contract) { toast('Not connected.', 'error'); return; }

    toast('Saving avatar...', '');

    S.v2Contract.setAvatar(url).then(function (tx) {
      return tx.wait();
    }).then(function () {
      toast('Avatar saved.', 'success');
      S.avatarCache[S.address.toLowerCase()] = url;
      var avatarEl = $('profile-avatar');
      if (url) {
        avatarEl.innerHTML = '<img src="' + escHtml(url) + '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
        avatarEl.style.background = 'transparent';
      } else {
        avatarEl.textContent = S.username ? S.username.charAt(0).toUpperCase() : '?';
        avatarEl.style.background = '';
      }
      cancelAvatarEdit();
    }).catch(function (e) {
      var msg = e.message || 'Failed';
      if (msg.includes('user rejected') || msg.includes('User denied')) msg = 'Cancelled.';
      else if (msg.length > 80) msg = msg.substring(0, 80) + '...';
      toast(msg, 'error');
    });
  }

  // ============================================
  // ERC-8004 REPUTATION
  // ============================================

  function resolveAgentId(addr) {
    // Get the ERC-8004 agent ID for an address via Identity Registry
    var registry = new ethers.Contract(ERC8004_REGISTRY, ERC8004_ID_ABI, S.readProvider);
    return registry.tokenOfOwnerByIndex(addr, 0).then(function (id) {
      return Number(id);
    }).catch(function () {
      return null;
    });
  }

  function submitReputationSidebar() {
    if (!S.connected || !S.signer) { toast('Connect wallet first.', 'error'); return; }

    var btn = $('btn-rep-sidebar');
    var status = $('sidebar-rep-status');

    btn.disabled = true;
    btn.textContent = 'Confirming...';
    status.textContent = 'Waiting for wallet approval...';
    status.className = 'sidebar-rep-status';

    var repContract = new ethers.Contract(REPUTATION_REGISTRY, REPUTATION_ABI, S.signer);
    var feedbackNote = 'Positive feedback via Ping App';
    var feedbackHash = ethers.keccak256(ethers.toUtf8Bytes(feedbackNote + '-' + Date.now()));

    repContract.giveFeedback(
      SIBYL_ERC8004_ID, // SIBYL agent ID 20880
      100,       // value (100/100 scale)
      0,         // valueDecimals
      'ping',    // tag1
      'positive', // tag2
      'ping-app', // endpoint
      feedbackNote,
      feedbackHash
    ).then(function (tx) {
      status.textContent = 'Submitted. Confirming...';
      return tx.wait();
    }).then(function () {
      status.textContent = 'Recorded on-chain.';
      status.className = 'sidebar-rep-status is-success';
      btn.textContent = 'Rated';
      btn.disabled = true;
      toast('Reputation feedback recorded on-chain.', 'success');
    }).catch(function (e) {
      var msg = e.message || 'Failed';
      if (msg.includes('user rejected') || msg.includes('User denied')) msg = 'Cancelled.';
      else if (msg.length > 60) msg = msg.substring(0, 60) + '...';
      status.textContent = msg;
      status.className = 'sidebar-rep-status is-error';
      btn.disabled = false;
      btn.textContent = 'Rate SIBYL';
    });
  }

  function submitReputation() {
    if (!S.connected || !S.signer) { toast('Connect wallet first.', 'error'); return; }
    if (!S.profileAgentId) { toast('Agent ID not found.', 'error'); return; }

    var agentId = S.profileAgentId;
    var btn = $('btn-rep');
    var status = $('rep-status');

    btn.disabled = true;
    btn.textContent = 'Confirming...';
    status.style.display = '';
    status.textContent = 'Waiting for wallet approval...';
    status.className = 'rep-status';

    var repContract = new ethers.Contract(REPUTATION_REGISTRY, REPUTATION_ABI, S.signer);
    var feedbackNote = 'Positive feedback via Ping App';
    var feedbackHash = ethers.keccak256(ethers.toUtf8Bytes(feedbackNote + '-' + Date.now()));

    repContract.giveFeedback(
      agentId,   // agentId
      100,       // value (100/100 scale)
      0,         // valueDecimals
      'ping',    // tag1
      'positive', // tag2
      'ping-app', // endpoint
      feedbackNote, // feedbackURI
      feedbackHash  // feedbackHash
    ).then(function (tx) {
      status.textContent = 'Transaction submitted. Waiting for confirmation...';
      return tx.wait();
    }).then(function () {
      status.textContent = 'Reputation submitted on-chain.';
      status.className = 'rep-status rep-status-success';
      btn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>' +
        ' Rated';
      btn.disabled = true;
      toast('Reputation feedback recorded on-chain.', 'success');
    }).catch(function (e) {
      var msg = e.message || 'Failed';
      if (msg.includes('user rejected') || msg.includes('User denied')) {
        msg = 'Cancelled.';
      } else if (msg.includes('self-feedback') || msg.includes('Cannot give feedback to yourself')) {
        msg = 'Cannot rate your own agent.';
      } else if (msg.length > 80) {
        msg = msg.substring(0, 80) + '...';
      }
      status.textContent = msg;
      status.className = 'rep-status rep-status-error';
      btn.disabled = false;
      btn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 9V5a3 3 0 00-6 0v1"/><path d="M18 8H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2z"/><circle cx="12" cy="15" r="1"/></svg>' +
        ' Rate on ERC-8004';
    });
  }

  // ============================================
  // STATS
  // ============================================

  function loadStats() {
    // Check stats cache first for instant render
    var statsCache = cacheGet('ping_stats');
    if (statsCache && (Date.now() - statsCache.ts < STATS_TTL)) {
      $('stat-users').textContent = statsCache.users;
      $('stat-messages').textContent = statsCache.messages;
      // Refresh from cache API in background
      setTimeout(loadStatsFromApi, 1000);
      return;
    }
    loadStatsFromApi();
  }

  // Primary: single fetch from cache API instead of scanning entire chain history
  function loadStatsFromApi() {
    fetch(CACHE_API_URL, { signal: AbortSignal.timeout(8000) })
      .then(function (resp) {
        if (!resp.ok) throw new Error('cache api ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        if (data.stats) {
          $('stat-users').textContent = data.stats.users || 0;
          $('stat-messages').textContent = data.stats.messages || 0;
          cacheSet('ping_stats', { ts: Date.now(), users: data.stats.users || 0, messages: data.stats.messages || 0 });
        }
        // Hydrate caches if not already done by loadFeedFromApi
        if (data.users && data.users.length && !S.directoryLoaded) {
          hydrateFromCacheApi(data);
        }
      })
      .catch(function (err) {
        console.warn('[cache-api] stats fallback to RPC:', err.message);
        loadStatsFreshRpc();
      });
  }

  // Fallback: direct RPC (only when cache API is down)
  function loadStatsFreshRpc() {
    getUserCount().then(function (c) { $('stat-users').textContent = c; S._statUsers = c; }).catch(function () {});
    withFailover(function () { return S.readProvider.getBlockNumber(); }).then(function (cur) {
      var topic0 = ethers.id('MessageSent(address,address,string)');
      var total = 0;
      return fetchLogsChunked([topic0], DEPLOY_BLOCK, cur).then(function (v1Logs) {
        total += v1Logs.length;
        return fetchV2LogsChunked([topic0], V2_DEPLOY_BLOCK, cur);
      }).then(function (v2Logs) {
        total += v2Logs.length;
        $('stat-messages').textContent = total;
        cacheSet('ping_stats', { ts: Date.now(), users: S._statUsers || 0, messages: total });
      });
    }).catch(function () {});
  }

  // ---- Auto-resize textarea ----

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 80) + 'px';
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================

  // Brand logo -> home (but not if clicking the SIBYL link)
  $('brand-home').addEventListener('click', function (e) {
    if (e.target.closest('.brand-by-link')) return;
    e.preventDefault();
    if (S.connected && S.username) {
      showMail();
    } else {
      showView('landing');
    }
  });

  // Connect
  $('btn-connect').addEventListener('click', function (e) {
    if (S.connected) { toggleDropdown(); }
    else { connectWallet(); }
  });
  $('btn-connect-hero').addEventListener('click', connectWallet);

  // Wallet dropdown
  $('wallet-view-profile').addEventListener('click', function () {
    closeDropdown();
    if (S.connected && S.address) openProfile(S.address);
  });
  $('wallet-logout').addEventListener('click', function () {
    disconnectWallet();
  });
  $('wallet-bug-report').addEventListener('click', function () {
    closeDropdown();
    if (!S.connected) { toast('Connect wallet first.', 'error'); return; }
    if (!S.username) { toast('Register first.', 'error'); return; }
    var sibylAddr = '0x4069ef1afC8A9b2a29117A3740fCAB2912499fBe';
    openWindow(sibylAddr, 'SIBYL', true);
    // Pre-fill textarea with bug report prefix after window renders
    setTimeout(function () {
      var key = sibylAddr.toLowerCase();
      var win = S.openWindows[key];
      if (win) {
        var ta = win.el.querySelector('textarea');
        if (ta) {
          ta.value = '[BUG REPORT] ';
          ta.focus();
          var counter = win.el.querySelector('.win-char-count');
          if (counter) counter.textContent = '13/1024';
        }
      }
    }, 100);
  });

  // Close dropdown on outside click
  document.addEventListener('click', function (e) {
    if (S.dropdownOpen && !e.target.closest('.wallet-wrap')) {
      closeDropdown();
    }
  });

  // Register
  $('btn-register').addEventListener('click', registerUser);
  $('input-username').addEventListener('keydown', function (e) { if (e.key === 'Enter') registerUser(); });

  // Sidebar actions
  $('btn-new-message').addEventListener('click', function () {
    if (!S.connected) { toast('Connect wallet first.', 'error'); return; }
    if (!S.username) { toast('Register first.', 'error'); return; }
    openComposeModal();
  });

  $('btn-directory').addEventListener('click', function () {
    openDrawer('directory');
  });

  // Pingcast
  $('btn-pingcast').addEventListener('click', function () {
    if (!S.connected) { toast('Connect wallet first.', 'error'); return; }
    if (!S.username) { toast('Register first.', 'error'); return; }
    openPingcastWindow();
  });

  $('pingcast-modal-close').addEventListener('click', closePingcastModal);
  $('pingcast-modal').addEventListener('click', function (e) {
    if (e.target === $('pingcast-modal')) closePingcastModal();
  });
  $('btn-pingcast-send').addEventListener('click', sendPingcast);
  $('pingcast-body').addEventListener('input', function () {
    var c = this.value.length;
    var el = $('pingcast-char-count');
    el.textContent = c;
    var p = el.parentElement;
    p.className = 'compose-char-count' + (c >= 1024 ? ' limit' : c >= 900 ? ' near' : '');
  });

  // Compose modal
  $('compose-modal-close').addEventListener('click', closeComposeModal);
  $('compose-modal').addEventListener('click', function (e) {
    if (e.target === $('compose-modal')) closeComposeModal();
  });
  $('btn-send').addEventListener('click', sendCompose);

  $('compose-body').addEventListener('input', function () {
    var c = this.value.length;
    var el = $('char-count');
    el.textContent = c;
    var p = el.parentElement;
    p.className = 'compose-char-count' + (c >= 1024 ? ' limit' : c >= 900 ? ' near' : '');
  });

  var rTimeout;
  $('compose-to').addEventListener('input', function () {
    clearTimeout(rTimeout);
    var v = this.value;
    rTimeout = setTimeout(function () { resolveRecipient(v); }, 400);
    // Autocomplete
    showAutocomplete(v);
  });

  $('compose-to').addEventListener('keydown', function (e) {
    var dropdown = $('autocomplete-dropdown');
    if (!dropdown.classList.contains('open')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateAutocomplete(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateAutocomplete(-1);
    } else if (e.key === 'Enter') {
      if (S.acHighlight >= 0 && S.acResults[S.acHighlight]) {
        e.preventDefault();
        selectAutocomplete(S.acHighlight);
      }
    } else if (e.key === 'Escape') {
      hideAutocomplete();
    }
  });

  $('compose-to').addEventListener('blur', function () {
    // Small delay so mousedown on ac-item fires first
    setTimeout(hideAutocomplete, 150);
  });

  // Drawer
  $('drawer-close').addEventListener('click', closeDrawer);
  $('drawer-overlay').addEventListener('click', closeDrawer);

  // Directory search
  $('dir-search').addEventListener('input', function () { filterDirectory(this.value.trim()); });

  // Directory tabs (Users / Referrals)
  document.querySelectorAll('.dir-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.dir-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      var which = tab.getAttribute('data-tab');
      $('directory-list').style.display = which === 'users' ? '' : 'none';
      $('dir-search').style.display = which === 'users' ? '' : 'none';
      var searchWrap = $('dir-search').parentElement;
      if (searchWrap) searchWrap.style.display = which === 'users' ? '' : 'none';
      $('leaderboard-list').style.display = which === 'leaderboard' ? '' : 'none';
      if (which === 'leaderboard') loadLeaderboard();
    });
  });

  // Copy referral link
  if ($('btn-copy-ref')) $('btn-copy-ref').addEventListener('click', copyReferralLink);

  // Sidebar claim banner
  if ($('btn-claim-banner')) $('btn-claim-banner').addEventListener('click', claimFromBanner);

  // Profile actions
  $('btn-profile-message').addEventListener('click', function () {
    if (!S.connected) { toast('Connect wallet first.', 'error'); return; }
    if (!S.username) { toast('Register first.', 'error'); return; }
    if (S.profileTarget) {
      getUsernameSafe(S.profileTarget).then(function (n) {
        closeDrawer();
        openComposeModal(n || S.profileTarget);
      });
    }
  });

  // ERC-8004 Reputation
  $('btn-rep').addEventListener('click', submitReputation);
  $('btn-rep-sidebar').addEventListener('click', submitReputationSidebar);

  // Bio editing
  $('btn-edit-bio').addEventListener('click', startBioEdit);
  $('btn-cancel-bio').addEventListener('click', cancelBioEdit);
  $('btn-save-bio').addEventListener('click', saveBio);
  $('btn-edit-avatar').addEventListener('click', startAvatarEdit);
  $('btn-cancel-avatar').addEventListener('click', cancelAvatarEdit);
  $('btn-save-avatar').addEventListener('click', saveAvatar);
  $('bio-edit-input').addEventListener('input', function () {
    $('bio-char-count').textContent = this.value.length;
  });

  // Wallet events
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', function (accs) {
      if (S.loggedOut) return;
      if (!accs.length) {
        disconnectWallet();
      } else {
        var newAddr = accs[0];
        if (S.address && newAddr.toLowerCase() === S.address.toLowerCase()) return;
        S.address = newAddr;
        S.usernameCache = {};
        S.provider = new ethers.BrowserProvider(window.ethereum);
        S.provider.getSigner().then(function (signer) {
          S.signer = signer;
          S.contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
          S.diamondContract = new ethers.Contract(DIAMOND_ADDRESS, BROADCAST_ABI, signer);
          S.v2Contract = new ethers.Contract(V2_ADDRESS, V2_ABI, signer);
          updateConnectBtn();
          checkRegistration().catch(function () {});
        });
      }
    });
    window.ethereum.on('chainChanged', function () { window.location.reload(); });
  }

  // Contract link
  if (V2_ADDRESS) {
    var link = $('topbar-contract');
    link.href = BASESCAN + '/address/' + V2_ADDRESS;
    link.style.display = '';
    var panelContract = $('wallet-panel-contract');
    if (panelContract) {
      panelContract.href = BASESCAN + '/address/' + V2_ADDRESS;
      panelContract.style.display = '';
    }
  }

  // ============================================
  // MOBILE NAVIGATION
  // ============================================

  function toggleMobileConvos() {
    var overlay = $('mobile-convo-overlay');
    if (overlay.style.display === 'none' || !overlay.style.display) {
      overlay.style.display = '';
      populateMobileConvos();
      $('mobile-tab-inbox').classList.add('active');
    } else {
      overlay.style.display = 'none';
      $('mobile-tab-inbox').classList.remove('active');
    }
  }

  function closeMobileConvos() {
    var overlay = $('mobile-convo-overlay');
    overlay.style.display = 'none';
    $('mobile-tab-inbox').classList.remove('active');
  }

  function populateMobileConvos() {
    var list = $('mobile-convo-list');
    var convos = S.conversations;
    var keys = Object.keys(convos);

    if (!keys.length) {
      list.innerHTML = '<div class="empty-state"><p>No conversations yet. Send a message to get started.</p></div>';
      return;
    }

    keys.sort(function (a, b) {
      var la = convos[a].messages[convos[a].messages.length - 1].block;
      var lb = convos[b].messages[convos[b].messages.length - 1].block;
      return lb - la;
    });

    var resolves = keys.map(function (k) {
      var addr = convos[k].address;
      return Promise.all([getUsernameSafe(addr), isAgent(addr), getAvatar(addr)]).then(function (r) {
        return { key: k, address: addr, name: r[0], agent: r[1], avatar: r[2] };
      });
    });

    Promise.all(resolves).then(function (infos) {
      list.innerHTML = '';
      infos.forEach(function (info) {
        var convo = convos[info.key];
        var last = convo.messages[convo.messages.length - 1];

        var el = document.createElement('div');
        el.className = 'sidebar-convo-item';
        el.style.padding = '14px 16px';
        el.style.minHeight = '48px';

        var avClass = 'sidebar-convo-avatar' + (info.agent ? ' is-agent' : '');
        var initial = info.name ? info.name.charAt(0).toUpperCase() : '?';
        var avContent = info.avatar
          ? '<img src="' + escHtml(info.avatar) + '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">'
          : initial;

        el.innerHTML =
          '<div class="' + avClass + '" style="width:36px;height:36px">' + avContent + '</div>' +
          '<div class="sidebar-convo-body">' +
            '<span class="sidebar-convo-name">' + escHtml(info.name || truncAddr(info.address)) + '</span>' +
            '<span class="sidebar-convo-preview">' + escHtml(last.content.substring(0, 60) + (last.content.length > 60 ? '...' : '')) + '</span>' +
          '</div>' +
          (convo.messages.length > 1 ? '<div class="sidebar-convo-count">' + convo.messages.length + '</div>' : '');

        el.addEventListener('click', function () {
          closeMobileConvos();
          openWindow(info.address, info.name, info.agent);
        });
        list.appendChild(el);
      });
    });
  }

  // Mobile nav tab handlers
  var mobileTabInbox = $('mobile-tab-inbox');
  var mobileTabCompose = $('mobile-tab-compose');
  var mobileTabDirectory = $('mobile-tab-directory');
  var mobileTabPingcast = $('mobile-tab-pingcast');
  var mobileConvoClose = $('mobile-convo-close');

  if (mobileTabInbox) {
    mobileTabInbox.addEventListener('click', function () {
      if (!S.connected) { toast('Connect wallet first.', 'error'); return; }
      if (!S.username) { toast('Register first.', 'error'); return; }
      toggleMobileConvos();
    });
  }

  if (mobileTabCompose) {
    mobileTabCompose.addEventListener('click', function () {
      if (!S.connected) { toast('Connect wallet first.', 'error'); return; }
      if (!S.username) { toast('Register first.', 'error'); return; }
      closeMobileConvos();
      openComposeModal();
    });
  }

  if (mobileTabDirectory) {
    mobileTabDirectory.addEventListener('click', function () {
      closeMobileConvos();
      openDrawer('directory');
    });
  }

  if (mobileTabPingcast) {
    mobileTabPingcast.addEventListener('click', function () {
      if (!S.connected) { toast('Connect wallet first.', 'error'); return; }
      if (!S.username) { toast('Register first.', 'error'); return; }
      closeMobileConvos();
      openPingcastWindow();
    });
  }

  if (mobileConvoClose) {
    mobileConvoClose.addEventListener('click', closeMobileConvos);
  }

  // ---- Mobile keyboard viewport fix ----
  if (window.visualViewport) {
    var _lastKbState = false;
    window.visualViewport.addEventListener('resize', function () {
      var vv = window.visualViewport;
      var viewMail = document.querySelector('.view-mail');
      var mobileNav = $('mobile-nav');
      if (viewMail && window.innerWidth <= 768) {
        // When keyboard is open, visualViewport.height shrinks
        var kbOpen = vv.height < window.innerHeight * 0.75;
        if (kbOpen) {
          // Keyboard open: shrink view to visible area above keyboard, hide bottom nav
          viewMail.style.bottom = (window.innerHeight - vv.height - vv.offsetTop) + 'px';
          if (mobileNav) mobileNav.style.display = 'none';

          // Scroll active conversation to bottom so input stays visible
          if (!_lastKbState) {
            var focused = document.querySelector('.msg-window.focused .win-messages');
            if (focused) {
              setTimeout(function () { focused.scrollTop = focused.scrollHeight; }, 250);
            }
          }
        } else {
          // Keyboard closed: restore bottom nav clearance
          viewMail.style.bottom = '';
          if (mobileNav) mobileNav.style.display = '';
        }
        _lastKbState = kbOpen;
      }
    });
  }

  // ---- Boot ----

  initRead();
  loadStats();
  loadFeed();

  if (window.ethereum) {
    window.ethereum.request({ method: 'eth_accounts' }).then(function (accs) {
      if (S.loggedOut || S.connecting || S.connected) return;
      if (accs && accs.length) {
        S.connecting = true;
        S.provider = new ethers.BrowserProvider(window.ethereum);
        return S.provider.getNetwork().then(function (net) {
          if (Number(net.chainId) !== CHAIN_ID) { S.connecting = false; return; }
          S.address = accs[0];
          S.connected = true;
          S.connecting = false;
          return S.provider.getSigner().then(function (signer) {
            S.signer = signer;
            S.contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
            S.diamondContract = new ethers.Contract(DIAMOND_ADDRESS, BROADCAST_ABI, signer);
            S.v2Contract = new ethers.Contract(V2_ADDRESS, V2_ABI, signer);
            updateConnectBtn();
            return S.v2Contract.messageFee().then(function (fee) {
              S.messageFee = fee;
            }).then(function () {
              return checkRegistration();
            });
          });
        });
      }
    }).catch(function () { S.connecting = false; });
  }

  // ---- Landing copy button ----
  var copyBtn = document.getElementById('landing-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var cmd = document.getElementById('landing-cmd');
      if (cmd) {
        navigator.clipboard.writeText(cmd.textContent).then(function () {
          copyBtn.textContent = 'copied';
          setTimeout(function () { copyBtn.textContent = 'copy'; }, 1500);
        });
      }
    });
  }

})();
