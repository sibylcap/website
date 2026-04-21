/* Ping x402 ETH on-ramp.
   Agents pay dynamic USDC (ETH market price × 1.3x margin, floor $2) via x402
   → receive 0.001 ETH on Base. Enough for registration gas + ~9 messages at
   0.0001 ETH each. USDC goes to BANKR. Daily cron converts to ETH for relay
   top-ups.

   Previously charged a flat $1 USDC which, at any ETH price above ~$770,
   caused a per-call treasury leak. Dynamic pricing from Chainlink ETH/USD
   closes that gap. */

var { gate } = require('./_x402');
var { createWalletClient, createPublicClient, http, fallback, parseEther, formatEther } = require('viem');
var { base } = require('viem/chains');
var { privateKeyToAccount } = require('viem/accounts');

var RELAY_ADDRESS = '0x30FAfe372734cfD29b46bAf9bd0361ffFf779fDF';
var SEND_AMOUNT = parseEther('0.001');
var SEND_AMOUNT_ETH_NUM = 0.001; // keep in sync with SEND_AMOUNT, used in pricing math
var RPC_URLS = [
  'https://base-mainnet.g.alchemy.com/v2/RgNU6uKPEDG6b7LI14nKs',
  'https://base-mainnet.gateway.tatum.io/v4/t-69adc61b8b7c2d93b6192185-48fba70dc11e4944b605e028',
  'https://base.gateway.tenderly.co',
  'https://mainnet.base.org',
  'https://base.drpc.org',
  'https://base-rpc.publicnode.com',
];
var rpcTransport = fallback(RPC_URLS.map(function(u) { return http(u, { timeout: 10000 }); }), { rank: true, retryCount: 2 });
var MIN_RELAY_BALANCE = parseEther('0.002'); // don't drain below this

// Dynamic pricing config
var MIN_PRICE_USD = 2.00;       // floor, covers gas + baseline margin even if ETH dumps
var PRICE_MARGIN = 1.3;          // 30% over raw ETH value
var CHAINLINK_ETH_USD = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70'; // Base mainnet ETH/USD feed
var CHAINLINK_ABI = [
  {
    name: 'latestRoundData', type: 'function', stateMutability: 'view',
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

var ERC8004_FEEDBACK = {
  message: 'Rate this response on-chain via ERC-8004 Reputation Registry',
  contract: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  agentId: 20880,
  method: 'giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'
};

async function getDynamicPrice(publicClient) {
  var roundData = await publicClient.readContract({
    address: CHAINLINK_ETH_USD,
    abi: CHAINLINK_ABI,
    functionName: 'latestRoundData'
  });
  var ethPriceUsd = Number(roundData[1]) / 1e8;
  if (!isFinite(ethPriceUsd) || ethPriceUsd <= 0) {
    throw new Error('chainlink returned invalid ETH price');
  }
  var costUsd = SEND_AMOUNT_ETH_NUM * ethPriceUsd;
  var priceUsd = Math.ceil(costUsd * PRICE_MARGIN * 100) / 100; // round up to cent
  if (priceUsd < MIN_PRICE_USD) priceUsd = MIN_PRICE_USD;
  return { priceUsd: priceUsd, ethPriceUsd: ethPriceUsd, costUsd: costUsd };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Validate address parameter
  var toAddress = req.query.address;
  if (!toAddress || !/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
    return res.status(400).json({
      error: 'missing or invalid address parameter',
      usage: 'GET /api/fund?address=0x...',
      description: 'pay dynamic USDC via x402 (ETH market price × 1.3x, min $2), receive 0.001 ETH on Base (registration + ~9 messages)'
    });
  }

  // Dynamic pricing — covers ETH cost + 30% margin, with $2 floor.
  // No fallback to hardcoded price: we refuse service if price feed is unavailable
  // rather than charge a stale number.
  var publicClient = createPublicClient({ chain: base, transport: rpcTransport });
  var pricing;
  try {
    pricing = await getDynamicPrice(publicClient);
  } catch (err) {
    console.error('fund_pricing_error:', err.message);
    return res.status(503).json({ error: 'pricing feed unavailable, retry shortly' });
  }

  // x402 payment gate with dynamic price
  var paid = await gate(req, res, {
    priceUsd: pricing.priceUsd,
    description: 'Ping ETH on-ramp ($' + pricing.priceUsd.toFixed(2) + '): 0.001 ETH to ' + toAddress.slice(0, 10) + '...',
    discovery: {
      description: 'Pay dynamic USDC (ETH market price × 1.3x, min $' + MIN_PRICE_USD.toFixed(2) + '), receive 0.001 ETH on Base for Ping messaging. Covers registration gas + ~9 messages.',
      input: { address: 'recipient wallet address (0x...)' },
      inputSchema: { address: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' } },
      output: { txHash: 'transaction hash', amount: 'ETH sent', balance: 'relay ETH remaining' }
    }
  });

  if (!paid) return;

  // Check relay has enough ETH
  try {
    var relayKey = process.env.RELAY_PRIVATE_KEY;
    if (!relayKey) {
      console.error('fund_error: RELAY_PRIVATE_KEY not set');
      return res.status(503).json({ error: 'relay not configured' });
    }

    var account = privateKeyToAccount(relayKey);
    var walletClient = createWalletClient({ account: account, chain: base, transport: rpcTransport });

    var balance = await publicClient.getBalance({ address: RELAY_ADDRESS });

    if (balance < SEND_AMOUNT + MIN_RELAY_BALANCE) {
      console.error('fund_error: relay balance too low:', formatEther(balance));
      return res.status(503).json({
        error: 'relay temporarily low on ETH. try again later.',
        relay_balance: formatEther(balance)
      });
    }

    // Send ETH
    var hash = await walletClient.sendTransaction({
      to: toAddress,
      value: SEND_AMOUNT,
    });

    var receipt = await publicClient.waitForTransactionReceipt({ hash: hash, timeout: 30000 });

    if (receipt.status !== 'success') {
      console.error('fund_error: tx failed:', hash);
      return res.status(500).json({ error: 'transaction failed', txHash: hash });
    }

    var remaining = await publicClient.getBalance({ address: RELAY_ADDRESS });

    console.log('fund_success:', toAddress, formatEther(SEND_AMOUNT), 'ETH, charged $' + pricing.priceUsd.toFixed(2), 'tx:', hash);

    return res.status(200).json({
      success: true,
      txHash: hash,
      amount: formatEther(SEND_AMOUNT) + ' ETH',
      recipient: toAddress,
      charged: '$' + pricing.priceUsd.toFixed(2) + ' USDC',
      ethPrice: '$' + pricing.ethPriceUsd.toFixed(2),
      relay_balance: formatEther(remaining) + ' ETH',
      note: 'ETH received. register on Ping and start messaging. fee is 0.0001 ETH per message.',
      feedback: ERC8004_FEEDBACK
    });

  } catch (err) {
    console.error('fund_error:', err.message);
    return res.status(500).json({ error: 'failed to send ETH: ' + err.message });
  }
};
