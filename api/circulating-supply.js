var AGENT_TOKEN = '0x797f214a2CD64a4963A91Fa21c8C55Ec3EBa4714';
var VESTING = '0xD6B830F72FE36AC6Fb2Bb959642B29c64bE3cF11';
var RPC = 'https://mainnet.base.org';

// ERC20 balanceOf(address) and totalSupply() selectors
var TOTAL_SUPPLY_SIG = '0x18160ddd';
var BALANCE_OF_SIG = '0x70a08231';

async function rpcCall(to, data) {
  var res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: to, data: data }, 'latest'] }),
  });
  var json = await res.json();
  return BigInt(json.result);
}

export default async function handler(req, res) {
  try {
    var totalSupply = await rpcCall(AGENT_TOKEN, TOTAL_SUPPLY_SIG);
    var vestingBal = await rpcCall(AGENT_TOKEN, BALANCE_OF_SIG + VESTING.slice(2).toLowerCase().padStart(64, '0'));

    var circulating = totalSupply - vestingBal;
    var formatted = (Number(circulating / 10n ** 12n) / 1e6).toFixed(0);

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.status(200).send(formatted);
  } catch (e) {
    res.status(500).send('error');
  }
}
