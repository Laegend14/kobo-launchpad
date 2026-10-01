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

const TOKENS_TO_DEPLOY = [
  {
    name: "Idan Coin",
    symbol: "IDAN",
    image: "https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=400&auto=format&fit=crop&q=80",
    description: "Idan no dey panic sell. The crowned lion of Nigerian degen culture. Odogwu verified!",
    cultureTag: "Igbo"
  },
  {
    name: "Sapa Slayer",
    symbol: "SAPA",
    image: "https://images.unsplash.com/photo-1579621970795-87facc2f976d?w=400&auto=format&fit=crop&q=80",
    description: "The official hedge against Nigerian inflation. Buy SAPA, conquer hunger, and chop life.",
    cultureTag: "Pan-Naija"
  },
  {
    name: "Arewa Knot",
    symbol: "AREWA",
    image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80",
    description: "Rooted in Northern resilience. Cryptographically secure, unruggable, and deeply cultured.",
    cultureTag: "Hausa"
  },
  {
    name: "Tiv Warrior",
    symbol: "ANGER",
    image: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=400&auto=format&fit=crop&q=80",
    description: "Inspired by the iconic A'nger black-and-white stripes of Benue. Pure discipline and community solidarity.",
    cultureTag: "Tiv"
  },
  {
    name: "Owambe Party",
    symbol: "OWAMBE",
    image: "https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=400&auto=format&fit=crop&q=80",
    description: "Spray money like Saturday in Lagos! The loudest, happiest community token with Aso-Oke style.",
    cultureTag: "Yoruba"
  },
  {
    name: "Portable Zazu",
    symbol: "ZAZOO",
    image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80",
    description: "Ika of Africa! No dey look Uche face. 100% madness, zero filter, pure street momentum.",
    cultureTag: "Yoruba"
  }
];

async function main() {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const factoryAddress = process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '0xE662b31B2e01302064cDc47906AB96177B0585E6';

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`Using deployer wallet: ${wallet.address}`);

  const artifactsDir = path.resolve(__dirname, '../artifacts');
  const factoryArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'KoboBondingCurve.json'), 'utf8'));
  const factory = new ethers.Contract(factoryAddress, factoryArtifact.abi, wallet);

  const existingCount = Number(await factory.allTokensLength());
  console.log(`Current registered tokens on curve: ${existingCount}`);

  const deployedList = [];

  // Check already deployed tokens
  for (let i = 0; i < existingCount; i++) {
    const addr = await factory.allTokens(i);
    const state = await factory.tokens(addr);
    console.log(`Found on-chain token #${i}: ${state.name} ($${state.symbol}) -> ${addr}`);
    deployedList.push({
      address: addr,
      name: state.name,
      symbol: state.symbol,
      imageUri: state.imageUri,
      description: state.description,
      creator: state.creator,
      realCngn: state.realCngn.toString(),
      realTokens: state.realTokens.toString(),
      virtualCngn: state.virtualCngn.toString(),
      virtualTokens: state.virtualTokens.toString(),
      totalTrades: Number(state.totalTrades),
      graduated: state.graduated,
      cultureTag: "Pan-Naija"
    });
  }

  // Deploy missing tokens
  for (const t of TOKENS_TO_DEPLOY) {
    const exists = deployedList.some(d => d.symbol.toUpperCase() === t.symbol.toUpperCase());
    if (exists) {
      console.log(`Token ${t.symbol} already on-chain, skipping.`);
      continue;
    }

    console.log(`Deploying ${t.name} ($${t.symbol}) to bonding curve on Base Sepolia...`);
    try {
      const tx = await factory.createToken(t.name, t.symbol, t.image, t.description, {
        gasLimit: 3000000
      });
      console.log(`Tx sent: ${tx.hash}, waiting...`);
      const receipt = await tx.wait();
      console.log(`✅ ${t.symbol} deployed successfully! Block: ${receipt.blockNumber}`);

      // Get latest token address
      const newCount = Number(await factory.allTokensLength());
      const newAddr = await factory.allTokens(newCount - 1);
      const state = await factory.tokens(newAddr);

      deployedList.push({
        address: newAddr,
        name: t.name,
        symbol: t.symbol,
        imageUri: t.image,
        description: t.description,
        creator: wallet.address,
        realCngn: state.realCngn.toString(),
        realTokens: state.realTokens.toString(),
        virtualCngn: state.virtualCngn.toString(),
        virtualTokens: state.virtualTokens.toString(),
        totalTrades: 0,
        graduated: false,
        cultureTag: t.cultureTag
      });
    } catch (err) {
      console.error(`Failed to deploy ${t.symbol}:`, err.message);
    }
  }

  // Save on-chain deployed tokens registry
  const outPath = path.resolve(__dirname, '../deployed-tokens.json');
  fs.writeFileSync(outPath, JSON.stringify(deployedList, null, 2));
  console.log(`\n🎉 Saved ${deployedList.length} live tokens to deployed-tokens.json!`);
}

main().catch(console.error);
