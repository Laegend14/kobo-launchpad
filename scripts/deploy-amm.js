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
  console.log('🚀 Deploying Kobo AMM Decentralized Exchange on Base Sepolia...\n');

  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY missing in .env.local');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`📍 Deployer Address: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Deployer Balance: ${ethers.formatEther(balance)} ETH\n`);

  const artifactsDir = path.resolve(__dirname, '../artifacts');
  const factoryArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'KoboAmmFactory.json'), 'utf8'));
  const routerArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'KoboAmmRouter.json'), 'utf8'));
  const pairArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'KoboAmmPair.json'), 'utf8'));

  // 1. Deploy Factory
  console.log('📦 1/3 Deploying KoboAmmFactory...');
  const FactoryContract = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, wallet);
  const factory = await FactoryContract.deploy(wallet.address);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`✅ KoboAmmFactory deployed at: ${factoryAddress}`);

  // 2. Deploy Router
  console.log('\n📦 2/3 Deploying KoboAmmRouter...');
  const RouterContract = new ethers.ContractFactory(routerArtifact.abi, routerArtifact.bytecode, wallet);
  const router = await RouterContract.deploy(factoryAddress);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log(`✅ KoboAmmRouter deployed at: ${routerAddress}`);

  // 3. Seed Initial Liquidity Pool for $TEST2 / cNGN
  const cngnAddress = process.env.NEXT_PUBLIC_CNGN_ADDRESS || '0xcFF8Fa5dA1bA6c5085F1fdcDc7C27164C0B565Ec';
  const test2Address = '0x40bB55601bEcc671a5F7043E99D4e0e1Ef112cB9';

  console.log(`\n🌊 3/3 Seeding Autonomous AMM Liquidity Pool ($TEST2 / cNGN)...`);
  const cngnContract = new ethers.Contract(
    cngnAddress,
    ['function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'],
    wallet
  );
  const test2Contract = new ethers.Contract(
    test2Address,
    ['function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'],
    wallet
  );

  const cngnAmount = ethers.parseUnits('9500000', 6); // 9.5M cNGN (graduation target pool)
  const tokenAmount = ethers.parseUnits('200000000', 18); // 200M $TEST2 tokens

  console.log('Approving cNGN for KoboAmmRouter...');
  const txApproveCngn = await cngnContract.approve(routerAddress, cngnAmount);
  await txApproveCngn.wait();

  console.log('Approving $TEST2 for KoboAmmRouter...');
  const txApproveToken = await test2Contract.approve(routerAddress, tokenAmount);
  await txApproveToken.wait();

  console.log('Executing addLiquidity on KoboAmmRouter...');
  const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 mins
  const txAddLiq = await router.addLiquidity(
    cngnAddress,
    test2Address,
    cngnAmount,
    tokenAmount,
    0,
    0,
    wallet.address,
    deadline
  );
  console.log(`Liquidity tx submitted: ${txAddLiq.hash}`);
  await txAddLiq.wait();
  console.log('✅ Liquidity seeded successfully on Base Sepolia!');

  // Fetch the created Pair address
  const pairAddress = await factory.getPair(cngnAddress, test2Address);
  console.log(`🏊 $TEST2 / cNGN Pair Contract Address: ${pairAddress}`);

  // Test AMM pricing
  const testSwapAmount = ethers.parseUnits('10000', 6); // 10,000 cNGN
  const amountsOut = await router.getAmountsOut(testSwapAmount, [cngnAddress, test2Address]);
  console.log(`\n🧮 AMM Live Test: 10,000 cNGN will buy -> ${ethers.formatUnits(amountsOut[1], 18)} $TEST2 tokens!`);

  // Update deployed-contracts.json
  const deployedContractsPath = path.resolve(__dirname, '../deployed-contracts.json');
  let deployedData = {};
  if (fs.existsSync(deployedContractsPath)) {
    try {
      deployedData = JSON.parse(fs.readFileSync(deployedContractsPath, 'utf8'));
    } catch (e) {}
  }

  deployedData.ammFactoryAddress = factoryAddress;
  deployedData.ammRouterAddress = routerAddress;
  deployedData.test2AmmPairAddress = pairAddress;
  deployedData.basescanAmmFactory = `https://sepolia.basescan.org/address/${factoryAddress}`;
  deployedData.basescanAmmRouter = `https://sepolia.basescan.org/address/${routerAddress}`;
  deployedData.basescanTest2Pair = `https://sepolia.basescan.org/address/${pairAddress}`;

  fs.writeFileSync(deployedContractsPath, JSON.stringify(deployedData, null, 2));
  console.log(`\n💾 Updated deployed-contracts.json`);

  // Update .env.local
  const envLocalPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envLocalPath)) {
    let content = fs.readFileSync(envLocalPath, 'utf8');
    if (!content.includes('NEXT_PUBLIC_AMM_FACTORY_ADDRESS=')) {
      content += `\nNEXT_PUBLIC_AMM_FACTORY_ADDRESS=${factoryAddress}`;
    } else {
      content = content.replace(/NEXT_PUBLIC_AMM_FACTORY_ADDRESS=.*/, `NEXT_PUBLIC_AMM_FACTORY_ADDRESS=${factoryAddress}`);
    }
    if (!content.includes('NEXT_PUBLIC_AMM_ROUTER_ADDRESS=')) {
      content += `\nNEXT_PUBLIC_AMM_ROUTER_ADDRESS=${routerAddress}`;
    } else {
      content = content.replace(/NEXT_PUBLIC_AMM_ROUTER_ADDRESS=.*/, `NEXT_PUBLIC_AMM_ROUTER_ADDRESS=${routerAddress}`);
    }
    fs.writeFileSync(envLocalPath, content);
    console.log(`💾 Updated .env.local with AMM Factory & Router addresses`);
  }

  console.log('\n🎉 Kobo Autonomous AMM Infrastructure deployed & verified on Base Sepolia!');
}

main().catch(console.error);
