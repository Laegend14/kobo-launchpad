const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function toBase58(buffer) {
  let num = 0n;
  for (let i = 0; i < buffer.length; i++) {
    num = (num << 8n) + BigInt(buffer[i]);
  }
  let result = '';
  while (num > 0n) {
    const remainder = num % 58n;
    num = num / 58n;
    result = BASE58_ALPHABET[Number(remainder)] + result;
  }
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    result = '1' + result;
  }
  return result;
}

function computeIpfsCid(buffer) {
  const sha256 = crypto.createHash('sha256').update(buffer).digest();
  const multihash = Buffer.concat([Buffer.from([0x12, 0x20]), sha256]);
  return toBase58(multihash);
}

const presets = [
  {
    name: 'Lion',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="#0D111A"/><circle cx="128" cy="128" r="88" fill="#F59E0B" fill-opacity="0.15" stroke="#F59E0B" stroke-width="2"/><text x="128" y="162" font-size="96" text-anchor="middle">🦁</text></svg>`
  },
  {
    name: 'Flash',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="#0D111A"/><circle cx="128" cy="128" r="88" fill="#00FF87" fill-opacity="0.15" stroke="#00FF87" stroke-width="2"/><text x="128" y="162" font-size="96" text-anchor="middle">⚡</text></svg>`
  },
  {
    name: 'Rocket',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="#0D111A"/><circle cx="128" cy="128" r="88" fill="#6366F1" fill-opacity="0.15" stroke="#6366F1" stroke-width="2"/><text x="128" y="162" font-size="96" text-anchor="middle">🚀</text></svg>`
  },
  {
    name: 'Diamond',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="#0D111A"/><circle cx="128" cy="128" r="88" fill="#38BDF8" fill-opacity="0.15" stroke="#38BDF8" stroke-width="2"/><text x="128" y="162" font-size="96" text-anchor="middle">💎</text></svg>`
  }
];

const ipfsDir = path.resolve(__dirname, '..', 'public', 'ipfs');
if (!fs.existsSync(ipfsDir)) fs.mkdirSync(ipfsDir, { recursive: true });

const results = {};
for (const p of presets) {
  const buf = Buffer.from(p.svg, 'utf8');
  const cid = computeIpfsCid(buf);
  fs.writeFileSync(path.join(ipfsDir, cid), buf);
  results[p.name] = { cid, uri: 'ipfs://' + cid };
}

console.log('Seeded presets to IPFS directory:');
console.log(JSON.stringify(results, null, 2));
