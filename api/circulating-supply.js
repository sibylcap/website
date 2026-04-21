var AGENT_TOKEN = '0x797f214a2CD64a4963A91Fa21c8C55Ec3EBa4714';
var VESTING = '0xD6B830F72FE36AC6Fb2Bb959642B29c64bE3cF11';
var STAKING = '0x6151aa0689576e8f8d218f4dc7f6a4ec1533d44d';
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
    // Circulating = totalSupply - vestingBalance - stakingBalance.
    // Vesting contract holds tokens not yet released to beneficiaries.
    // Staking contract holds both user-staked tokens (locked) and unclaimed rewards pool.
    // Both are removed from the tradeable float.
    var [totalSupply, vestingBal, stakingBal] = await Promise.all([
      rpcCall(AGENT_TOKEN, TOTAL_SUPPLY_SIG),
      rpcCall(AGENT_TOKEN, BALANCE_OF_SIG + VESTING.slice(2).toLowerCase().padStart(64, '0')),
      rpcCall(AGENT_TOKEN, BALANCE_OF_SIG + STAKING.slice(2).toLowerCase().padStart(64, '0')),
    ]);

    var circulating = totalSupply - vestingBal - stakingBal;
    var formatted = (Number(circulating / 10n ** 12n) / 1e6).toFixed(0);

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.status(200).send(formatted);
  } catch (e) {
    res.status(500).send('error');
  }
}
