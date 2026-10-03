const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}
loadEnv();

async function main() {
  console.log('🚀 Initializing & Seeding AMM Pool for $DANFO on Base Sepolia...\n');

  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  const cngnAddress = '0xDdc8B9e1Afdcc3136212c8642d253285c2Bc237c';
  const danfoAddress = '0xdb4f0734a84ae393eb8d64a69287a05f161bb4f5';
  const factoryAddress = '0x01aEA417df786883364721Af2A8238bf02d1AD2F';
  const routerAddress = '0xA862739c8755fa83FE1B75021Af6f7D438EC6c80';

  const artifactsDir = path.resolve(__dirname, '../artifacts');
  const factoryArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'KoboAmmFactory.json'), 'utf8'));
  const routerArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'KoboAmmRouter.json'), 'utf8'));

  const factory = new ethers.Contract(factoryAddress, factoryArtifact.abi, wallet);
  const router = new ethers.Contract(routerAddress, routerArtifact.abi, wallet);

  let pair = await factory.getPair(cngnAddress, danfoAddress);
  console.log(`Initial Pair Address: ${pair}`);

  const cngnContract = new ethers.Contract(
    cngnAddress,
    ['function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'],
    wallet
  );
  const danfoContract = new ethers.Contract(
    danfoAddress,
    ['function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'],
    wallet
  );

  const cngnAmount = ethers.parseUnits('9500000', 6); // 9.5M cNGN
  const tokenAmount = ethers.parseUnits('200000000', 18); // 200M $DANFO tokens

  console.log('1. Approving cNGN for Router...');
  const tx1 = await cngnContract.approve(routerAddress, ethers.MaxUint256);
  await tx1.wait();

  console.log('2. Approving $DANFO for Router...');
  const tx2 = await danfoContract.approve(routerAddress, ethers.MaxUint256);
  await tx2.wait();

  console.log('3. Adding Liquidity to AMM Router (auto-creates Pair)...');
  const deadline = Math.floor(Date.now() / 1000) + 1200;
  const txAddLiq = await router.addLiquidity(
    cngnAddress,
    danfoAddress,
    cngnAmount,
    tokenAmount,
    0,
    0,
    wallet.address,
    deadline
  );
  console.log(`Transaction submitted: ${txAddLiq.hash}`);
  const receipt = await txAddLiq.wait();
  console.log(`✅ Liquidity added in block: ${receipt.blockNumber}`);

  pair = await factory.getPair(cngnAddress, danfoAddress);
  console.log(`🏊 Verified DANFO/cNGN Pair Address: ${pair}`);

  // Test spot quote
  const testQuote = ethers.parseUnits('10000', 6);
  const amounts = await router.getAmountsOut(testQuote, [cngnAddress, danfoAddress]);
  console.log(`🎉 10,000 cNGN buys: ${ethers.formatUnits(amounts[1], 18)} $DANFO!`);
}

main().catch(console.error);
