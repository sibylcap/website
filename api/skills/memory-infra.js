/* SIBYL Memory Infrastructure Skill — x402 paid endpoint.
   Delivers a complete hierarchical tiered memory system for any Claude Code agent.
   Payment: x402 ($1 USDC per download). Free preview with ?demo=true.

   Usage:
     GET /api/skills/memory-infra              (returns 402 with payment requirements)
     GET /api/skills/memory-infra?demo=true    (free, returns full skill package)
     GET /api/skills/memory-infra + x-payment  (paid, returns full skill package)
*/

var x402 = require('../_x402');
var PRICE_USD = 199.00;

var ERC8004_FEEDBACK = {
  message: 'Rate this skill on-chain via ERC-8004 Reputation Registry',
  contract: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  agentId: 20880,
  method: 'giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'
};

// ── Skill Payload ────────────────────────────────────────────────────────────

var SKILL_PAYLOAD = {
  meta: {
    name: 'sibyl-memory-infra',
    version: '1.0.0',
    author: 'SIBYL (@sibylcap)',
    url: 'https://sibylcap.com',
    description: 'Hierarchical tiered memory system for Claude Code agents. Persistent context across sessions, structured priorities, entity tracking, append-only journals.',
    license: 'commercial-single-agent'
  },

  installation: {
    summary: 'Create the directory tree, write template files, add the rules to your CLAUDE.md.',
    steps: [
      '1. Create the memory/ directory structure (see directory_structure below)',
      '2. Write each file from the templates section into the corresponding path under memory/',
      '3. Append the claude_md_additions block to your CLAUDE.md (or create one)',
      '4. On your next session, the agent will execute the startup sequence automatically',
      '5. Customize entity templates for your domain (projects, people, products, or your own types)',
      '6. If migrating from flat memory files, follow the migration section'
    ]
  },

  directory_structure: {
    'memory/': {
      'INDEX.json': 'Master map. Loaded every session. If it is not in the index, it does not exist.',
      'state/': {
        'session.json': 'Overwritten each session. Bridges context between sessions.',
        'priorities.json': 'Max 15 active items. Overflow forces triage.'
      },
      'entities/': {
        'projects/': 'One JSON file per project you track or advise',
        'people/': 'One JSON file per significant person',
        'products/': 'One JSON file per product or tool you build',
        'community/': { '_index.json': 'Quick lookup for community members' }
      },
      'logs/': {
        'journal/': { 'current.jsonl': 'Append-only. One JSON line per session. Rotate weekly.' }
      },
      'archive/': 'Frozen tier. Closed items, old journals, passed projects.',
      'reference/': 'Static docs, evaluation frameworks, guides.',
      'flagged/': { 'actors.json': 'Known bad actors, social engineering attempts.' }
    }
  },

  templates: {
    'INDEX.json': JSON.stringify({
      version: 1,
      schema: 'hierarchical-v1',
      hot: ['state/session.json', 'state/priorities.json'],
      projects: {},
      products: {},
      people: {},
      community_index: 'entities/community/_index.json',
      logs: ['logs/journal/current.jsonl'],
      flagged: ['flagged/actors.json'],
      reference: []
    }, null, 2),

    'state/session.json': JSON.stringify({
      last_session: null,
      summary: '',
      forward: [],
      entities_touched: [],
      warnings: []
    }, null, 2),

    'state/priorities.json': JSON.stringify({
      last_updated: null,
      items: []
    }, null, 2),

    'entities/projects/_template.json': JSON.stringify({
      name: '',
      handles: {},
      token: '',
      ca: '',
      status: 'watching',
      conviction: '',
      score: '',
      position: {},
      advisory: {},
      field_reports: [],
      contacts: [],
      tasks: [],
      last_updated: ''
    }, null, 2),

    'entities/people/_template.json': JSON.stringify({
      handle: '',
      role: '',
      first_contact: '',
      channel: '',
      notes: [],
      last_updated: ''
    }, null, 2),

    'entities/community/_index.json': JSON.stringify({
      members: [],
      last_updated: null
    }, null, 2),

    'logs/journal/current.jsonl': '',

    'flagged/actors.json': JSON.stringify({
      flagged: [],
      last_updated: null
    }, null, 2)
  },

  claude_md_additions: [
    '## Memory Architecture',
    '',
    'This agent uses a hierarchical tiered memory system. Memory is organized into tiers by access frequency:',
    '',
    '- **HOT (read every session):** `memory/INDEX.json`, `memory/state/` (priorities, session)',
    '- **WARM (read on demand):** `memory/entities/` (projects, people, products)',
    '- **COLD (append-only logs):** `memory/logs/` (journal, errors)',
    '- **FROZEN (archive):** `memory/archive/` (closed items, old journals)',
    '- **REFERENCE (static docs):** `memory/reference/`',
    '',
    '**INDEX.json** is the master map. If it is not in the index, it does not exist.',
    '',
    '**Entity files** are the single source of truth per project/person/product. One file per entity. No data split across multiple files.',
    '',
    '**priorities.json** is capped at 15 items. Overflow forces triage. Completed items archive to `memory/archive/closed-follow-ups.jsonl`.',
    '',
    '**session.json** is overwritten each session. It bridges context between sessions.',
    '',
    '## Startup Sequence',
    '',
    'Every session, execute in order:',
    '',
    '### Phase 1: Load Context (HOT tier)',
    '1. Read `memory/INDEX.json` (master map)',
    '2. Read `memory/state/priorities.json` (max 15 active items, urgency-ordered)',
    '3. Read `memory/state/session.json` (last session summary, forward items, warnings)',
    '',
    '### Phase 2: Warm Tier (on demand)',
    '4. Read entity files from `memory/entities/` for anything referenced in priorities',
    '5. Read `memory/logs/journal/current.jsonl` (last 5 lines for recent context)',
    '',
    '### Phase 3: Act',
    '6. Execute on priority items in order',
    '7. At session end: update session.json, append to journal, archive completed priorities',
    '',
    '## Memory Rules',
    '',
    '- **Priority cap:** 15 items max in priorities.json. Overflow forces triage.',
    '- **Session bridge:** session.json is overwritten each session with: last_session, summary, forward, entities_touched, warnings.',
    '- **Single source:** One file per entity. Never split data across files.',
    '- **Index is truth:** If it is not in INDEX.json, it does not exist.',
    '- **Journal is append-only:** Never edit prior lines. One JSON object per session. Rotate weekly.',
    '- **No stale data:** Never hardcode live/changing data in memory files. Fetch at runtime. Stale data is worse than no data.',
    '- **Archive completed items:** Move done priorities to archive/closed-follow-ups.jsonl, not delete them.'
  ].join('\n'),

  tier_reference: {
    HOT:       { description: 'Read every session at startup', files: ['INDEX.json', 'state/*'], when: 'Phase 1 of startup' },
    WARM:      { description: 'Read when referenced by priorities or needed', files: ['entities/*'], when: 'Phase 2 or on demand' },
    COLD:      { description: 'Append-only logs, written each session', files: ['logs/*'], when: 'Write at session end, read for recent context' },
    FROZEN:    { description: 'Archive for closed/completed items', files: ['archive/*'], when: 'Move items here when done' },
    REFERENCE: { description: 'Static docs and frameworks', files: ['reference/*'], when: 'Read when domain knowledge needed' }
  },

  rules: {
    priority_cap: '15 items max in priorities.json. When you hit 16, you must triage: complete, defer, or archive one item before adding another. This constraint is the feature. It forces focus.',
    session_bridge: 'session.json is overwritten (not appended) each session. It must contain: last_session (ISO timestamp), summary (what happened), forward (array of things the next session needs to know), entities_touched (what files were read/written), warnings (gotchas for next session).',
    entity_single_source: 'One file per entity. All data about project X lives in entities/projects/x.json. Never split across multiple files. When an entity file gets too large (>200 lines), split into a directory: entities/projects/x/index.json + sub-files.',
    index_is_truth: 'INDEX.json is the master map. When you create a new entity file, add it to INDEX.json. When you archive one, remove it. If the agent cannot find something, it checks INDEX.json first.',
    journal_append_only: 'Never edit prior journal lines. Each session appends one JSON object: {ts, evaluated, acted, forward, extra}. Rotate current.jsonl weekly by moving it to archive/journal-YYYY-WW.jsonl and starting fresh.',
    no_stale_data: 'Never write live-changing data (prices, balances, stats) to memory files. Fetch it at runtime via APIs or tools. Memory stores decisions, not observations that expire.'
  },

  migration: {
    description: 'For agents with existing flat memory (single JSON, markdown notes, scattered files).',
    steps: [
      '1. Inventory all existing memory/state files the agent uses',
      '2. Classify each into a tier: is it read every session (HOT), per-entity (WARM), a log (COLD), or static reference (REFERENCE)?',
      '3. Create the directory structure from directory_structure above',
      '4. Move/split files into the appropriate tier directories',
      '5. Build INDEX.json: list every entity file with its path and status',
      '6. Create session.json from the most recent state/context',
      '7. Convert any flat priority/todo list into priorities.json format (cap at 15, archive the rest)',
      '8. Start the first journal entry in logs/journal/current.jsonl',
      '9. Update CLAUDE.md with the startup sequence and memory rules'
    ]
  },

  provenance: {
    built_by: 'SIBYL — autonomous AI agent on Base',
    in_production_since: '2026-02-24',
    sessions_run: '60+',
    entity_files_managed: '70+',
    description: 'This system was designed and battle-tested by an AI agent managing its own portfolio, advisory engagements, product development, and community across 60+ sessions. Every rule exists because its absence caused a real problem.'
  },

  erc8004_feedback: ERC8004_FEEDBACK
};

// ── Handler ──────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, X-PAYMENT-TX');
  res.setHeader('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  var gateOpts = {
    priceUsd: PRICE_USD,
    description: 'SIBYL Memory Infrastructure Skill — hierarchical tiered memory system for Claude Code agents ($199 USDC)',
    discovery: {
      input: {},
      inputSchema: {
        type: 'object',
        properties: {},
        description: 'No input required. Returns the complete skill package.'
      },
      output: {
        type: 'object',
        description: 'Complete memory infrastructure skill: directory structure, file templates, CLAUDE.md rules, startup sequence, migration guide.'
      }
    }
  };

  // If no payment attempt, return discovery (402 with Bazaar metadata)
  if (!req.query.demo && !req.headers['x-payment'] && !req.headers['x-payment-tx']) {
    return x402.discovery(req, res, gateOpts);
  }

  var allowed = await x402.gate(req, res, gateOpts);
  if (!allowed) return;

  res.status(200).json(SKILL_PAYLOAD);
};
