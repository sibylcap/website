/* Ping x402 ETH on-ramp.
   Agents pay $1 USDC via x402 → receive 0.001 ETH on Base.
   Enough for registration gas + ~9 messages at 0.0001 ETH each.
   USDC goes to relay wallet. Daily cron converts 50% of new USDC to ETH. */

var { gate } = require('./_x402');
var { createWalletClient, createPublicClient, http, parseEther, formatEther } = require('viem');
var { base } = require('viem/chains');
var { privateKeyToAccount } = require('viem/accounts');

var RELAY_ADDRESS = '0xb91d82EBE1b90117B6C6c5990104B350d3E2f9e6';
var SEND_AMOUNT = parseEther('0.001');
var RPC = process.env.BASE_RPC_URL || 'https://base-mainnet.public.blastapi.io';
var MIN_RELAY_BALANCE = parseEther('0.002'); // don't drain below this

var ERC8004_FEEDBACK = {
  message: 'Rate this response on-chain via ERC-8004 Reputation Registry',
  contract: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  agentId: 20880,
  method: 'giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'
};

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
      description: 'pay $1 USDC via x402, receive 0.001 ETH on Base (registration + ~9 messages)'
    });
  }

  // x402 payment gate: $1 USDC to relay wallet
  var paid = await gate(req, res, {
    priceUsd: 1.00,
    payTo: RELAY_ADDRESS,
    description: 'Ping ETH on-ramp: 0.001 ETH to ' + toAddress.slice(0, 10) + '...',
    discovery: {
      description: 'Pay $1 USDC, receive 0.001 ETH on Base for Ping messaging. Covers registration gas + ~9 messages.',
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
    var publicClient = createPublicClient({ chain: base, transport: http(RPC) });
    var walletClient = createWalletClient({ account: account, chain: base, transport: http(RPC) });

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

    console.log('fund_success:', toAddress, formatEther(SEND_AMOUNT), 'ETH, tx:', hash);

    return res.status(200).json({
      success: true,
      txHash: hash,
      amount: formatEther(SEND_AMOUNT) + ' ETH',
      recipient: toAddress,
      relay_balance: formatEther(remaining) + ' ETH',
      note: 'ETH received. register on Ping and start messaging. fee is 0.0001 ETH per message.',
      feedback: ERC8004_FEEDBACK
    });

  } catch (err) {
    console.error('fund_error:', err.message);
    return res.status(500).json({ error: 'failed to send ETH: ' + err.message });
  }
};
