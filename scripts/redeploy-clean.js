const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

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
  console.log('\n======================================================');
  console.log('🚀 CLEAN REDEPLOYMENT: KOBO LAUNCHPAD (BASE SEPOLIA)');
  console.log('   Strict Mode: NO tokens will be deployed.');
  console.log('======================================================\n');

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

  if (balance === 0n) {
    throw new Error('Deployer wallet has 0 ETH on Base Sepolia!');
  }

  const artifactsDir = path.resolve(__dirname, '../artifacts');
  const mockCngnArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'MockCNGN.json'), 'utf8'));
  const curveArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'KoboBondingCurve.json'), 'utf8'));
  const factoryArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'KoboAmmFactory.json'), 'utf8'));
  const routerArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'KoboAmmRouter.json'), 'utf8'));

  // 1. Deploy MockCNGN
  console.log('📦 1/4 Deploying MockCNGN (Compliant Naira)...');
  const MockCngnFactory = new ethers.ContractFactory(mockCngnArtifact.abi, mockCngnArtifact.bytecode, wallet);
  const mockCngn = await MockCngnFactory.deploy();
  await mockCngn.waitForDeployment();
  const cngnAddress = await mockCngn.getAddress();
  console.log(`✅ MockCNGN deployed at: ${cngnAddress}`);

  // 2. Deploy KoboBondingCurve
  console.log('\n📦 2/4 Deploying KoboBondingCurve Factory & Engine...');
  const treasury = wallet.address;
  const CurveFactory = new ethers.ContractFactory(curveArtifact.abi, curveArtifact.bytecode, wallet);
  const bondingCurve = await CurveFactory.deploy(cngnAddress, treasury);
  await bondingCurve.waitForDeployment();
  const bondingCurveAddress = await bondingCurve.getAddress();
  console.log(`✅ KoboBondingCurve deployed at: ${bondingCurveAddress}`);

  // 3. Deploy KoboAmmFactory
  console.log('\n📦 3/4 Deploying KoboAmmFactory (Decentralized Exchange)...');
  const AmmFactoryContract = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, wallet);
  const ammFactory = await AmmFactoryContract.deploy(treasury);
  await ammFactory.waitForDeployment();
  const ammFactoryAddress = await ammFactory.getAddress();
  console.log(`✅ KoboAmmFactory deployed at: ${ammFactoryAddress}`);

  // 4. Deploy KoboAmmRouter
  console.log('\n📦 4/4 Deploying KoboAmmRouter (Automated Swaps & Liquidity)...');
  const AmmRouterContract = new ethers.ContractFactory(routerArtifact.abi, routerArtifact.bytecode, wallet);
  const ammRouter = await AmmRouterContract.deploy(ammFactoryAddress);
  await ammRouter.waitForDeployment();
  const ammRouterAddress = await ammRouter.getAddress();
  console.log(`✅ KoboAmmRouter deployed at: ${ammRouterAddress}`);

  // Verify that 0 tokens are created
  const totalTokens = await bondingCurve.allTokensLength();
  console.log(`\n🎉 Verification: Total tokens on curve = ${totalTokens.toString()} (clean slate)`);

  // Record deployment addresses
  const deployedData = {
    network: "base-sepolia",
    chainId: 84532,
    cngnAddress,
    bondingCurveAddress,
    treasuryAddress: treasury,
    ammFactoryAddress,
    ammRouterAddress,
    deployedAt: new Date().toISOString(),
    basescanCngn: `https://sepolia.basescan.org/address/${cngnAddress}`,
    basescanBondingCurve: `https://sepolia.basescan.org/address/${bondingCurveAddress}`,
    basescanAmmFactory: `https://sepolia.basescan.org/address/${ammFactoryAddress}`,
    basescanAmmRouter: `https://sepolia.basescan.org/address/${ammRouterAddress}`
  };

  fs.writeFileSync(
    path.resolve(__dirname, '../deployed-contracts.json'),
    JSON.stringify(deployedData, null, 2)
  );
  console.log('Saved deployment record to deployed-contracts.json');

  // Reset deployed-tokens.json to empty list
  fs.writeFileSync(
    path.resolve(__dirname, '../deployed-tokens.json'),
    JSON.stringify([], null, 2)
  );
  console.log('Cleaned deployed-tokens.json -> []');

  // Update .env.local with deployed contract addresses
  const envPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent.replace(/NEXT_PUBLIC_CNGN_ADDRESS=.*/g, `NEXT_PUBLIC_CNGN_ADDRESS=${cngnAddress}`);
    envContent = envContent.replace(/NEXT_PUBLIC_FACTORY_ADDRESS=.*/g, `NEXT_PUBLIC_FACTORY_ADDRESS=${bondingCurveAddress}`);
    envContent = envContent.replace(/NEXT_PUBLIC_AMM_FACTORY_ADDRESS=.*/g, `NEXT_PUBLIC_AMM_FACTORY_ADDRESS=${ammFactoryAddress}`);
    envContent = envContent.replace(/NEXT_PUBLIC_AMM_ROUTER_ADDRESS=.*/g, `NEXT_PUBLIC_AMM_ROUTER_ADDRESS=${ammRouterAddress}`);
    fs.writeFileSync(envPath, envContent);
    console.log('Updated .env.local with newly deployed addresses.');
  }

  // Clear stale tokens and trades from SQLite database
  const dbPath = path.resolve(__dirname, '../kobo.db');
  if (fs.existsSync(dbPath)) {
    try {
      const db = new DatabaseSync(dbPath);
      db.exec('DELETE FROM tokens;');
      db.exec('DELETE FROM trades;');
      console.log('Cleaned SQLite database: tokens and trades tables purged of old test data.');
    } catch (dbErr) {
      console.warn('Note on clearing SQLite:', dbErr.message);
    }
  }

  console.log('\n======================================================');
  console.log('✅ ALL CONTRACTS REDEPLOYED TO BASE SEPOLIA');
  console.log(`cNGN:          ${cngnAddress}`);
  console.log(`Bonding Curve: ${bondingCurveAddress}`);
  console.log(`AMM Factory:   ${ammFactoryAddress}`);
  console.log(`AMM Router:    ${ammRouterAddress}`);
  console.log('======================================================\n');
}

main().catch(err => {
  console.error('Redeployment error:', err);
  process.exit(1);
});
