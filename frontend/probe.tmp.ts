import { ethers } from 'ethers';
const RPC = 'https://rpc.testnet.arc.io';
const FACTORY = '0x467816F896E03919300431e23CB9136a6e26a48B';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function call(p: any, to: string, data: string, label: string, retries = 8): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try { return await p.call({ to, data }); }
    catch (e: any) {
      const msg = e?.info?.error?.message || e?.message || String(e);
      if (/limit|coalesce|missing revert/i.test(msg)) { await sleep(1000 * (i + 1)); continue; }
      console.log(label, 'HARD ERROR:', msg); return null;
    }
  }
  console.log(label, 'exhausted retries'); return null;
}
function decStr(hex: string): string {
  try { return ethers.AbiCoder.defaultAbiCoder().decode(['string'], hex)[0]; } catch { return '?'; }
}
async function main() {
  const p = new ethers.JsonRpcProvider(RPC);
  const cnt = await call(p, FACTORY, ethers.id('getAllTokensCount()').slice(0,10), 'count');
  const n = cnt ? Number(BigInt(cnt)) : -1;
  console.log('>>> FACTORY TOKEN COUNT:', n);
  for (let i = 0; i < n; i++) {
    await sleep(300);
    const raw = await call(p, FACTORY, ethers.id('allTokens(uint256)').slice(0,10) + i.toString(16).padStart(64,'0'), `allTokens(${i})`);
    if (!raw) continue;
    const tok = ethers.getAddress('0x' + raw.slice(26));
    await sleep(300);
    const nm = await call(p, tok, ethers.id('name()').slice(0,10), 'name');
    await sleep(300);
    const sy = await call(p, tok, ethers.id('symbol()').slice(0,10), 'symbol');
    await sleep(300);
    const mu = await call(p, FACTORY, ethers.id('tokenMetadataURI(address)').slice(0,10) + tok.slice(2).toLowerCase().padStart(64,'0'), 'meta');
    console.log(`  [${i}] ${tok}  name=${nm?decStr(nm):'?'} symbol=${sy?decStr(sy):'?'} meta=${mu?decStr(mu):'?'}`);
  }
}
main().catch(e => console.error('FAILED:', e.message || e));
