const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Robust local .env parser
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
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();


async function deploy() {
  console.log('🚀 Starting Deployment of Kobo Launchpad to Base Sepolia...');

  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY is missing in .env.local');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`📍 Deployer Address: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Deployer Balance: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    throw new Error('Deployer wallet has 0 ETH on Base Sepolia! Please fund it with testnet ETH.');
  }

  // Read artifacts
  const artifactsDir = path.resolve(__dirname, '../artifacts');
  const mockCngnArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'MockCNGN.json'), 'utf8'));
  const factoryArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'KoboBondingCurve.json'), 'utf8'));

  // 1. Deploy MockCNGN
  console.log('\nDeploying MockCNGN (Compliant Naira)...');
  const MockCngnFactory = new ethers.ContractFactory(mockCngnArtifact.abi, mockCngnArtifact.bytecode, wallet);
  const mockCngn = await MockCngnFactory.deploy();
  await mockCngn.waitForDeployment();
  const cngnAddress = await mockCngn.getAddress();
  console.log(`✅ MockCNGN deployed at: ${cngnAddress}`);

  // 2. Deploy KoboBondingCurve
  console.log('\nDeploying KoboBondingCurve Factory & AMM...');
  const BondingCurveFactory = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, wallet);
  const treasury = wallet.address; // Deployer receives treasury platform fees
  const bondingCurve = await BondingCurveFactory.deploy(cngnAddress, treasury);
  await bondingCurve.waitForDeployment();
  const bondingCurveAddress = await bondingCurve.getAddress();
  console.log(`✅ KoboBondingCurve deployed at: ${bondingCurveAddress}`);

  // 3. Create starter cultural tokens on the curve
  console.log('\nCreating initial cultural meme coins on Kobo...');
  const starterTokens = [
    {
      name: "Idan Coin",
      symbol: "IDAN",
      image: "https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=400&auto=format&fit=crop&q=80",
      description: "Idan no dey panic sell. The crowned lion of Nigerian degen culture. Odogwu verified!"
    },
    {
      name: "Sapa Killer",
      symbol: "SAPA",
      image: "https://images.unsplash.com/photo-1579621970795-87facc2f976d?w=400&auto=format&fit=crop&q=80",
      description: "The official hedge against Nigerian inflation. Buy SAPA, conquer hunger, and chop life."
    },
    {
      name: "Arewa Knot",
      symbol: "AREWA",
      image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80",
      description: "Rooted in Northern resilience. Cryptographically secure, unruggable, and deeply cultured."
    },
    {
      name: "Tiv Warrior",
      symbol: "ANGER",
      image: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=400&auto=format&fit=crop&q=80",
      description: "Inspired by the iconic A'nger black-and-white stripes of Benue. Pure discipline and community power."
    }
  ];

  const createdTokens = [];
  for (const t of starterTokens) {
    console.log(`Creating token ${t.symbol}...`);
    try {
      const tx = await bondingCurve.createToken(t.name, t.symbol, t.image, t.description, {
        gasLimit: 2500000,
      });
      const receipt = await tx.wait();
      console.log(`✅ Token ${t.symbol} created! Tx: ${receipt.hash}`);
    } catch (err) {
      console.warn(`Could not create token ${t.symbol}:`, err.message);
    }
  }

  const allTokenAddresses = await bondingCurve.allTokensLength();
  console.log(`🎉 Total tokens registered on curve: ${allTokenAddresses.toString()}`);

  // Save addresses to deployed-contracts.json
  const deployedData = {
    network: "base-sepolia",
    chainId: 84532,
    cngnAddress,
    bondingCurveAddress,
    treasuryAddress: treasury,
    deployedAt: new Date().toISOString()
  };

  fs.writeFileSync(
    path.resolve(__dirname, '../deployed-contracts.json'),
    JSON.stringify(deployedData, null, 2)
  );
  console.log('Saved deployment record to deployed-contracts.json');

  // Update .env.local with deployed contract addresses
  const envPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent.replace(/NEXT_PUBLIC_CNGN_ADDRESS=.*/g, `NEXT_PUBLIC_CNGN_ADDRESS=${cngnAddress}`);
    envContent = envContent.replace(/NEXT_PUBLIC_FACTORY_ADDRESS=.*/g, `NEXT_PUBLIC_FACTORY_ADDRESS=${bondingCurveAddress}`);
    fs.writeFileSync(envPath, envContent);
    console.log('Updated .env.local with deployed addresses.');
  }

  console.log('\n=============================================');
  console.log('🔥 KOBO LAUNCHPAD DEPLOYED TO BASE SEPOLIA 🔥');
  console.log(`cNGN: ${cngnAddress}`);
  console.log(`Bonding Curve: ${bondingCurveAddress}`);
  console.log('=============================================\n');
}

if (require.main === module) {
  deploy().catch(console.error);
}

module.exports = deploy;
