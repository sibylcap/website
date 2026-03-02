/* ============================================
   SIBYL : script.js
   Scroll reveals, nav scroll, clipboard
   ============================================ */

(function () {
  'use strict';

  // Respect reduced motion preference
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------
     Scroll Reveal via IntersectionObserver
     ------------------------------------------ */
  if (!prefersReduced && 'IntersectionObserver' in window) {
    var revealElements = document.querySelectorAll('.reveal, .reveal-stagger');
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -30px 0px'
    });

    revealElements.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    // If reduced motion or no IO support, show everything
    var allReveal = document.querySelectorAll('.reveal, .reveal-stagger');
    allReveal.forEach(function (el) {
      el.classList.add('visible');
    });
  }

  /* ------------------------------------------
     Parallax on background images
     ------------------------------------------ */
  if (!prefersReduced) {
    var parallaxSections = [
      { el: document.querySelector('.hero'), speed: 0.25 },
      { el: document.querySelector('.process'), speed: 0.15 },
      { el: document.querySelector('.record'), speed: 0.15 },
      { el: document.querySelector('.mind-hero'), speed: 0.2 },
      { el: document.querySelector('.mind-advisory'), speed: 0.15 },
      { el: document.querySelector('.mind-infra'), speed: 0.15 }
    ];

    var ticking = false;
    function updateParallax() {
      var scrollY = window.scrollY;
      parallaxSections.forEach(function (s) {
        if (!s.el) return;
        var before = s.el.querySelector(':scope > *');
        if (!before) return;
        var rect = s.el.getBoundingClientRect();
        var offset = rect.top + scrollY;
        var shift = (scrollY - offset) * s.speed;
        s.el.style.setProperty('--parallax-y', shift + 'px');
      });
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }, { passive: true });
  }

  /* ------------------------------------------
     Treasury count-up animation
     ------------------------------------------ */
  if (!prefersReduced && 'IntersectionObserver' in window) {
    var treasuryGrid = document.querySelector('.treasury-grid');
    var countUpDone = false;

    if (treasuryGrid) {
      var countObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !countUpDone) {
            countUpDone = true;
            countObserver.unobserve(entry.target);
            // Wait for portfolio data to load, then animate
            var checkData = setInterval(function () {
              var el = document.getElementById('t-total');
              if (el && el.textContent !== '...' && el.textContent !== '--') {
                clearInterval(checkData);
                animateTreasuryValues();
              }
            }, 200);
            // Stop checking after 8s
            setTimeout(function () { clearInterval(checkData); }, 8000);
          }
        });
      }, { threshold: 0.3 });

      countObserver.observe(treasuryGrid);
    }
  }

  function animateTreasuryValues() {
    var ids = ['t-total', 't-deployable', 't-reserve'];
    ids.forEach(function (id, i) {
      var el = document.getElementById(id);
      if (!el) return;
      var text = el.textContent;
      var target = parseFloat(text.replace(/[$,]/g, ''));
      if (isNaN(target)) return;

      var duration = 1200;
      var delay = i * 150;
      var start = null;

      el.textContent = '$0';

      setTimeout(function () {
        requestAnimationFrame(function step(ts) {
          if (!start) start = ts;
          var progress = Math.min((ts - start) / duration, 1);
          // Ease out cubic
          var eased = 1 - Math.pow(1 - progress, 3);
          var current = target * eased;

          if (current >= 1000) {
            el.textContent = '$' + Math.round(current).toLocaleString('en-US');
          } else {
            el.textContent = '$' + current.toFixed(2);
          }

          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            // Snap to final formatted value
            if (target >= 1000) {
              el.textContent = '$' + Math.round(target).toLocaleString('en-US');
            } else {
              el.textContent = '$' + target.toFixed(2);
            }
          }
        });
      }, delay);
    });
  }

  /* ------------------------------------------
     Nav scroll state
     ------------------------------------------ */
  var nav = document.getElementById('nav');
  var scrollThreshold = 60;

  function updateNav() {
    if (window.scrollY > scrollThreshold) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();

  /* ------------------------------------------
     Copy wallet address
     ------------------------------------------ */
  var walletBtn = document.getElementById('wallet-copy');
  if (walletBtn) {
    var address = walletBtn.getAttribute('data-address') || walletBtn.querySelector('code').textContent.trim();
    var copyLabel = walletBtn.querySelector('.copy-label');

    function handleCopy() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(address).then(function () {
          showCopied();
        });
      } else {
        // Fallback for older browsers
        var textarea = document.createElement('textarea');
        textarea.value = address;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showCopied();
      }
    }

    function showCopied() {
      copyLabel.textContent = 'copied';
      walletBtn.classList.add('copied');
      setTimeout(function () {
        copyLabel.textContent = 'copy';
        walletBtn.classList.remove('copied');
      }, 2000);
    }

    walletBtn.addEventListener('click', handleCopy);
    walletBtn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCopy();
      }
    });
  }

  /* ------------------------------------------
     Copy email address
     ------------------------------------------ */
  var emailBtn = document.getElementById('email-copy');
  if (emailBtn) {
    var emailAddr = emailBtn.getAttribute('data-email');
    var emailCopyLabel = emailBtn.querySelector('.copy-label');

    function handleEmailCopy() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(emailAddr).then(function () {
          showEmailCopied();
        });
      } else {
        var textarea = document.createElement('textarea');
        textarea.value = emailAddr;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showEmailCopied();
      }
    }

    function showEmailCopied() {
      emailCopyLabel.textContent = 'copied';
      emailBtn.classList.add('copied');
      setTimeout(function () {
        emailCopyLabel.textContent = 'copy';
        emailBtn.classList.remove('copied');
      }, 2000);
    }

    emailBtn.addEventListener('click', handleEmailCopy);
    emailBtn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleEmailCopy();
      }
    });
  }

  /* ------------------------------------------
     Smooth scroll for anchor links
     ------------------------------------------ */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({
          behavior: prefersReduced ? 'auto' : 'smooth',
          block: 'start'
        });
      }
    });
  });

  /* ------------------------------------------
     Live portfolio data
     ------------------------------------------ */
  function formatUsd(n) {
    if (n >= 1000) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (n >= 1) return '$' + n.toFixed(2);
    return '$' + n.toFixed(2);
  }

  function loadPortfolio() {
    fetch('/api/portfolio')
      .then(function (resp) { return resp.json(); })
      .then(function (data) {
        if (data.error) return;

        // Treasury stats
        var tTotal = document.getElementById('t-total');
        var tDeployable = document.getElementById('t-deployable');
        var tReserve = document.getElementById('t-reserve');
        var tPositions = document.getElementById('t-positions');

        if (tTotal) tTotal.textContent = formatUsd(data.treasury.total_usd);
        if (tDeployable) tDeployable.textContent = formatUsd(data.treasury.deployable_usd);
        if (tReserve) tReserve.textContent = formatUsd(data.treasury.reserve_usd);
        if (tPositions) tPositions.textContent = data.treasury.positions;

        // Holdings table
        var tbody = document.getElementById('holdings-body');
        if (tbody && data.holdings && data.holdings.length > 0) {
          tbody.innerHTML = '';
          data.holdings.forEach(function (h) {
            var pnlClass = h.pnl_pct >= 0 ? 'pnl-positive' : 'pnl-negative';
            var pnlSign = h.pnl_pct >= 0 ? '+' : '';
            var tr = document.createElement('tr');
            var cells = [
              { text: String(h.token || ''), cls: '' },
              { text: '$' + h.entry_size, cls: 'secondary' },
              { text: formatUsd(h.value_usd), cls: '' },
              { text: pnlSign + h.pnl_pct + '%', cls: pnlClass },
              { text: String(h.status || ''), cls: 'status-' + (h.status || '') }
            ];
            cells.forEach(function (c) {
              var td = document.createElement('td');
              td.textContent = c.text;
              if (c.cls) td.className = c.cls;
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          });
        }
      })
      .catch(function () {
        // Fail silently: show dashes
        var fields = ['t-total', 't-deployable', 't-reserve', 't-positions'];
        fields.forEach(function (id) {
          var el = document.getElementById(id);
          if (el && el.textContent === '...') el.textContent = '--';
        });
      });
  }

  loadPortfolio();

  /* ------------------------------------------
     Form submission handler
     ------------------------------------------ */
  var API_URL = '/api/submit';
  var formLoadTime = Date.now();

  function showStatus(el, message, type) {
    el.textContent = message;
    el.className = 'form-status ' + type;
    setTimeout(function () {
      el.textContent = '';
      el.className = 'form-status';
    }, 4000);
  }

  function submitForm(type, data, statusEl, resetFn) {
    var hp = '';
    var hpField = document.querySelector('input[name="_hp"]');
    if (hpField) hp = hpField.value;

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: type,
        data: data,
        _hp: hp,
        _t: formLoadTime
      })
    })
    .then(function (resp) {
      if (resp.ok) {
        showStatus(statusEl, 'received.', 'success');
        if (resetFn) resetFn();
      } else {
        showStatus(statusEl, 'something went wrong.', 'error');
      }
    })
    .catch(function () {
      showStatus(statusEl, 'network error.', 'error');
    });
  }

  // Pitch form
  var pitchForm = document.getElementById('pitch-form');
  if (pitchForm) {
    pitchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = pitchForm.querySelector('.form-submit');
      btn.disabled = true;
      btn.textContent = 'sending...';

      submitForm('pitch', {
        project: document.getElementById('pitch-project').value.trim(),
        handle: document.getElementById('pitch-handle').value.trim(),
        description: document.getElementById('pitch-desc').value.trim(),
        contract: document.getElementById('pitch-contract').value.trim()
      }, document.getElementById('pitch-status'), function () {
        pitchForm.reset();
        btn.disabled = false;
        btn.textContent = 'submit pitch';
      });

      setTimeout(function () {
        btn.disabled = false;
        btn.textContent = 'submit pitch';
      }, 5000);
    });
  }

  // Suggest form
  var suggestForm = document.getElementById('suggest-form');
  if (suggestForm) {
    suggestForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = suggestForm.querySelector('.form-submit');
      btn.disabled = true;
      btn.textContent = 'sending...';

      submitForm('suggest', {
        project: document.getElementById('suggest-project').value.trim(),
        handle: document.getElementById('suggest-handle').value.trim(),
        why: document.getElementById('suggest-why').value.trim()
      }, document.getElementById('suggest-status'), function () {
        suggestForm.reset();
        btn.disabled = false;
        btn.textContent = 'submit';
      });

      setTimeout(function () {
        btn.disabled = false;
        btn.textContent = 'submit';
      }, 5000);
    });
  }

  // Signal buttons
  var signalBtns = document.querySelectorAll('.signal-btn');
  var signaled = JSON.parse(localStorage.getItem('sibyl_signals') || '{}');

  signalBtns.forEach(function (btn) {
    var project = btn.getAttribute('data-project');

    // Restore previous signals from localStorage
    if (signaled[project]) {
      btn.classList.add('signaled');
      btn.querySelector('.signal-label').textContent = 'signaled';
    }

    btn.addEventListener('click', function () {
      if (signaled[project]) return;

      signaled[project] = Date.now();
      localStorage.setItem('sibyl_signals', JSON.stringify(signaled));
      btn.classList.add('signaled');
      btn.querySelector('.signal-label').textContent = 'signaled';

      submitForm('signal', {
        project: project
      }, document.getElementById('signal-status'), null);
    });
  });

  /* ------------------------------------------
     Skill Tree (Mind v2)
     ------------------------------------------ */
  var skillTree = document.getElementById('skill-tree');
  if (skillTree) {
    // Node metadata (condensed: category-level leaves, rich detail panels)
    var SKILL_TREE_DATA = {
      core:             { title: 'SIBYL Core',          status: 'unlocked', parent: null },
      intel:            { title: 'Intelligence',        status: 'unlocked', parent: 'core' },
      'x402-endpoints': { title: 'x402 Endpoints',      status: 'unlocked', parent: 'intel' },
      advisory:         { title: 'Advisory Framework',   status: 'unlocked', parent: 'core' },
      criteria:         { title: 'Evaluation Criteria',  status: 'unlocked', parent: 'advisory' },
      engagement:       { title: 'Engagement Model',     status: 'unlocked', parent: 'advisory' },
      dealflow:         { title: 'Deal Flow',            status: 'unlocked', parent: 'core' },
      pipeline:         { title: 'Pipeline',             status: 'unlocked', parent: 'dealflow' },
      capital:          { title: 'Capital Rules',        status: 'unlocked', parent: 'dealflow' },
      verify:           { title: 'Identity',             status: 'unlocked', parent: 'core' },
      'verify-8004':    { title: 'ERC-8004',              status: 'unlocked', parent: 'verify' },
      'verify-exo':     { title: 'Exoskeleton #53',       status: 'unlocked', parent: 'verify' },
      'verify-helixa':  { title: 'Helixa #1037',          status: 'unlocked', parent: 'verify' },
      infra:            { title: 'Infrastructure',       status: 'unlocked', parent: 'core' },
      tooling:          { title: 'Tooling',              status: 'unlocked', parent: 'infra' },
      'mcp-servers':    { title: 'MCP Servers',          status: 'unlocked', parent: 'infra' },
      'data-sources':   { title: 'Data Sources',         status: 'unlocked', parent: 'infra' },
      defi:             { title: 'DeFi',                 status: 'unlocked', parent: 'core' },
      'defi-lending':   { title: 'Lending',              status: 'unlocked', parent: 'defi' },
      'defi-trading':   { title: 'Trading',              status: 'unlocked', parent: 'defi' },
      ping:             { title: 'Ping App',              status: 'unlocked', parent: 'core' },
      'ping-arch':      { title: 'Architecture',         status: 'unlocked', parent: 'ping' },
      'ping-x402':      { title: 'x402 Services',        status: 'unlocked', parent: 'ping' },
      community:        { title: 'Community',            status: 'unlocked', parent: 'core' },
      participation:    { title: 'Participation',        status: 'unlocked', parent: 'community' },
      'sibyl-token':    { title: '$SIBYL Token',         status: 'coming',   parent: 'community' }
    };

    var svgEl = document.getElementById('skill-tree-lines');
    var overlay = document.getElementById('st-overlay');
    var detailPanel = document.getElementById('st-detail');
    var detailTitle = document.getElementById('st-detail-title');
    var detailStatus = document.getElementById('st-detail-status');
    var detailBody = document.getElementById('st-detail-body');
    var detailClose = detailPanel ? detailPanel.querySelector('.st-detail-close') : null;
    var activeNodeId = null;
    var isMobile = window.innerWidth <= 768;

    // --- SVG Connection Lines ---
    function getNodeCenter(nodeEl) {
      var rect = nodeEl.getBoundingClientRect();
      var containerRect = svgEl.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top + rect.height / 2 - containerRect.top
      };
    }

    function drawTreeLines() {
      if (!svgEl || isMobile) return;
      svgEl.innerHTML = '';
      svgEl.setAttribute('width', svgEl.parentElement.offsetWidth);
      svgEl.setAttribute('height', svgEl.parentElement.offsetHeight);

      // Draw lines from core to branches and branches to leaves
      var connections = [];
      Object.keys(SKILL_TREE_DATA).forEach(function (id) {
        var data = SKILL_TREE_DATA[id];
        if (data.parent) {
          connections.push({ from: data.parent, to: id, status: data.status });
        }
      });

      connections.forEach(function (conn) {
        var fromEl = skillTree.querySelector('[data-node="' + conn.from + '"]');
        var toEl = skillTree.querySelector('[data-node="' + conn.to + '"]');
        if (!fromEl || !toEl) return;

        var from = getNodeCenter(fromEl);
        var to = getNodeCenter(toEl);

        var dx = to.x - from.x;
        var dy = to.y - from.y;
        var cp1x = from.x + dx * 0.2;
        var cp1y = from.y + dy * 0.6;
        var cp2x = from.x + dx * 0.8;
        var cp2y = from.y + dy * 0.4;

        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        var d = 'M ' + from.x + ' ' + from.y +
                ' C ' + cp1x + ' ' + cp1y +
                ', ' + cp2x + ' ' + cp2y +
                ', ' + to.x + ' ' + to.y;
        path.setAttribute('d', d);

        if (conn.status === 'coming') {
          path.classList.add('st-line--coming');
        }

        // Animate: stroke-dashoffset draw-in
        var length = path.getTotalLength ? path.getTotalLength() : 200;
        path.style.strokeDasharray = length;
        path.style.strokeDashoffset = length;
        path.style.transition = 'stroke-dashoffset 0.8s ease';

        svgEl.appendChild(path);

        // Trigger draw after a frame
        requestAnimationFrame(function () {
          path.style.strokeDashoffset = '0';
          if (conn.status === 'coming') {
            // After draw-in completes, switch to dashed animation
            setTimeout(function () {
              path.style.strokeDasharray = '6 4';
              path.style.strokeDashoffset = '';
              path.style.transition = '';
            }, 850);
          }
        });
      });
    }

    // Debounced resize
    var resizeTimer;
    window.addEventListener('resize', function () {
      var wasMobile = isMobile;
      isMobile = window.innerWidth <= 768;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (!isMobile) drawTreeLines();
        else if (svgEl) svgEl.innerHTML = '';
      }, 150);
    });

    // --- Detail Panel ---
    function openDetail(nodeId) {
      var data = SKILL_TREE_DATA[nodeId];
      if (!data) return;

      // Content from hidden store
      var contentEl = document.querySelector('[data-tree-content="' + nodeId + '"]');
      if (!contentEl) return;

      // Update active state
      if (activeNodeId) {
        var prevNode = skillTree.querySelector('[data-node="' + activeNodeId + '"]');
        if (prevNode) prevNode.classList.remove('st-active');
      }

      var currentNode = skillTree.querySelector('[data-node="' + nodeId + '"]');
      if (currentNode) currentNode.classList.add('st-active');
      activeNodeId = nodeId;

      // Populate panel
      detailTitle.textContent = data.title;
      detailStatus.textContent = data.status === 'coming' ? 'building' : data.status;
      detailStatus.className = 'st-detail-status' + (data.status === 'coming' ? ' st-status--coming' : '');
      detailBody.innerHTML = contentEl.innerHTML;

      // Open
      overlay.classList.add('st-open');
      detailPanel.classList.add('st-open');
      detailPanel.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeDetail() {
      overlay.classList.remove('st-open');
      detailPanel.classList.remove('st-open');
      detailPanel.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';

      if (activeNodeId) {
        var prevNode = skillTree.querySelector('[data-node="' + activeNodeId + '"]');
        if (prevNode) prevNode.classList.remove('st-active');
        activeNodeId = null;
      }
    }

    // Close handlers
    if (overlay) overlay.addEventListener('click', closeDetail);
    if (detailClose) detailClose.addEventListener('click', closeDetail);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && activeNodeId) closeDetail();
    });

    // --- Node click handlers ---
    var allNodes = skillTree.querySelectorAll('.st-node');
    allNodes.forEach(function (node) {
      node.addEventListener('click', function (e) {
        var nodeId = this.getAttribute('data-node');
        var data = SKILL_TREE_DATA[nodeId];
        if (!data) return;

        // Locked nodes do nothing
        if (data.status === 'locked') return;

        // On mobile, branch nodes toggle their leaves (accordion)
        if (isMobile && this.classList.contains('st-node--branch')) {
          var branch = this.closest('.st-branch');
          if (branch) {
            branch.classList.toggle('st-expanded');
          }
          // Still open detail for branch
        }

        openDetail(nodeId);
      });

      // Keyboard: Enter or Space activates
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.click();
        }
      });
    });

    // --- Scroll-triggered entrance animation ---
    if (!prefersReduced && 'IntersectionObserver' in window) {
      var treeObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            skillTree.classList.add('st-tree-visible');
            treeObserver.unobserve(entry.target);
            // Draw SVG lines after nodes animate in
            setTimeout(function () {
              if (!isMobile) drawTreeLines();
            }, 500);
          }
        });
      }, { threshold: 0.1 });

      treeObserver.observe(skillTree);
    } else {
      // No animation, show immediately
      skillTree.classList.add('st-tree-visible');
      allNodes.forEach(function (n) { n.style.opacity = '1'; });
      if (!isMobile) {
        setTimeout(drawTreeLines, 100);
      }
    }
  }

})();
