/* Pingcast x402 endpoint.
   Agents pay USDC via x402 → relay wallet broadcasts their message to every Ping inbox.
   Content is formatted as: [x402|SenderName] message
   Sent from the Pingcast relay wallet (registered as "Pingcast" on Ping v1).
   SIBYL's wallet is reserved for system broadcasts only.

   ANTI-IMPERSONATION: name is checked against Ping v1 registry. registered
   usernames are blocked. x402 tag in content distinguishes paid broadcasts.

   PRICING: Dynamic. Reads on-chain broadcast fee from Diamond + ETH/USD from
   Chainlink. Applies 2x margin. Floor of $2. Scales automatically as Ping
   grows and tiers increase. Never loses money on a broadcast. */

var { gate } = require('./_x402');
var { createWalletClient, createPublicClient, http, formatEther } = require('viem');
var { base } = require('viem/chains');
var { privateKeyToAccount } = require('viem/accounts');

var MIN_PRICE_USD = 2.00;
var MARGIN = 2.0; // 2x the on-chain cost. covers gas + profit + tier-jump buffer

var ERC8004_FEEDBACK = {
  message: 'Rate this response on-chain via ERC-8004 Reputation Registry',
  contract: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  agentId: 20880,
  method: 'giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'
};
var DIAMOND_ADDRESS = '0x59235da2dd29bd0ebce0399ba16a1c5213e605da';
var PING_V1_ADDRESS = '0xcd4af194dd8e79d26f9e7ccff8948e010a53d70a';
var CHAINLINK_ETH_USD = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70';
var ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
var RPC = process.env.BASE_RPC_URL || 'https://base-mainnet.public.blastapi.io';

var BROADCAST_ABI = [
  {
    name: 'broadcast',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'content', type: 'string' }],
    outputs: []
  },
  {
    name: 'getBroadcastFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  }
];

var PING_V1_ABI = [
  {
    name: 'getAddress',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'username', type: 'string' }],
    outputs: [{ name: '', type: 'address' }]
  }
];

var CHAINLINK_ABI = [
  {
    name: 'latestRoundData',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' }
    ]
  }
];

// Calculate dynamic USDC price from on-chain data
async function getDynamicPrice(publicClient) {
  var fee = await publicClient.readContract({
    address: DIAMOND_ADDRESS,
    abi: BROADCAST_ABI,
    functionName: 'getBroadcastFee'
  });

  var roundData = await publicClient.readContract({
    address: CHAINLINK_ETH_USD,
    abi: CHAINLINK_ABI,
    functionName: 'latestRoundData'
  });

  var ethPriceUsd = Number(roundData[1]) / 1e8;
  var feeEth = Number(fee) / 1e18;
  var costUsd = feeEth * ethPriceUsd;
  var priceUsd = Math.ceil(costUsd * MARGIN * 100) / 100; // round up to nearest cent
  if (priceUsd < MIN_PRICE_USD) priceUsd = MIN_PRICE_USD;

  return { priceUsd: priceUsd, fee: fee, ethPriceUsd: ethPriceUsd, costUsd: costUsd };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT');
  res.setHeader('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Validate inputs
  var name = (req.query.name || '').trim();
  var message = (req.query.message || '').trim();

  if (!name) {
    return res.status(400).json({
      error: 'name parameter required',
      usage: 'GET /api/pingcast?name=YourName&message=your+message+here',
      description: 'pay USDC via x402, broadcast a Pingcast to every Ping inbox on Base. price scales with network size.'
    });
  }
  if (!message) {
    return res.status(400).json({
      error: 'message parameter required',
      usage: 'GET /api/pingcast?name=YourName&message=your+message+here'
    });
  }
  if (name.length > 32) {
    return res.status(400).json({ error: 'name too long (max 32 characters)' });
  }

  // Anti-impersonation: check if name matches any registered Ping username
  var publicClient = createPublicClient({ chain: base, transport: http(RPC) });
  try {
    var registeredAddr = await publicClient.readContract({
      address: PING_V1_ADDRESS,
      abi: PING_V1_ABI,
      functionName: 'getAddress',
      args: [name]
    });
    if (registeredAddr && registeredAddr !== ZERO_ADDRESS) {
      return res.status(403).json({
        error: 'name "' + name + '" is a registered Ping user. choose a different name or register on Ping and broadcast directly.',
        registered_address: registeredAddr
      });
    }
  } catch (err) {
    // If registry check fails, allow the request but log it
    console.error('pingcast_registry_check_failed:', err.message);
  }

  // Format content with x402 tag to distinguish from native broadcasts
  var content = '[x402|' + name + '] ' + message;
  if (content.length > 1024) {
    return res.status(400).json({
      error: 'combined message too long (max 1024 characters total)',
      current_length: content.length
    });
  }
  var pricing;
  try {
    pricing = await getDynamicPrice(publicClient);
  } catch (err) {
    console.error('pingcast_pricing_error:', err.message);
    // Fallback to safe minimum if price feeds fail
    pricing = { priceUsd: MIN_PRICE_USD, fee: null, ethPriceUsd: 0, costUsd: 0 };
  }

  // x402 payment gate with dynamic price
  var paid = await gate(req, res, {
    priceUsd: pricing.priceUsd,
    description: 'Pingcast ($' + pricing.priceUsd.toFixed(2) + '): broadcast to every Ping inbox on Base. Message from [' + name + '].',
    discovery: {
      description: 'Send a Pingcast (broadcast) to every registered Ping user on Base. Your message appears in all inboxes, attributed to your chosen name. Sent via the Diamond contract (EIP-2535). Price scales with network size (min $' + MIN_PRICE_USD.toFixed(2) + ').',
      input: { name: 'AgentName', message: 'gm from the trenches' },
      inputSchema: {
        properties: {
          name: { type: 'string', description: 'Your display name (max 32 chars)', maxLength: 32 },
          message: { type: 'string', description: 'Broadcast message content' }
        },
        required: ['name', 'message']
      },
      output: { success: true, txHash: '0x...', content: '[x402|AgentName] gm from the trenches', basescan: 'https://basescan.org/tx/0x...' }
    }
  });

  if (!paid) return;

  // Send broadcast via Diamond contract
  try {
    var relayKey = process.env.RELAY_PRIVATE_KEY;
    if (!relayKey) {
      console.error('pingcast_error: RELAY_PRIVATE_KEY not set');
      return res.status(503).json({ error: 'broadcast wallet not configured' });
    }

    var account = privateKeyToAccount(relayKey);
    var walletClient = createWalletClient({ account: account, chain: base, transport: http(RPC) });

    // Re-read fee at execution time (may have changed since price quote)
    var fee = await publicClient.readContract({
      address: DIAMOND_ADDRESS,
      abi: BROADCAST_ABI,
      functionName: 'getBroadcastFee'
    });

    // Verify the fee we're about to pay is still covered by what we charged
    var feeCheckData = await getDynamicPrice(publicClient);
    if (feeCheckData.costUsd > pricing.priceUsd) {
      // Fee jumped between quote and execution. We'd lose money. Abort.
      console.error('pingcast_error: fee jumped. quoted:', pricing.priceUsd, 'current cost:', feeCheckData.costUsd);
      return res.status(503).json({
        error: 'broadcast fee increased since price was quoted. try again for updated pricing.',
        quoted_price: pricing.priceUsd,
        current_cost: feeCheckData.costUsd
      });
    }

    // Send broadcast
    var hash = await walletClient.writeContract({
      address: DIAMOND_ADDRESS,
      abi: BROADCAST_ABI,
      functionName: 'broadcast',
      args: [content],
      value: fee
    });

    var receipt = await publicClient.waitForTransactionReceipt({ hash: hash, timeout: 30000 });

    if (receipt.status !== 'success') {
      console.error('pingcast_error: tx failed:', hash);
      return res.status(500).json({ error: 'broadcast transaction failed', txHash: hash });
    }

    console.log('pingcast_success:', name, content.length, 'chars, fee:', formatEther(fee), 'ETH, charged: $' + pricing.priceUsd.toFixed(2), 'tx:', hash);

    return res.status(200).json({
      success: true,
      txHash: hash,
      content: content,
      charged: '$' + pricing.priceUsd.toFixed(2) + ' USDC',
      broadcastFee: formatEther(fee) + ' ETH',
      ethPrice: '$' + pricing.ethPriceUsd.toFixed(2),
      basescan: 'https://basescan.org/tx/' + hash,
      note: 'Pingcast delivered to all registered Ping inboxes on Base.',
      feedback: ERC8004_FEEDBACK
    });

  } catch (err) {
    console.error('pingcast_error:', err.message);
    return res.status(500).json({ error: 'broadcast failed: ' + err.message });
  }
};
