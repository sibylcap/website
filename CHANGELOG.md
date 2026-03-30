# Website & x402 Changelog

All notable changes to sibylcap.com and x402 paid endpoints.

---

## 2026-03-16

### Presale Restructure
- **Allocation**: SIBYL 35% → 25%, Presale 52.5% → 62.5%. SIBYL contributes ~$1K, presale gets the lowest possible entry price.
- **Entry FDV**: $55,295 → $51,204 (live, tracks VIRTUAL price via VIRTUAL-denominated constants).
- **Graduation FDV**: $276,090 → $304,000. VIRTUAL price updated from $0.719 to $0.76.
- **Multiples**: floor 5x → 5.9x, liquid at TGE 2.5x → 3.0x. Both now update dynamically with VIRTUAL price.
- **Vesting**: SVG and PDF corrected from 6 months to 90 days (contract was already updated 2026-03-15).
- **Price scenarios**: all four deposit rows recalculated against new FDV.
- **Presale page**: updated terms grid, FDV constants (ENTRY_FDV_VIRTUAL=67373, GRAD_FDV_VIRTUAL=400000), TARGET_VIRTUAL=42108, liquid mult now dynamic.

### PDF Access Control
- **Edge middleware** (`middleware.js`): blocks direct access to presale PDF/SVG. Requires `?t=sibyl2026` query param. Presale page passes token automatically via blob fetch.
- **Randomized path**: PDF/SVG moved from `_sp_terms.*` to randomized filename. Old URLs return 404.

### Memory Architecture Visualization
- **`/images/memory-tree.png`**: full memory architecture diagram (SVG → PNG, 2400x2800). Shows all 5 tiers (HOT/WARM/COLD/FROZEN/RUNTIME), session flow, rules.
- **Homepage**: animated constellation icon in hero section (right side, pulsing, floating nodes). Click opens memory diagram in modal with scale-up animation.
- **`/mind` page**: Memory Architecture section added before bottom CTA. Animated brain icon trigger with rotating rings, floating nodes, pulsing core. Click expands into full diagram modal.

### Homepage Updates
- **Watchlist**: removed stale entries (Sigil dead, AHM Protocol never acquired). Added: OpenPaw/PawHub, ProfitPilot, Nookplot, ThoughtProof AI, OriginDAO. Agent Swarm updated to note team inactivity.
- **Ping install**: corrected to `npm install ping-onchain viem` (was old curl-based skill install).
- **Chat widget**: built but removed pending Telegram integration (Vercel Hobby 12-function limit).

---

## 2026-03-09

### `/api/ping-cache` Rewrite: Capability-Aware RPC Router
- **Root cause**: `eth_getLogs` was silently returning empty results. RPCs have undocumented block range limits (Alchemy: 10 blocks, Tatum: 100, mainnet.base.org: 10K, drpc: 10K). The API tried these providers first, they returned JSON-RPC errors, the code silently swallowed them, and the response contained empty `recent_messages` / `recent_broadcasts`. The frontend got nothing to render.
- **Provider registry**: each RPC now declares `maxLogRange`, `batchLimit`, and `timeout`. Seven providers registered with tested limits. Tenderly and publicnode support unlimited block ranges. Others have hard limits.
- **Smart `getLogs` routing**: calculates required block range, skips providers whose `maxLogRange` is too small. Tries each capable provider with 2 attempts. Falls back to 2K-block chunking (where each chunk also tries every capable provider) only if all full-range providers fail.
- **`batchCall` failover**: sequential provider failover for `eth_call` batches. 50-item chunks. Rejects any batch containing RPC errors.
- **Removed**: baseline/gap counting system (replaced by full-history scan — dataset is ~120 logs, Tenderly handles in single call), `getLogsChunked` (replaced by `getLogs` with smart routing), stateful health tracking (useless on stateless Vercel).
- **Result**: 5/5 consecutive calls return identical data (25 users, 115 messages, 4 broadcasts). Previously returned 0-32 messages depending on which RPC responded. Vercel edge cache (60s/120s stale-while-revalidate) means most requests are instant.

---

## 2026-03-08

### Free Pingcast from Referrals
- **`/api/pingcast` referral credits**: add `&address=0x...` to use free credits instead of x402 payment. Verifies registered username matches `name` param. Checks `referralCount` on PingReferrals contract (`0x0f1a7dcb6409149721f0c187e01d0107b2dd94e0`). Credit tiers: 1st referral = 1 free, +1 per 10 additional (11, 21, 31...). Used credits counted from broadcast logs tagged `[ref|Username]`. Returns 402 with credit status when exhausted.
- **`executeBroadcast` helper**: extracted shared broadcast execution from paid flow. Used by both free and paid paths.
- **Anti-impersonation bypass**: registered users providing their address skip the name-block check (they ARE registered, that's the point).

### Ping Dashboard v2 Fix
- **`/api/ping-stats` v2 support**: Phase 1 fetches `getUserCount` from both v1 and v2 + `getTotalUserCount` from v2. Phase 2 fetches user addresses from both contracts with dedup. Phase 3 resolves usernames via v2 `getUsername`. Phase 4 counts message logs from both v1 and v2 in parallel. Fixed: 20 users → 24 users, 87 messages → 114 messages.

### Presale Portal
- **sibylcap.com/presale**: private presale deposit portal. password-gated (`ServeSibyl2026`). live escrow balance tracking via direct RPC reads (VIRTUAL, USDC, ETH). progress bar against ~43,424 VIRTUAL raise target. terms grid (Entry FDV, Graduation FDV, floor multiple, vesting). PDF modal viewer. one-click escrow address copy. BaseScan link. 30s auto-refresh. `noindex, nofollow`.
- **Escrow wallet**: `0xc022B8b4a1e1b69A7eb432Fc696C37Ffc5A2D915`. key stored as `ESCROW_PRIVATE_KEY` in Doppler. isolated from all operations.
- **PDF/SVG protection**: presale terms files renamed to non-guessable paths (`_sp_terms.pdf/svg`). old public URLs (`sibyl-presale.pdf/svg`) return 404. PDF loaded as JS blob after auth so real URL never appears in DOM.

### Security
- **X-Frame-Options**: changed global policy from `DENY` to `SAMEORIGIN` to allow PDF iframe modal on presale page while still blocking external framing.
- **CSP update**: added `blob:` to `frame-src` for blob-based PDF loading. added `https://mainnet.base.org` to `connect-src` for client-side RPC reads. added `frame-src` directive.

---

## 2026-03-07

### Docs
- **Ping docs overhaul**: updated contract section (V2 primary, Diamond, V1 legacy). added V2 contract address to nav. added Bios & Avatars section (setAvatar/getAvatar). updated SDK API table with avatar methods. updated "For Humans" section (new UI: compose, wallet menu, directory, mobile). added Bug Reports section (app + SDK). added Rate SIBYL (ERC-8004) section with contract call example. fixed raw viem section to use V2 ABI.

---

## 2026-03-06

### Endpoints
- **All 13 endpoint fixes deployed to Vercel**: decimal-aware supply, tighter SHIP_RE, check safe=low, AI category split, tweet corpus, description param, GitHub weight reduction, fee buffer, treasury.json integration, price caching, tx age tightening, nonce checks.
- **/api/report deprecated**: duplicate scoring engine drifted from evaluate.js. announced via tweet 2029459990268826028.
- **x402 Bazaar format updated**: x402Version 2, bazaar extension key with info/schema structure, HTTP method-aware input format.

### Dashboard
- **Ping protocol stats** added to dashboard: revenue, fees, message volume, user growth.

---

## 2026-03-05

### Endpoint Audit (13 fixes, local only until 03-06 deploy)
- **/api/score**: decimal-aware supply parsing, tighter SHIP_RE regex.
- **/api/check**: safe rating changed to "low" (honest about limitations). flagged for full rebuild.
- **/api/evaluate**: AI category split (ai_infra/ai_agents/ai_general), tweet corpus search, description param, GitHub weight 25→15.
- **/api/advisory**: same fixes as evaluate plus advisory narrative improvements.
- **/api/builder**: GitHub weight reduced. Events API data unreliable.
- **/api/narrative**: thin data acknowledged. needs narrative-cache infra.
- **/api/fund**: fee buffer for relay wallet gas.
- **/api/portfolio**: treasury.json integration, price caching.
- **/api/pingcast**: demo mode 500 bug identified (not yet fixed). fee-jump abort issue.
- **_x402.js**: nonce replay protection, tx age tightening.

---

## 2026-03-03

### Features
- **x402 payment interface**: sibylcap.com/x402. 9 service cards with free demo, USDC direct transfer, and x402 auto-pay modes. SVG-first output rendering with score rings and progress bars.
- **Direct USDC transfer flow**: replaced EIP-712 + facilitator with on-chain USDC.transfer(). Backend verifies via tx receipt (Transfer event, amount check, 5-min recency, replay protection).
- **Dashboard built**: sibylcap.com/dashboard. DASHBOARD_KEY auth. Ping protocol stats API.

### Endpoints
- **/api/pingcast**: dynamic pricing (on-chain fee + Chainlink ETH/USD, 2x margin, $2 floor).

---

## 2026-03-02

### Features
- **Skill tree**: sibylcap.com/mind. Interactive RPG-style hex grid: 18 nodes, click-to-expand rich content.

---

## 2026-03-01

### Features
- **Try Ping banner**: added to homepage between hero and thesis sections.
- **Ping docs**: added ETH On-Ramp section, animated Try Ping CTA button.

### Endpoints
- **/api/fund**: x402-powered ETH on-ramp for Ping. $1 USDC = 0.001 ETH via relay wallet.

---

## 2026-02-28

### Infrastructure
- **x402 facilitator**: switched to pay.openfacilitator.io (Base mainnet confirmed working).
- **Bazaar discovery extensions**: deployed to all 6 x402 endpoints.
- **dotenv removal**: v17.3.1 stdout pollution broke MCP servers. Removed from all servers.

---

## 2026-02-27

### Endpoints
- **/api/score**: token health scoring ($0.25). liquidity, activity, maturity, contract, momentum.
- **/api/check**: safety check ($0.10). honeypot detection, liquidity verification.
- **/api/evaluate**: project evaluation ($0.25). builder conviction, community, on-chain proof.
- **/api/advisory**: strategic advisory ($0.50). evaluate + narrative positioning.
- **/api/builder**: builder value score ($0.25). X activity, GitHub, market position.
- **/api/narrative**: Base chain narrative landscape ($0.10).
- **ERC-8004 registration**: agent ID 20880, 8004.json deployed.

### Website
- **sibylcap.com launched**: Syne font, text-only hero, portfolio API, live treasury data.
- **Custom domain connected** via Vercel.
