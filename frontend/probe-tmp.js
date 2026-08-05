const { ethers } = require('ethers');
const p = new ethers.JsonRpcProvider('https://rpc.testnet.arc.io', { chainId: 5042002, name: 'arc' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const head = await p.getBlockNumber();
  const b1 = await p.getBlock(head);
  await sleep(300);
  const b2 = await p.getBlock(head - 20000);
  const dt = b1.timestamp - b2.timestamp;
  console.log('block time avg (s):', (dt/20000).toFixed(4));
  console.log('50,000 blocks covers:', ((50000*dt/20000)/60).toFixed(1), 'minutes');
  console.log('60,000 blocks covers:', ((60000*dt/20000)/60).toFixed(1), 'minutes');
  console.log('1 day needs ~', Math.round(86400/(dt/20000)).toLocaleString(), 'blocks');

  // find the max getLogs range Arc accepts
  const curve = '0x8D31A02FaaE7004C83Fa5eDed2733bA823505dc0';
  for (const span of [5000, 9999, 10000, 20000]) {
    await sleep(400);
    try {
      const r = await p.send('eth_getLogs', [{ address: curve,
        fromBlock: '0x'+(head-span).toString(16), toBlock: '0x'+head.toString(16) }]);
      console.log(`  span ${span}: OK (${r.length} logs)`);
    } catch(e) { console.log(`  span ${span}: FAIL ${(e.message||'').slice(0,80)}`); }
  }
})().catch(e=>console.error('FATAL',e.message));
