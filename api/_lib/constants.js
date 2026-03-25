/* Shared constants for SIBYL x402 endpoints */

var RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
var RPC_FALLBACKS = [RPC, 'https://mainnet.base.org', 'https://base.llamarpc.com'];
var X_BEARER = process.env.X_BEARER_TOKEN || '';

var ERC8004_FEEDBACK = {
  message: 'Rate this response on-chain via ERC-8004 Reputation Registry',
  contract: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  agentId: 20880,
  method: 'giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'
};

// Tighter shipping signal regex: requires technical context, excludes generic words
var SHIP_RE = /deploy|shipped|shipping|ship\s|push.*prod|commit\s*[a-f0-9]|merge.*PR|merged.*pull|v\d+\.\d|testnet|mainnet|smart.?contract|audit|refactor|integrat.*api|open.?source|changelog|patch|hotfix|bug.?fix|migrat/i;

// Narrative classification patterns
var NARRATIVES = {
  ai_infra: { label: 'AI Infra', re: /inference|gpu|compute|model.?host|model.?serv|private.?ai|uncensor|open.?source.?ai|fine.?tun|train|neural.?net|deep.?learn|machine.?learn|vector|embedding|llm.?api|ai.?api|ai.?sdk|ai.?platform|ai.?infra/i },
  ai_agents: { label: 'AI Agents', re: /\bagent\b|autonom|sentient|synthetic|brain|cogni|intelli|swarm|multi.?agent|agent.?infra|aura|reputation.?scor|identity.?reg|erc.?8004|on.?chain.?identity|agent.?framework|agent.?protocol/i },
  ai_general: { label: 'AI', re: /\bai\b|gpt|llm|neural|predict|generative|diffusion|transformer|chatbot|copilot/i },
  defi: { label: 'DeFi', re: /\bdefi\b|swap|lend|borrow|yield|vault|stake|liquid|amm|pool|perp|leverag|margin|collateral|bridge|wrap|farm/i },
  meme: { label: 'Meme', re: /doge|pepe|shib|wojak|chad|moon|rocket|inu|cat|frog|bear|bull|ape|monkey|bonk|floki|elon|trump|maga|based|cope|seethe|wagmi|ngmi|gm\b|ser\b|anon\b|degen/i },
  gaming: { label: 'Gaming / Metaverse', re: /game|play|guild|quest|arena|battle|rpg|nft.?game|metaverse|virtual|world|land|avatar|character|level|loot/i },
  social: { label: 'Social / NFT', re: /social|nft|art|creator|collect|community|dao|govern|vote|member|club|access|pass|mint|gallery|culture/i },
  infra: { label: 'Infrastructure', re: /infra|protocol|layer|chain|rollup|oracle|index|api|sdk|tool|dev|framework|node|validator|relay|rpc|data|storage/i },
  rwa: { label: 'RWA / Payments', re: /\brwa\b|real.?world|tokeniz|asset|property|equity|bond|treasury|payment|pay|transfer|remit|stable|dollar|usd|euro|gold/i }
};
var NARRATIVE_KEYS = Object.keys(NARRATIVES);

module.exports = {
  RPC: RPC,
  RPC_FALLBACKS: RPC_FALLBACKS,
  X_BEARER: X_BEARER,
  ERC8004_FEEDBACK: ERC8004_FEEDBACK,
  SHIP_RE: SHIP_RE,
  NARRATIVES: NARRATIVES,
  NARRATIVE_KEYS: NARRATIVE_KEYS
};
