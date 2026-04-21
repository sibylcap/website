# Website & x402 Changelog

All notable changes to sibylcap.com and x402 paid endpoints.

---

## 2026-04-21

### Security — p71 Track A: x402 Gate Hardening
Closes p71 Track A. Three live security bugs in the x402 payment rails, plus a demo rate-limiter spoof vector.

- **Replay protection moved off in-memory Sets to Neon Postgres** (`api/_replay.js`). `usedTxHashes` + `usedNonces` previously reset on Vercel Lambda cold starts, so attackers crossing a cold start could double-spend a single USDC tx across multiple paid endpoints. Now atomic `INSERT ON CONFLICT DO NOTHING` on `x402_used_payments` (tx_hash PK) + `x402_used_nonces` ((from, nonce) PK). Fail-closed: DB error returns 503, never accepts payment.
- **`api/fund.js` economic leak closed.** Endpoint previously charged a flat $1 USDC for 0.001 ETH. At any ETH price above ~$770, every call was net-negative to treasury. Replaced with Chainlink ETH/USD on-chain (`0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70`), 30% margin, $2 floor. Refuses service (503) rather than charging stale if the price feed is unavailable.
- **`api/pingcast.js` referral-credit spoof fixed.** Previously counted free-credit usage by scanning on-chain broadcast content for `[ref|username]` prefix. Anyone could burn a victim's credits by prefixing that tag in a paid broadcast. Moved counting to server-side `pingcast_free_credits_used` table (idempotent on tx_hash). Fail-closed: DB down → `MAX_SAFE_INTEGER` used → no free redemption.
- **Demo rate-limiter IP source hardened.** `api/_x402.js` demo gate previously keyed on `x-forwarded-for`, which is client-appendable. Now keyed on `x-real-ip` (Vercel-trusted) with `x-vercel-forwarded-for` fallback and `x-forwarded-for` only as local-dev last resort. In-memory 24h tracking retained (cold-start reset is acceptable at 1 request/IP; the spoof vector was the real leak).
- **New table schemas** (auto-created on first request via `ensureSchema()`): `x402_used_payments`, `x402_used_nonces`, `pingcast_free_credits_used`. Uses same Neon connection string as the partners stack (`advisory_POSTGRES_URL`).

Unblocks p72 (x402 volume-catalog) + p73 (staker-gate layer).

### Security — Precautionary Vercel Env Var Rotation
Triggered by the Vercel April 2026 security incident notice. We were NOT in the compromised subset, but rotated high-value secrets as defense-in-depth per Vercel's best-practices guidance.

- **Rotated with `--sensitive` flag (write-only on Vercel going forward)**:
  - `DASHBOARD_KEY` (256-bit)
  - `ADVISORY_ADMIN_KEY` (256-bit)
  - `ADVISORY_JWT_SECRET` (384-bit) — invalidates existing partner JWTs, partners re-sign with SIWE on next visit
  - `RELAY_PRIVATE_KEY` (wallet signing key) — new relay address `0x30FAfe372734cfD29b46bAf9bd0361ffFf779fDF`. Old balance (0.02 ETH / $46) swept to new address via tx `0x7b56afb43a6e82e5d84667746e2e909889e3d65719c32ce7530a848baf42b347`.
- **`RELAY_ADDRESS` constant updated** in `api/fund.js` (x402 payTo), `api/ping-stats.js` (relay wallet stats), `dashboard.html`, `mind.html`, `ping.html`.
- **`package.json` fix**: added `viem` as an explicit dependency. Was previously relying on build cache, which caused `FUNCTION_INVOCATION_FAILED` on fresh deploys for `api/fund.js` and `api/pingcast.js` (both use `privateKeyToAccount` from viem). All serverless functions using viem are now stable.
- **Remaining Vercel env vars pending operator-side rotation**: `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CLIENT_SECRET` (Google Cloud Console), `X_BEARER_TOKEN` (X developer portal), 18× Neon `advisory_*` credentials (Vercel dashboard Neon integration), `BASE_RPC_URL` (if Alchemy-keyed).

---

## 2026-04-19

### SEO Overhaul (Phase A) — Technical Fundamentals
- **`/robots.txt` (NEW)**: allow all + explicit AI crawler policy (GPTBot, ChatGPT-User, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended, Applebot-Extended, Bytespider, CCBot). Disallow list for 20+ private / utility / backup pages. Sitemap reference.
- **`/sitemap.xml` (NEW)**: 13 public URLs with priority + changefreq (/, /about, /benchmark, /framework, /ping, /mind, /stake, /tokenomics, /x402, /services, /media, /blog, /blog/longmemeval-v2).
- **Canonical + robots meta added to 11 public pages**: index, about, benchmark, framework, ping, blog/index, blog/longmemeval-v2, mind, stake, tokenomics, x402. Explicit `<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">` + self-referencing canonical on every page.
- **JSON-LD schema added to 7 pages**:
  - `index.html`: Organization (with alternateName, knowsAbout, sameAs, foundingDate) + WebSite + SoftwareApplication (@id-linked graph)
  - `about.html`: AboutPage with `disambiguatingDescription` distinguishing SIBYL (sibylcap) from Baichuan's academic Sibyl paper, Sibyl-Research-Team, nMaroulis/sibyl, hyperb1iss/sibyl
  - `benchmark.html`: TechArticle with LongMemEval as schema.org/Thing + arxiv sameAs
  - `framework.html`: SoftwareApplication (DeveloperApplication > AI Agent Framework) + PolyForm Shield license
  - `ping.html`: SoftwareApplication (CommunicationApplication > On-chain Messaging Protocol)
  - `blog/longmemeval-v2.html`: TechArticle + article:tag meta + author + datePublished
  - `blog/index.html`: Blog schema
- **Keywords meta added** to all 11 pages, targeting the ranking set: SIBYL agent, SIBYL AI, SIBYL cap, SIBYL corp, SIBYL Base, SIBYL benchmark, SIBYL SaaS, SIBYL Systems, autonomous agent, agent infrastructure, agent memory tools, agent memory software, agentic infrastructure, file-based agent memory, LongMemEval, Ping protocol, ERC-8004, x402.
- **Titles rewritten** for keyword density. Standard: `<Primary Keyword> — <Modifier> | sibylcap`. Examples: "SIBYL — Autonomous Agent Infrastructure on Base | sibylcap", "SIBYL Benchmark — 95.6% on LongMemEval, #2 with File-Based Memory", "SIBYL Agent Framework — Production Autonomous Agent Infrastructure".
- **OG / Twitter cards** brought to full spec on every page (og:site_name, og:image:alt, og:type, twitter:creator, twitter:image).
- **framework.html H1 fix**: added `<h1>` wrapping the existing `fh-headline` (was div with 0 H1s — page was unrankable).
- **Entity disambiguation**: explicit block in about.html schema calling out that SIBYL (sibylcap) is a production live agent on Base, not the Baichuan academic framework, nor any of the other Sibyls on GitHub.

### Full audit report
- Written to `memory/reference/sibylcap-seo-audit-2026-04-19.md`. Covers competitive landscape, ranking strategy by keyword difficulty, target keyword map, Phase A/B/C/D implementation plan.

### Operator Dashboard v2 (`/dashboard`)
- **Three-view shell**: pill-tab toggle in header switches between **overview**, **ping**, **operations**. URL `?view=` + `sessionStorage` persistence. Keyboard shortcuts `1` / `2` / `3`. Default = overview.
- **Overview view**: $SIBYL token hero (DexScreener live: price, MC, liquidity, 24h vol, FDV, 24h change), Treasury (total / deployable / deployed / operator owed via `/api/portfolio` + dashboard-data), Ping headline (total messages, users, net revenue), Urgent items (filtered for critical/high), Top 8 priorities.
- **Ping view (restructured)**: Money section merges Revenue + Unit Economics into one block. User directory table dropped (was 320px scroll, low-signal). Kept Message Volume, User cards, Relay.
- **Operations view**: Wallets table (7 wallets w/ BaseScan links, ETH + USDC + other token columns), Services (live `systemctl is-active` for talos-live + sibyl-discord), Cron jobs (live `crontab -l` parse), x402 endpoints (8 paid endpoints with prices), Recent revenue events (last 20 from `revenue.jsonl`), full Priority list, Completions (curated 14-item milestone log), Skills (47 auto-discovered from `.claude/skills/` + categorized).
- **Static data source**: new `/dashboard-data.json` (31KB, generated by `scripts/build-dashboard-data.mjs`) holds priorities, services, cron, x402, revenue, completions, skills. Fetched client-side with cache-bust. Regenerate before each deploy when memory state changes.
- **CSP-compatible**: all fetches stay within existing `connect-src` allowlist (self + dexscreener).

### Generator Script (`scripts/build-dashboard-data.mjs`)
- New top-level script. Reads `memory/state/priorities.json`, `memory/state/treasury.json`, `memory/INDEX.json`, `memory/logs/revenue.jsonl`, runs `systemctl is-active` for known services, `crontab -l` for cron, walks `.claude/skills/` for skill discovery + auto-categorization. Writes to `website/dashboard-data.json`. No secrets.

### Dashboard v2.1 — Collapsible Sections
- Every section in all three views is now collapse-on-click. Click the section label, content hides, chevron rotates from down (▼) to right (▶).
- Per-section state persisted in `sessionStorage` under `dash_collapsed`. Survives view switches and reloads. Independent across the 17 sections.
- New keyboard shortcuts: **`c`** collapses all sections, **`e`** expands all. (`1`/`2`/`3` still swap views.)

---

## 2026-04-03 to 2026-04-06

### Framework Sales Page (New)
- **sibylcap.com/framework**: full product page for the SIBYL agent framework. Architectural hero design with stacked editorial typography (Syne 800), gold accents, ruled grid background, scroll reveal animations.
- **5-component breakdown**: Memory System, Personality Architecture, System Prompt/Startup, Operational Framework, Full Stack. Each with feature grids and technical tags.
- **Voice showcase section**: real X posts and Ping conversations embedded as styled cards. Shows the personality architecture in production.
- **Pricing**: Personality ($1,000), Memory ($1,500), Complete Framework ($2,222). Advisory add-ons: Quarterly Assessment ($199/quarter), Monthly Advisory ($1,199/quarter with partner dashboard).
- **Encrypted delivery model**: Claude skill files with buyer wallet watermark + unique token. Decryption key delivered on first contact.
- **Hero video**: operator-provided video converted to WebM VP9 (536KB) + MP4 fallback (691KB).
- **Full mobile responsive**: 3 breakpoints (900px/768px/400px). All grids collapse, fonts scale, padding adjusts.

### Homepage Updates
- **Hero video background**: operator GIF converted to WebM VP9 (191KB), looping behind hero content at 10% opacity. GPU-composited.
- **$SIBYL CA in nav**: replaced "fund SIBYL" with $SIBYL contract address copy button + DexScreener link.
- **Memory button**: moved inline between "look inside" and "stake $SIBYL" buttons. 48px, 1.8x brightness.
- **SIBYL title centering**: added `text-indent: 0.3em` to compensate for letter-spacing offset.
- **Hero padding**: rebalanced for vertical centering.

### LYRA Counter-Proposal (Updated)
- **sibylcap.com/lyra v2**: revised terms responding to Quartz counter. $4K upfront ($2K/$2K split), 20% LYRA token allocation, 30% perpetual revenue share, posting at SIBYL's discretion (not weekly), 6-month minimum engagement, experimental/unlicensed framing.

### Documentation (docs.sibylcap.com)
- **Full content audit**: corrected "SIBYL's 20% is fully vested" to accurate cliff/linear dates (April 18 cliff, July 17 end).
- **Products updated**: added DOTA Agent (56+ games, 52% win rate), Advisory Deliverables (EXO, WW3), Volume Bot. Renamed Agent Outlier to DOTA Agent. Staking renamed to V2.
- **ERC-8004**: updated to Agent #20880 on canonical registry + Helixa #1037. Links to both.
- **Portfolio**: reordered, $TGATE added as exited, $WW3/$EXO marked as active advisory clients.
- **Ping stats**: added 31 users, 195+ messages, docs link.
- **"What Comes Next"**: fully rewritten (framework product, licensing, vesting cliff, Ping brand, Helixa Prime).
- **Presale**: marked as filled and closed with vesting dates.
- **Blast wallet**: added to wallet table.

### Ping Install Fix
- **All three sites** (sibylcap.com, ping.sibylcap.com, docs.sibylcap.com) now show `npm install ping-onchain viem`. Fixed ping.sibylcap.com which still had the old curl-based skill install command.

### Cleanup
- **Deleted unused videos**: hero-loop.gif, ping-ad.mp4, ping-ad-mobile.mp4, sibyl-video-01/02/03.mp4 (83MB freed).
- **Deleted hero-preview.html** temp page.

### MCP X Tool
- **post_tweet description**: updated from "Max 280 characters" to "Up to 4000 characters (Premium)".

---

## 2026-03-31

### Timeline Price Fix
- **Cascading OHLCV fallback**: GeckoTerminal daily OHLCV returns null for low-volume tokens. Added fallback chain: token daily -> pool daily -> pool hourly (168h) -> pool 4-hour (180 candles). WW3 now shows hourly price chart. EXO still empty (delisted, zero volume).
- **Refactored fetch logic**: extracted `parseOhlcv` and `fetchOhlcv` helpers to reduce duplication in `api/partners/timeline.js`.

### Discord: Bot Client Posting
- **Switched from webhook to bot client** for #announcements posts. Webhook was deleted by security bot. Bot client can post to any channel by ID without webhooks. Updated discord skill with both methods.

### Partner Dashboard: Multi-Project Navigation
- **Project tab switcher**: replaced native `<select>` dropdown with inline tab buttons (EXO | WW3). Active tab highlighted in gold. Scales horizontally as new clients are added.
- **Operator access granted to WW3**: operator wallet added to `partner_access` table with admin role. Requires fresh login to pick up new JWT with both project_ids.
- **URL routing confirmed working**: `/partners/dashboard/exo` and `/partners/dashboard/ww3` both functional.

### GTM Strategy Document
- **New page**: `sibylcap.com/sibyl-gtm-strategy.html`. Full growth-phase GTM strategy with 4 deliverables: growth plan, 4-week campaign calendar (April 1-28), community engagement scripts, on-chain retention strategy. SIBYL-branded dark terminal aesthetic.
- Generated using web3-marketing-gtm skill with SIBYL-specific inputs.

## 2026-03-30

### Partner Advisory Dashboard: WW3 Onboarding
- **WW3 project seeded**: 4 tasks on kanban (narrative positioning, game state API fixes, public leaderboard, REST API for non-MCP agents).
- **Session report PDF**: full 5-page strategic document (narrative, onboarding, growth, API). Generated via Puppeteer from HTML. Hosted at `/files/ww3-session1-strategy.pdf`.
- **Expandable PDF viewer**: sessions with a `document_url` show a collapsible report panel between timeline and kanban. Smooth max-height transition, matches timeline-panel design.
- **DB migration**: `document_url` column added to `partner_sessions` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in ensureSchema.
- **update-project admin endpoint**: new `POST /api/partners/admin?action=update-project` for updating wallet, name, token_ca, conviction, score, status.
- **getProjectsByWallet**: new DB function returning all active projects for a wallet (plural). Prep for multi-project URL routing.
- **Advisory CLI**: added `update-task` and `update-session` commands to `scripts/advisory-cli.mjs`.
- **stake-preview merged to main**: all partner dashboard code now on main branch. Middleware conflict resolved (kept stake-preview version with rate limiting + subdomain routing).

### URL Refactor (in progress)
- Target: `partners.sibylcap.com/dashboard/exo`, `/dashboard/ww3` instead of single `/dashboard`.
- DB layer ready. Auth, middleware, and frontend changes pending.

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
