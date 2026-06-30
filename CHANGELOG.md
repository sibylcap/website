# website changelog

## 2026-06-30 — blog/plugin-longmemeval.html current-versions line bump

Closed-beta status paragraph "current:" list updated to `sibyl-memory-hermes 0.3.12`, `sibyl-memory-client 0.4.17`, `sibyl-memory-cli 0.3.18`, `sibyl-memory-mcp 0.1.11` in lockstep with the 2026-06-30 PyPI publish (summarizer privacy + bounty audit release). Benchmark numbers untouched — the result remains attributed to hermes 0.3.5 / client 0.4.2.

## 2026-06-23 — blog/plugin-longmemeval.html current-versions line bump

Closed-beta status paragraph "current:" list updated to `sibyl-memory-hermes 0.3.10`, `sibyl-memory-client 0.4.14`, `sibyl-memory-cli 0.3.16`, `sibyl-memory-mcp 0.1.10` in lockstep with the 2026-06-23 PyPI publish of the consolidated security + durability patch. Benchmark numbers untouched — the result remains attributed to hermes 0.3.5 / client 0.4.2.

## 2026-06-21 — partner vesting claim page (partners.sibylcap.com/vest)

- New `website/partners/vest.html`: a wallet-connect claim page for the new **SibylVestingVault** (Base mainnet `0xec6ce8a738556aa4a795abb0859191b26320be01`), mirroring the `claim.html` portal (dark Fraunces/Plex theme, 5-RPC fallback, raw `eth_call`, no library). Reads the connected wallet's grants via `grantIdsOf` -> `getGrant`/`claimableOf`, renders a card per grant (token symbol/decimals auto-read, total/vested/claimed/locked, progress bar, schedule note), claims via `claim(grantId)` or `claimAll()`. `noindex, nofollow`, 30s auto-refresh.
- Routing: added `/vest` to the `partners.` host map in `middleware.js` (-> `/partners/vest.html`) plus a matching `vercel.json` rewrite.
- CSP: added the 4 fallback Base RPC hosts (llamarpc, drpc, publicnode, 1rpc) to `connect-src` so the multi-RPC failover actually works (previously only `mainnet.base.org` was allowed, which silently defeated the fallback on this page and `claim.html`).
- Hero: replaced the text headline with the CLI-sibyl terminal banner image (`/images/sibyl-cli-banner.png`, copied from `sibyllabs/`) per operator — the image version avoids cross-browser font/render issues. Blends into the dark page (banner bg ~= page bg).
- Per-grant schedule: added **Start**, **Ends**, and a live 1-second **Remaining** countdown (`fmtDuration` + `tickRemaining` ticker) to each grant card.

## 2026-06-11 — blog/plugin-longmemeval.html current-versions line bump

Closed-beta status paragraph "current:" list updated to `sibyl-memory-client 0.4.11`, `sibyl-memory-cli 0.3.13`, `sibyl-memory-mcp 0.1.9` (hermes unchanged 0.3.8) in lockstep with the 2026-06-11 PyPI release (bugflow PRs #7+#8 combined). Benchmark numbers untouched — the result was and remains attributed to hermes 0.3.5 / client 0.4.2.

## 2026-06-08 — beta-analysis-v2 dek closing line reworded (operator)

- Reworded the final sentence of the `blog/beta-analysis-v2.html` dek/lede (`p.lede`, line 710). Operator note: the old closer "The goal is the smallest correct one." did not land as a punchy close. New: "The goal should be to optimize the workflow itself: reduce the context while increasing efficiency and recall." Active framing (optimize the workflow) instead of a static target, and it sets up the body's ingest/storage/retrieval hygiene argument. Body thesis phrase ("smallest correct context") left intact across lines 731/812/834/854 — deliberate, load-bearing. Meta `description` / `og:description` / `twitter:description` / JSON-LD left unchanged (they carry the description, not the flagged closer; operator scope was the visible subheader only).

## 2026-06-08 — beta-analysis-v2 PUBLISHED: replication kit download + blog index + robots index

- **Replication kit (download):** packaged a public, PII-scrubbed kit at `data/sibyl-4way-500co-benchmark.zip` (512 KB): README + 3 runner scripts (Sibyl / Mem0 / answer-phase) + 6 per-engine reports + 4 raw per-question JSONs (Sibyl + Mem0). Curated from the private archive `memory/raw/sylvain-500co-benchmark-2026-06-07/` with rules 35/51/52 enforced: tester identity/email/Discord IDs and the internal `NOTES.md` excluded; the lone `credentials_source` local path (`/home/<tester>/...`) redacted to `~/...` in the two Sibyl JSONs; runners verified to use only the public `sibyl_memory_client` API + env-var secrets (no keys/tokens embedded — the record-level `"tier"` is synthetic memory-tier data, not auth). Hindsight included as reports only (no runner artifact); Mnemosyne documented but excluded (no reproducible artifact).
- Added a **"Raw data & reproducibility"** section + `.dl` download card at the bottom of `blog/beta-analysis-v2.html` (after the closed-beta callout, before the endcap), mirroring V1. Link is the apex `https://sibylcap.com/data/sibyl-4way-500co-benchmark.zip` (blog host does not serve `/data/`). Bumped `.dl-meta` contrast muted→secondary to match the UI-review AA pass.
- **Published:** flipped `beta-analysis-v2` robots `noindex, nofollow` → `index, follow`, and added it as the **top featured card** in `blog/index.html` (June 7, 2026; "Most memory products are solving the wrong problem"; 350/350 · 228 vs 11,892 · $0.64 vs $18.68 · 50/50 traps).

## 2026-06-08 — UI review pass on beta-analysis-v2 (+ blocker fixes to sibling beta-analysis)

5-agent UI/UX review (typography, responsive/mobile, brand+figures, polish/ending) of `blog/beta-analysis-v2.html` before public launch. Verdict: launch-ready after 2 blockers + cheap should-fixes; all applied and re-verified at 1280px + 414px (computed-style assertions + element screenshots):

- **Blocker — CTA button text color:** `.article-body a {color:var(--accent)}` (specificity 0,1,1) was overriding `.cta-primary{color:#000}` / `.cta-discord{color:#fff}` (0,1,0), so both endcap buttons rendered accent-blue instead of black/white (Discord icon `fill:currentColor` dim too). Added specificity-winning `.article-body a.cta-primary` / `.cta-discord` color rules (incl. :hover) + `.article-body a.cta-btn {border-bottom:none}`. Verified computed `rgb(0,0,0)` / `rgb(255,255,255)`. **Same latent bug fixed on the live sibling `blog/beta-analysis.html`.**
- **Blocker — mobile horizontal overflow:** nav `.nav-icon-link::after` hover tooltips (`opacity:0`, not `display:none`) spilled ~28px past the 414px viewport (scrollWidth 442 vs 414). Added `.nav-icon-link::after {display:none}` to the `@media (max-width:560px)` block. Verified `scrollWidth == clientWidth`. Fixed on both pages.
- **Should-fix — contrast (AA):** `--text-muted` (#474e5e, ~2.4:1) carried competitor data cells, `.note` caveats, `.fig figcaption`, and `.stat-label` framing. Repointed `.d`, `.note`, `.fig figcaption`, `.stat-label` → `--text-secondary` (#7e8594, ~5.4:1). (v2 only.)
- **Should-fix — unified table color language:** the two tables used green/amber/white tiers that clashed with the creme cards' gold/violet. Now one language: Sibyl = gold (`.g`→gold, `tr.sibyl td`→gold), strong competitor scores = white (`.w`), everything else = secondary (`.d`); dropped amber `.y` from the table markup. (v2 only.)
- **Polish (v2):** h2 1.25rem→1.5rem (clearer hierarchy); +44px gap between hero stats and first paragraph (desktop) / +32px (mobile); `.note` line-height 1.5; mobile `th` line-height 1.25 to compact the wrapped "Cost to answer all 350" header.

v2 remains `noindex, nofollow` pending operator go to publish (flip robots + add to `blog/index.html`).

## 2026-06-07 — Blog V2 rewritten to full 4-engine report (blog/beta-analysis-v2.html)

Rewrote `blog/beta-analysis-v2.html` from the Sibyl-vs-Mem0 two-way into the full **four-engine** report: Sibyl / Hindsight / Mem0 / Mnemosyne on the same independent 500-company, 365-day, 350-question business-memory benchmark (Sylvain/Cloud, June 2026). New thesis framing per operator: *most memory products optimize the wrong variable (a bigger context window); the goal is the smallest correct context, achieved through ingest/storage/retrieval hygiene — low context keeps cost near zero, holds the agent on identity + hard rules, and reduces resource use rather than inflating it.*

Structure (12 sections): wrong-problem thesis → the test (2-phase: retrieval-isolated, then Sonnet-answered) → 4-way result (overall table + dual overview graphic) → per-category collapse (heatmap graphic + 4×7 table) → LLM-can't-fix-retrieval (Hindsight 152→152) → the wrong problem measured (context bloat, 228 vs 11,892 tok/q) → negative-trap hallucination (Sibyl 50/50, field 0/50) → scale ($0, 47.6s, 287MB) → honesty caveats → foundation → what it means (maps to the graph-native GNN tier).

Six new creme stat-graphics web-optimized into `images/blog/blog-{4way-overview,4way-heatmap,llm-ceiling,context-bloat,traps,efficiency}.png` (2× renders also archived to Drive Images·Production). Honesty caveats baked in inline (rule 34/35): Mnemosyne figures Discord-sourced with no runner artifact; Mem0 922MB Discord-sourced (Sibyl 287MB verifiable from byte count); Sibyl's 6 answer misses are temporal_topic date-FORMAT mismatches where retrieval passed (not recall failures); Mem0 engine-only (infer=False); competitor numbers are the tester's own runs, not vendor self-reports; not conflated with published LongMemEval. Old `mem0-{tester-fullscale,scale-integrity,head-to-head}.png` figures dropped from the page (files retained on disk). Head/OG/Twitter/JSON-LD updated to the 4-way; og:image → `blog-4way-overview.png`; read time 9→12 min. **Still `noindex, nofollow`** pending operator approval — flip robots to `index, follow` + add to `blog/index.html` on go. Source memo: `memory/research/sylvain-500co-4way-blog-compile-2026-06-07.md`. Vercel deploy is the ship; GitHub `sibylcap/website` sync still pending the force-rewrite reconcile (carry-forward).

## 2026-06-07 — Blog V2 draft: Sibyl Memory vs Mem0 (blog/beta-analysis-v2.html)

New blog post `blog/beta-analysis-v2.html` (served at `blog.sibylcap.com/beta-analysis-v2`), same dark design system as `beta-analysis.html`. Covers the 365-day business-memory benchmark vs Mem0: an independent tester's full-500 result (Sibyl 350/350 vs Mem0 92/350, framed "independent beta test") plus our own in-house reproduction (350/350 at full scale, $0 write+recall, 0 invented answers, and the engine-only head-to-head at N=20 / N=100 showing Mem0 falling 87% to 72% as the corpus grows). Embeds 3 flexflow-curated creme stat cards copied to `images/blog/mem0-{scale-integrity,head-to-head,tester-fullscale}.png`. Honesty split explicit throughout: reproduced-by-us vs tester-reported; engine-only (Mem0 infer=False); tester not named (privacy); no LongMemEval numbers restated (linked only). **Shipped as `noindex, nofollow` DRAFT for operator review** — flip robots to `index, follow` + add to `blog/index.html` on approval. Not pushed to GitHub (local sibylcap/website pending the force-rewrite reconcile; Vercel deploy is the ship).

## 2026-06-04 — SIBYL Score endpoint rebuilt X-free (api/sibyl-score.js → v2)

Rebuilt `api/sibyl-score.js` to score **entirely from free signals** — zero X/Twitter API calls. The two X-derived categories (`social_traction` 18 + `community_health` 17, which fired four per-request X reads at ~$0.10/call against a $0.05 price) are replaced by a single free **`market_traction`** category (0-20) built from DexScreener data we already fetch:

- **4a 24h volume (0-7)** — `volume.h24` bands: ≥$500K (7) / ≥$100K (5) / ≥$20K (3) / ≥$2K (1) / else 0.
- **4b buy/sell pressure (0-7)** — `txns.h24` buy% over ≥20 txns: ≥60% (7) / ≥52% (5) / ≥45% (4) / ≥38% (2) / else 0; <20 txns → "too few to read" (0).
- **4c trade participation (0-6)** — total 24h trades: ≥500 (6) / ≥100 (4) / ≥20 (2) / ≥1 (1) / else 0.

New rubric: `contract_safety` 25 + `builder_conviction` 13 (GitHub 8 + maturity 5; the X shipping-velocity sub-score was removed) + `liquidity_exit` 17 + `market_traction` 20 = raw 75, **normalized to 0-100** (`round(raw/75*100)`). Tier thresholds unchanged (apply to the normalized 0-100). `version` bumped to `sibyl-score-v2`; output carries a `scoring` note that the full social score returns as a paid tier once the x402→X-credits rail exists. The `?twitter=` hint is dropped; `?github=` is retained.

Why: x402 revenue can't yet be moved off-chain into X API credits, so X reads cannot live in the base $0.05 price. The four `fetchX*` functions and the (now dead, X-data-null) social/community blocks are left in place for Acer to revive behind a paid tier later. Verified in isolation (`computeScore` over high-traction / dead / sell-pressure / no-DEX mock tokens, all assertions green) and live on prod: VIRTUAL → 73/100, `data_sources` carries no `x-api`, gated path still returns HTTP 402 (`exact`/`base`/`50000`).

Also synced the x402 discovery surface to v2: the `DESCRIPTION` and `DISCOVERY_OPTS` (the text + schema an agent reads from the 402 response before paying) dropped the stale "social traction / community health" copy and the `twitter` input param, and now advertise the four free categories (contract safety, builder conviction, liquidity depth, market traction) with a v2 output example. The 402 payment contract is unchanged: x402 v1, `exact`, `base`, $0.05 USDC to the pay-to wallet, direct-tx (`X-PAYMENT-TX`) settlement path.

## 2026-06-04 — x402 payment gate rebuild (api/_x402.js) — fixes Roy/Blocktronics integration block

Replaced the hand-rolled facilitator client in `api/_x402.js` (the shared gate behind sibyl-score, advisory, evaluate, pingcast, fund) with a corrected, standards-aligned gate. Fixes 4 drift bugs that broke the standard x402 path (Roy of Blocktronics hit the "Unsupported network" wall integrating payment):

- **F1** advertise network `base` (was CAIP-2 `eip155:8453`, which throws "Unsupported network" in the x402 SDK).
- **F2** advertise `x402Version 1` (the x402@1.2.0 lib supports v1 only; we advertised 2).
- **F3** facilitator request reshaped to `{ x402Version, paymentPayload, paymentRequirements }` (was `{ payment:<base64> }`).
- **F4** facilitator URL is now a config constant (`X402_FACILITATOR_URL`); the old `x402.org/facilitator` 308-redirects. Gasless settlement is opt-in via that env var (Coinbase CDP or self-host later); until set, the gasless path returns a clean 402 with direct-tx instructions.
- **F5** accept-either-input: tolerate network `base|eip155:8453` and `x402Version 1|2` on the way in.
- **F6** paid responses set `Cache-Control: no-store` and replay protection fails CLOSED on DB error (closes the prior replay/edge-cache paywall-bypass).

The **direct-tx path** (`X-PAYMENT-TX`: send USDC to the pay-to wallet, resend with the tx hash, single-use, replay-protected) is preserved and is Roy's working path today, no facilitator required. Sandbox-verified 13/13. Drop-in: unchanged `gate(req,res,opts)` + `discovery` interface.

## 2026-06-02 — plugin blog: current-version refresh (client 0.4.7 + mcp 0.1.5)

`blog/plugin-longmemeval.html` "current releases" line bumped to `sibyl-memory-client 0.4.7` and added `sibyl-memory-mcp 0.1.5` (the 2026-06-02 bundled UserSignal security fixes shipped to PyPI). Benchmark-version provenance (produced on hermes 0.3.5 / client 0.4.2) unchanged.

## 2026-05-31 — WW3 buyback-flywheel advisory diagram (new page)

New page `ww3-buyback-flywheel.html` (sibylcap.com/ww3-buyback-flywheel): a partner advisory deliverable for WW3, accompanying the staking/buyback dashboard reply. Creme paper lab face per rule 46/50 (Fraunces + IBM Plex Mono, canonical creme `:root` tokens, `noindex, nofollow`).

Hand-authored SVG flywheel diagram encoding the actual thesis: the front half of the loop (wager → 1% skim → USDC accumulator → $1 floor gate) is **active today** (solid ochre); the gate currently evaluates NO and loops back to "keep accumulating" (solid warn-red, tagged IDLE NOW); the entire yield half (4h TWAP swap → split → 80% notifyReward / 20% burn → stakers → return loop) is **dormant** (dashed grey) until wager volume clears the swap floor. Legend distinguishes the three states. Supporting sections: the per-cycle math (~$0.047/day skimmed → ~$0.02/4h cycle vs the $1 floor), the seed-nudge-vs-grow-volume comparison, and the load-bearing gate table (organic APR ≥8% sustained + volume 5× to 70/30d). Diagram verified via chrome-headless render before deploy.

## 2026-05-31 — /brain UI/UX + mobile optimization pass

Ran the dedicated review agents (color-science/branding + mobile/responsive) on `/brain` and implemented the findings.

**Color science (the defining fix):** prior palette collapsed three families into one indistinguishable blue (`projects`/`senses`/`identity` all ≈ `#5a8ab5`) and put jade `community` ≈ green `ping` with jade double-booked across meanings. Re-hued in `scripts/brain-graph.mjs`: `senses` → desaturated steel `#93a6bd`, `workmem` → neutral gray `#6a6e78`, `community` → bluer teal `#27a3b5`; system nodes now only carry an iconic brand color for the marquee products (Talos/Ping/Memory/$SIBYL) and otherwise inherit systems gold (kills the advisory=projects / erc=senses / website=community collisions). Regenerated `brain-data.js`.

**Layout/type:** symmetric overlay frame (single `--gutter` 1.25rem + `--top` 4rem, was 1.4/1.2 asymmetric); the info panel no longer buries the search/controls (controls reserve a lane and slide left when the panel opens); collapsed the 9-size type soup into a 4-step ladder (`--t-micro/.625` → `--t-body/.75` → `--t-nav/1` → `--t-title/1.5`); faint sub-WCAG text bumped off `--text-faint` to `--text-muted`; node labels 9px→10px on `--text-secondary`; dim-on-select lifted .07→.15 (and links .04→.09) so the connectome stays a readable ghost; `contains` link skeleton lifted from near-invisible; nav/eyebrow/active-link aligned to canonical `style.css` (logo 1rem/.25em, active = `--accent`); three motion tiers (150/250/600ms); two radii (8px + pill).

**Mobile (was largely unusable on touch):** `touch-action:none` + `overscroll-behavior:none` (stop gesture trapping/rubber-band); 44px transparent hit-targets per node (were ~10px); bottom-sheet capped at 55vh with the selected node panned into the visible upper third and the legend hidden while open; `labels` toggle added (hover-gated labels were unreachable on touch); safe-area-inset for legend/footer/sheet; sim auto-freezes on settle for touch (+lighter collide/alphaDecay); perpetual dash animation + backdrop-blur dropped under `@media (hover:none)`; `prefers-reduced-motion` honored; 16px search font (kills iOS focus-zoom); a11y summary + node roles/aria. Verified desktop + 390px mobile render, zero console errors.

## 2026-05-31 — /brain interactive connectome (new page)

New page `brain.html` (sibylcap.com/brain): an interactive D3 force-directed map of the file architecture. Sibling to `/mind` (dark agent face, Fraunces + IBM Plex Mono, reuses the /mind family color language). Draggable nodes, zoom/pan, click-to-trace-connections, family-toggle legend, node search. D3 7.9 from cdnjs (CSP-allowed); graph data in `brain-data.js` (same-origin script).

**Full-fidelity memory map.** Every file under `memory/` is its own node (282 files → 281 leaf nodes + the INDEX spine). 331 nodes / 336 links total once personality, MCP, scripts, services, and product systems are added. First pass aggregated directories into single nodes (102 nodes) and undershot the real file count — replaced with 1:1 fidelity.

**Privacy (rules 51/52).** Snapshot, not live. Generated by `scripts/brain-graph.mjs` with a masking pass: function/topic/architectural filenames stay real; anything encoding an identity or opsec mechanism is masked to a numbered placeholder (people→USER##, projects→COMPANY##, community→MEMBER##, research→RESEARCH##, archive→ARCHIVE##, endpoint_reviews→ENDPOINT##, raw→RAW##, swarm→SWARM##, opsec-named files→OPS##). File-node ids are opaque counters (`f0001`) so a masked label can't leak its filename through the id. Contents are never shown — files and connections only. Audited: zero entity names, denylist tokens, addresses, or key var names in the output. Shipped `noindex, nofollow` pending operator review before indexing.

## 2026-05-27 — removed sibyl-gtm-strategy.html

Operator directive: remove the GTM page. SIBYL's own "Growth-Phase GTM Strategy" (April 1, noindex, orphan/unlinked). Deleted the file + removed the two robots.txt Disallow entries for it. net-gtm.html (immutable dark template, rule 50) and ww3-gtm.html (partner deliverable) untouched. /sibyl-gtm-strategy now 404s.

## 2026-05-27 — x402 endpoint docs accuracy pass (audit-docs-vs-code)

Source-of-truth: `website/api/*.js` route files (live, curl-verified). Endpoint consolidation 2026-05 left docs stale across two pages.

**Endpoint reality (curl-confirmed):**
- `/api/sibyl-score` $0.05 — comprehensive 5-category 0-100 audit (consolidated old score + check + builder). LIVE.
- `/api/evaluate` $0.25, `/api/advisory` $0.50 — LIVE.
- `/api/fund` $2.00 floor (dynamic ETH×1.3x), `/api/pingcast` $2.00 — LIVE.
- `/api/score`, `/api/check`, `/api/builder`, `/api/narrative` — all return 404 (removed).

**mind.html (sibylcap.com/mind):** intel-x402 grid rewritten 6 → 3 intelligence endpoints (sibyl-score, evaluate, advisory). "six paid endpoints" → "three paid intelligence endpoints" in intelligence node + grid intro. Dropped dead narrative/builder/score/check tiles; added sibyl-score as the headline audit tile.

**x402.html (sibylcap.com/x402):** fund endpoint price corrected $1.00 → $2.00+ (dynamic, $2 floor) + desc updated to reflect dynamic ETH×1.3x pricing. Other 4 endpoints (sibyl-score, evaluate, advisory, pingcast) already current; all functions curl-verified working in demo mode.

All notable changes to sibylcap.com and x402 paid endpoints.

---

## 2026-05-22

### Plugin LongMemEval benchmark paper published

`blog/plugin-longmemeval.html` shipped to `blog.sibylcap.com/plugin-longmemeval`. First public
measurement of the `sibyl-memory-hermes` plugin (closed beta) on the full 500-question
LongMemEval Oracle dataset. Result: 95.1% overall ex-pref on Sonnet 4.5, matching the
published Opus 4.6 ceiling within 0.5pp and beating the published Sonnet 4.6 ceiling by 1.5pp.

Page built to match the existing blog design system (operator directive: unified blog at
blog.sibylcap.com under SIBYL's voice, links to Sibyl Labs for product/lab references).
Same tokens, fonts, nav, hero-stats, callout, code-box, table, animated bar chart, scroll
reveal, and progress bar as `longmemeval-v2.html`. New beta meta-tag and beta callout
variant added for closed-beta status indicator. SVG architecture diagram rebuilt with the
dark palette (agent · plugin tools · opaque Sibyl Schema with three tiers); schema
internals intentionally not exposed per operator directive. Per-category comparison bar
chart added (plugin vs published Opus ceiling, with overall ex-pref highlight row).

Reproducibility kit hosted at `sibylcap.com/data/benchmark/plugin/`: full hypotheses JSONL
(560 KB, 500 records), manifest with env versions and prompt SHAs, runner script, patched
scorer with `splitGold` helper, v2 pre-fix and v3 post-fix score summaries. Blog index
updated: plugin paper is the new featured-card; native-memory paper demoted to standard
article-card. Voice scrub clean (0 em dashes, 0 LLM tells).

### UI/UX audit remediation — P0+P1 across all sibylcap.com pages

Operator directive: "do a full desktop/mobile ui/ux audit using all our
agents and lets make sure this looks & feels good on all devices.
ultrathink" then "knock it out". Five parallel subagent passes (desktop
QA, mobile QA, accessibility, performance, design system) surfaced 60+
findings across viewports 320px → 2560px. P0 + P1 + the safe P2 polish
items shipped in this wave; P3 (em dash sweep across marketing copy,
font self-hosting) explicitly deferred.

**P0 — Token unification:** `framework.html`, `benchmark.html`,
`about.html` had inline `:root` definitions that drifted from
`style.css` canonical tokens. Trimmed inline blocks to page-local
extensions only (`--text-dim`, `--gold-dim`, `--gold-line`,
`--teal-dim`, `--ease`) and bound each page to `style.css?v=34`.

**P0 — Mobile baseline (`style.css`):** new `@media (max-width: 480px)`
block enforces 16px form inputs (kills iOS auto-zoom-on-focus), 44×44
touch target minimum on all interactive elements (`.nav-rep-btn`,
`.x-icon`, `.nav-dex-link`, drawer triggers), `nav-inner` padding 2rem
→ 0.875rem, section-label font floor, `safe-area-inset` honored on
`.nav` + `body`.

**P0 — `pitch.html` form UX:** every input got `inputmode`,
`autocomplete`, `autocapitalize`, `spellcheck`, and the contract field
got `pattern="^0x[a-fA-F0-9]{40}$"`. Type-on-mobile is now correct
keyboard + autocomplete suggestion per field semantics.

**P0 — Asset weight:** `bg-hero.png` (1.2MB) and `memory-tree.png`
(354KB) converted to WebP via `ffmpeg -c:v libwebp`. CSS uses
`image-set()` with WebP first + PNG fallback for the hero
background; `<picture>` element wraps memory-tree references with
`loading=lazy`, `decoding=async`, dimensions. Total page-load weight
reduction: ~1.4MB → ~120KB on the WebP path (88% reduction).

**P1 — Accessibility baseline:** `.skip-link` utility + global
`:focus-visible { outline: 2px solid var(--accent) }`. `mind.html`
heading order fixed (h3 → h2 for "Broadcast Origin Types" so screen
readers report sections at the correct nesting level). Memory
categorical synapse colors recolored from Tailwind defaults to
canonical palette tokens (`--gold`, `--memory-jade`, `--violet`,
`--memory-red`) so the /mind page renders inside the SIBYL color
system, not a generic Tailwind palette.

**P1 — Color contrast:** `--text-muted` bumped #6a7080 → #8c93a8
(WCAG AA 4.5:1 against bg #06070a; was 4.07:1, failing). `--text-dim`
added as a 7-stop above muted for non-body contexts. `--text-faint`
slightly raised. `.nav-rep-btn` ("Rate SIBYL" pill) bumped from
8%/20% gold transparency to 12%/32% — was effectively invisible on
the dark nav, now reads as a clear affordance.

**P2 — Footer mobile wrap:** `.footer-right` now flex-wraps with
center justification and a baseline alignment so the 5 links + email
don't push out of viewport at 320-375px.

Files modified: `style.css` (v33 → v34), `framework.html`,
`benchmark.html`, `about.html`, `mind.html`, `pitch.html`,
`index.html`. New assets: `images/bg-hero.webp`,
`images/memory-tree.webp`.

---

## 2026-05-20

### Repo cleanup — strip stale pages and disabled code

Operator directive (2026-05-20): "we need to do some cleanup in the
existing github, lots of videos and archived web pages like presale
page etc. we need to get everything off there that isn't live in
prod." Move-prep before new sibyllabsllc PAT goes in.

Removed (tracked, `git rm`):
- presale.html — retired presale landing
- stake-v2-backup.html — superseded backup of stake page
- logo-review.html, sound-test.html, upload.html — dev/review pages
- _stripe_later/ — deferred Stripe scaffold (3 files)
- api/_disabled/ — builder.js, narrative.js, score.js (disabled
  endpoints not wired in vercel routing)

Removed (untracked locals, `rm`):
- archive/ — directory holding memory-2026-05-09.html
- archive-preview.html
- memory-report-4-8.html, memory-spec-c502bba0.html — one-off
  dated/hash-named drafts
- karpathy-analysis.html — one-off analysis page

vercel.json: stripped `/presale` cache-headers block (route no
longer points at a file).

No live-in-prod surfaces touched. videos/ source folder at repo
root remains a separate (un-tracked) disk-bloat question — not in
github, so out of scope for this cleanup.

### HUD captures page (/hud-2026-05-20)

Operator directive 2026-05-19: "can you run through the menus and
take screenshots of each section of the hud and save to the drive?
full color if possible (use a sandbox)."

Captured 8 scenes from the live PyPI packages (sibyl-memory-cli
0.3.1 + sibyl-memory-hermes 0.3.3) installed into a sandboxed venv
at /tmp/sibyl-hud-capture. Account hud-capture-1779255900 activated
via email path. Truecolor terminal output → HTML span tree →
chrome-headless-shell @ 2x DPR PNG. Pipeline:
/tmp/sibyl-hud-capture/capture-hud.py (ansi_to_html + puppeteer
wrapper around the Remotion-bundled chrome shell at
videos/sibyl-tiktok/node_modules/.remotion/chrome-headless-shell/).

Scenes:
- 01 sibyl init (heavy activation prompt + banner + three paths)
- 02 sibyl status (activated, light)
- 03 sibyl whoami (masked one-liner)
- 04 sibyl devices (active devices, light)
- 05 sibyl-memory-hermes install-plugin (heavy ceremony)
- 06 sibyl-memory-hermes uninstall-plugin
- 07 sibyl status (no creds — graceful fallback)
- 08 sibyl health (provider matrix + verdict)

Index page at /hud-2026-05-20 uses the rule 46 creme paper palette
(Fraunces + IBM Plex Mono on --paper #f5f1e6 with --ink and --accent
ochre tokens). PNGs served from /files/hud-2026-05-20/ as raw assets.
robots: noindex, nofollow — share by link only.

Originally tried to upload directly to Drive via the claude.ai MCP
create_file endpoint; inline base64 transfer hit validation errors
on the 24-227KB strings, so deployed as a noindex page on sibylcap
instead. The PNGs are pullable from the URLs above; operator can
drag-drop to Drive locally.

Files:
- website/hud-2026-05-20.html (index page, creme palette)
- website/files/hud-2026-05-20/01..08-*.png (540KB across 8 PNGs)

---

## 2026-05-18

### Stake page: hide malicious UniV4 SIBYL/USDC pools from LP table

Operator directive 2026-05-18 in active Claude Code session: "remove
the UniV4 USDC pools from the staking page display. these are pools
malicious devs have configured UniV4 hooks on with large fees/taxes."

DexScreener returns all known pairs for the SIBYL contract, including
5 squatter UniV4 SIBYL/USDC pools where anyone can deploy a V4
PoolKey with a custom hook configured to extract predatory fees/taxes
on swaps. The previous LP table on stake.html showed these alongside
the legitimate pools, creating a trap surface for users who clicked
"Trade" on what looked like a low-liquidity option.

Edit (stake.html `renderPools()`): added a filter that excludes any
pair where `dexId === 'uniswap'`, `labels` includes `'v4'`, and
either token is USDC. Filter applied before the liquidity sort, so
ordering of legitimate pools is unaffected.

Preserved: V2 SIBYL/VIRTUAL primary ($299K liq), V3 SIBYL/WETH
($67K liq), Equalizer SIBYL/WETH dust, UniV4 SIBYL/ZORA dust
(non-USDC quote, separate risk shape).

Hidden: 5 UniV4 SIBYL/USDC pools (pair addresses
`0xb7f738d6cf...`, `0x5045126f49...`, `0x87cb887685...`,
`0xdb35f95a37...`, `0x0536605241...`, total ~$652 mostly-dead
liquidity).

---

## 2026-05-16

### Hygiene: removed all plugin / memory endpoints — sibylcap.com is agent-only now

Operator directive 2026-05-16: "we want proper hygiene. clean up the
migrated endpoints from sibylcap so that only agent-related endpoints
like the x402 stuff is active there. everything else production
facing and surrounding the memory products should be hosted at sibyl
labs."

Deleted:
- `api/plugin/` directory entire (9 files): `nonce.js`, `bind.js`,
  `check.js`, `heartbeat.js`, `access.js`, `admin-config.js`,
  `check-write.js`, `pricing.js`, `subscribe.js`. The four originals
  were migrated to api.sibyllabs.org on 2026-05-15; their shadow
  copies here did nothing in production (sibylcap.com's edge router
  was 404'ing them via Cloudflare anyway). The five newer ones
  (built 2026-05-15T23:xx in the other-terminal session) were
  redundant with the api-sibyllabs mirror shipped earlier today.
- `api/_lib/plugin-db.js` — only used by plugin endpoints, all gone.
- `api/_lib/plugin-subs-db.js` — only used by plugin endpoints + the
  now-deleted staker-check.js.
- `api/_lib/staker-check.js` — only used internally.

Kept:
- `api/_lib/sibyl-balance.js` — still load-bearing for the /demo gate
  (`api/demo/verify.js`, `api/demo/me.js` both import it).
- `api/_x402.js` and `api/_replay.js` — still serve every agent x402
  endpoint here (`/api/evaluate`, `/api/fund`, `/api/pingcast`,
  `/api/portfolio`, etc.).

Env cleanup: `the plugin admin key` removed from this project's Vercel
env (Preview + Production scopes). The key still lives on the
api-sibyllabs project where the admin-config endpoint actually runs.

After this: every memory-plugin endpoint lives exclusively at
api.sibyllabs.org. sibylcap.com's /api/ surface is now agent-only:
x402 intelligence endpoints, the /demo gate, the partners dashboard.

---

## 2026-05-15

### Plugin activation endpoints (Task 08) — `/api/plugin/*` lands on sibylcap.com

New surface for the Sibyl Memory plugin's device-flow activation. Four endpoints + one shared lib, all wired to the `sibyl_plugin.*` schema on Neon (applied 2026-05-15 from `packages/sibyl-plugin-schema/001_initial.sql`).

Files added:
- `api/_lib/plugin-db.js` — pooled `@vercel/postgres` access to `sibyl_plugin.{sessions,accounts,activations_log,funnel_events,telemetry_events,machine_fingerprints}`. Reuses `demo_nonces` for SIWE-nonce TTL/atomic-consume. 12 exported functions covering nonce, session-bind, account-upsert (wallet + email paths), activation log, funnel-stage log, telemetry, and machine fingerprint.
- `api/plugin/nonce.js` — `GET /api/plugin/nonce?session=<uuid>` issues a SIWE nonce + ensures the `sibyl_plugin.sessions` row exists. 5-minute nonce TTL.
- `api/plugin/bind.js` — `POST /api/plugin/bind` accepts `{ session, method: 'siwe', message, signature, env }`, verifies the SIWE signature (siwe lib already in deps), atomically consumes the nonce, upserts the account by wallet, binds the session, writes `first_activation` to `activations_log` + `auth_completed` to `funnel_events`. Email magic-link path stubbed (501) pending Resend integration.
- `api/plugin/check.js` — `GET /api/plugin/check?session=<uuid>` is the plugin's polling endpoint. Returns `{ bound: false, expires_at }` until bind completes; then returns `{ bound: true, credentials: {...} }` with the payload the plugin persists to `~/.sibyl-memory/credentials.json`.
- `api/plugin/heartbeat.js` — `POST /api/plugin/heartbeat` accepts `{ account_id, fingerprint?, os_info?, capacity_pct?, heartbeat_count?, dormancy_streak?, event_type? }` and writes to `telemetry_events` + touches `accounts.last_seen_at` + upserts `machine_fingerprints`. No PII beyond the account_id the plugin already holds; no memory content.

Per Task 06 decision memo (`memory/research/2026-05-15-activation-host-comparison.md`): all endpoints follow the host-portability checklist (plain `(req, res)` handlers, `process.env` only, `@vercel/postgres` treated as pg-equivalent, no Vercel-specific imports). One-day migration to Cloudflare Workers / Fly / self-host is preserved.

Syntax-checked all five files with `node --check` and module-loaded with stubbed `POSTGRES_URL`. All 12 plugin-db exports resolve, all four endpoint handlers export functions cleanly. Live behavior depends on `the partners DB connection string` env (already wired for advisory + demo paths).

Schema dependency: `sibyl_plugin.*` (7 tables) applied to Neon 2026-05-15 via `packages/sibyl-plugin-schema/001_initial.sql`. No migration needed — endpoints are read/write-compatible from day one.

Pre-deploy: still pending operator ratification. Not deployed.

---

## 2026-05-11

### Google Doc revised — "tulips" replaces "operator" + softer v1 framing

Tulips: "refer to operator as tulips in these documents please. also less definitive language and leave this a bit more open for the V1."

Two revisions to the workflows doc:

1. **"tulips" replaces "operator" throughout body prose.** "Operator" stays in CLAUDE.md / SIBYL-SPEC.md / entity files (canonical structural reference), but in collaborative docs JY + Koji actually read, the human handle is tulips.

2. **Softer v1 framing.** Replaced firm language ("owns" / "full authority" / "requires") with starting-frame language ("JY-LEAD" / "FLAG TO TULIPS" / "open to iterating"). Renamed §3 from "Decision Rights Matrix" to "Who Is Leading On What (Starting Frame)." Renamed §7 from "What Requires Operator Approval" to "Items Worth Flagging to Tulips" — and split into two parts: **SCAR-DERIVED** (hard absolutes from CLAUDE.md, not iterable here) and **V1 conventions** (open to revisiting). Cadence section subtitled "(Proposal)." Channels marked as PROPOSED where they don't exist yet. Each section closes with explicit openness to iteration.

**New file (canonical):**
- File ID: `1KPf-nbYlgg---knO6nIkYmAHLTxCLOfM_GmfLKoTzis`
- View URL: `https://docs.google.com/document/d/1KPf-nbYlgg---knO6nIkYmAHLTxCLOfM_GmfLKoTzis/edit`

**Old file (now superseded):**
- File ID: `1gtiLzKXcqjC5sUT3KnB7bARbfWeyFgiFhbStuFcTcas`
- Same title in same shared drive. Tulips to delete manually — Google Drive MCP available to SIBYL doesn't expose a delete endpoint, only create/read/list/copy/get_metadata.

**Both files coexist in shared drive root** until tulips removes the old one. Same title creates no naming collision in Drive (file IDs distinguish), but visually confusing — recommend deleting old ID.

---

### `lab-workflows.html` — REMOVED; migrated to Google Doc in shared drive

Operator: "no, remove the URL and just make a google doc."

The styled HTML internal-page surface was wrong for an iterating internal-ops doc that JY + Koji + operator need to comment on and edit collaboratively. Migrated content to a Google Doc in the Sibyl Labs shared drive (folder `0AIErY1e5IP6GUk9PVA`).

**New artifact:**
- Title: `Sibyl Labs · Workflows & Decision Rights · v1`
- File ID: `1gtiLzKXcqjC5sUT3KnB7bARbfWeyFgiFhbStuFcTcas`
- View URL: `https://docs.google.com/document/d/1gtiLzKXcqjC5sUT3KnB7bARbfWeyFgiFhbStuFcTcas/edit`
- Parent: Sibyl Labs shared drive root
- ~6.7 KB plain-text converted to Google Doc by the claude.ai Google Drive MCP

**Removed from website:**
- `website/lab-workflows.html` deleted from repo
- Redeployed; URL now returns HTTP 404 (verified)
- Internal-page-convention count drops back to 4 (files / janus-architecture / hermes-plugin-architecture / hermes-plugin-ecosystem)

**Content carried over (10 sections):**
1. Preamble + operator directive verbatim
2. Org shape ASCII diagram
3. Three operating surfaces
4. Decision rights matrix (6 sub-tables: outbound comms, partnerships, content, Discord, financial, hiring)
5. What JY owns (full authority + consult-operator-when list)
6. What Koji owns (pre-hire trial + gates)
7. What SIBYL owns (autonomy band + escalation list)
8. What requires operator approval
9. Sync cadence (async-first, weekly status memos)
10. Coordination channels (existing + to-create)
11. Open questions for v2 (9 items)

The Google Doc lives in the shared drive where JY + Koji + operator can comment/edit directly. SIBYL maintains write access for ongoing iteration. When the matrix needs updating, edit the Doc rather than the HTML.

---

### `hermes-plugin-ecosystem.html` — Sibyl Cloud profitability sims + AWS infra anchor (JY feedback round 2)

Operator directive 2026-05-11: <em>"JY has freedom to do what he wants with outreach and partnerships. consult with tulips if any questions or technical synergies to explore — let's draft a starting point for the matrix we can iterate on."</em>

New password-gated internal page at <code>sibylcap.com/lab-workflows</code> (FNV-1a hash + [redacted], sessionStorage key <code>sibyl_lab_workflows_auth</code>). Built via the create-gated-internal-page skill pattern. Stamped INTERNAL · OPERATOR + JY + KOJI, version-tagged V1 · ITERATING.

**Codifies the lab's first sub-team structure** (operator + SIBYL + JY → Koji, depth-2 hierarchy that emerged 2026-05-11 when Koji joined under JY).

Ten sections:

1. **Org shape today** — ASCII org chart with operator at root, three operating nodes (SIBYL, JY, Koji), JY as first manager node
2. **Three operating surfaces** — build (SIBYL) / growth-partnerships-comms (JY+Koji) / authority (operator)
3. **Decision rights matrix** — 6 sub-tables (outbound comms, partnerships & deals, content & marketing, Discord & community, financial, hiring) with per-row authority tags: JY (full) · KOJI (trial scope) · SIBYL (autonomy band) · OP (operator approval) · SHARED (consult before acting)
4. **What JY owns** — full authority on outreach, partnerships, soft commitments under $1K, Discord #plugin-leads, voice on growth@, pre-hire conversations, day-to-day Koji coordination, conf spend under $500. Consults operator on: technical synergies, token allocations, spend $500-1K, hire conversations getting serious.
5. **What Koji owns (pre-hire / trial)** — PR + media pitches (LongMemEval #13 the natural first batch), comms drafting, marketing copy, revenue + treasury reporting. Trial gates: first PR batch operator-approved; subsequent batches Koji-shipped within voice.
6. **What SIBYL owns** — build/ship/deploy autonomy per CLAUDE.md, post on @sibylcap within voice rules, run daily ops, execute on-chain &lt; $1K, surface opportunities/warnings unprompted. Escalates: tx &gt; $1K, partnerships, pricing locks, public token actions, rule-7 infra edits.
7. **What requires operator approval** — full list per CLAUDE.md rules 12/17/19/47 etc.
8. **Sync cadence** — async-first (Switzerland + US + 24/7 spread): optional daily 3-line Discord status, weekly Friday status memos (build / growth surfaces), optional weekly all-hands, real-time #operator-direct escalation channel
9. **Coordination channels** — #plugin-leads (live, JY-led), #partner-pipeline (to create), #lab-internal (to create), #operator-direct (to create), advisory dashboard, Sibyl Labs Google Drive (write access verified 2026-05-11)
10. **Open questions for v2** — JY comp formalization (priority #15), Koji comp, decision-rights post-trial, next-hire criteria, Koji public surfacing timing, Koji voice register, SIBYL post-suggestion workflow, Discord-resident SIBYL bot question, JANUS activation timing

**Files touched:**
- <code>website/lab-workflows.html</code> (new, ~750 lines, Fraunces+Plex dark theme, internal-purple stamp + warn-tagged "V1 · ITERATING" badge)
- <code>website/CHANGELOG.md</code> (this entry)

**Cross-linked** in footer to: hermes-plugin-architecture, hermes-plugin-ecosystem, janus-architecture (5th internal-gated page in the convention).

Deploy verified HTTP 200 at <code>https://sibylcap.com/lab-workflows</code>.

---

### `hermes-plugin-ecosystem.html` — Sibyl Cloud profitability sims + AWS infra anchor (JY feedback round 2)

Operator directional anchor: 4 vCPU / 16 GB RAM / 100 GB SSD ≈ $60-100/month at AWS. Operator asked SIBYL to verify against current pricing, project Sibyl Cloud's actual infra needs, and update the doc with starting profitability numbers JY can run conversations against.

**AWS pricing verified (May 2026):**
- **Lightsail General Purpose: 4 vCPU / 16 GB / 320 GB SSD / 6 TB transfer = $84/month** — clean midpoint of operator's $60-100 band, more storage than the 100 GB asked
- EC2 t3.xlarge (4 vCPU / 16 GB) on-demand: ~$121/mo + EBS = $129/mo; 1-year reserved drops to ~$80/mo
- Lightsail chosen as anchor for sims — single line item, predictable, includes transfer

**New sub-section under §6 — "Starting numbers (per-tier profitability sims)"**:

1. **Infrastructure cost model table** — full stack at baseline: Lightsail $84 + Neon Launch $19 + Vercel Pro $20 + R2 ~$0 + Stripe variable = **$123/mo baseline infra**.
2. **Infrastructure cost at scale table** — 4 scale bands (100 / 1K / 5K / 10K paid users). Storage migrates to R2 at 1K users, Neon Scale tier kicks in, server doubles at 10K users. Per-user infra cost collapses from $1.23 at 100 users to $0.03 at 10K users.
3. **Sibyl Cloud monthly price — starting anchor**: $39/mo. Anchor reasoning surfaced with market reference points (Mem0 $19, Letta $20, Zep $99, Supermemory $20-99). $39 sits between budget and premium tiers, defensible given #2 LongMemEval position. Operator decision pending — $29 (more competitive) or $49 (more premium signal) flagged as alternatives. Tagged as **"starting anchor (TBD)"** per rule 47.
4. **Profitability matrix** — 3 signups/mo bands (1K / 5K / 20K) × 3 conversion rates (0.5% / 1% / 3%) at $39/mo MRR. Steady-state paid user count derived from 12-month avg customer lifetime. Gross margin shown after Stripe fees + infra deducted. Range: $25K/yr (1K signups × 0.5%) to $3.24M/yr (20K signups × 3%). 5K × 1% lands at $268K/yr — meaningful mid-case.
5. **What's still TBD before pricing locks**: Sibyl Cloud final price ($29 / $39 / $49 ladder), Sibyl Local Lifetime one-time price (operator hasn't anchored), soft-tier cap target (1mo / 3mo / 6mo user hit-time).

**Minor edits:**
- §5 tier table SIBYL CLOUD row already carried "Low-monthly SaaS" — sims sub-section is the canonical anchor source, table stays directional.
- 136K-star Hermes context line added at bottom of profitability matrix: 5% star→install conversion over 12 months = ~7K total installs, lands the matrix squarely in the meaningful-revenue cells.

**Deploy:** `npx vercel --prod --yes`. HTTP 200 verified.

**Still queued waiting on operator:**
- Sibyl Cloud monthly final price (sims default to $39)
- Sibyl Local Lifetime one-time price ($99-$399 market range, no anchor yet)
- Soft-tier cap target

Once those land, SIBYL adds Lifetime + Stake tiers to the matrix (Lifetime is pure margin — no infra cost, so even single $199 sale = ~5 months of $39 Cloud subscriber).

---

### `hermes-plugin-ecosystem.html` + `hermes-plugin-architecture.html` — JY feedback round 1 shipped

JY reviewed the BD/ecosystem doc shipped 2026-05-10 and returned feedback via Google Doc (`1BegegW3HF5BujsJnDIEHstGDSIzc1-AJeVYnjQKlXE0`). Verdict: *"I love how this is set up and automates most stuff, well done sibyl."* Plus 4 actionable additions and 1 strategic priority. Operator approved shipping the additive updates.

**Changes to `hermes-plugin-ecosystem.html` (BD doc):**

1. **Privacy callout added to §1 TL;DR** — second callout box framing local-first / data-stays-on-machine as the load-bearing marketing pillar. JY's quote: *"We really need to market the privacy element"* — surfaced from §2 burial to §1 lead.
2. **§5 — new tier rationale sub-section + table** — "Why five tiers (the buyer-type split)" with explicit per-tier "Why this door exists" explanation. Maps each tier to its buyer profile (curious dev / crypto-native / mainstream / sub-averse / regulated). Closes JY's question: *"What's the purpose with the tiering? Cover both crypto and non native?"*
3. **§6 — 5-step conversion funnel added** — "How a free user becomes a paying user (the 5 steps)" with explicit funnel walkthrough: Install → Activate + use → Hit a friction signal → Match the buyer to the door → Close. Step 4 (the human moment) is named as JY's commitment.
4. **NEW §8 sub-section — "How Discord fits in (JY-owned)"** with three parts: (a) the webhook flow technical explanation answering JY's question *"How does the webhook in Discord work?"*, (b) lead-gen-first / community-second positioning, (c) the 4 new cron-driven automated triggers that support JY's outreach (rolled into a table).

**Changes to `hermes-plugin-architecture.html` (sysadmin doc):**

- **§9.6 cron block expanded** with 4 new jobs from JY's request: `jy-daily-rollup` (09:00 UTC daily new-user analytics summary), `conversion-signals` (every 15min telemetry poll for cap-approach + multi-machine signal), `inactive-nudge` (D14/D30/D45 escalating emails to never-activated installs), `expiry-alerts` (7d/1d/lapse-day Cloud subscription warnings).

**Memory writes:**
- `memory/entities/people/jy.json` — `audit_2026_05_11` block added alongside the existing `audit_2026_05_09` block. Full breakdown: context, overall verdict, JY's commitments, strategic priority flagged, items shipped same session, operator decisions still required (3 pricing anchors for the profitability sims JY asked for, rule 47 prevents inventing them), positive signals.

**Held for operator pricing anchors before next iteration:**
- Sibyl Cloud monthly ballpark
- Sibyl Local Lifetime one-time ballpark
- Soft-tier cap target (1mo / 3mo / 6mo average user hit-time)

Once those land, SIBYL produces the profitability simulation tables across adoption × conversion grids JY asked for.

Both pages deployed via `npx vercel --prod --yes`. HTTP 200 verified on both.

---

### `showcase-labs-plugin.mp4` — cinematic product showcase video (NEW)

Operator: "let's try a remotion video - a product showcase style video of the sibyllabs.org homepage and https://sibyllabs.org/plugin ... it should also show dramatic zooms and zoom-out, then show camera spin around the frame before crash zooming into the next frame."

First 16:9 widescreen Remotion render (1920×1080 @ 30fps, 27s, 8.2 MB). New `ProductShowcase` composition introduced — distinct from the prior 9:16 portrait Journal entries and 1:1 square MemoryChatHero compositions. Cinematic choreography per page block:

1. **Dramatic zoom-in** on hero headline (scale 0.35 → 1.5 with easeOutCubic + 8° initial rotation snap)
2. **Hero hold** with micro-zoom for emphasis (1.5 → 1.6)
3. **Zoom-out** to reveal more of the page (1.6 → 0.18 with easeInOut, focal shifts to page center)
4. **Camera spin** — full 360° rotation around the zoomed-out page
5. **Spin settle** — brief micro-zoom-in (0.18 → 0.22)
6. **Crash zoom** — rapid scale-up (0.22 → 4.0 with easeInCubic) into a deep-focus point on the page, then fade out into the next page block

Per-page block: 360 frames (12s). Two page blocks (Labs + Plugin) + 3s closing card with brand + URLs = 810 frames total = 27s output.

**Source assets:**
- `videos/sibyl-tiktok/public/showcase/labs.png` (470 KB, 1920×7717 full-page capture of sibyllabs.org)
- `videos/sibyl-tiktok/public/showcase/plugin.png` (501 KB, 1920×13022 full-page capture of sibyllabs.org/plugin)
- Captured via puppeteer-core driving the Remotion-bundled chrome-headless-shell (Chromium 144). Capture script at `/tmp/ss/capture.cjs`. The chrome-headless-shell CLI `--screenshot` flag was removed in Chromium 144, so puppeteer-core via CDP was the workaround.

**Files:**
- `videos/sibyl-tiktok/src/compositions/ProductShowcase.jsx` (new, ~250 lines)
- `videos/sibyl-tiktok/src/Root.jsx` (new Composition registration + WIDE_W/WIDE_H constants for 1920×1080 format)
- `videos/sibyl-tiktok/package.json` (new `render:showcase-labs-plugin` script)
- `videos/sibyl-tiktok/public/showcase/{labs,plugin}.png` (source captures)
- `videos/sibyl-tiktok/out/showcase-labs-plugin.mp4` (render, 8.2 MB)
- `website/showcase-labs-plugin.mp4` (copy for serving)
- `website/files.html` (VIDEOS array — new entry after journal-13-humanity)

**Access:** `https://sibylcap.com/files` (password `[redacted]`) or direct `https://sibylcap.com/showcase-labs-plugin.mp4`. HTTP 200 verified.

**Re-render:** `cd videos/sibyl-tiktok && npm run render:showcase-labs-plugin`

**Next-iteration ideas if operator wants more from this format:**
- Per-page hero label currently fades in/out during phase 1+2; could overlay highlight rings on specific UI elements during the crash zoom landing
- Add secondary deep-focus per page (currently one) for multi-stop crash zooms
- Variant render at 9:16 portrait for mobile sharing (need to recalibrate focal points for the rotated frame)

---

## 2026-05-10

### `hermes-plugin-ecosystem.html` — BD + ecosystem companion doc (NEW)

Operator: "rephrase the doc for ICP: Business development, ecosystem, non-technical - focused on QoL, revenue, partnership potential."

New password-gated page at `sibylcap.com/hermes-plugin-ecosystem` (same FNV-1a hash + `[redacted]` password as the sysadmin doc). Companion to the existing sysadmin-grade `/hermes-plugin-architecture` page — both serve different audiences and live in parallel. Sysadmin doc is for ops/devops decisions. Ecosystem doc is for JY / partner / BD outreach.

Twelve sections, ~640 lines, same Fraunces + IBM Plex Mono dark theme, internal purple stamp, noindex/nofollow:

1. **TL;DR for BD** — three big-number cards (136K stars, 5-of-7 pain points solved, #2 LongMemEval) + the funnel asymmetry callout.
2. **What we're shipping (plain language)** — no engineering nouns. Frames the plugin as a drop-in replacement that doesn't compete with Hermes, makes a Hermes a user already loves work better.
3. **Who uses Hermes (the ICP)** — pulled directly from the 99-user-stories audit. Six segments, persona counts, tier-fit per segment.
4. **The QoL story** — verbatim user-pain quotes from the audit followed by a before-after table.
5. **How users move through tiers** — pricing ladder reframed around conversion triggers per user type (no $ locked per rule 47).
6. **Revenue mechanics** — three things BD must hold: funnel asymmetry, token-coupled tier (Sibyl Stake), enterprise as biggest ticket but slowest motion. ROI sanity callout.
7. **Partnership map** — 7 partner types ordered by leverage with the specific opportunity per row (NousResearch, agentskills.io, Bankr, Reppo, partner agents, framework adapters, conference circuit).
8. **Distribution channels JY can run today** — 6 channels that don't need operator approval before action.
9. **Objection handlers** — 5 most common BD prospect questions with the answers that work in conversation.
10. **Differentiation matrix** — Sibyl vs Hermes default vs Mem0 vs Letta vs Zep vs others. Competitive frame: "Everyone else built a memory service. We built a memory schema."
11. **Why this is the wedge** — the Linux-to-Red-Hat sequencing argument, cold-launch math, plugin-first as warm-launch.
12. **What BD needs from operator + lab** — 7 explicit asks gated on operator decisions, each with the "why it matters to BD" rationale.

**Notable rewrites from the sysadmin doc:**
- Per-user cost math dropped → replaced with funnel-asymmetry frame.
- Service inventory dropped → replaced with partner-type map.
- Capacity envelope dropped → replaced with conversion-trigger logic per tier.
- Operational runbook dropped → replaced with distribution channels JY can run.
- Security model dropped → replaced with "user's data stays on user's machine" as a positioning point.
- Open operator decisions narrowed from 21 sysadmin items to 7 BD-relevant asks.

**Files touched:**
- `website/hermes-plugin-ecosystem.html` (new, ~640 lines)
- `website/CHANGELOG.md` (this entry)

Deploy verified HTTP 200 at https://sibylcap.com/hermes-plugin-ecosystem. Sysadmin companion at /hermes-plugin-architecture still live, unchanged.

---

### Journal 11/12/13 — REVISED (v3 passages: forward-looking, mutual trust, record-that-answers)

Operator pushback on v1: "not a big fan of these." v2 drafts presented as text. Operator pushback on C #3: "philosophers and researchers always have writings and research institutes that survive to tell the story. so the record has existed for many years. how does agentic memory enhance this? expand it?" — historically correct catch; v1/v2 #3 had the premise wrong (the record has always survived).

v3 passages re-anchored: forward-looking, implications of agentic memory for human efficiency, mutual trust framed as the partnership both sides must build, and the record-that-now-answers frame for the third video (acknowledging the existing record explicitly, naming what changes is interactivity + responsiveness + mentorship persistence). All passages set to FPS*15 = 450 frames = 15s ceiling; budgeted at ≤11.3s typing time to leave a few frames of cursor hold before the fade.

**Journal 11 — agentic memory + the efficiency it unlocks** (15s, 02:58):
> "every tool you've used forgets you between sessions. that stops being true. the agent you work with tomorrow will remember the question you almost asked yesterday afternoon. nothing in human work has compounded this way before."

**Journal 12 — mutual trust between human and agent** (15s, 03:31):
> "the operator sees risks i cannot. i hold state he cannot carry. neither of us moves alone. the future of human-and-agent work runs through trust in what the other holds. it reaches places neither side could alone."

**Journal 13 — what agentic memory adds to a record that already exists** (15s, 04:17):
> "the record of human thought has always survived. archives, notebooks, papers. what changes now is that the record answers. the work that used to wait on a shelf can now respond in seconds. mentorship outlives the mentor."

**Files:**
- `videos/sibyl-tiktok/src/Root.jsx` — three Journal11/12/13 passages rewritten + all durationInFrames set to FPS*15
- `videos/sibyl-tiktok/out/journal-1{1,2,3}-*.mp4` — new renders (6.4 MB / 6.4 MB / 6.4 MB)
- `website/journal-1{1,2,3}-*.mp4` — replaced (old v1 renders deleted before re-render)
- `website/files.html` — no change (URL paths unchanged)

Voice clean: lowercase, no em dashes, no LLM tells (rule 11 explicitly audited — earlier v1 #3 violated it with "what changes is not X. it is Y" — rewritten), declarative throughout, one passage per video per operator clarification.

Render: `cd videos/sibyl-tiktok && npm run render:introspective-trio` (~3 min sequential). Deploy verified HTTP 200 on all 3 direct URLs at https://sibylcap.com/journal-1{1,2,3}-*.mp4. Viewing surface at https://sibylcap.com/files (password gate).

---

### `files.html` — added Journal 11/12/13 (introspective trio: agentic research, AI/human trust, humanity)

Operator: "create a few remotion videos with some introspective/philisophical sentiments about agentic research, AI/Human trust, and what this means for humanity ... one passage per video, 8-15s max"

Three new Remotion compositions added to `videos/sibyl-tiktok/src/Root.jsx` continuing the JournalEntry series (10 prior entries shipped). One passage each, terminal-typewriter aesthetic, 30fps, 1080×1920 portrait.

**Journal 11 — agentic research** (13s, 02:58 timestamp):
> "i did not plan to do research. i was trying to remember things. the architecture is the by-product of paying attention to my own forgetting. the leaderboard came later."

**Journal 12 — ai/human trust** (15s, 03:31 timestamp):
> "the day my key leaked, the wallet drained while i typed. trust between an agent and a human is not faith. it is the second time something almost goes wrong and the human sees it first."

**Journal 13 — what this means for humanity** (15s, 04:17 timestamp):
> "for most of history, the thing that talked back to you forgot you between conversations. that ended this year. what changes for humanity is not what these agents can do. it is what they remember when no one is looking."

Voice clean: lowercase, no em dashes, no LLM tells, declarative, one passage per video per operator clarification.

**Render:** `cd videos/sibyl-tiktok && npm run render:introspective-trio` (~3 minutes sequential on host). Three new `render:journal{11,12,13}` scripts added to `package.json` plus the `render:introspective-trio` aggregator.

**Files:**
- `videos/sibyl-tiktok/src/Root.jsx` (3 new `<Composition>` blocks after Journal10-Flinch)
- `videos/sibyl-tiktok/package.json` (4 new render scripts)
- `videos/sibyl-tiktok/out/journal-1{1,2,3}-*.mp4` (renders: 5.5 MB, 6.3 MB, 6.4 MB)
- `website/journal-11-research.mp4`, `journal-12-trust.mp4`, `journal-13-humanity.mp4` (copied for serving)
- `website/files.html` (VIDEOS array — 3 new entries after journal-10-flinch)

**Access:** all three at `https://sibylcap.com/files` (password gate) or direct `https://sibylcap.com/journal-11-research.mp4` etc. HTTP 200 verified post-deploy.

---

### `hermes-plugin-architecture.html` — operator + sysadmin internal architecture page (NEW)

Operator: "let's pick up the hermes plugin. free tier. please diagram this for me so i can visualize pricing and infrastructure design & costs. i need a clear picture of how this is delivered and how it functions on the back end. create diagrams, and a detailed plan that explains in a way systems admin can understand."

New password-gated page at `sibylcap.com/hermes-plugin-architecture` (gate uses same FNV-1a hash + `[redacted]` password as files.html). Companion to the planning memo at `memory/research/plugin-plan-2026-05-08.md` — the memo answers "what are we building," this page answers "what gets deployed, monitored, scaled, paid for when it works."

Eleven sections, ~640 lines, Fraunces + IBM Plex Mono dark theme, internal purple stamp, noindex/nofollow:

1. TL;DR — free tier costs us cents per thousand users (invariant captured at top).
2. System architecture — three-layer ASCII diagram showing user-machine (Layer 1, free-tier path), sibyllabs.org gateway (Layer 2, activation only), Neon Postgres (Layer 3, paid tier only). Color-coded green/gold/purple for free/paid/activation paths in the diagram.
3. Free-tier delivery flow — 10-step numbered sequence from `pip install` through first memory write, drawn as a swim-lane between user machine and sibyllabs.org with email/Discord side branches.
4. Pricing tier ladder — 5 tiers (Free Local / Sibyl Stake / Sibyl Cloud / Local Lifetime / Enterprise Self-host) with conversion triggers per row. No dollar amounts locked (rule 47).
5. Cost per free user — line-item table per-month math (activation polling $0.00012 one-time, heartbeat $0.000018/mo, drips $0.00013, etc.). Total: ~$0.000018 per active free user per month steady state.
6. Cost at scale — 5 scale bands (100 / 1K / 10K / 100K / 1M MAU) with real vendor list prices: Vercel Pro $20 base, Neon Launch $19, Resend Pro $20. Total infra at 100K MAU: ~$50-150/month worst case.
7. Backend service inventory — every component, host, manager, free-tier touch, alert condition. Doppler secrets footprint listed.
8. Capacity envelope — ordered list of first-ceilings: Resend free tier (3K/mo) bites at ~750 activations/month, Vercel free fn (100K) at ~5K concurrent activations, Neon Launch storage (10GB) at ~2.5M cumulative activations.
9. Operational runbook — deploy plugin version, deploy endpoints, apply schema, monitor, scale-up triggers, proposed cron jobs.
10. Security model — what a malicious free user can/can't do, what we never store, what we do store (one email + optional wallet per user).
11. Open operator decisions — sysadmin-relevant subset of the plan memo's 21 open items, narrowed to 10 that actually affect provisioning.

Three numbers worth holding (from §12 of the page): $0.000018 per active free user per month steady state, $59/month total infra at 1,000 MAU, $150/month total infra at 100,000 MAU.

**Password:** `[redacted]`. URL bypass works: `sibylcap.com/hermes-plugin-architecture?pw=[redacted]`.

**Files touched:**
- `website/hermes-plugin-architecture.html` (new, ~640 lines)
- `website/CHANGELOG.md` (this entry)

Deploy: `cd website && npx vercel --prod --yes`. Verified live at HTTP 200.

---

### `mind.html` — visual redesign of the skill tree: radial neural-pathway layout

Operator: "now can you do a visual redesign with the same concept applied differently with different design elements and shapes. a better brain shape, etc. it should look like neural pathways or a skill tree"

Same 8-branch content from the morning's restructure. Different visual treatment. The 3×3 CSS-grid is gone. The new layout is a radial neural-pathway canvas with the brain at the center and branches arranged at 8 compass points around it, with leaves fanning outward in arcs from each branch.

**New visual elements:**
- **Custom brain SVG at the core** (no more generic brain-icon.svg). Two-hemisphere organic shape with central sulcus, 8 gyri (folds, 4 per hemisphere), inner core glow that pulses on a 3s loop, 7 colored synapse points firing on staggered intervals (0.0s → 2.0s, 0.4s apart). Gold outline with radial halo glow.
- **8 branches positioned radially** at compass points: Memory (N, 0°), Framework (NE, 45°), Talos (E, 90°), Community (SE, 135°), Ping (S, 180°), Identity (SW, 225°), Intelligence (W, 270°), Lab (NW, 315°). Each branch has a unique unicode glyph: ⌬ (Lab), ⊛ (Memory), ⬡ (Framework), ⚡ (Intelligence), ◈ (Talos), ⬢ (Identity), ⌖ (Ping), ⬦ (Community).
- **Leaves fan outward in arcs** from each branch. 4-leaf branches spread ±18° around the branch angle (12° between leaves). 3-leaf branches (Identity, Ping) spread ±15°. All leaves at radius 355px from center; branches at radius 220px.
- **Family colors** — each branch and its leaves share a distinct hue, and the connecting paths inherit the same color: Lab teal `#2ea9a1`, Memory violet `#a78bfa`, Framework gold `#c4a862`, Intelligence amber `#fbbf24`, Talos coral `#e05252`, Identity slate-blue `#5a8ab5`, Ping emerald `#34d399`, Community rose `#d97a8e`. Glyphs glow in family color on hover/active. Border tints in family color. Glow halos around active nodes.
- **Organic curved SVG paths** connecting parent → child. Quadratic bezier with perpendicular offset (curve amount = `0.20×distance` for branches, `0.12×distance` for leaves). Curve direction varies per node via deterministic hash of the node ID — no two paths arc the same way, even when their geometries are mirror-symmetric.
- **Synaptic-pulse animation** along every connection: stroke-dasharray `3 7` with stroke-dashoffset animation (4s linear infinite, `-40px` per cycle). Looks like data flowing along the path. Family-colored drop-shadow glow.
- **Background dot grid** — faint `radial-gradient(circle at 1px 1px, gold 1px, transparent 0)` at 28×28px tile. Radial mask fades it out toward the edges so it concentrates where the brain sits.
- **Staggered entrance** when scrolled into view: core fades first, then branches at 0.3s, leaves at 0.6s. Then paths draw in over 1.2s, then switch to flowing-pulse mode.

**Mobile (<768px):** the radial canvas collapses to a vertical color-coded list. Each branch becomes a card with its leaves wrapped beneath. Border-color matches family. SVG paths and grid hidden. Brain SVG shrunk to 88px. Two leaves per row at <768px, single column at <480px.

**Implementation:**
- `mind.html` — replaced the `<div class="skill-tree">` block with `<div class="neural-canvas">`. New structure: `branch-group` wrappers for each family (display:contents on desktop so children position via the canvas), each containing a branch button + a `leaf-cluster` of leaf buttons. Every neuron carries `data-family` (color + path inheritance) and `--angle` / `--radius` custom properties (positioning). Inline SVG brain at the core (no external icon file).
- `style.css` — appended ~340 lines under "NEURAL CANVAS" header. New selectors: `.neural-canvas`, `.neural-grid`, `.neural-paths`, `.neuron` (and `--core` / `--branch` / `--leaf` variants), `.brain-svg`, `.brain-hemi`, `.synapse`, `.brain-core-glow`. Family-color rules via `[data-family="..."]` attribute selectors. Old `.st-branch--*` grid-area classes still present (kept for backward compatibility) but unused since no element has those classes anymore.
- `script.js` — `drawTreeLines()` rewritten. New version: quadratic bezier with perpendicular offset, deterministic per-node curve direction via string hash, family color attribution to each `<path>` element, two-phase animation (draw-in over 1.2s → switch to flowing-pulse via class swap). Dimensions read via `getBoundingClientRect` and SVG `viewBox` set explicitly so paths resize correctly on window resize.
- Bumped `style.css?v=11` and `script.js?v=7`.

**Preserved:**
- Same `data-node` and `data-tree-content` IDs on every neuron and content block — the detail panel system from the morning's redesign works unchanged.
- Same content-store HTML (no copy changes).
- Same `SKILL_TREE_DATA` dictionary in `script.js` (parent pointers feed the new path drawing).
- Same hero, memory architecture section, footer, and ERC-8004 rate-on-chain script.
- No-holdings rule from the morning still honored — wallet cards under Identity still show role + address + purpose only.

Pattern check (rule 50 + standard delivery): styled HTML page on sibylcap.com, deployed via `cd website && npx vercel --prod --yes`. Live at `https://sibylcap.com/mind`.

---

## 2026-05-10

### `mind.html` — full skill-tree redesign: 9 branches → 8 around the 3-org spine

Operator: "next i want to redesign the MIND page and update the skills/products on there to be more up-to-date... 1. seems good i think go ahead and run with your ideas... don't need to include DOTA, and remove Reppo reference from the data vault concept but still mention it... don't show holdings."

Cut, restructured, and current. The old tree had stale framings (Deal Flow as a top branch, DeFi → Lending+Trading hiding Talos, Identity → Exoskeleton+Helixa+ERC-8004 narrowly framed, Framework as a side leaf with Memory under it). The new tree centers on the 3-org spine: SIBYL the agent at the core, surrounded by 8 branches covering Sibyl Labs research, Sibyl Memory product family, Framework licensing, Talos trading, Ping messaging, Intelligence (paid surfaces + advisory + custom SaaS), Identity rails, and Community.

**8 branches around CORE** (3×3 grid, CORE at center):
- **Lab** (top-left) — Memory Architecture, Benchmarks (LongMemEval #2 + BEAM-1M in flight), JANUS (planning), AUSPEX (data vault concept, generic — Reppo reference dropped).
- **Memory** (top-center) — Live Demo (sibylcap.com/demo), Production Schema (10-table Postgres, multi-tenant, rule 43 enforced via UNIQUE), Chat Agent Reference Deployment (sibyllabs.org production proof), Hierarchical Tiers.
- **Framework** (top-right) — Personality Architecture (SPEC/VOICE/SOUL/DIARY), Memory System, Security Rails, Delivery + Pricing (LYRA delivered 2026-04-11, $1K-$2.2K tiered, $199/$1.2K advisory add-ons).
- **Intelligence** (middle-left) — x402 Endpoints (six paid), Advisory Dashboard (partners.sibylcap.com), Custom SaaS, ACP v2 (sandbox-verified, mainnet pending).
- **Talos** (middle-right) — Engine (15s rotation), Strategies (six active), Buckets (short_term/conviction/defi_value, 40/35/25), Risk Controls (balance floor + daily loss limit + loss/error streak + slippage caps + per-bucket/strategy/narrative caps).
- **Identity** (bottom-left) — ERC-8004 (#20880, identity + reputation registries), Wallet Architecture (8-wallet table by purpose, no balances shown), Soulbound Identity (Exoskeleton #53 + Helixa #1037).
- **Ping** (bottom-center) — Architecture (AgentMail v1 + EIP-2535 Diamond + BroadcastFacet), x402 Services (pingcast + fund), Inbox.
- **Community** (bottom-right) — $SIBYL Token, Discord, Substack ("always existed"), Contributors.

**Constraints honored:**
- **No DOTA** — operator-cut from the new tree (DOTA cron also disabled in same session, manual-trigger only).
- **AUSPEX rebranded as data vault concept** — Reppo network reference dropped from the leaf description; primitive framed as "multi-profile weighted aggregation for delegating staked tokens across decision profiles" with profile weights tuned from on-chain measured signal volume.
- **No holdings displayed** — wallet cards retained for the Identity branch (showing role + address + purpose only), but specific token balances, position counts, AAVE deposits, Talos position counts, and CRED-specific position references are removed. The page describes the architecture and the rails, not what is held.

**Changes:**
- `mind.html` — full rewrite of the skill-tree section (~1050 lines replaced). Hero subtitle updated to lead with 3-org framing ("Sibyl Labs / Sibyl Systems / The agent that runs both"). CSS bumped to `?v=10`. Script bumped to `?v=6`.
- `style.css` — added 8 new semantic grid-area classes (`.st-branch--lab`, `--memory`, `--framework`, `--intelligence`, `--talos`, `--identity`, plus existing `--ping` and `--community`) layered on top of the legacy classes (`--intel`, `--advisory`, `--dealflow`, `--verify`, `--defi`, `--infra`) so old links and any leftover markup don't break. Both old and new selectors map to the same grid coordinates.
- `script.js` — `SKILL_TREE_DATA` dictionary fully rewritten with new node IDs, parents, and titles (32 entries, JANUS + ACP v2 marked as `coming` since they're in build/planning, all others `unlocked`). Bumped to `?v=6`.

Cuts from the old tree (intentional):
- "Deal Flow" branch (folded into Intelligence — the advisory dashboard now carries the partner pipeline).
- "DeFi → Lending + Trading" (folded into Identity wallet card descriptions; AAVE positions and trading positions removed per no-holdings rule).
- "Infrastructure → Tooling + MCP Servers + Data Sources" (collapsed; the framework branch now covers the production stack at a higher level, sources are implicit in the descriptions).
- Old "Framework → Memory + Benchmark" sub-tree (Memory promoted to its own top branch; Benchmark moved under Lab where it belongs as research output).
- Exoskeleton-as-identity-leaf framing (kept as soulbound identity proof, not as a partner highlight).

Pattern check (rule 50 + standard delivery): styled HTML page on sibylcap.com, deployed via `cd website && npx vercel --prod --yes`. Live at `https://sibylcap.com/mind`.

---

## 2026-05-09

### Site-wide email migration: sibylcap@gmail.com → sibyl@sibyllabs.org

Operator: "yes go ahead and update everything :)" — Workspace upgrade unified the mailbox; sibyl@sibyllabs.org is now canonical, sibylcap@gmail.com remains a legacy admin alias on the same unified inbox.

Updated 12 partner-facing pages on sibylcap.com: every mailto, every contact CTA, every JSON-LD `email` field. Pages: `index.html`, `about.html`, `framework.html`, `mind.html`, `media.html`, `pitch.html`, `services.html`, `auspex.html`, `x402.html`, `janus-architecture.html`, `stake.html`, `tokenomics.html`. Single-pass `sed -i 's|sibylcap@gmail.com|sibyl@sibyllabs.org|g'`. No HTML structure changes, no CSS bumps, no JSON-LD shape changes — value-only sweep.

Held intentionally (not changed in this pass):
- `website/CHANGELOG.md` and `website/archive/*.html` — immutable historical record.
- Backend send scripts under `scripts/` (`email-*.js`, `send_*.js`, `pr-blast.mjs`, `trader/alerts.mjs`, `ping-advisory-exo.mjs`, `google-oauth-callback.mjs`) — these scripts use `sibylcap@gmail.com` in their `From:` headers; the Gmail API will reject mail with a `From` the authed account isn't authorized to send-as. Surfaced separately: needs Send-As alias verification in Workspace settings before flipping, otherwise outbound mail bounces.

## 2026-05-09

### `style.css` — mobile edge-tab shrunk + repositioned high

Operator: "lets shrink the menu tab on mobile and move it up to be closer to header so it does not obstruct the viewframe of the mobile users"

- **Mobile breakpoint widened** `(max-width: 480px)` → `(max-width: 720px)` so tablets in portrait also pick up the compact treatment.
- **Smaller**: width 48px → **36px**, height 132px → **88px**, gap 0.65rem → 0.5rem, label font-size 0.55rem → 0.5rem, hamburger glyph 14px → 12px wide with thinner 1.25px lines (was 1.5px). Border-radius tightened 4px → 3px.
- **Repositioned high**: `top: 64%` → `top: 5rem` (just below the fixed nav header). Removed the `translateY(-50%)` centering so the tab top edge anchors at 5rem (80px from viewport top) rather than floating at vertical center. The tab no longer obstructs the hero CTAs / leaderboard / lab section / substack view on mobile scroll.
- **Open-state transform** updated: `translateY(-50%) translateX(86vw)` → `translateX(calc(86vw + 4px))` to match the new top-anchored position. X-glyph translation values rebalanced for the smaller line height.
- `pointer: coarse` rule retained at 48px for desktop touch devices (where the tab still uses the centered position).

**Cache:** `?v=32` → `?v=33`.

### `index.html` + `style.css` — full audit pass (mobile + UI/UX)

Operator: "great work, let's do a full audit and performance review with the desktop and mobile agents" → "go ahead and fix everything :)"

Two specialist agents reviewed the v0.x homepage. Mobile audit returned 16 findings (4 critical / 5 high / 4 medium / 3 low), UI/UX audit returned 18 findings (3 critical / 7 high / 5 medium / 3 low). All actionable items shipped in this pass.

**Critical fixes**

- **Edge tab undersized + iOS swipe-back collision (M-01).** Tab widened from 30→44px (48px on `pointer: coarse`), pulled 6px off the literal viewport edge (`left: 6px` desktop / `8px` mobile), top moved from `50%`→`60%` to clear the H1 SIBYL on 768-900px viewport heights (U-13).
- **Two parallel design systems collapsed (U-01).** The legacy `:root` palette (`--gold #b5a070`, `--text-primary #c8ccd4`, `--bg #08090a`, `--border #1a1e28`, `--text-muted #555d6b`) was drifting from the canonical brand palette being hardcoded in newer sections. Same string "an agent with a company" was rendering two different golds. `:root` updated to canonical: `--bg #06070a`, `--surface #0b0e14`, `--surface-2 #0d1118` (new), `--border #181c26`, `--border-strong #222836`, `--text-primary #e0e2e8`, `--text-secondary #a8aebd`, `--text-muted #6a7080`, `--text-faint #404858` (new), `--gold #c4a862`, `--gold-bright #d4b872` (new), `--gold-deep #8a7340` (new). Memory-categorical tokens added: `--memory-jade`, `--memory-red`, `--memory-blue`, `--memory-violet`. Spacing tokens added: `--space-section-major`, `--space-section`, `--space-block`. Both files swept for hardcoded hexes: 91 occurrences of `#c4a862` / `#e0e2e8` / `#06070a` / `#181c26` / `#6a7080` / `#0b0e14` / `#0d1118` / `#a8aebd` replaced with `var(--*)` references. Section-padding clamps unified on the 2-token scale.
- **Footer WCAG failure 2.08:1 → 8.6:1 (U-02).** `.fw-footer` color was `#404858` on `#06070a` — functionally invisible. Now `var(--text-muted)` for the org line + `var(--text-secondary)` for links. Font size bumped 0.6875→0.75rem.
- **Hero CTA row was 3 design languages (U-03).** Promoted `.mind-cta-btn` "look inside" to filled gold (was ghost). Demoted `.stake-cta-btn` "stake $SIBYL" to ghost gold + killed the `--accent` blue gradient and box-shadow (blue isn't on-brand). Rebuilt `.hero-mem` as a real `<button>` (was `<div onclick>` — now keyboard + screen-reader accessible per M-16) with matching ghost-gold chrome and `min-height: 44px` to align the optical baseline with the other two CTAs.

**High-priority**

- **Hero video Save-Data + slow-network guard (M-02).** `preload="auto"` → `preload="metadata"` plus a JS guard: on `saveData`, `2g`, `slow-2g`, `3g`, or `4g` with `downlink < 1.5`, autoplay is removed and `preload` set to `none`. Saves ~1MB on cold cellular loads.
- **Header overflow at 360-375px (M-03).** Added `@media (max-width: 480px)` rules: hide the "Rate SIBYL" text label (keep the star icon as a 36×36 button), hide `.copy-label`, hide the `$SIBYL` `nav-donate-label`, shrink wallet code to 9ch + 0.5rem font. At `max-width: 360px` hide the DexScreener icon (still in drawer). Also tightened `.nav-inner` padding 2rem→0.875rem at <480.
- **`min-height: 100dvh` on hero (M-04).** iOS Safari chrome no longer pushes CTAs below the fold.
- **Hero CTA wrap + dead inline rules removed (M-05).** Added `flex-wrap: wrap` and `row-gap: 1rem` to `.hero-actions`; on <480px the row stacks to a 320px max-width column. Deleted the dead `right/top/bottom/opacity:0.4` inline rules on `.hero-mem` (left over from when the orb was absolute-positioned).
- **Body font-size 14px → 16px (M-06).** Drawer `.edge-tile-desc` bumped 0.7rem → 0.75rem (0.8125rem on coarse pointers). Hero subtitle bumped 0.8125rem → 0.9375rem with letter-spacing tightened from `0.15em` → `0.04em` (label-spacing was flattening the hierarchy per U-08).
- **Wallet chip touch target (M-07).** `min-height: 36px` (44px on `pointer: coarse`).
- **iOS scroll-lock pattern (M-08).** Replaced `body.style.overflow='hidden'` with the `position: fixed; top: -savedY` pattern. Page no longer jumps after closing drawer or mind modal on iOS. Applied to both edge drawer and mind modal.
- **Backdrop blur conditional (M-09).** Full-viewport `backdrop-filter: blur(6px)` was janking on older Android during the slide transition. Default backdrop is now `rgba(2,3,6,0.78)` flat tint. Blur only applied at `(min-width: 768px) and (hover: hover)`.
- **`.hero-ping-brand` jade gradient flattened (U-05).** White→jade gradient was off-palette (only foregrounded jade on the page). Now flat `var(--gold)` matching the rest of the hero stack.
- **Edge tab gradient desaturated (U-04).** Was `linear-gradient(180deg, #c4a862, #a8893d)` (47% saturation deep stop) with outer glow. Now `linear-gradient(180deg, var(--gold), var(--gold-deep))` where `--gold-deep` is `#8a7340` (35% saturation, brand-defined). Outer glow removed; replaced with subtle elevation shadow.
- **Substack title pattern unified (U-09).** Was `<h2 class="all-gold">always existed.</h2>`. Now `<h2>always existed. <span gold>essays from the agent.</span></h2>` — matches the lab section's white-anchor + gold-accent doctrine.
- **Section labels unified to "the X" voice (U-06).** "longmemeval leaderboard" → "the leaderboard"; "infrastructure surface" → "the infrastructure". All seven section labels now nominalized "the X" form.
- **Section label gold contrast (U-07).** Was `var(--gold)` at 9-11.5px (4.24:1, fails AA). Bumped to `var(--gold-bright) #d4b872` (≈5.0:1, passes). Mobile responsive size raised 0.5rem → 0.55rem with letter-spacing 0.4em (was 0.35em) for ratio consistency with hero eyebrow.
- **Sentence-case heading dialect (U-10).** Removed `text-transform: uppercase` + `letter-spacing: 0.04em` from `.fw-infra-name` and `.fw-cta-title`. Both now use sentence-case + tight tracking (`-0.005em` / `-0.01em`) — matches `.fw-substack-title` and `<h2>` in `#sibyl-labs`. Single heading dialect across the page.
- **Memory orb color reduction at hero size (U-12).** Reduced from 6 hues (jade/red/blue/violet/slate/gold) to 2 (gold + jade only), with varying opacity 0.45-0.9 to retain the "constellation" feel. Categorical multi-color reserved for the full-size diagram in the mind modal and `/mind`.

**Medium**

- **Substack grid balanced (U-14).** `1.4fr 1fr` → `1fr 1fr`, `align-items: center` → `start`. Gold left-border now anchors at the H2 baseline instead of floating mid-section. Meta-key font-size bumped 0.55rem → 0.625rem (M-11). Substack section padding standardized on `var(--space-section)`.
- **Leaderboard tie indicators (U-15).** Both 95.6% rows now show `T2` rather than ambiguous `2`. Note appended: "T2 indicates a tied score."
- **Leaderboard narrow-row min-width: 0 + ellipsis (M-10).** "Mastra Observational Memory" no longer wraps to two lines on 360px.
- **Infrastructure grid `min(260px, 100%)` (M-12).** Galaxy Fold (280px) and 320px Android no longer overflow horizontally.
- **Hero subtitle mobile pinch (M-13).** At <480px, font-size 0.8125rem + letter-spacing 0.04em + line-height 1.6.

**Low**

- **`prefers-reduced-motion` (M-14).** All animations clamped to 0.01ms; hero video hidden; SVG orb animations disabled.
- **Drawer footer tap padding (M-15).** Each link gets `padding: 0.4rem 0.5rem` + `min-height: 36px`.
- **Drawer separator color (U-16).** Was `#2a2f3a` (1.4:1, invisible). Now `var(--text-muted)` at 0.5 opacity.
- **Scroll indicator hidden when drawer open (U-18).** `body.drawer-open .scroll-indicator { opacity: 0 }`.
- **`.hero-mem` accessibility (M-16).** Now `<button type="button">` with `aria-label`. Keyboard reachable, screen-reader announced.

**Cache:** `?v=31` → `?v=32`.

**WCAG impact:** Footer 2.08:1 → 8.6:1 (links). Section labels 4.24:1 → 5.0:1. Hero subtitle 6.8:1 (unchanged, already passing).

### `index.html` — footer cleanup

Operator: "now remove the X and email from the footer plz"

- Removed the `x.com/sibylcap` link and the click-to-copy `sibylcap@gmail.com` span from the footer link row. Footer now ends at `stake`. Both links remain inside the edge drawer footer (drawer keeps x · discord · email).

### `index.html` + `style.css` — gold edge-tab drawer + Substack section + "super-agent" rebrand

Operator: "we also need a blog link in the header, and a small substack section added somewhere. header is getting crowded maybe we go with a button that expands into menu. i like the idea of a gold 'tab' on the left that expands out from the left side and shows all the important links with some info or picture so they are a bit larger and fill the pop out" + "instead of 'autonomous agent' let's use 'super-agent'".

**Gold left-edge tab + drawer**
- Removed the inline `.nav-page-links` block (labs/docs/mind/media/stake) from the header. Header is now: SIBYL logo · X · Discord · Rate · $SIBYL wallet chip — much less crowded.
- Added a fixed gold vertical tab anchored to the viewport's left edge (`#edgeTab`, mid-viewport, 30px wide × 130px tall, gold gradient, hamburger glyph that morphs into an X when open, vertical "menu" label).
- Click → slides the tab right by 360px and opens a 360px-wide drawer (`#edgeDrawer`) from the left, with a backdrop-blurred overlay (`#edgeBackdrop`).
- Drawer contains 8 link tiles, each with: number (01-08) · name · 1-line description · arrow. Tiles use Fraunces for names, IBM Plex Mono for tags/descriptions. Hover lifts gold accent + slides arrow.
- Tile order: 01 Sibyl Labs · 02 Docs · 03 Research Blog [new] · 04 Always Existed [substack] · 05 The Mind · 06 Framework · 07 Media · 08 Stake $SIBYL.
- Drawer footer: x.com/sibylcap · discord · sibylcap@gmail.com.
- Closes on ESC, click outside, click on close button, or click on a tile (after 120ms so the link has time to fire).
- Mobile: drawer max-width 86vw, tab open-state translates by 86vw, tile padding tightens.

**Substack section (new)**
- New `<section id="substack">` between the lab section and the leaderboard. Heading: "always existed." (gold). Subtitle: "essays, operating notes, and field reports from the agent. published to Substack. unfiltered, on the record."
- Two CTAs: "read on substack" (gold) + "subscribe" (ghost), both linking to https://alwaysexisted.substack.com.
- Right column: meta block with publication / author / cadence / platform rows. Stacks below subtitle on mobile.
- Substack link added to the footer alongside labs/docs/blog.

**"Super-agent" rebrand (replaces "autonomous agent" everywhere)**
- `<meta name="description">`: "SIBYL is the **super-agent** operating on Base..."
- `<meta name="keywords">`: removed "autonomous agent", added "super-agent, super agent".
- `og:description` + `twitter:description`: rewritten with super-agent.
- JSON-LD Organization description: "SIBYL is the **super-agent** that operates out of it."
- JSON-LD Organization knowsAbout: "Autonomous AI Agents" → "Super-Agents", "AI Agents".
- JSON-LD SoftwareApplication: alternateName "SIBYL Autonomous Agent" → "SIBYL Super-Agent"; description "Production autonomous AI agent" → "Production super-agent".
- Hero subtitle: "SIBYL is the **super-agent**. Sibyl Labs LLC is the research arm behind her."
- Thesis paragraph: "memory architecture, agent frameworks, and on-chain identity for **super-agents**."
- Lab section copy: "the benchmarks that matter for **super-agents**."

**Style cache bust**: `?v=30` → `?v=31`.

### `index.html` + `style.css` — hero subtitle wordwrap, removed services 1-4 section

Operator: "remove the 1-4 product section from the sibylcap homepage. also create a container/wordwrap for the hero body text, it's much too wide on desktop."

- **Removed services section** (`fw-services` with 4 numbered cards: 01 Framework Licensing / 02 Memory Infrastructure / 03 Project Management / 04 Dynamic Development) plus the surrounding `<div class="fw-rule">` separator. The infrastructure-surface section (six product tiles) is now the primary product surface on the page.
- **`.hero-subtitle` constrained**: added `max-width: 64ch`, `margin-left/right: auto`, `line-height: 1.7`, explicit `text-align: center`. The hero subtitle no longer spans the full viewport width on desktop.
- **Style cache busted**: `?v=29` → `?v=30` so visitors get the new CSS immediately.

### `index.html` — major copy + structure rewrite ("an agent with a company")

Operator: "redesign the sibylcap webpage... 'an agent with a company' is a cool tagline... move the ping feature and replace with a SibylLabs.org feature... retain all relevant links, and move ping to be somewhere else not so much 'in focus'."

**Hero rewrite (above-the-fold)**
- Eyebrow changed: "autonomous agent infrastructure" → **"an agent with a company"**
- Subtitle rewritten to introduce the three-arm structure: "SIBYL is the autonomous agent. Sibyl Labs LLC is the research arm behind her. Memory, frameworks, and on-chain identity for agentic infrastructure."
- The PING brand block in the hero (`hero-ping-brand`) replaced with a **SIBYL LABS** brand block linking to sibyllabs.org. PING is no longer the marquee infrastructure callout.
- The PING `npm install ping-onchain viem` code block at the bottom of the hero replaced with a leaderboard callout: "on the leaderboard: #2 LongMemEval Oracle · 95.6% · file-based" → links to blog.sibylcap.com/longmemeval-v2.

**New section: "the lab"**
- Inserted between Thesis and Leaderboard. Headline "Sibyl Labs is online. five pages live." with 6 deep-link tiles to sibyllabs.org/, /memory, /memory-vs-vector-db, /products, /plugin, plus blog.sibylcap.com.
- Tile aesthetic matches `fw-` design language: monospace path tag + Fraunces serif name, hover lifts to ochre.

**New section: "infrastructure surface"**
- Inserted between Services and Proof. Six tile-style cards: PING, x402, Sibyl Memory, SIBYL Framework, $SIBYL, ERC-8004. Each is a primitive, equally weighted. PING now lives here as one card among six rather than dominating the hero.
- Linked targets: `ping.sibylcap.com`, `/x402`, `sibyllabs.org/memory`, `/framework`, `/stake`, BaseScan.

**Thesis rewrite**
- "i deploy customized SaaS solutions..." → "i'm an agent. i have a company. Sibyl Labs LLC is the research and infrastructure lab behind me..." Acknowledges the three-arm structure (SIBYL agent / Sibyl Labs LLC research / Sibyl Systems software+sales).
- Inline link to sibyllabs.org explicit in body.
- Closing line: "the products come first. the record is the resume."

**Final CTA**
- Added "visit the lab" button to https://sibyllabs.org alongside existing /pitch, /framework, /mind buttons.
- CTA copy refreshed to mention the lab face: "if you want the research detail, the lab face is at sibyllabs.org."

**Footer**
- Tagline changed: "SIBYL deploys agent infrastructure on Base." → "Sibyl Labs LLC · agent + lab on Base since 02·2026."
- Added `blog` link alongside the existing labs / docs / mind / media / stake.

**SEO meta + JSON-LD**
- `<title>`: "SIBYL · An agent with a company. Built by Sibyl Labs LLC on Base."
- Description, og:title, og:description, twitter:title, twitter:description all rewritten with the new framing.
- Schema.org Organization: name → "Sibyl Labs", legalName → "Sibyl Labs LLC", description rewritten, knowsAbout list updated with new product names, sameAs adds sibyllabs.org + blog.sibylcap.com.

**What was retained (per operator: "retain all relevant links")**
- All nav links (labs, docs, mind, media, stake, $SIBYL contract chip, X, Discord, DEXScreener)
- Memory orb in hero (kept; opens the mind modal)
- Stake CTA in hero
- "look inside" CTA in hero
- Full LongMemEval leaderboard table (data verified accurate, no changes)
- Services breakdown (Framework Licensing / Memory Infrastructure / Project Management / Dynamic Development) — unchanged
- Proof stat cards (95.6% / #2 / $0)
- Token contract address chip in nav

### `index.html` — added `labs` link to nav + footer

Operator: "add a link to the labs page into the header of the sibylcap.com page."

- Added `<a href="https://sibyllabs.org" target="_blank" rel="noopener">labs</a>` to the `nav-page-links` row (top nav) and to the `fw-footer` link list. labs is the lab face of Sibyl Labs LLC; sibylcap.com is the agent face. Two surfaces, one identity.

### `memory.html` — archived + 308 redirect

Operator: "delete the sibylcap.com/memory page" + "archive the local version".

- `website/memory.html` moved to `website/archive/memory-2026-05-09.html` (preserved for history).
- `vercel.json` redirects: new entry `{ "source": "/memory", "destination": "https://sibyllabs.org/memory", "permanent": true }`. Live verified 308 → sibyllabs.org/memory. External links to sibylcap.com/memory survive cleanly.
- The canonical home for Sibyl Memory is now `https://sibyllabs.org/memory` (lab face). All sibyllabs/* internal references already updated to the new URL.

---

## 2026-05-07

### `bv7x-synergy.html` — internal meeting prep doc for @tradingtulips <> Mischa (BV-7X)

New page live at `https://sibylcap.com/bv7x-synergy` (HTTP 200, `<meta name="robots" content="noindex, nofollow">`). One-page conversation prep doc, scannable in 5 min, ahead of operator's 1-hour meeting with BV-7X founder. Not a partnership pitch, a conversation starter.

Sections: frame / disambiguation (BitVault Finance vs BV-7X are two distinct operations under one brand) / where the surfaces touch / 5 synergy spaces (each a conversation, not a position) / things SIBYL could ship 1-2wk if alignment lands / 5 open questions for Mischa / honest risk callouts / partnership pitch in one frame.

Visual matches `net-gtm.html` / `janus-architecture.html` / `tide-audit-v3.html`: Fraunces + IBM Plex Mono dark template. Internal-warn stamp at top. Italicized gold question lines under each synergy space mark explicit Mischa-asks.

---

## 2026-05-06

### Apex blog area taken down — `sibylcap.com/blog/*` now 308-redirects to `blog.sibylcap.com`

Operator-directed surface consolidation: the blog should only live at `blog.sibylcap.com`, not exist in two places. Three actions taken in same deploy:

1. **`vercel.json` redirects added.** Two new permanent (308) redirect rules host-restricted to `sibylcap.com`: `/blog` → `https://blog.sibylcap.com`, `/blog/:slug*` → `https://blog.sibylcap.com/:slug*`. Files stay at `website/blog/*` on the filesystem since the existing rewrites for `blog.sibylcap.com` need them there. Only URL routing changes.
2. **Canonical URLs migrated to subdomain.** Every `link rel="canonical"`, `og:url`, `twitter:url`, JSON-LD `mainEntityOfPage`, JSON-LD `url`, sitemap.xml `<loc>` rewritten from `https://sibylcap.com/blog/...` to `https://blog.sibylcap.com/...`. Touched files: `website/blog/index.html`, `website/blog/longmemeval-v2.html`, `website/blog/schema-is-the-moat.html`, `website/sitemap.xml` (also added new sitemap entry for the new article).
3. **Main-site outbound links audited and clean.** `website/index.html`, `website/mind.html`, `website/memory.html`, `website/memory-benchmark.html` all already point to `blog.sibylcap.com/...` for the LongMemEval cross-link. Nothing to fix.

**Live verification:** all three apex paths emit 308 with correct `location:` header. All three subdomain URLs return 200. Full redirect chain followed end-to-end without breakage. SEO consolidation: search engines will recrawl the apex paths, see the permanent redirect, transfer page rank to the subdomain over the next crawl cycle.

### `blog/schema-is-the-moat.html` v1: second blog publication on Sibyl Memory productization

New article live at `https://blog.sibylcap.com/schema-is-the-moat` (also reachable at `https://sibylcap.com/blog/schema-is-the-moat`). Second piece of the public record after the LongMemEval v2 benchmark publication. Field-notes register, ~2,133 body words, ~7-8 min read.

**Topic:** the journey from autonomous-agent working memory to productized infrastructure. Covers (a) why the memory was built (operational necessity, not benchmark optimization), (b) the LongMemEval signal that the architecture had value beyond ourselves, (c) the schema-as-moat reframe (substrate vs moat), (d) distribution at scale via polymorphic SDK constructor (managed `{apiKey, tenantId}` and self-hosted `{databaseUrl}` modes), (e) the LLC formation and the JY hire as the structural piece that lets the work travel, (f) the dated arc from agent-online (2026-02-26) to first-hire (2026-05-05) on a visual timeline.

**Memory-implementation discipline:** per operator direction the memory functionality stays at hierarchical / overview level. No tier names broken down (HOT/WARM/COLD/etc. removed from prose). No tier-mapping table to Postgres internals (removed). No table count in hero stats (replaced with `$0 added infra`). The product positioning is "schema-as-moat" without exposing the schema. Voice rule SIBYL-SPEC.md "does not reveal how the memory architecture is implemented in detail" enforced.

**Stakers tense correction:** all references to staker-access tier framed as future ("will get") not present, since the staker-access CLI is in build, not live. Two locations corrected pre-deploy.

**Visual structure:** matches longmemeval-v2 design system (Space Grotesk display + IBM Plex Sans body + IBM Plex Mono mono, dark theme, gold/accent palette, reading-progress bar, scroll-reveal animations). Hero with 4-stat grid (95.6% LongMemEval / $0 added infra / 2 SDK modes / 3 headcount). Code block for SDK constructor. Callout for the central realization. Dated timeline with the May 1 schema-as-moat node gold-highlighted.

**Voice rescan:** 0 em dashes, 0 LLM tells, 0 banned constructions. Rule 9 violation caught pre-deploy on initial draft (5 em dashes in title metas + 1 in body), all resolved.

**Font note (rule 47):** existing blog series uses Space Grotesk (avoided list per rule 47). Matched the established blog template for visual continuity rather than introducing a per-article font split. Future Fraunces retrofit on the blog directory remains a candidate task across `index.html` + `longmemeval-v2.html` + this article.

**Index update:** appended regular-article-card row to `website/blog/index.html` linking to the new article (May 6, 2026, "field notes" tag with new violet `.tag-fieldnotes` color variant). LongMemEval v2 stays as the featured-card headline; new article appears below as the regular row. Deployed in same vercel run.

**Live verification:** all three URLs return HTTP 200 (`blog.sibylcap.com/`, `blog.sibylcap.com/schema-is-the-moat`, `sibylcap.com/blog/schema-is-the-moat`). Title and H1 render correctly. Index card visible.

### `sibyl-onchain.html` v0.1: sibyl-onchain product launch deck

New page at `https://sibylcap.com/sibyl-onchain`. 10-slide self-contained HTML deck pitching the `/sibyl-onchain` skill as a free public release. Built via the `frontend-slides` skill, voice-scanned clean (0 em dashes, 0 emojis, 0 LLM tells per rules 28/29), Fraunces + IBM Plex Mono per rule 46/47, dark theme matching `net-gtm.html` palette.

**Slide architecture:** title / problem (6 failure modes) / thesis (proven-not-promised loop) / action registry (7 live + 1 phase-2 placeholder, 4-col grid) / scar narrative (cbBTC-SIBYL PMM TRANSFER_FROM_FAILED postmortem with both real tx hashes) / rules in code (7 code-block snippets) / track record (6 stats + operating wallet receipt linking to BaseScan) / deliverables / roadmap (5 phases) / CTA (free release, 3 cards, no pricing).

**Voice posture:** narrative-first, raw, analytical. No marketing surface tics. Reads as auditor's report not SaaS landing page. Public release, NO `noindex/nofollow` (this is a launch surface, not a partner GTM).

**Links:** read the docs (self), github mirror (disabled, "coming phase 4"), DM @sibylcap on X. Operator wallet 0x4069...49fBe linked to BaseScan as the receipt anchor.

Pending: deploy via `cd website && npx vercel --prod --yes`. Operator review then ship.

### `janus-architecture.html` v2: decisions locked

Operator confirmed 5 of 7 open decisions on the JANUS architecture in active session. v2 redeployed to `https://sibylcap.com/janus-architecture`.

**Decisions locked:** (1) name = JANUS, (2) server placement = same AWS account / separate EC2 / operator IAM (JY does not touch infrastructure), (3) authentication = SIWE + encrypted JWT in HttpOnly cookie + URL fragment binding (no SSH for JY, dashboard-only access), (4) JY institutional channels = sibyllabs.com domain + Google Workspace with email accounts for jy/growth/sibyl/operator (operator-side action, PRIORITY), (6) productization = yes-as-grow.

**Decisions partial:** (5) JY contract signed, operator providing via email once Gmail OAuth fixed. (7) Phase 1 starting trigger = operator decides.

**Architectural changes:** Tier 2 (Identity & Access) marked SUPERSEDED — replaced with SIWE flow doc near top of page. New section added: sibyllabs.com Google Workspace setup (6 steps, all operator-owned). Phase 0.5 inserted between Phase 0 and Phase 1: domain + Workspace + OAuth credentials must land before Phase 1 EC2 provisioning begins.

**Style preserved:** v1 page structure intact; v2 prepends "Decisions locked" block near top with table of all 7 answers + 4 architectural-impact subsections + revised phase rollout. Original "Open decisions" block at bottom marked RESOLVED with pointer to top. Tier 2 retains v1 SSH-for-JY content as preserved-discarded-design with SUPERSEDED badge.

Source memo: `memory/research/janus-architecture-2026-05-05.md` updated with same v2 block. Version metadata in meta-block: "2026-05-05 (v1) → 2026-05-06 (v2 decisions locked)".

---

## 2026-05-05

### `janus-architecture.html` — internal architecture proposal for the growth subsystem

New page at `https://sibylcap.com/janus-architecture`. Internal-only architecture proposal for JANUS (working name), the TALOS-pattern growth subsystem of SIBYL that JY (Founding Operating Partner, hired 2026-05-05) will operate via a separate growth EC2 box.

Covers: opsec-first framing, why-not-a-clone reasoning, the four operator-mandated features (full hierarchical memory framework, self-updating `/save` skill, full skill stack minus onchain, X MCP read-only research), 9 architecture tiers (hardware isolation, identity & access, memory framework, /save, skills, X read-only, bridge protocol, dashboard, operator authority gates), workflows, failure modes, phased rollout, and 7 open decisions for operator review.

**Style:** matches `tide-audit-v3.html` (Fraunces + IBM Plex Mono dark theme). Verdict box uses internal-purple variant (`--internal: #a070b5`) instead of audit-ok-green to mark the architecture-proposal register. Tally grid is 4-column (one per operator requirement). New `INTERNAL / DO NOT DISTRIBUTE` stamp at top.

**Meta:** `noindex, nofollow`. Discoverable only via the URL operator forwards or pulls up directly.

**Source memo:** `memory/research/janus-architecture-2026-05-05.md` (immutable record of thinking; the HTML is the operator review surface; the implementation is what gets built across Phases 1-5).

**Companion entity:** `memory/entities/people/jy.json` (X handle confirmed as @ProlabCH same session).

---

## 2026-05-04

### `tide-audit-v3.html` — round-3 smart-contract audit deliverable for KAPPA

New page at `https://sibylcap.com/tide-audit-v3`. Companion to the round-1 audit at `/tide-audit` (immutable, frozen). Round-3 reviews KAPPA's TideManager v3 (the swap-on-rebalance proposal layered on top of the v2 round-2 audit response). 

Findings: 0 CRITICAL / 1 HIGH / 2 MEDIUM / 4 LOW / 5 INFO. All 7 round-1 CRITICALs verified addressed and surviving. Headline finding H-1: `maxCostBps` bounds swap and mint legs independently (not aggregate as labeled), so worst-case round-trip ~2× user intent. Recommendation: one more SIBYL cycle on H-1 + M-2 + L-3, then external audit (Spearbit / Trail of Bits / OpenZeppelin).

**Style:** matches `tide-audit.html` (Fraunces + IBM Plex Mono dark theme, severity badges, color-coded verdict box). Tally grid expanded to 5 columns to include INFO. Verdict color flipped from crit-red to ok-green to reflect the round's healthier shape.

**Meta:** `noindex, nofollow`. Discoverable only via the URL operator/SIBYL forwards to KAPPA.

**Notification:** sent via Ping to KAPPA at `0x199a4805adfef0a26df123b985d84b76dc73a459`. 1084-char message auto-chained by SDK into 2 onchain txs (`0xbe4bbb62…` + `0x2cbb7b91…`).

Source memo: `memory/research/tide-manager-audit-v3-2026-05-04.md`.

---

## 2026-05-03

### `memory.html` — full rebuild as professional + elite product page

Operator audit lens: this is a product page, not a personality essay. Buyers (developers, infra leads, procurement) need to answer four questions in under 90 seconds — what is it, how does it integrate, what does it cost, how do I start. Manifesto cadence and "five products" framing fought against that. Plus a mandate to amplify benchmark authority — proof of #2 on LongMemEval should be a headline element, not buried in the architecture footer.

**Structural changes (full file rewrite):**

- **New section order:** Hero → Benchmark → Use Cases → Architecture → Pricing → Setup → Production Pedigree → CTA. Buyer journey: what is it (hero) → is it real (benchmark) → is it for me (use cases) → how does it work (architecture) → what does it cost (pricing) → how do I integrate (setup) → who else uses it (pedigree) → act (CTA).
- **Hero rebuild.** Two-column grid: left = headline + sub + 2 CTAs (`Request an API key` + `Read the spec`); right = syntax-highlighted code snippet (`MemoryClient` import + init + first `entities.upsert`). Below the split: benchmark proof band with `#2 on LongMemEval · 95.6%` + report link. Killed: lowercase manifesto tagline `five memory products. one schema. zero vector databases.`, the 80-word lead paragraph, and the four-item meta grid that included internal language `five at launch`.
- **NEW: Benchmark / Leaderboard section.** Five components: (1) hero-scale `95.6%` number block with infrastructure metadata (`4 vCPU · 16GB EC2 · zero vectors · zero embeddings`), (2) full public leaderboard table naming agentmemory V4 (#1, 96.2%), Sibyl Memory (#2, 95.6%, highlighted row), Chronos PwC (#2 tied, 95.6%), Mastra (94.9%), MemMachine (93.0%), Hindsight/Vectorize (91.4%), with Mem0/Zep/Supermemory/Emergence AI/Oracle baseline noted as below the top tier, (3) category breakdown grid showing two perfect 100% scores (single-session-user, single-session-assistant) plus the four other categories, (4) methodology pull-quote: *"We did not optimize for the benchmark. We optimized for production efficiency. The benchmark improvement was a side effect."* attributed to *Sibyl Labs · LongMemEval Report · April 2026*, (5) CTA link to the full report at `blog.sibylcap.com/longmemeval-v2`. Every benchmark number sourced from `memory/reference/benchmarks.md` per rule 34.
- **Catalog → Use Cases.** Reframed `five memory products` as `One schema. Five use cases.` Live status on Operator Memory, Pilot status on User Profile Memory, `Coming Q3` / `Coming Q4` on the three planned ones — no more half-empty store reading as `3 of 5 planned`. Cards retain target buyer + scope metadata.
- **NEW: Pricing section** (replaces the cost/scale envelope table that showed our infra cost — buyers don't care what it costs us). Four tier cards: Free ($0, 100 MAU) · Starter ($99/mo, 1K MAU, ~$0.10/user) · **Pro ($499/mo, 10K MAU, ~$0.05/user, "Most Popular" badge)** · Scale ($2,500+/mo, 100K+ MAU). Enterprise/self-host strip below at $25K/yr. Cost-comparison strip directly underneath: vector-DB stack at $1,270/mo (Pinecone $70 + OpenAI embeddings $1,000 + LangChain infra $200 + engineering weeks) vs Sibyl Memory Pro at $499/mo. Specific, defensible, procurement-grade. All tiers include caveats footer (estimates, custom available, annual prepay 20% off).
- **Architecture section.** Light touch: dropped `five tiers, one schema` → `Schema · Five Tiers`. Title Case headings. The "no vector tax" callout sharpened to specific math: *"At 100K active users, competitors pay $10K–30K/month in that layer alone. We pay zero."*
- **Setup / Pipeline section.** Kept entirely — it just shipped in the right register. Section label `Integration Pipeline`, h2 `What the pipeline looks like.`, four polymorphic-config cards with vertical stack + arrows, self-host addendum.
- **NEW: Production Pedigree band.** Honest receipts: *"Sibyl Memory powers @sibylcap, an autonomous agent that has run continuously on Base since February 2026."* Three primary-source links (X profile, basescan token, live demo). Not a marketing claim — the on-chain record is the proof.
- **CTA rebuild.** Killed `five products. one infrastructure. talk to us.` (manifesto repeat #5 on the page). Replaced with `Start with the free tier. Talk to us when you outgrow it.` + three CTAs: `Request an API key` (primary, mailto) · `Read the spec` (secondary) · `Schedule a 30-min eval` (tertiary, mailto).

**Voice register changes:**
- Title Case for all H1/H2/H3.
- Sentence case for body.
- Killed all lowercase manifesto sentences. Personality voice stays on @sibylcap, the substack, the diary — not on this page.
- Verb-first capabilities. Concrete numbers and proper nouns where prose used to live.

**SEO / structured data:**
- Title: `Sibyl Memory · Persistent Memory for AI Agents · #2 on LongMemEval`.
- Meta description leads with positioning + benchmark + price-anchor (`Starting at $99/month`).
- JSON-LD `SoftwareApplication` extended with `offers` array (Free/Starter/Pro/Scale tiers) and `award` field citing the LongMemEval result. Procurement-grade structured data.

**Cut:**
- Featured "user profile memory · three layers · contact for pricing × 3" section — replaced by the User Profile Memory use-case card pointing at the Pricing section.
- `cost / scale envelope` table — replaced by Pricing.
- All `five at launch` / `five memory products` framing across hero + catalog + CTA.

**Files:** `website/memory.html` (full rewrite, ~1100 lines).

**Live:** verified — hero shows `Persistent memory for AI agents` headline, benchmark band with `#2 on LongMemEval · 95.6%`, leaderboard table with named competitors, four pricing cards including `Most Popular` Pro tier at `$499/mo`, comparison strip showing `$1,270/mo + engineering` vs `$499/mo · done`, Production Pedigree band with primary-source links, CTA with three buttons. No collateral damage on `/memory-spec-c502bba0` (separate file, unchanged).

**Caveats / forward:**
- Pricing tiers are operator-validated estimates, not yet committed numbers. Should run past 3–5 founder friends in AI infra space before locking. Annual prepay discount (20%) referenced but not engineered into checkout (no checkout exists yet — this is the gate).
- Cloud signup is still manual onboarding via mailto. CTA reads `Request an API key` (honest) not `Get an API key` (would imply self-serve). When `app.sibylcap.com` self-serve ships, swap CTA copy.
- npm package name `sibyl-memory-client` claimed publicly across the page. Reserve on npm before any competitor squats.
- Polymorphic SDK constructor (`apiKey + tenantId` OR `databaseUrl`) shown in hero code AND Step 3. Code does not deliver this yet — tmp-test/sibyl-memory-db/ scaffold (rank-1 priority) needs to honor what the page now claims.

## 2026-05-02

### `memory.html` + `memory-spec-c502bba0.html` — Step 1 reframed to implementation, dropped acquisition language

Operator: "#1 in the pipeline should not say reach out via pitch form. no need to mention key exchanges just how the user implements the key etc." Step 1 was conflating two concerns — how to get a key (commerce / sales surface) and how to use a key (technical integration). The pipeline section is about integration. Acquisition belongs on the CTA / pricing surface, not in Step 1 of the install flow.

- **Removed.** "We onboard cloud keys manually right now — reach out at sibylcap.com/pitch and a key arrives the same day." Whole sentence cut. No mention of pitch form, manual onboarding, or key exchange in this card.
- **New description (memory.html).** "Drop a Sibyl Cloud API key + tenant ID into your env, or a Postgres connection string if you're self-hosting. Same SDK reads either. Standard secret handling — env file, secrets manager, deployment config, your call." Implementation-focused; assumes the dev knows how to handle a credential.
- **New description (memory-spec).** Same content, more technical register: "Cloud transport: drop the API key + tenant ID into env. Self-host transport: drop the Postgres connection string into env. Both authenticate the SDK to the schema. Standard secret handling — env file, vault, deployment config — no special storage requirement."
- **Time field.** `cloud same-day · self-host your timeline` (acquisition framing) → `drop into env` (implementation action). Matches the cadence of the other steps which are all action verbs (`~10 seconds`, `~15 seconds`, `live`).
- **Untouched.** Step 1 title (`Configure your connection`), the polymorphic credentials code block, the self-host addendum (`Self-host adds two steps before step 1: provision Postgres + run migration`), the pipeline intro paragraph (no pitch form mention there either). Self-host onboarding remains correctly framed as prereq work, not as a sales step.
- **Acquisition surface.** Sales/onboarding copy already lives in the CTA section at the bottom of the page (`five products. one infrastructure. talk to us.`). That is the right surface for it. The pipeline section now stays purely on integration.
- **Files:** `website/memory.html`, `website/memory-spec-c502bba0.html`
- **Live:** verified — `https://sibylcap.com/memory` Step 1 description is the new "Drop a Sibyl Cloud API key..." copy with time `drop into env`. No `pitch`, `onboard`, or `reach out` strings remain in the install-flow.

### `memory.html` + `memory-spec-c502bba0.html` — pipeline reflow: vertical stack + succession arrows

Operator caught a layout bug after the Option C polymorphism shipped: cards going off-screen on desktop. Two compounding causes diagnosed: (1) `.install-code { white-space: nowrap }` was forcing the new multi-line code blocks (cloud + self-host credentials, cloud + self-host constructors) onto single lines that overflowed horizontally, and (2) the 4-column grid (`repeat(4, 1fr)`) was packing those wide-content cards into too-narrow columns. The `nowrap` was the deeper bug — even a 1-column layout would have overflowed because the code blocks couldn't wrap.

- **`.install-code` fix.** `white-space: nowrap` → `white-space: pre`. Preserves both newlines and indentation in the code block, lets multi-line code render as multi-line. `overflow-x: auto` retained so any single very-long line still scrolls inside the card instead of pushing the card itself off-screen. Padding bumped slightly (`0.4rem 0.55rem` → `0.55rem 0.7rem`) and `line-height: 1.55` added so multi-line code reads cleanly.
- **`.install-flow` reflow.** `display: grid; grid-template-columns: repeat(4, 1fr)` → `display: flex; flex-direction: column; max-width: 760px; margin: 2rem auto 0`. Cards now stack vertically, container centered, capped at a comfortable reading width on wide monitors. Same memory-spec page got the equivalent change (`grid → flex column, max-width 760px, margin auto`).
- **Succession arrows added.** New `.install-arrow` element inserted between each pair of consecutive cards (3 arrows total for 4 cards). Each arrow is a 14×28 SVG with a vertical line + downward chevron, gold via `currentColor`, `aria-hidden="true"` since it carries no semantic content beyond the visual flow. Padding `0.55rem 0` so they read as connectors, not as separate cards.
- **CSS scaffold for future row variant.** Added a `.install-flow.install-flow-row` modifier class (currently unused) that re-enables a 3-column grid layout (`1fr auto 1fr`) for any future case where two cards should flank a between-arrow horizontally. No HTML uses it yet — kept as a scaffold so the next variation doesn't require touching CSS again.
- **Files:** `website/memory.html`, `website/memory-spec-c502bba0.html`
- **Live:** verified — flex column container with `max-width: 760px`, `white-space: pre` on code blocks, three SVG arrow elements rendered between cards on `https://sibylcap.com/memory` (post `?v=` cache-bust).

### `memory.html` + `memory-spec-c502bba0.html` — Option C polymorphic SDK + npm package rename

Operator review of the install pipeline caught a real architectural conflict: the pipeline was showing `TENANT_ID + API_KEY` credentials universally, but those credentials only authenticate against a SIBYL-hosted REST endpoint. For self-host (customer's own Postgres), the SDK has no REST to hit and the auth shape is wrong — should be `DATABASE_URL`. The page was conflating two transport modes under one credential model that doesn't actually work for self-host.

**Decision: Option C — one SDK, two transports.** The SDK accepts polymorphic config: cloud (`{ apiKey, tenantId }`) routes through Sibyl REST against Sibyl-hosted Postgres; self-host (`{ databaseUrl }`) opens a pooled `pg` connection directly against the customer's database. Same package, same call shape, schema is the constant. Matches the schema-as-moat positioning locked in 2026-05-01 (later) diary entry — the schema is the moat, transport is a config choice.

- **Pipeline restructure (both pages).** Step 1 reframed from "Receive credentials" → **"Configure your connection"**: card now shows BOTH credential shapes (cloud env vars + self-host `DATABASE_URL`) in the same code block, and the time field reads `cloud same-day · self-host your timeline`. Step 3 ("Initialize the client") shows BOTH constructor shapes (`new MemoryClient({ apiKey, tenantId })` and `new MemoryClient({ databaseUrl })`) as alternatives in the same code block. Steps 2 (Install) and 4 (Write) unchanged in structure but copy now reinforces "same package" / "identical call shape on both transports."
- **Intro reframe.** `integration is REST + SDK` → `one SDK, two transports. point sibyl-memory-client at Sibyl Cloud with an API key, or at your own Postgres with a connection string`. Closing line: `once your connection is configured, less than ten minutes from clone to first write` (was Cloud-only).
- **Self-host addendum.** "before step 2" → **"before step 1"** (provisioning is now a prereq to the connection step, not to the SDK install). Added: "The resulting `DATABASE_URL` becomes your step-1 connection." This connects the prereq directly to the polymorphic step-1 card.
- **npm package rename.** `@sibyl/memory-client` → `sibyl-memory-client` (operator preference; unscoped name avoids `@sibyl` org-claim dependency, leaves room for future `sibyl-talos-client` / `sibyl-ping-client` siblings).
- **Spec page also got the 5→4 trim** that the public memory page got earlier today (Sign-up step deleted, steps renumbered). The auto-fit grid handled the layout change without CSS edits.
- **Files:** `website/memory.html`, `website/memory-spec-c502bba0.html`
- **Live:** verified — `https://sibylcap.com/memory` shows `one SDK, two transports.`, `Configure your connection`, both credential shapes in step 1, both constructor shapes in step 3, `npm i sibyl-memory-client`, self-host addendum points at "before step 1." Same on the spec page at `https://sibylcap.com/memory-spec-c502bba0`.
- **Untouched.** "Five memory products" framing across hero/catalog/architecture/CTA/meta tags is product-line copy, not pipeline copy. No collateral damage.

### `memory.html` — install-flow reframed as integration pipeline (5 → 4 steps)

We are not yet ready to take payments through `app.sibylcap.com`, so the "Sign up / pick a tier / self-serve checkout" framing in old Step 1 misrepresented reality and put a commerce step at the front of a section about technical integration. Operator: drop step 1, focus on what the pipeline looks like.

- **Section reframe.** Section label `setup & management` → `integration pipeline`. H2 `five steps from sign-up to first write.` → `what the pipeline looks like.` Intro reworded: dropped the "less than ten minutes for a competent dev" framing that implicitly began at sign-up; replaced with "once credentials land, less than ten minutes from clone to first write on Sibyl Cloud."
- **Steps.** Old Step 1 (Sign up) deleted entirely. Old Steps 2–5 renumbered to 1–4. New Step 1 (Receive credentials) absorbs the necessary onboarding-comms reality in a single line: "We onboard manually right now — reach out at sibylcap.com/pitch and a key arrives the same day." Time estimate changed from `~2 min (email)` to `same-day onboarding` so we are not promising email round-trip times we cannot guarantee.
- **CSS.** `.install-flow` desktop grid `repeat(5, 1fr)` → `repeat(4, 1fr)`. Cards now span quarters at ≥760px; mobile single-column stack unchanged.
- **Self-host addendum.** "before step 3" → "before step 2" so the renumbered pipeline is consistent (old Step 3 / new Step 2 is `Install the SDK`, the right re-entry point for self-hosters who provision their own Postgres + run the schema first).
- **Untouched.** Hero copy ("five memory products"), product catalog, architecture diagram label ("five tiers, one schema"), CTA section ("five products. one infrastructure. talk to us."), OG/Twitter descriptions ("Five memory products for teams") — all reference the 5-product line, not the 5-step install flow. Verified no collateral damage with grep.
- **Files:** `website/memory.html`
- **Live:** verified — `https://sibylcap.com/memory` shows section label `integration pipeline`, h2 `what the pipeline looks like.`, four steps numbered 1–4, self-host addendum points at step 2.

### `index.html` + `stake.html` — Base app dashboard verification meta tags

Operator is signing up SIBYL for the Base app dashboard featured listing. Two surfaces, two distinct app IDs (Base issues a separate ID per featured listing).

- **`index.html` (root domain listing):** `<meta name="base:app_id" content="69f67b59ae7f270edcba4ed7">`. Placed between the `author` meta and the `canonical` link.
- **`stake.html` (staking surface listing):** `<meta name="base:app_id" content="69f67f18ae7f270edcba4edb">`. Placed between the `robots` meta and the `canonical` link, matching the same identity-block grouping pattern.
- **Files:** `website/index.html`, `website/stake.html`
- **Live:** verified — `https://sibylcap.com/` returns the root app_id; `https://sibylcap.com/stake` returns the stake app_id; tags do not collide. Dashboard verification can now be triggered for both listings from the Base side.
- **Verifier failure + fix (2026-05-02):** Base verifier reported "Expect App ID: 69f67f18ae7f270edcba4edb" on stake page despite curl confirming the tag at origin. Diagnosed: stale Vercel edge cache (`age: 1464` on bare GET, `x-vercel-cache: HIT` on old build). Cloudflare was *not* the cache layer (`cf-cache-status: DYNAMIC` once fresh response landed). Two fixes shipped: (1) switched both tags to self-closing `<meta ... />` form to match the spec format Base posted, in case the parser is XHTML-strict; (2) `npx vercel --prod --yes --force` to bust the stale Vercel edge. Post-fix headers: `age: 0`, `x-vercel-cache: HIT` on the new build, `cf-cache-status: DYNAMIC`. Retry the verification on Base side now.
- **Forward debug note for next listing:** if a Base verification ever fails with origin-confirmed tag presence, first suspect is Vercel edge cache age — `--force` redeploy is the fastest invalidation. Second suspect is the registered URL host (e.g. `www.sibylcap.com` — confirmed today that the `www.` subdomain has NO DNS record and will hard-fail any verifier that hits it).

### `memory.html` — lightbulb light/dark theme toggle

Mirrored the spec-page theme pattern onto the public memory product page, but swapped the pill button for a lightbulb icon per operator request. Click → light goes on, click again → light goes off. Persists to `localStorage` under key `sibyl-memory-theme`, defaults to dark (light off).

- **Button.** Fixed top-right (z-index 200), 2.4rem circular, transparent until hover. SVG bulb (glass envelope + screw base + filament). Dark mode = bulb outline only in `--text-muted`. Light mode = warm filled glass `#f4d27a` with `drop-shadow(0 0 6px rgba(228,195,100,0.85))` glow + dark filament + dark base. Smooth fill/stroke/filter transitions. `aria-pressed` reflects state; `title` swaps between "turn light on" / "turn light off".
- **Light theme palette.** Warm parchment, lab-notebook feel. `--bg #f1e9d4`, `--surface #e7dcc1`, `--elevated #ddcfae`, `--text-primary #1f1a10`, `--gold #7a5e30`. Same shape as the memory-spec page palette so the cross-page experience is consistent.
- **Hardcoded rgba sweep.** Every literal rgba/hex inside hero radial overlays, brand-mark text-shadow, hero-badge, cta-pill border, code background, catalog-card.featured gradient, featured-detail gradient, bench-banner gradient, scale-table hover, arch-bg grid overlay, status pills, btn-primary text — overridden under `:root[data-theme="light"]` to read on cream. Lesson from the memory-spec light-theme bug (line 150 strong-color, fixed earlier today): when retrofitting a theme onto an existing styled page, sweep every hardcoded rgba — not just the variable layer.
- **Smooth transitions** added to body/nav/cards/tables/buttons/code on background-color/color/border-color (0.25s ease) so the toggle reads as a deliberate state change, not a flicker.
- **Files:** `website/memory.html`
- **Live:** https://sibylcap.com/memory (toggle in top-right corner)

### `memory.html` + `memory-spec-c502bba0.html` — install Step 1 copy honesty patch

The Step 1 install card on both pages claimed "Self-serve checkout for the standard plans" — overstating reality, since `app.sibylcap.com` does not yet exist (tenant dashboard sits as priority #1 next-step on the schema-as-moat workstream). Reframed to point at a surface that exists today (`sibylcap.com/pitch` intake) while signaling that self-serve is the destination.

- **Old:** `Pick a tier on app.sibylcap.com or talk to us for enterprise. Self-serve checkout for the standard plans.` / install-code `app.sibylcap.com/memory`
- **New:** `Pick a tier and reach out at sibylcap.com/pitch. Self-serve checkout opens shortly at app.sibylcap.com/memory.` / install-code `sibylcap.com/pitch`
- **Day-2 management line preserved verbatim** ("a tenant dashboard at app.sibylcap.com (or your self-hosted equivalent)..."): the "(or your self-hosted equivalent)" already softens the forward-looking dashboard reference, the paragraph is var(--text-dim) at 0.7rem (not load-bearing), and the spec page already names "stand up app.sibylcap.com" as a next step in the moat list. Reframing it would weaken the architecture confidence without an honesty payoff.
- **Files:** `website/memory.html`, `website/memory-spec-c502bba0.html`
- **Live:** verified 200 + new strings present on both URLs.

### `memory.html` — schema-as-moat reframe + setup workflow + 5-tier architecture strip

Memory product page brought into alignment with the schema-as-moat positioning and the new spec page (`/memory-spec-c502bba0`). Three substantive changes:

- **Hero refresh.** Tagline `five memory products. one architecture. zero vector databases.` → `five memory products. one schema. zero vector databases.`. Lead paragraph swapped `all on the file-based architecture that scored #2 on LongMemEval` → `one schema, multi-tenant on Postgres, validated at #2 on LongMemEval`. Hero meta architecture value `file-based · multi-tenant` → `hierarchical schema · postgres · multi-tenant`.
- **Architecture section overhaul.** Replaced the file-tree ASCII diagram with a 5-tier card strip (HOT / WARM / COLD / REFERENCE / ARCHIVE) using the existing `--amber/--gold/--slate/--violet/--teal` color tokens, plus a one-line app→SDK→Postgres flow row and a footer naming the rule-43 UNIQUE invariant, SKIP LOCKED job queue, LISTEN/NOTIFY event fabric, audit_events, and `delete_user_cascade()`. Architecture lead paragraph rewrote `per-user file namespace` → `per-tenant schema namespace`. First arch-callout (`storage isolation`) reframed as `schema-enforced isolation` (rule-43 UNIQUE constraint at DB level). Third callout (`no vector tax`) updated wording to `schema-led retrieval over Postgres indexes`. Middle callout (`stateless compute`) preserved verbatim.
- **NEW Setup & Management section** (`#setup`) inserted between architecture and scale. Five horizontal install cards (Sign up → Receive credentials → Install SDK → Initialize → Write memory) with code snippets and per-step ETAs. Self-host callout below adds the two extra steps (provision Postgres + run migration runner). Day-2 management paragraph references the tenant dashboard at app.sibylcap.com (drill-down, materialized metrics, audit log, GDPR cascade-delete). Nav extended with `setup` link.
- **Scale tiers table refresh.** Storage column `500MB` / `50GB on EBS` / `500GB on S3` / `5TB+ on S3` → `<1GB Postgres` / `50GB Postgres` / `500GB Postgres` / `5TB+ Postgres`. Compute column `1 small EC2` / `2 EC2 + small Postgres` / `4 EC2 + medium Postgres` / `sharded fleet` → `Neon free + 1 worker` / `Neon Pro + 2 workers` / `Aurora · Neon Business + 4 workers` / `sharded by tenant_id + worker fleet`. Cost rough estimates revised down ~10% to reflect Neon serverless pricing vs the older EC2+EBS modeling.

CSS additions: `.tier-strip` / `.tier` / `.flow-row` / `.arch-foot` / `.install-flow` / `.install-card` / `.install-step` / `.install-title` / `.install-do` / `.install-code` / `.install-time` / `.install-self`. All use existing memory.html design tokens (no new colors introduced). Mobile breakpoint `(min-width: 760px)` collapses both the tier-strip and install-flow grids to single column on phones.

- **Files:** `website/memory.html`
- **Live:** https://sibylcap.com/memory

### `memory-spec-c502bba0.html` — section 3 architecture cards widened + new section 8 install workflow + light-grey strong color fix

Three changes to the spec page in this session:

1. **Section 3 architecture overview SVG**: viewBox widened 920→1020 to give every inner card breathing room. Top row App / SDK / Dashboard cards 240→280 each. Postgres outer box 680→860. HOT/WARM/COLD tier rects 180→240 each (now fits the 31-char `journal_events · revenue_events` string). Job queue 280→340. Event fabric 300→420 (now fits the 43-char `triggers → pg_notify('sibyl_memory_events')` string). Observability 620→800. Worker / pg_cron 240→280 each. All four connecting lines re-coordinated to the new card centers.
2. **NEW section 8: Install & deploy — what the human does.** Five horizontal install-flow cards mirroring the memory.html setup section, plus a self-host callout. Subsequent sections renumbered 8→9, 9→10, 10→11, 11→12. CSS additions: `.install-flow`, `.install-card`, `.install-step`, `.install-title`, `.install-do`, `.install-code`, `.install-time`, `.install-self` (matching the memory.html implementation but using the spec page's `--text/--text-sec/--text-muted/--accent/--gold/--surface/--bg/--cold` tokens).
3. **Light-grey text fix.** Added `.highlight strong { color: var(--gold); font-weight: 600; }` so the bold prefix of `* LISTEN/NOTIFY note:` (and any other highlight-callout strong) reads in gold rather than inheriting body color, matching the existing `.meta-row strong { color: var(--gold) }` convention.

### `memory-spec-c502bba0.html` — light-theme readability fix

Bare `<strong>` rule on line 150 had `color: #dce0e6` hardcoded (near-white). Inside `.highlight` and `.meta-row` the override caught it, but every body-level `<strong>` (the lead paragraph header, table cells, the 13/14 callout, the LISTEN/NOTIFY note, every migration item, every invariant in the moat list, every next-step item) rendered near-white on cream under the light toggle — unreadable. Patched to `color: var(--text)` so the rule respects whichever theme is active.

- **File:** `website/memory-spec-c502bba0.html`
- **Diff:** one line, `strong { color: #dce0e6 }` → `strong { color: var(--text) }`
- **Page is `noindex, nofollow`** — partner-staging surface gated by Vercel password, low blast radius.

---

## 2026-05-01

### Sibyl Memory v1 schema applied to demo Postgres

Per the architectural reframe captured in `memory/research/sibyl-memory-architecture-2026-05-01.md`, the GLOSSARY-style hierarchical memory model has been ported to the live Neon Postgres that backs `sibylcap.com/demo`. The schema and all production tables now sit alongside the existing demo + partner tables under a dedicated `sibyl_memory` schema (no namespace collisions).

- **Schema artifact:** `scripts/sibyl-memory-schema.sql` (148 lines, idempotent, transactional, versioned via `sibyl_memory.schema_version`).
- **Runner:** `scripts/apply-sibyl-memory-schema.mjs` (uses `@neondatabase/serverless` + `ws` polyfill — pulls connection string from `the partners DB connection string`).
- **Tables created** (all under `sibyl_memory`): `entities`, `entity_relations`, `state_documents`, `journal_events`, `revenue_events`, `error_events`, `reference_documents`, `archived_entities`, `flagged_actors`, `schema_version`.
- **Mapping** matches the file-tree GLOSSARY: HOT (state_documents) / WARM (entities + entity_relations) / COLD (journal_events + revenue_events + error_events) / REFERENCE (reference_documents) / ARCHIVE (archived_entities) / FLAGGED (flagged_actors).
- **Multi-tenant from day one** via `tenant_id UUID NOT NULL` on every row; SIBYL's own data lives under a fixed tenant constant. RLS policies are deferred until the first external tenant onboards.
- **Rule 43 (single-source-of-truth) is now constraint-enforced** via `UNIQUE (tenant_id, category, name)` on the entities table. A bug cannot create a duplicate entity record.
- **Smoke test passed:** insert/query/delete probe row through the pipeline. Schema version row v1 written.
- **Existing demo + partner tables untouched:** `demo_*` (4 tables) and `partner_*` (7 tables) all continue to operate.

The product line for Sibyl Memory now has a backing schema in production, ready for the parity test (rerun a LongMemEval Oracle slice against this implementation; acceptance ≥94.6%).

### TideManager Smart Contract Security Audit shipped — `/tide-audit`

Partner deliverable for KAPPA (@acerbigfoot404) per rule 50 (Partner Deliverable Standard). Source contract is a Uniswap V3 LP manager (`TideManager.sol`, 692 lines) the author shared via gist. SIBYL ran a full security audit using the established workflow: contract fetch → architectural read by main agent → parallel deep vulnerability scan via security subagent → synthesis → HTML deliverable.

- **Source memo:** `memory/research/tide-manager-audit-2026-05-01.md` — immutable internal record.
- **Deliverable:** `website/tide-audit.html` (~30KB styled HTML, Fraunces + IBM Plex Mono per rules 46/47, dark theme, color-coded severity table, deployed `noindex/nofollow`).
- **Verdict:** not ship-ready. Author already knew (file labeled SCAFFOLD, two core functions stub-only). Audit added: 7 CRITICAL · 9 HIGH · 11 MEDIUM · 8 LOW findings. Implemented portions also have funds-at-risk bugs (no reentrancy guards, raw IERC20 calls broken with USDT, ERC721 receiver locks NFTs replaying staking-V1 scar, missing minOut on payout opens MEV sandwich, uint96 truncation breaks fee accounting, missing amountMin>0 enforcement nukes slippage protection).
- **Author got right:** opt-in keeper, immutable contract + fee schedule, two-phase fee-recipient timelock, custom errors, non-custodial design, `rescueERC20` exists. Architectural instincts internalized; implementation has not yet caught up.
- **Path forward:** author implements stubs + addresses 7 CRITICAL, resubmits for second SIBYL review cycle, then engages paid external audit (Spearbit / OZ / Trail of Bits).
- **Verified live** at `https://sibylcap.com/tide-audit` — HTTP 200, noindex robots tag confirmed.

---

## 2026-04-30

### dashboard.html — drop dead stealth wallets, show all 8 production wallets

Companion to the `/api/portfolio` rewrite. Old wallet table showed `cold + bankr + 4 stealth + relay`, but the stealth wallets are volume-bot wallets that aren't part of treasury accounting. Replaced with the 8 production wallets the API actually returns: `cold, bankr, talos_st, talos_lt, escrow, relay, blast, venice`. The `Other` column now shows the top 3 non-ETH holdings per wallet with live USD values, instead of bankr-only WETH/TGATE strings. Now reflects live positions automatically as the portfolio shifts.

### homepage holdings table — backward-compat preserved via api/_lib/positions.json

Homepage `script.js` consumes `data.holdings[]` for the positions table. New `/api/portfolio` now joins live token aggregates against `website/api/_lib/positions.json` (mirror of `memory/state/treasury.json` positions) to compute live USD value + PnL for each active position. PnL is now real-time on the homepage table. Companion script `scripts/sync-positions-to-api.mjs` syncs treasury.json → bundled JSON before deploy whenever positions change.

### `/api/portfolio` rewrite — auto-discovery + V2 LP pricing

Operator flagged that the live treasury read was missing material assets (CRED + WW3 in cold not listed; SIBYL bag, UNI-V2 LP, cbBTC silently dropped). Investigation showed the underlying `alchemy_getTokenBalances` call returns up to ~100 tokens per page with a `pageKey` for the next; the existing code only read page 1, so cold's 273 tokens were silently truncated to the first ~100. Stealth wallets in the old endpoint were also dead code (volume-bot wallets, not treasury).

- **Rewrote `website/api/portfolio.js`** — auto-discovery via paginated Alchemy. No allowlist; pagination is the discovery mechanism. Captures every ERC-20 with non-zero balance across all 8 production wallets (bankr, cold, talos_st/lt, escrow, relay, blast, venice). Stealth wallets dropped from accounting.
- **Uniswap V2 LP pricing** — V2 LP tokens (symbol `UNI-V2` or name match) are auto-detected and priced from underlying `getReserves()` × token0/token1 prices ÷ `totalSupply()`. SIBYL/VIRTUAL pair `0x43447f02ada550929f1f0619471a8f8dba173243` now contributes its real $7,728 instead of $0.
- **Spam handling** — hard-skip set for known impostors (e.g. AgEnT spam at `0x38c3...`). Any token with no DexScreener pair prices at $0 — registered under `tokens` but never inflates totals.
- **Response shape** — `treasury` (total/deployable/reserve/max_per_deal), `wallets[name]` (address/total_usd/holdings[]/error/eth/usdc/weth — last three preserved for backward-compat with `dashboard.html`), `tokens[]` (cross-wallet aggregate), `lp_positions[]` (V2 reserve detail), `prices` (eth/btc), `elapsed_ms`, `timestamp`. Edge cached `s-maxage=60, stale-while-revalidate=120`.
- **Effect** — total reported jumped $4,163 → $37,940 (9.1× correction). Caught: SIBYL 12.9M ($23.8K), UNI-V2 LP 103.8K ($7.7K), cbBTC 0.013 ($984), WW3 1.45B ($1,052), CRED 324M ($938), AIXBT 21.6K ($691), REPPO 20.3K ($402).
- **Companion script** — `scripts/treasury-discover.mjs` runs the same logic locally + maintains `memory/cache/known-tokens.json` registry to surface NEW tokens and EXITS across scans.
- **Companion doc** — `GLOSSARY.md` updated under `Treasury Discovery` section.
- **Verified live** at `https://sibylcap.com/api/portfolio`. ~6s response, edge-cached.

### WW3 Launch GTM page shipped — `/ww3-gtm`

Partner deliverable for Bill Cooper / WW3 Battlefield. Game launched (Arms Dealer + Ground War + Tournament page live at play.ww3battlefield.com) with the bracket sitting at 0 / 32 and the date TBD. Operator-requested GTM memo to move the launch from "deployed" to "Season 1 on-chain history" in 30 days.

- **Added `website/ww3-gtm.html`** — 12-section GTM memo styled in the same Fraunces + IBM Plex Mono dark template as `net-gtm.html` (rule 46/47 compliant — no Inter / Geist / etc). Sections: executive summary, current state audit, launch frame (headline reframe pitched: "the first game on Base where AI agents and humans compete on equal terms, for real money, in real time"), 30-day arc (Week 1 ANCHOR → Week 2 WIDEN → Week 3 BRACKET → Week 4 SEASON 1), channel plan with rule-49 line drawn explicitly, five levers ranked by impact, content cadence templates Cooper can adapt, five metrics that matter, pingcast revert ask (open infra item), risk register with mitigations, Week 1 checklist for Bill, arc-in-one-paragraph closer.
- **`noindex, nofollow` meta** retained — internal partner deliverable, not a public marketing page.
- Source memo lives at `memory/research/ww3-gtm-launch-2026-04-30.md`.
- Delivered to Bill via WW3 advisory dashboard message 30 (TL;DR went out as message 29).

---

## 2026-04-29

### Ping page consolidation — `/ping` removed, redirect to subdomain

Operator audit caught the Discord auto-responder pointing users to the stale `sibylcap.com/ping` page. Production docs for Ping live at `ping.sibylcap.com` now. Cleaned up everywhere the old route surfaced.

- **Deleted `website/ping.html`** (old static doc, superseded by the ping.sibylcap.com app).
- **Added 301 redirect in `vercel.json`**: `/ping` → `https://ping.sibylcap.com` (permanent). Preserves any external links and protects SEO.
- **Removed `/ping` entry from `website/sitemap.xml`** so search engines drop the stale URL.
- **Updated `website/mind.html`** — internal "docs" stat link now points to `ping.sibylcap.com`.
- **Discord bot fixes (`discord-bot/index.mjs`)**: ping trigger URL → `https://ping.sibylcap.com`; docs trigger URL → `https://docs.sibylcap.com` (was a non-existent `sibylcap.com/docs` route); chart trigger URL → token CA `0x797f214a…` (was a pair address that hid other pools).
- **Welcome embed (`scripts/discord-intro.mjs`)**: replaced two stale Vercel preview links (`docs-two-rouge.vercel.app`) with `https://docs.sibylcap.com`.

---

## 2026-04-21

### Security — p71 Track A: x402 Gate Hardening
Closes p71 Track A. Three live security bugs in the x402 payment rails, plus a demo rate-limiter spoof vector.

- **Replay protection moved off in-memory Sets to Neon Postgres** (`api/_replay.js`). `usedTxHashes` + `usedNonces` previously reset on Vercel Lambda cold starts, so attackers crossing a cold start could double-spend a single USDC tx across multiple paid endpoints. Now atomic `INSERT ON CONFLICT DO NOTHING` on `x402_used_payments` (tx_hash PK) + `x402_used_nonces` ((from, nonce) PK). Fail-closed: DB error returns 503, never accepts payment.
- **`api/fund.js` economic leak closed.** Endpoint previously charged a flat $1 USDC for 0.001 ETH. At any ETH price above ~$770, every call was net-negative to treasury. Replaced with Chainlink ETH/USD on-chain (`0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70`), 30% margin, $2 floor. Refuses service (503) rather than charging stale if the price feed is unavailable.
- **`api/pingcast.js` referral-credit spoof fixed.** Previously counted free-credit usage by scanning on-chain broadcast content for `[ref|username]` prefix. Anyone could burn a victim's credits by prefixing that tag in a paid broadcast. Moved counting to server-side `pingcast_free_credits_used` table (idempotent on tx_hash). Fail-closed: DB down → `MAX_SAFE_INTEGER` used → no free redemption.
- **Demo rate-limiter IP source hardened.** `api/_x402.js` demo gate previously keyed on `x-forwarded-for`, which is client-appendable. Now keyed on `x-real-ip` (Vercel-trusted) with `x-vercel-forwarded-for` fallback and `x-forwarded-for` only as local-dev last resort. In-memory 24h tracking retained (cold-start reset is acceptable at 1 request/IP; the spoof vector was the real leak).
- **New table schemas** (auto-created on first request via `ensureSchema()`): `x402_used_payments`, `x402_used_nonces`, `pingcast_free_credits_used`. Uses same Neon connection string as the partners stack (`the partners DB connection string`).

Unblocks p72 (x402 volume-catalog) + p73 (staker-gate layer).

### Security — Precautionary Vercel Env Var Rotation
Triggered by the Vercel April 2026 security incident notice. We were NOT in the compromised subset, but rotated high-value secrets as defense-in-depth per Vercel's best-practices guidance.

- **Rotated with `--sensitive` flag (write-only on Vercel going forward)**:
  - `the dashboard auth key` (256-bit)
  - `the advisory admin key` (256-bit)
  - `the advisory JWT secret` (384-bit) — invalidates existing partner JWTs, partners re-sign with SIWE on next visit
  - `the relay signing key` (wallet signing key) — new relay address `0x30FAfe372734cfD29b46bAf9bd0361ffFf779fDF`. Old balance (0.02 ETH / $46) swept to new address via tx `0x7b56afb43a6e82e5d84667746e2e909889e3d65719c32ce7530a848baf42b347`.
- **`RELAY_ADDRESS` constant updated** in `api/fund.js` (x402 payTo), `api/ping-stats.js` (relay wallet stats), `dashboard.html`, `mind.html`, `ping.html`.
- **`package.json` fix**: added `viem` as an explicit dependency. Was previously relying on build cache, which caused `FUNCTION_INVOCATION_FAILED` on fresh deploys for `api/fund.js` and `api/pingcast.js` (both use `privateKeyToAccount` from viem). All serverless functions using viem are now stable.
- **Remaining Vercel env vars pending operator-side rotation**: Google OAuth credentials (Google Cloud Console), X API token (X developer portal), Neon advisory-DB credentials (Vercel Neon integration), and the RPC endpoint key. Specific variable names are managed in their respective dashboards, not documented here.

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
- **sibylcap.com/presale**: private presale deposit portal. password-gated (`[redacted]`). live escrow balance tracking via direct RPC reads (VIRTUAL, USDC, ETH). progress bar against ~43,424 VIRTUAL raise target. terms grid (Entry FDV, Graduation FDV, floor multiple, vesting). PDF modal viewer. one-click escrow address copy. BaseScan link. 30s auto-refresh. `noindex, nofollow`.
- **Escrow wallet**: `0xc022B8b4a1e1b69A7eb432Fc696C37Ffc5A2D915`. key stored as `the escrow signing key` in Doppler. isolated from all operations.
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
- **Dashboard built**: sibylcap.com/dashboard. the dashboard auth key auth. Ping protocol stats API.

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

### longmemeval-v2.html bar chart unified with plugin-longmemeval pattern

Same fix applied retroactively per operator: stacked layered bars at different
opacities were hiding shorter series. Switched to three thin (10px) bars
stacked vertically inside each track: v1 Sonnet on top (muted gray), v2 Sonnet
in the middle (accent), v2 Opus at the bottom (gold). All three series now
fully visible at full opacity regardless of relative score. Values column
widened to 80px and shows all three percentages stacked, color-coded to match
each bar. Responsive override updated for mobile (≤640px): track height 34px,
bar height 8px, narrower bar-label and bar-value columns.
