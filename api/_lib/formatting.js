/* Shared formatting utilities for SIBYL x402 endpoints */

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

function fmtPrice(n) {
  if (n === 0) return '0.00';
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  if (n >= 0.000001) return n.toFixed(8).replace(/0+$/, '');
  return n.toExponential(2);
}

function s(n) { return n >= 0 ? '+' + n.toFixed(1) : n.toFixed(1); }

function r1(n) { return Math.round(n * 10) / 10; }

function round(n, d) {
  var f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

module.exports = {
  fmt: fmt,
  fmtSupply: fmtSupply,
  fmtPrice: fmtPrice,
  s: s,
  r1: r1,
  round: round
};
