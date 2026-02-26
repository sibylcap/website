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
    var revealElements = document.querySelectorAll('.reveal');
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    // If reduced motion or no IO support, show everything
    var allReveal = document.querySelectorAll('.reveal');
    allReveal.forEach(function (el) {
      el.classList.add('visible');
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

})();
