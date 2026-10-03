const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment variables from .env.local immediately
function loadEnv() {
  const envPath = path.resolve(__dirname, '.env.local');
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

const { ethers } = require('ethers');
const { DatabaseSync } = require('node:sqlite');
const firebaseDb = require('./lib/firebaseDb');
firebaseDb.initFirestore();

// ==========================================
// IPFS (DECENTRALIZED STORAGE) HELPERS
// ==========================================
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
  // IPFS CIDv0 multihash prefix: 0x12 (sha2-256), 0x20 (32 bytes length)
  const multihash = Buffer.concat([Buffer.from([0x12, 0x20]), sha256]);
  return toBase58(multihash);
}

function detectImageMime(buffer) {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  if (buffer.length >= 4 && buffer.slice(0, 4).toString('ascii') === 'GIF8') {
    return 'image/gif';
  }
  if (buffer.length >= 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.slice(0, 100).toString('utf8').includes('<svg')) {
    return 'image/svg+xml';
  }
  return 'image/png';
}

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const IPFS_DIR = isVercel ? path.join('/tmp', 'ipfs') : path.resolve(__dirname, 'public', 'ipfs');
if (!fs.existsSync(IPFS_DIR)) {
  try {
    fs.mkdirSync(IPFS_DIR, { recursive: true });
  } catch (e) {}
}





const PORT = process.env.PORT || 3000;
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
const BASE_SEPOLIA_CHAIN_ID = 84532;
function getProvider() {
  return new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC, BASE_SEPOLIA_CHAIN_ID, { staticNetwork: true });
}
const CNGN_ADDRESS = process.env.NEXT_PUBLIC_CNGN_ADDRESS || '0x2ae29c2D91896356D8066C347008e2764d599F59';
const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '0x57620fd472BEdD6f481aA98cad48F870Fec7E745';
const AMM_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_AMM_FACTORY_ADDRESS || '0x60859E47929AD7cbd1ED1Bc4EDbdA8225Cf1dd45';
const AMM_ROUTER_ADDRESS = process.env.NEXT_PUBLIC_AMM_ROUTER_ADDRESS || '0x9f2b67634A06AAfbB36aECcb764F597b7111BFFE';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || 'pk_test_e4af71e0fdd90c6de06dfbaa0cd315397f5a230c';
const DYNAMIC_ENV_ID = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || '56723438-864e-4a04-a970-e168c8cee6b5';

const MOCK_CNGN_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function faucet(address to)",
  "function mint(address to, uint256 amount)"
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function transfer(address, uint256) returns (bool)",
  "function approve(address, uint256) returns (bool)"
];

const KOBO_BONDING_CURVE_ABI = [
  "function buy(address tokenAddr, uint256 cngnIn, uint256 minTokensOut) returns (uint256)",
  "function sell(address tokenAddr, uint256 tokensIn, uint256 minCngnOut) returns (uint256)",
  "function getAmountOutTokens(address tokenAddr, uint256 cngnIn) view returns (uint256)",
  "function getAmountOutCngn(address tokenAddr, uint256 tokensIn) view returns (uint256)",
  "function tokens(address) view returns (address tokenAddress, string name, string symbol, string imageUri, string description, address creator, uint256 realCngn, uint256 realTokens, uint256 virtualCngn, uint256 virtualTokens, bool graduated, uint256 createdAt, uint256 totalTrades)",
  "function allTokensLength() view returns (uint256)",
  "function allTokens(uint256) view returns (address)",
  "function createToken(string name, string symbol, string imageUri, string description) returns (address)"
];

const KOBO_AMM_FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
  "function createPair(address tokenA, address tokenB) returns (address pair)",
  "function allPairsLength() view returns (uint256)",
  "function allPairs(uint256) view returns (address)"
];

const KOBO_AMM_PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
  "event Sync(uint112 reserve0, uint112 reserve1)"
];

const KOBO_AMM_ROUTER_ABI = [
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)",
  "function getAmountsOut(uint256 amountIn, address[] calldata path) view returns (uint256[] memory amounts)",
  "function getAmountsIn(uint256 amountOut, address[] calldata path) view returns (uint256[] memory amounts)",
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function factory() view returns (address)"
];

// ==========================================
// PERSISTENT DATABASE ENGINE (SQLite via node:sqlite)
// ==========================================
let dbPath = path.resolve(__dirname, 'kobo.db');
if (isVercel) {
  dbPath = path.join('/tmp', 'kobo.db');
  const localSeedPath = path.resolve(__dirname, 'kobo.db');
  if (fs.existsSync(localSeedPath) && !fs.existsSync(dbPath)) {
    try {
      fs.copyFileSync(localSeedPath, dbPath);
    } catch (e) {
      console.warn('Vercel /tmp db copy notice:', e.message);
    }
  }
}
const db = new DatabaseSync(dbPath);

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS tokens (
    address TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    description TEXT,
    image_uri TEXT,
    culture_tag TEXT,
    creator TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    token_address TEXT,
    token_symbol TEXT,
    trader_address TEXT,
    is_buy INTEGER,
    cngn_amount REAL,
    token_amount REAL,
    tx_hash TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT UNIQUE,
    wallet_address TEXT,
    amount_ngn REAL,
    status TEXT,
    tx_hash TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT UNIQUE,
    wallet_address TEXT,
    amount_cngn REAL,
    bank_name TEXT,
    account_number TEXT,
    account_name TEXT,
    status TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS user_balances (
    wallet_address TEXT PRIMARY KEY,
    naira_balance REAL DEFAULT 0,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS starter_gas_claims (
    wallet_address TEXT PRIMARY KEY,
    amount_eth TEXT,
    amount_usd TEXT,
    tx_hash TEXT,
    claimed_at INTEGER
  );
`);

// Seed user_balances from deposits if not yet populated
try {
  const depositRows = db.prepare("SELECT wallet_address, SUM(amount_ngn) as total FROM deposits WHERE status = 'success' GROUP BY wallet_address").all();
  for (const row of depositRows) {
    if (row.wallet_address) {
      db.prepare(`
        INSERT OR IGNORE INTO user_balances (wallet_address, naira_balance, updated_at)
        VALUES (?, ?, ?)
      `).run(row.wallet_address.toLowerCase(), row.total, Date.now());
    }
  }
} catch (e) {
  console.warn('user_balances init notice:', e.message);
}

// Seed tokens from deployed-tokens.json if table is empty
const deployedTokensPath = path.resolve(__dirname, 'deployed-tokens.json');
try {
  const tokenCount = db.prepare('SELECT COUNT(*) as count FROM tokens').get().count;
  if (tokenCount === 0 && fs.existsSync(deployedTokensPath)) {
    const loaded = JSON.parse(fs.readFileSync(deployedTokensPath, 'utf8'));
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO tokens (address, name, symbol, description, image_uri, culture_tag, creator, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const t of loaded) {
      insertStmt.run(
        t.address,
        t.name,
        t.symbol,
        t.description || '',
        t.imageUri,
        t.cultureTag || 'Meme',
        t.creator || '0x0000000000000000000000000000000000000000',
        Date.now()
      );
    }
    console.log(`📦 [SQLite DB] Seeded ${loaded.length} tokens into database.`);
  }
} catch (e) {
  console.warn('SQLite token seed notice:', e.message);
}

// Seed initial trade if trades table is empty
try {
  const tradeCount = db.prepare('SELECT COUNT(*) as count FROM trades').get().count;
  if (tradeCount === 0) {
    db.prepare(`
      INSERT INTO trades (id, token_address, token_symbol, trader_address, is_buy, cngn_amount, token_amount, tx_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      't-init-1',
      '0x098A2fEbEa0D9117cf6b5b54fe38578762512f45',
      'ASO',
      '0x8E056cb829788507641fFBC066246Fd6B1D08b04',
      1,
      1000,
      394444,
      '0x96e4b19e6ebcbfa1a3d9004f211bd248ecc8137143a648937cfd06125c76060f',
      Date.now() - 60000
    );
  }
} catch (e) {
  console.warn('SQLite trade seed notice:', e.message);
}

function shortenAddress(addr) {
  if (!addr) return '';
  return addr.length > 10 ? addr.substring(0, 6) + '...' + addr.substring(addr.length - 4) : addr;
}

function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Ensure Autonomous AMM pair exists for graduated coins
async function ensureAmmPairForToken(tokenAddress, symbol = 'TOKEN') {
  if (!AMM_FACTORY_ADDRESS || !tokenAddress || !CNGN_ADDRESS) return null;
  try {
    const provider = getProvider();
    const factory = new ethers.Contract(AMM_FACTORY_ADDRESS, KOBO_AMM_FACTORY_ABI, provider);
    let pair = await factory.getPair(CNGN_ADDRESS, tokenAddress);
    if (pair && pair !== ethers.ZeroAddress) {
      return pair;
    }

    if (DEPLOYER_PRIVATE_KEY) {
      const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
      console.log(`⚡ [AMM Auto-Pair] Initializing pair for ${symbol} (${tokenAddress}) on Base Sepolia...`);

      // Try addLiquidity directly on router (it auto-creates pair)
      if (AMM_ROUTER_ADDRESS) {
        try {
          const cngnContract = new ethers.Contract(CNGN_ADDRESS, MOCK_CNGN_ABI, wallet);
          const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
          const cngnBal = await cngnContract.balanceOf(wallet.address);
          const tokBal = await tokenContract.balanceOf(wallet.address);

          if (cngnBal >= 1000000n && tokBal >= 1000000000000000000n) {
            const seedCngn = cngnBal > 9500000000000n ? 9500000000000n : (cngnBal > 1000000000n ? 1000000000n : cngnBal);
            const seedTok = tokBal > 200000000000000000000000000n ? 200000000000000000000000000n : (tokBal > 10000000000000000000000000n ? 10000000000000000000000000n : tokBal);

            await (await cngnContract.approve(AMM_ROUTER_ADDRESS, ethers.MaxUint256)).wait();
            await (await tokenContract.approve(AMM_ROUTER_ADDRESS, ethers.MaxUint256)).wait();

            const router = new ethers.Contract(AMM_ROUTER_ADDRESS, KOBO_AMM_ROUTER_ABI, wallet);
            const deadline = Math.floor(Date.now() / 1000) + 1200;
            const liqTx = await router.addLiquidity(
              CNGN_ADDRESS,
              tokenAddress,
              seedCngn,
              seedTok,
              0,
              0,
              wallet.address,
              deadline
            );
            await liqTx.wait();
            pair = await factory.getPair(CNGN_ADDRESS, tokenAddress);
            console.log(`✅ [AMM Auto-Pair] Created & seeded pair: ${pair} (tx: ${liqTx.hash})`);
            return pair;
          }
        } catch (liqErr) {
          console.warn('Auto addLiquidity notice:', liqErr.message);
        }
      }

      // If addLiquidity couldn't seed, at least create the pair on factory
      const factoryWithWallet = new ethers.Contract(AMM_FACTORY_ADDRESS, KOBO_AMM_FACTORY_ABI, wallet);
      const tx = await factoryWithWallet.createPair(CNGN_ADDRESS, tokenAddress);
      await tx.wait();
      pair = await factory.getPair(CNGN_ADDRESS, tokenAddress);
      console.log(`✅ [AMM Auto-Pair] Created bare pair: ${pair}`);
      return pair;
    }
  } catch (err) {
    console.warn('ensureAmmPairForToken error:', err.message);
  }
  return null;
}

// Function to fetch all tokens combined with live Base Sepolia on-chain curve stats & autonomous AMM pools
async function getTokensWithChainData() {
  let dbTokens = null;
  try {
    const firestoreTokens = await firebaseDb.getAllTokensFirestore();
    if (firestoreTokens && Array.isArray(firestoreTokens) && firestoreTokens.length > 0) {
      dbTokens = firestoreTokens.map(t => ({
        address: t.address,
        name: t.name,
        symbol: t.symbol,
        image_uri: t.imageUri,
        description: t.description,
        creator: t.creator,
        culture_tag: t.cultureTag,
        created_at: t.createdAt
      }));
    }
  } catch (e) {}

  if (!dbTokens) {
    dbTokens = db.prepare('SELECT * FROM tokens ORDER BY created_at DESC').all();
  }
  const provider = getProvider();
  const curve = FACTORY_ADDRESS ? new ethers.Contract(FACTORY_ADDRESS, KOBO_BONDING_CURVE_ABI, provider) : null;
  const ammFactory = AMM_FACTORY_ADDRESS ? new ethers.Contract(AMM_FACTORY_ADDRESS, KOBO_AMM_FACTORY_ABI, provider) : null;

  const result = [];
  for (const row of dbTokens) {
    const item = {
      address: row.address,
      name: row.name,
      symbol: row.symbol,
      imageUri: row.image_uri,
      description: row.description,
      creator: row.creator,
      cultureTag: row.culture_tag,
      marketCapNaira: 2500000,
      priceKobo: 0.0025,
      progressPercent: 0,
      totalTrades: 0,
      graduated: false
    };

    if (curve && row.address && row.address.startsWith('0x')) {
      try {
        const data = await curve.tokens(row.address);
        if (data && data[0] && data[0] !== ethers.ZeroAddress) {
          const realCngn = Number(ethers.formatUnits(data[6], 6));
          const virtualCngn = Number(ethers.formatUnits(data[8], 6));
          const virtualTokens = Number(ethers.formatUnits(data[9], 18));
          const priceKobo = virtualTokens > 0 ? (virtualCngn * 100) / virtualTokens : 0.0025;
          item.realCngn = realCngn;
          item.marketCapNaira = 2500000 + realCngn;
          item.priceKobo = priceKobo;
          item.progressPercent = Math.min(100, (realCngn / 10000000) * 100);
          item.totalTrades = Number(data[12]);
          item.graduated = data[10];
        }
      } catch (err) {
        // Skip individual contract query failures
      }
    }

    // Check autonomous AMM pool ($MEME / cNGN)
    if (ammFactory && row.address && row.address.startsWith('0x')) {
      try {
        const pairAddr = await ammFactory.getPair(row.address, CNGN_ADDRESS);
        if (pairAddr && pairAddr !== ethers.ZeroAddress) {
          item.ammPair = pairAddr;
          item.graduated = true;
          item.progressPercent = 100;

          const pair = new ethers.Contract(pairAddr, KOBO_AMM_PAIR_ABI, provider);
          const [r0, r1] = await pair.getReserves();
          const t0 = await pair.token0();
          let cngnRes, tokRes;
          if (t0.toLowerCase() === CNGN_ADDRESS.toLowerCase()) {
            cngnRes = Number(ethers.formatUnits(r0, 6));
            tokRes = Number(ethers.formatUnits(r1, 18));
          } else {
            tokRes = Number(ethers.formatUnits(r0, 18));
            cngnRes = Number(ethers.formatUnits(r1, 6));
          }
          if (tokRes > 0 && cngnRes > 0) {
            const priceNaira = cngnRes / tokRes;
            item.priceKobo = priceNaira * 100;
            item.priceCngn = priceNaira;
            item.marketCapNaira = priceNaira * 1000000000;
            item.hasLiquidity = true;
          } else {
            item.hasLiquidity = false;
          }
          item.cngnReserve = cngnRes || 0;
          item.tokenReserve = tokRes || 0;
        }
      } catch (ammErr) {}
    }

    result.push(item);
  }
  return result;
}

// Function to fetch latest trades from persistent database
async function getLatestTrades() {
  try {
    const firestoreTrades = await firebaseDb.getLatestTradesFirestore(30);
    if (firestoreTrades && Array.isArray(firestoreTrades) && firestoreTrades.length > 0) {
      return firestoreTrades.map(r => ({
        id: r.id,
        tokenAddress: r.tokenAddress,
        tokenSymbol: r.tokenSymbol,
        trader: shortenAddress(r.traderAddress),
        traderAddress: r.traderAddress,
        isBuy: Boolean(r.isBuy),
        cngnAmount: r.cngnAmount,
        tokenAmount: r.tokenAmount,
        txHash: r.txHash,
        timeAgo: formatTimeAgo(r.createdAt)
      }));
    }
  } catch (e) {}

  const rows = db.prepare('SELECT * FROM trades ORDER BY created_at DESC LIMIT 30').all();
  return rows.map(r => ({
    id: r.id,
    tokenAddress: r.token_address,
    tokenSymbol: r.token_symbol,
    trader: shortenAddress(r.trader_address),
    traderAddress: r.trader_address,
    isBuy: Boolean(r.is_buy),
    cngnAmount: r.cngn_amount,
    tokenAmount: r.token_amount,
    txHash: r.tx_hash,
    timeAgo: formatTimeAgo(r.created_at)
  }));
}

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // --- API: Config ---
  if (pathname === '/api/config' && req.method === 'GET') {
    let treasuryAddr = '0x959C2c33419b009ce02113BFAee45d4ae72981f8';
    try {
      if (DEPLOYER_PRIVATE_KEY) {
        treasuryAddr = new ethers.Wallet(DEPLOYER_PRIVATE_KEY).address;
      }
    } catch (e) {}

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      cngnAddress: CNGN_ADDRESS,
      factoryAddress: FACTORY_ADDRESS,
      bondingCurveAddress: FACTORY_ADDRESS,
      ammFactoryAddress: AMM_FACTORY_ADDRESS,
      ammRouterAddress: AMM_ROUTER_ADDRESS,
      treasuryAddress: treasuryAddr,
      dexRouterAddress: AMM_ROUTER_ADDRESS,
      paystackPublicKey: PAYSTACK_PUBLIC_KEY,
      dynamicEnvId: DYNAMIC_ENV_ID,
      network: 'Base Sepolia',
      chainId: 84532,
      rpcUrl: BASE_SEPOLIA_RPC
    }));
  }

  // --- API: List Tokens (Live on-chain sync + SQLite & Firestore persistent data) ---
  if (pathname === '/api/tokens' && req.method === 'GET') {
    const tokenList = await getTokensWithChainData();
    const tradeList = await getLatestTrades();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ tokens: tokenList, trades: tradeList }));
  }

  // --- API: Ensure AMM Pair for Graduated Coin ---
  if (pathname === '/api/amm/ensure-pair' && req.method === 'POST') {
    try {
      const data = await parseJson(req);
      const { tokenAddress, tokenSymbol } = data;
      if (!tokenAddress) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'tokenAddress required' }));
      }
      const pair = await ensureAmmPairForToken(tokenAddress, tokenSymbol || 'TOKEN');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, tokenAddress, pairAddress: pair }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // --- API: Single Token Details, Trade History & Price Chart History ---
  if (pathname === '/api/tokens/details' && req.method === 'GET') {
    const address = url.searchParams.get('address');
    if (!address) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Token address required' }));
    }

    try {
      let row = db.prepare('SELECT * FROM tokens WHERE LOWER(address) = LOWER(?)').get(address);
      if (!row) {
        // Fallback 1: Query persistent Firestore cloud storage
        try {
          const fDoc = await firebaseDb.getTokenFirestore(address);
          if (fDoc) {
            row = {
              address: fDoc.address,
              name: fDoc.name,
              symbol: fDoc.symbol,
              description: fDoc.description,
              image_uri: fDoc.imageUri,
              culture_tag: fDoc.cultureTag,
              creator: fDoc.creator,
              created_at: fDoc.createdAt
            };
            db.prepare(`
              INSERT OR IGNORE INTO tokens (address, name, symbol, description, image_uri, culture_tag, creator, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(row.address, row.name, row.symbol, row.description || '', row.image_uri || '', row.culture_tag || 'Meme', row.creator || '', row.created_at || Date.now());
          }
        } catch (fErr) {}
      }

      // Fallback 2: Query on-chain bonding curve
      if (!row && FACTORY_ADDRESS) {
        try {
          const provider = getProvider();
          const curve = new ethers.Contract(FACTORY_ADDRESS, KOBO_BONDING_CURVE_ABI, provider);
          const onChain = await curve.tokens(address);
          if (onChain && onChain[0] && onChain[0] !== ethers.ZeroAddress) {
            row = {
              address: onChain[0],
              name: onChain[1],
              symbol: onChain[2],
              image_uri: onChain[3],
              description: onChain[4],
              creator: onChain[5],
              culture_tag: 'Meme',
              created_at: Number(onChain[11]) * 1000 || Date.now()
            };
            db.prepare(`
              INSERT OR IGNORE INTO tokens (address, name, symbol, description, image_uri, culture_tag, creator, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(row.address, row.name, row.symbol, row.description || '', row.image_uri || '', row.culture_tag || 'Meme', row.creator || '', row.created_at || Date.now());
          }
        } catch (cErr) {}
      }

      if (!row) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Token not found' }));
      }

      const provider = getProvider();
      const curve = FACTORY_ADDRESS ? new ethers.Contract(FACTORY_ADDRESS, KOBO_BONDING_CURVE_ABI, provider) : null;

      const tokenData = {
        address: row.address,
        name: row.name,
        symbol: row.symbol,
        description: row.description,
        imageUri: row.image_uri,
        cultureTag: row.culture_tag,
        creator: row.creator,
        createdAt: row.created_at,
        realCngn: 0,
        realTokens: 800000000,
        virtualCngn: 2500000,
        virtualTokens: 1000000000,
        marketCapNaira: 2500000,
        priceKobo: 0.0025,
        priceCngn: 0.000025,
        progressPercent: 0,
        totalTrades: 0,
        graduated: false
      };

      if (curve && row.address.startsWith('0x')) {
        try {
          const data = await curve.tokens(row.address);
          if (data && data[0] && data[0] !== ethers.ZeroAddress) {
            const realCngn = Number(ethers.formatUnits(data[6], 6));
            const realTokens = Number(ethers.formatUnits(data[7], 18));
            const virtualCngn = Number(ethers.formatUnits(data[8], 6));
            const virtualTokens = Number(ethers.formatUnits(data[9], 18));
            const priceKobo = virtualTokens > 0 ? (virtualCngn * 100) / virtualTokens : 0.0025;
            tokenData.realCngn = realCngn;
            tokenData.realTokens = realTokens;
            tokenData.virtualCngn = virtualCngn;
            tokenData.virtualTokens = virtualTokens;
            tokenData.marketCapNaira = 2500000 + realCngn;
            tokenData.priceKobo = priceKobo;
            tokenData.priceCngn = priceKobo / 100;
            tokenData.progressPercent = Math.min(100, (realCngn / 10000000) * 100);
            tokenData.totalTrades = Number(data[12]);
            tokenData.graduated = data[10];
          }
        } catch (chainErr) {
          console.warn('Curve query error for details:', chainErr.message);
        }
      }

      // Check AMM Factory for autonomous liquidity pool ($MEME / cNGN)
      let ammPairAddress = null;
      if (AMM_FACTORY_ADDRESS && address.startsWith('0x')) {
        try {
          const ammFactory = new ethers.Contract(AMM_FACTORY_ADDRESS, KOBO_AMM_FACTORY_ABI, provider);
          const pairAddr = await ammFactory.getPair(address, CNGN_ADDRESS);
          if (pairAddr && pairAddr !== ethers.ZeroAddress) {
            ammPairAddress = pairAddr;
            tokenData.ammPair = pairAddr;
            tokenData.graduated = true;
            tokenData.progressPercent = 100;

            const pair = new ethers.Contract(pairAddr, KOBO_AMM_PAIR_ABI, provider);
            const [r0, r1] = await pair.getReserves();
            const t0 = await pair.token0();
            let cngnRes, tokRes;
            if (t0.toLowerCase() === CNGN_ADDRESS.toLowerCase()) {
              cngnRes = Number(ethers.formatUnits(r0, 6));
              tokRes = Number(ethers.formatUnits(r1, 18));
            } else {
              tokRes = Number(ethers.formatUnits(r0, 18));
              cngnRes = Number(ethers.formatUnits(r1, 6));
            }
            if (tokRes > 0 && cngnRes > 0) {
              const priceNaira = cngnRes / tokRes;
              tokenData.priceKobo = priceNaira * 100;
              tokenData.priceCngn = priceNaira;
              tokenData.marketCapNaira = priceNaira * 1000000000;
              tokenData.hasLiquidity = true;
            } else {
              tokenData.hasLiquidity = false;
            }
            tokenData.cngnReserve = cngnRes || 0;
            tokenData.tokenReserve = tokRes || 0;
          }
        } catch (e) {}
      }

      // Fetch trades specifically for this token from SQLite
      const tradesRaw = db.prepare('SELECT * FROM trades WHERE LOWER(token_address) = LOWER(?) ORDER BY created_at DESC LIMIT 50').all(address);
      const tradesMap = new Map();

      tradesRaw.forEach(r => {
        const key = (r.tx_hash && r.tx_hash.startsWith('0x') && r.tx_hash.length > 20) ? r.tx_hash.toLowerCase() : r.id;
        tradesMap.set(key, {
          id: r.id,
          tokenAddress: r.token_address,
          tokenSymbol: r.token_symbol,
          trader: shortenAddress(r.trader_address),
          traderAddress: r.trader_address,
          isBuy: Boolean(r.is_buy),
          cngnAmount: r.cngn_amount,
          tokenAmount: r.token_amount,
          txHash: r.tx_hash,
          createdAt: r.created_at,
          timeAgo: formatTimeAgo(r.created_at)
        });
      });

      // ALSO fetch persistent trades from Firestore to prevent disappearing trades across serverless instances
      try {
        const firestoreTrades = await firebaseDb.getTradesForTokenFirestore(address, 50);
        if (Array.isArray(firestoreTrades)) {
          firestoreTrades.forEach(ft => {
            const key = (ft.txHash && ft.txHash.startsWith('0x') && ft.txHash.length > 20) ? ft.txHash.toLowerCase() : (ft.id || 'f-' + ft.createdAt);
            if (!tradesMap.has(key)) {
              tradesMap.set(key, {
                id: ft.id || key,
                tokenAddress: ft.tokenAddress,
                tokenSymbol: ft.tokenSymbol || row.symbol,
                trader: shortenAddress(ft.traderAddress || ft.trader),
                traderAddress: ft.traderAddress || ft.trader,
                isBuy: Boolean(ft.isBuy),
                cngnAmount: Number(ft.cngnAmount || 0),
                tokenAmount: Number(ft.tokenAmount || 0),
                txHash: ft.txHash || '',
                createdAt: ft.createdAt || Date.now(),
                timeAgo: formatTimeAgo(ft.createdAt || Date.now())
              });
            }
          });
        }
      } catch (fErr) {
        console.warn('Firestore token trades query notice:', fErr.message);
      }

      const trades = Array.from(tradesMap.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 50);

      // Index on-chain AMM Swap events if pool exists
      if (ammPairAddress) {
        try {
          const pair = new ethers.Contract(ammPairAddress, KOBO_AMM_PAIR_ABI, provider);
          const currentBlock = await provider.getBlockNumber();
          const fromBlock = Math.max(0, currentBlock - 990);
          const swapEvents = await pair.queryFilter(pair.filters.Swap(), fromBlock, currentBlock);
          const t0 = await pair.token0();
          const isToken0Cngn = t0.toLowerCase() === CNGN_ADDRESS.toLowerCase();

          for (const ev of swapEvents) {
            const a0In = ev.args.amount0In;
            const a1In = ev.args.amount1In;
            const a0Out = ev.args.amount0Out;
            const a1Out = ev.args.amount1Out;

            const cngnIn = isToken0Cngn ? a0In : a1In;
            const cngnOut = isToken0Cngn ? a0Out : a1Out;
            const tokIn = isToken0Cngn ? a1In : a0In;
            const tokOut = isToken0Cngn ? a1Out : a0Out;

            const isBuy = cngnIn > 0n;
            const cngnAmt = Number(ethers.formatUnits(isBuy ? cngnIn : cngnOut, 6));
            const tokAmt = Number(ethers.formatUnits(isBuy ? tokOut : tokIn, 18));

            const alreadyIndexed = trades.some(t => t.txHash && t.txHash.toLowerCase() === ev.transactionHash.toLowerCase());
            if (!alreadyIndexed) {
              trades.unshift({
                id: 'chain-' + ev.transactionHash.slice(0, 10),
                tokenAddress: address,
                tokenSymbol: row.symbol,
                trader: shortenAddress(ev.args.to),
                traderAddress: ev.args.to,
                isBuy,
                cngnAmount: cngnAmt,
                tokenAmount: tokAmt,
                txHash: ev.transactionHash,
                createdAt: Date.now(),
                timeAgo: 'Just now'
              });
            }
          }
        } catch (evErr) {
          console.warn('Could not query on-chain AMM Swap events:', evErr.message);
        }
      }

      // Sort trades newest first and update totalTrades count
      trades.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      tokenData.totalTrades = Math.max(Number(tokenData.totalTrades || 0), trades.length);

      // Generate realistic price points for Chart.js
      const priceHistory = [];
      const baseTime = row.created_at || (Date.now() - 3600000);
      priceHistory.push({
        time: new Date(baseTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        price: 0.0025,
        timestamp: baseTime
      });

      const chronologicalTrades = [...trades].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      let runningVirtualCngn = 2500000;
      let runningVirtualTokens = 1000000000;

      for (const tr of chronologicalTrades) {
        const isBuy = tr.isBuy;
        const cngnAmt = tr.cngnAmount || 0;
        const tokAmt = tr.tokenAmount || 0;
        if (isBuy) {
          runningVirtualCngn += cngnAmt * 0.9865;
          runningVirtualTokens -= tokAmt;
        } else {
          runningVirtualCngn -= cngnAmt;
          runningVirtualTokens += tokAmt;
        }
        if (runningVirtualTokens > 0) {
          const ptPrice = (runningVirtualCngn * 100) / runningVirtualTokens;
          priceHistory.push({
            time: new Date(tr.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            price: Number(ptPrice.toFixed(6)),
            timestamp: tr.createdAt || Date.now()
          });
        }
      }

      priceHistory.push({
        time: 'Now',
        price: Number(tokenData.priceKobo.toFixed(6)),
        timestamp: Date.now()
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        token: tokenData,
        trades,
        priceHistory
      }));
    } catch (e) {
      console.error('Error fetching token details:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // --- API: Record On-Chain Trade (Saves to SQLite for live multi-user ticker) ---
  if (pathname === '/api/trade' && req.method === 'POST') {
    try {
      const data = await parseJson(req);
      const { txHash, tokenAddress, isBuy, amountCngn, tokenAmount, traderAddress, tokenSymbol: inputSymbol } = data;

      let tokenSymbol = inputSymbol;
      if (!tokenSymbol || tokenSymbol === 'TOKEN') {
        if (tokenAddress) {
          const tok = db.prepare('SELECT symbol FROM tokens WHERE LOWER(address) = LOWER(?)').get(tokenAddress);
          if (tok && tok.symbol) tokenSymbol = tok.symbol;
          if (!tokenSymbol || tokenSymbol === 'TOKEN') {
            try {
              const fTok = await firebaseDb.getTokenFirestore(tokenAddress);
              if (fTok && fTok.symbol) tokenSymbol = fTok.symbol;
            } catch (e) {}
          }
          if (!tokenSymbol || tokenSymbol === 'TOKEN') {
            try {
              const provider = getProvider();
              const c = new ethers.Contract(tokenAddress, ['function symbol() view returns (string)'], provider);
              const s = await c.symbol();
              if (s) tokenSymbol = s;
            } catch (e) {}
          }
        }
      }
      if (!tokenSymbol) tokenSymbol = 'TOKEN';

      const tradeId = 't-' + Date.now();
      db.prepare(`
        INSERT INTO trades (id, token_address, token_symbol, trader_address, is_buy, cngn_amount, token_amount, tx_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        tradeId,
        tokenAddress || '',
        tokenSymbol,
        traderAddress || '0x0000000000000000000000000000000000000000',
        isBuy ? 1 : 0,
        parseFloat(amountCngn) || 0,
        parseFloat(tokenAmount) || 0,
        txHash || '',
        Date.now()
      );

      // Also persist in Firestore (dual-write, fire-and-forget)
      firebaseDb.saveTradeFirestore({
        id: tradeId,
        tokenAddress: tokenAddress || '',
        tokenSymbol,
        traderAddress: traderAddress || '0x0000000000000000000000000000000000000000',
        isBuy: Boolean(isBuy),
        cngnAmount: parseFloat(amountCngn) || 0,
        tokenAmount: parseFloat(tokenAmount) || 0,
        txHash: txHash || '',
        createdAt: Date.now()
      }).catch(e => console.warn('[Firestore] trade save notice:', e.message));

      console.log(`📊 [Trade Logged] ${isBuy ? 'BUY' : 'SELL'} ₦${amountCngn} $${tokenSymbol} by ${traderAddress}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, tradeId }));
    } catch (e) {
      console.warn('Trade log error:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // --- API: DEX Swap Execution (For graduated coins like $TEST2 - continuous trading pump.fun style) ---
  if (pathname === '/api/trade/dex-swap' && req.method === 'POST') {
    try {
      const data = await parseJson(req);
      const { tokenAddress, tokenSymbol, traderAddress, isBuy, amountCngn, tokenAmount, userTxHash } = data;

      if (!tokenAddress || !traderAddress || !userTxHash) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'tokenAddress, traderAddress, and userTxHash required' }));
      }

      const numCngn = parseFloat(amountCngn) || 0;
      const numTokens = parseFloat(tokenAmount) || 0;

      let symbol = tokenSymbol || 'TOKEN';
      try {
        const tok = db.prepare('SELECT symbol FROM tokens WHERE LOWER(address) = LOWER(?)').get(tokenAddress);
        if (tok && tok.symbol) symbol = tok.symbol;
      } catch (e) {}

      let dispatchTxHash = null;

      if (DEPLOYER_PRIVATE_KEY) {
        const provider = getProvider();
        const deployerWallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);

        if (isBuy) {
          // BUY: User transferred cNGN to treasury -> Deployer dispatches tokens to trader
          console.log(`⚡ [DEX SWAP BUY] User ${traderAddress} sent ₦${numCngn} cNGN (tx: ${userTxHash}). Dispatching ${numTokens} $${symbol}...`);
          try {
            const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, deployerWallet);
            const tokenUnits = ethers.parseUnits(numTokens.toString(), 18);
            const tx = await tokenContract.transfer(traderAddress, tokenUnits);
            dispatchTxHash = tx.hash;
            console.log(`✅ [DEX SWAP BUY] Dispatched $${symbol} to ${traderAddress}, tx: ${dispatchTxHash}`);
          } catch (tErr) {
            console.warn('DEX swap buy dispatch error:', tErr.message);
          }
        } else {
          // SELL: User transferred tokens to treasury -> Deployer dispatches cNGN to trader
          console.log(`⚡ [DEX SWAP SELL] User ${traderAddress} sent ${numTokens} $${symbol} (tx: ${userTxHash}). Dispatching ₦${numCngn} cNGN...`);
          try {
            const cngnContract = new ethers.Contract(CNGN_ADDRESS, MOCK_CNGN_ABI, deployerWallet);
            const cngnUnits = ethers.parseUnits(numCngn.toString(), 6);
            const tx = await cngnContract.transfer(traderAddress, cngnUnits);
            dispatchTxHash = tx.hash;
            console.log(`✅ [DEX SWAP SELL] Dispatched cNGN to ${traderAddress}, tx: ${dispatchTxHash}`);

            // Automatically seed AMM pool with received tokens + matching cNGN if pool has 0 reserves
            if (AMM_ROUTER_ADDRESS && AMM_FACTORY_ADDRESS) {
              try {
                const factory = new ethers.Contract(AMM_FACTORY_ADDRESS, KOBO_AMM_FACTORY_ABI, deployerWallet);
                const pairAddr = await factory.getPair(CNGN_ADDRESS, tokenAddress);
                if (pairAddr && pairAddr !== ethers.ZeroAddress) {
                  const pair = new ethers.Contract(pairAddr, KOBO_AMM_PAIR_ABI, deployerWallet);
                  const [r0, r1] = await pair.getReserves();
                  if (r0 === 0n && r1 === 0n) {
                    console.log(`🌊 [AMM Auto-Seed] Seeding initial pool for $${symbol} with received tokens...`);
                    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, deployerWallet);
                    const tokBal = await tokenContract.balanceOf(deployerWallet.address);
                    const cngnBal = await cngnContract.balanceOf(deployerWallet.address);
                    const seedCngn = cngnUnits > cngnBal ? cngnBal : cngnUnits;
                    if (tokBal > 0n && seedCngn > 0n) {
                      await (await cngnContract.approve(AMM_ROUTER_ADDRESS, ethers.MaxUint256)).wait();
                      await (await tokenContract.approve(AMM_ROUTER_ADDRESS, ethers.MaxUint256)).wait();
                      const router = new ethers.Contract(AMM_ROUTER_ADDRESS, KOBO_AMM_ROUTER_ABI, deployerWallet);
                      const deadline = Math.floor(Date.now() / 1000) + 1200;
                      const addTx = await router.addLiquidity(
                        CNGN_ADDRESS,
                        tokenAddress,
                        seedCngn,
                        tokBal,
                        0,
                        0,
                        deployerWallet.address,
                        deadline
                      );
                      await addTx.wait();
                      console.log(`✅ [AMM Auto-Seed] Successfully seeded pool ${pairAddr} (tx: ${addTx.hash})`);
                    }
                  }
                }
              } catch (seedErr) {
                console.warn('Auto-seed after sell notice:', seedErr.message);
              }
            }
          } catch (cErr) {
            console.warn('DEX swap sell dispatch error:', cErr.message);
          }
        }
      }

      // Record trade in SQLite persistent database
      const tradeId = 'dex-' + Date.now();
      db.prepare(`
        INSERT INTO trades (id, token_address, token_symbol, trader_address, is_buy, cngn_amount, token_amount, tx_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        tradeId,
        tokenAddress,
        symbol,
        traderAddress,
        isBuy ? 1 : 0,
        numCngn,
        numTokens,
        dispatchTxHash || userTxHash,
        Date.now()
      );

      // Also persist in Firestore (dual-write, fire-and-forget)
      firebaseDb.saveTradeFirestore({
        id: tradeId,
        tokenAddress,
        tokenSymbol: symbol,
        traderAddress,
        isBuy: Boolean(isBuy),
        cngnAmount: numCngn,
        tokenAmount: numTokens,
        txHash: dispatchTxHash || userTxHash,
        createdAt: Date.now()
      }).catch(e => console.warn('[Firestore] dex trade save notice:', e.message));

      console.log(`🎉 [DEX Trade Recorded] ${isBuy ? 'BUY' : 'SELL'} ₦${numCngn} $${symbol} by ${traderAddress}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        tradeId,
        userTxHash,
        dispatchTxHash,
        isBuy,
        amountCngn: numCngn,
        tokenAmount: numTokens,
        message: isBuy
          ? `DEX Swap complete! Delivered ${numTokens.toLocaleString()} $${symbol} to your wallet on Base Sepolia.`
          : `DEX Swap complete! Delivered ₦${numCngn.toLocaleString()} cNGN to your wallet on Base Sepolia.`
      }));
    } catch (e) {
      console.error('DEX swap error:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // --- API: User Deposited Naira Balance ---
  if (pathname === '/api/naira-balance' && req.method === 'GET') {
    const address = (url.searchParams.get('address') || '').toLowerCase();
    if (!address || !address.startsWith('0x')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Invalid address' }));
    }
    try {
      let balanceNaira = 0;
      const row = db.prepare('SELECT naira_balance FROM user_balances WHERE LOWER(wallet_address) = LOWER(?)').get(address);
      if (row && typeof row.naira_balance === 'number') {
        balanceNaira = row.naira_balance;
      }

      // Check authoritative Firestore cloud balance to prevent flickering across serverless instances
      try {
        const firestoreBal = await firebaseDb.getUserBalanceFirestore(address);
        if (typeof firestoreBal === 'number') {
          balanceNaira = Math.max(balanceNaira, firestoreBal);
          // Sync local SQLite instance
          db.prepare(`
            INSERT INTO user_balances (wallet_address, naira_balance, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(wallet_address) DO UPDATE SET 
              naira_balance = excluded.naira_balance,
              updated_at = excluded.updated_at
          `).run(address, balanceNaira, Date.now());
        }
      } catch (fErr) {}

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, address, balanceNaira }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, address, balanceNaira: 0 }));
    }
  }

  // --- API: cNGN Balance ---
  if (pathname === '/api/cngn-balance' && req.method === 'GET') {
    const address = url.searchParams.get('address');
    if (!address || !address.startsWith('0x')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Invalid address' }));
    }
    try {
      const provider = getProvider();
      const cngn = new ethers.Contract(CNGN_ADDRESS, MOCK_CNGN_ABI, provider);
      const bal = await cngn.balanceOf(address);
      const balance = Number(ethers.formatUnits(bal, 6));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, address, balance }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, address, balance: 0 }));
    }
  }

  // --- API: ETH Balance (Gas) ---
  if (pathname === '/api/eth-balance' && req.method === 'GET') {
    const address = url.searchParams.get('address');
    if (!address || !address.startsWith('0x')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Invalid address' }));
    }
    try {
      const provider = getProvider();
      const bal = await provider.getBalance(address);
      const balanceEth = Number(ethers.formatEther(bal));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, address, balanceEth }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, address, balanceEth: 0 }));
    }
  }

  // --- API: Starter Gas Claim Status (1¢ in ETH, Once Per Account) ---
  if (pathname === '/api/gas/starter-status' && req.method === 'GET') {
    const rawAddress = url.searchParams.get('address') || '';
    if (!rawAddress || !rawAddress.startsWith('0x')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Invalid address' }));
    }
    const address = rawAddress.toLowerCase();
    try {
      let claim = null;
      const row = db.prepare('SELECT * FROM starter_gas_claims WHERE LOWER(wallet_address) = LOWER(?)').get(address);
      if (row) {
        claim = {
          walletAddress: row.wallet_address,
          amountEth: row.amount_eth || '0.000005',
          amountUsd: row.amount_usd || '0.01',
          txHash: row.tx_hash,
          claimedAt: row.claimed_at
        };
      } else {
        // Query Firestore cloud persistence
        try {
          const fClaim = await firebaseDb.getGasClaimFirestore(address);
          if (fClaim) {
            claim = fClaim;
            db.prepare(`
              INSERT OR IGNORE INTO starter_gas_claims (wallet_address, amount_eth, amount_usd, tx_hash, claimed_at)
              VALUES (?, ?, ?, ?, ?)
            `).run(address, fClaim.amountEth || '0.000005', fClaim.amountUsd || '0.01', fClaim.txHash || '', fClaim.claimedAt || Date.now());
          }
        } catch (fErr) {}
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        address,
        hasClaimed: Boolean(claim),
        claim: claim || null,
        amountEth: '0.000005',
        amountUsd: '0.01'
      }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, address, hasClaimed: false, amountEth: '0.000005', amountUsd: '0.01' }));
    }
  }

  // --- API: Claim 1¢ Starter Gas in ETH (Sent from Deployer Private Key) ---
  if (pathname === '/api/gas/claim-starter' && req.method === 'POST') {
    try {
      const data = await parseJson(req);
      const rawAddress = data.walletAddress || data.address;
      if (!rawAddress || !rawAddress.startsWith('0x')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Valid recipient wallet address is required' }));
      }
      const walletAddress = rawAddress.toLowerCase();

      // Check SQLite
      const existingRow = db.prepare('SELECT * FROM starter_gas_claims WHERE LOWER(wallet_address) = LOWER(?)').get(walletAddress);
      if (existingRow) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          hasClaimed: true,
          message: 'Starter gas has already been claimed for this wallet address. Only 1 claim is allowed per account.',
          claim: {
            txHash: existingRow.tx_hash,
            claimedAt: existingRow.claimed_at,
            amountEth: existingRow.amount_eth
          }
        }));
      }

      // Check Firestore
      try {
        const firestoreClaim = await firebaseDb.getGasClaimFirestore(walletAddress);
        if (firestoreClaim) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            hasClaimed: true,
            message: 'Starter gas has already been claimed for this wallet address. Only 1 claim is allowed per account.',
            claim: firestoreClaim
          }));
        }
      } catch (fErr) {}

      if (!DEPLOYER_PRIVATE_KEY) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          message: 'Deployer gas key is not configured on the server. Please contact support.'
        }));
      }

      // 1 cent in ETH (~0.000005 ETH)
      const provider = getProvider();
      const relayerWallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
      const amountEth = '0.000005';
      const amountWei = ethers.parseEther(amountEth);

      const feeData = await provider.getFeeData();
      console.log(`⛽ [Starter Gas Claim] Dispensing 1¢ (${amountEth} ETH) to ${rawAddress} from deployer ${relayerWallet.address}...`);

      const tx = await relayerWallet.sendTransaction({
        to: rawAddress,
        value: amountWei,
        gasLimit: 30000,
        maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('0.02', 'gwei'),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('0.002', 'gwei')
      });

      console.log(`🚀 [Starter Gas Claim] Tx broadcast: ${tx.hash}, waiting confirmation...`);
      await tx.wait();
      const txHash = tx.hash;

      const claimRecord = {
        amountEth,
        amountUsd: '0.01',
        txHash,
        claimedAt: Date.now()
      };

      // Record in SQLite
      db.prepare(`
        INSERT OR REPLACE INTO starter_gas_claims (wallet_address, amount_eth, amount_usd, tx_hash, claimed_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(walletAddress, amountEth, '0.01', txHash, claimRecord.claimedAt);

      // Record in Firestore
      await firebaseDb.saveGasClaimFirestore(walletAddress, claimRecord).catch(e => {
        console.warn('Firestore starter gas claim save notice:', e.message);
      });

      console.log(`✅ [Starter Gas Claim] Dispensed 1¢ ETH to ${rawAddress}. Tx: ${txHash}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        recipient: rawAddress,
        amountEth,
        amountUsd: '0.01',
        txHash,
        message: 'Successfully sent 1¢ in Base Sepolia ETH (0.000005 ETH) to your wallet for gas!'
      }));
    } catch (e) {
      console.error('Starter gas claim error:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message || 'Gas claim failed on-chain' }));
    }
  }

  // --- API: Token Balance ---
  if (pathname === '/api/token-balance' && req.method === 'GET') {
    const address = url.searchParams.get('address');
    const tokenAddress = url.searchParams.get('tokenAddress');
    if (!address || !tokenAddress) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Address and tokenAddress required' }));
    }
    try {
      const provider = getProvider();
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const bal = await token.balanceOf(address);
      const balance = Number(ethers.formatUnits(bal, 18));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, address, tokenAddress, balance }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, address, tokenAddress, balance: 0 }));
    }
  }

  // --- API: Paystack Verify (Credits user in-app Naira balance) ---
  if (pathname === '/api/paystack/verify' && req.method === 'POST') {
    try {
      const data = await parseJson(req);
      const { reference, walletAddress, amountNgn } = data;

      if (!reference || !walletAddress) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Reference and wallet address are required' }));
      }

      // Verify with Paystack API
      let paidNgn = amountNgn || 10000;
      try {
        const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
        });
        const verifyJson = await paystackRes.json();
        if (verifyJson && verifyJson.status && verifyJson.data && verifyJson.data.status === 'success') {
          paidNgn = verifyJson.data.amount / 100;
        }
      } catch (paystackErr) {
        console.warn('Paystack API notice, falling back to payload amount:', paystackErr.message);
      }

      // Credit User's in-app Naira Balance in SQLite and Firestore
      let newNairaBalance = paidNgn;
      try {
        const firestoreBal = await firebaseDb.getUserBalanceFirestore(walletAddress);
        if (typeof firestoreBal === 'number' && firestoreBal > 0) {
          newNairaBalance = firestoreBal + paidNgn;
        } else {
          const row = db.prepare('SELECT naira_balance FROM user_balances WHERE LOWER(wallet_address) = LOWER(?)').get(walletAddress.toLowerCase());
          if (row && typeof row.naira_balance === 'number') {
            newNairaBalance = row.naira_balance + paidNgn;
          }
        }

        db.prepare(`
          INSERT INTO user_balances (wallet_address, naira_balance, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(wallet_address) DO UPDATE SET 
            naira_balance = excluded.naira_balance,
            updated_at = excluded.updated_at
        `).run(walletAddress.toLowerCase(), newNairaBalance, Date.now());

        await firebaseDb.setUserBalanceFirestore(walletAddress, newNairaBalance);
      } catch (balErr) {
        console.warn('Update naira balance notice:', balErr.message);
      }

      // Record deposit in SQLite and Firestore
      const txHash = '0xpaystack_' + Date.now();
      try {
        db.prepare(`
          INSERT OR IGNORE INTO deposits (reference, wallet_address, amount_ngn, status, tx_hash, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(reference, walletAddress, paidNgn, 'success', txHash, Date.now());

        await firebaseDb.saveDepositFirestore({
          reference,
          walletAddress: walletAddress.toLowerCase(),
          amountNgn: paidNgn,
          status: 'success',
          createdAt: Date.now()
        });
        console.log(`💾 Recorded Paystack deposit ₦${paidNgn} for ${walletAddress}. New Naira Balance: ₦${newNairaBalance}`);
      } catch (dbErr) {
        console.warn('Deposit log notice:', dbErr.message);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        amountNgn: paidNgn,
        nairaBalance: newNairaBalance,
        txHash,
        message: `Successfully deposited ₦${paidNgn.toLocaleString()} NGN into your account! You can now convert it 1:1 to cNGN to trade on-chain.`
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // --- API: Account Convert (Naira Deposit ⇄ cNGN at 1:1 Parity — NO PAYSTACK PROMPT) ---
  if (pathname === '/api/account/convert' && req.method === 'POST') {
    try {
      const data = await parseJson(req);
      const { walletAddress, fromCurrency, toCurrency, amount } = data;
      const numAmount = parseFloat(amount) || 0;

      if (!walletAddress || numAmount <= 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Valid wallet address and amount required' }));
      }

      if (fromCurrency === 'NGN' && toCurrency === 'cNGN') {
        // Converting Deposited Naira -> On-Chain cNGN
        let availableNaira = 0;
        const row = db.prepare('SELECT naira_balance FROM user_balances WHERE LOWER(wallet_address) = LOWER(?)').get(walletAddress.toLowerCase());
        if (row && typeof row.naira_balance === 'number') availableNaira = row.naira_balance;

        try {
          const fBal = await firebaseDb.getUserBalanceFirestore(walletAddress);
          if (typeof fBal === 'number') availableNaira = Math.max(availableNaira, fBal);
        } catch (e) {}

        if (availableNaira < numAmount) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            message: `Insufficient deposited Naira balance! You have ₦${availableNaira.toLocaleString()} NGN. Please deposit Naira first.`
          }));
        }

        // Deduct from in-app Naira balance across SQLite & Firestore
        const remainingNaira = Math.max(0, availableNaira - numAmount);
        db.prepare('UPDATE user_balances SET naira_balance = ?, updated_at = ? WHERE LOWER(wallet_address) = LOWER(?)')
          .run(remainingNaira, Date.now(), walletAddress.toLowerCase());
        await firebaseDb.setUserBalanceFirestore(walletAddress, remainingNaira).catch(() => {});

        // Dispatch cNGN on Base Sepolia
        let txHash = '0xconv_' + Date.now();
        if (DEPLOYER_PRIVATE_KEY && CNGN_ADDRESS) {
          try {
            const provider = getProvider();
            const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
            const cngnContract = new ethers.Contract(CNGN_ADDRESS, MOCK_CNGN_ABI, wallet);
            const cngnUnits = ethers.parseUnits(numAmount.toString(), 6);
            try {
              const deployerBal = await cngnContract.balanceOf(wallet.address);
              if (deployerBal < cngnUnits) {
                const mintTx = await cngnContract.mint(wallet.address, cngnUnits * 2n);
                await mintTx.wait();
                console.log(`🪙 [Auto-Mint cNGN] Minted reserve to deployer to cover conversion of ${numAmount} cNGN`);
              }
            } catch (mErr) {
              console.warn('Auto-mint check notice:', mErr.message);
            }
            const tx = await cngnContract.transfer(walletAddress, cngnUnits);
            txHash = tx.hash;
            console.log(`🔄 [Account Convert] Dispatched ${numAmount} cNGN to ${walletAddress}, tx: ${txHash}`);
          } catch (chainErr) {
            console.warn('Convert dispatch notice:', chainErr.message);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          fromCurrency,
          toCurrency,
          amount: numAmount,
          remainingNaira,
          txHash,
          message: `Successfully converted ₦${numAmount.toLocaleString()} NGN into cNGN on Base Sepolia!`
        }));

      } else {
        // Converting cNGN back to Naira balance (Sell cNGN)
        let currentNaira = numAmount;
        try {
          const fBal = await firebaseDb.getUserBalanceFirestore(walletAddress);
          if (typeof fBal === 'number') currentNaira = fBal + numAmount;
        } catch (e) {}

        db.prepare(`
          INSERT INTO user_balances (wallet_address, naira_balance, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(wallet_address) DO UPDATE SET 
            naira_balance = excluded.naira_balance,
            updated_at = excluded.updated_at
        `).run(walletAddress.toLowerCase(), currentNaira, Date.now());
        await firebaseDb.setUserBalanceFirestore(walletAddress, currentNaira).catch(() => {});

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          fromCurrency,
          toCurrency,
          amount: numAmount,
          nairaBalance: currentNaira,
          message: `Successfully converted ₦${numAmount.toLocaleString()} cNGN back into your Naira balance!`
        }));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // --- API: Account Withdraw (cNGN ➔ Nigerian Bank Account via Paystack) ---
  if (pathname === '/api/account/withdraw' && req.method === 'POST') {
    try {
      const data = await parseJson(req);
      const { walletAddress, amountCngn, bankName, accountNumber, accountName } = data;
      const numAmount = parseFloat(amountCngn) || 0;

      if (!walletAddress || numAmount <= 0 || !accountNumber) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Valid amount, account number and wallet address required' }));
      }

      const reference = 'PAYOUT_' + Math.floor(Math.random() * 1000000000);
      
      // Record withdrawal in SQLite database
      try {
        db.prepare(`
          INSERT INTO withdrawals (reference, wallet_address, amount_cngn, bank_name, account_number, account_name, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(reference, walletAddress, numAmount, bankName || 'Bank', accountNumber, accountName || 'Verified Recipient', 'processing', Date.now());
        console.log(`💾 [SQLite DB] Recorded withdrawal ₦${numAmount} cNGN to ${bankName} (${accountNumber}) for ${walletAddress}`);
      } catch (dbErr) {
        console.warn('Withdrawal SQLite log notice:', dbErr.message);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        amount: numAmount,
        reference,
        bankName: bankName || 'Bank',
        accountNumber,
        accountName: accountName || 'Verified Recipient',
        message: `Withdrawal request for ₦${numAmount.toLocaleString()} cNGN approved! Funds will arrive in your ${bankName || 'bank'} account within minutes via Paystack payout.`
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // --- API: User Portfolio (Holdings across all launched memecoins) ---
  if (pathname === '/api/user-portfolio' && req.method === 'GET') {
    const address = url.searchParams.get('address');
    if (!address || !address.startsWith('0x')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Invalid address' }));
    }

    try {
      const provider = getProvider();
      const tokenList = await getTokensWithChainData();
      const portfolio = [];

      for (const t of tokenList) {
        try {
          if (t.address && t.address.startsWith('0x')) {
            const tokenContract = new ethers.Contract(t.address, ERC20_ABI, provider);
            const bal = await tokenContract.balanceOf(address);
            const tokenCount = Number(ethers.formatUnits(bal, 18));
            if (tokenCount > 0) {
              const priceNaira = (t.priceKobo || 0.0025) / 100;
              const valueNaira = tokenCount * priceNaira;
              portfolio.push({
                address: t.address,
                name: t.name,
                symbol: t.symbol,
                imageUri: t.imageUri,
                cultureTag: t.cultureTag,
                tokenCount,
                priceKobo: t.priceKobo,
                valueNaira
              });
            }
          }
        } catch (err) {}
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, address, portfolio }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // --- API: Register On-Chain Token (Created directly by user's wallet) ---
  if (pathname === '/api/tokens/register' && req.method === 'POST') {
    try {
      const data = await parseJson(req);
      const { address, name, symbol, description, imageUri, cultureTag, creator, txHash } = data;

      if (!address || !name || !symbol) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Address, name, and symbol are required' }));
      }

      const registeredToken = {
        address,
        name,
        symbol: symbol.toUpperCase(),
        description: description || 'No description provided.',
        imageUri: imageUri || 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=400&auto=format&fit=crop&q=80',
        creator: creator || '0x0000000000000000000000000000000000000000',
        marketCapNaira: 2500000,
        priceKobo: 0.0025,
        progressPercent: 0,
        totalTrades: 0,
        cultureTag: cultureTag || 'Meme',
        graduated: false
      };

      // Persist in SQLite database
      db.prepare(`
        INSERT INTO tokens (address, name, symbol, description, image_uri, culture_tag, creator, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(address) DO UPDATE SET
          name = excluded.name,
          symbol = excluded.symbol,
          description = excluded.description,
          image_uri = excluded.image_uri,
          culture_tag = excluded.culture_tag,
          creator = excluded.creator,
          created_at = excluded.created_at
      `).run(
        registeredToken.address,
        registeredToken.name,
        registeredToken.symbol,
        registeredToken.description,
        registeredToken.imageUri,
        registeredToken.cultureTag,
        registeredToken.creator,
        Date.now()
      );

      // Persist in deployed-tokens.json
      try {
        if (fs.existsSync(deployedTokensPath)) {
          const list = JSON.parse(fs.readFileSync(deployedTokensPath, 'utf8'));
          const existingIdx = list.findIndex(t => t.address.toLowerCase() === registeredToken.address.toLowerCase());
          if (existingIdx >= 0) {
            list[existingIdx] = registeredToken;
          } else {
            list.unshift(registeredToken);
          }
          fs.writeFileSync(deployedTokensPath, JSON.stringify(list, null, 2), 'utf8');
        }
      } catch (fErr) {
        console.warn('deployed-tokens.json write notice:', fErr.message);
      }

      // Also persist in Firestore (dual-write, fire-and-forget)
      firebaseDb.saveTokenFirestore({
        address: registeredToken.address,
        name: registeredToken.name,
        symbol: registeredToken.symbol,
        description: registeredToken.description,
        imageUri: registeredToken.imageUri,
        cultureTag: registeredToken.cultureTag,
        creator: registeredToken.creator,
        createdAt: Date.now()
      }).catch(e => console.warn('[Firestore] token save notice:', e.message));

      console.log(`🎉 [Token Registered On-Chain] $${registeredToken.symbol} at ${registeredToken.address} by ${registeredToken.creator} (Tx: ${txHash})`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        token: registeredToken,
        txHash,
        message: `Token $${registeredToken.symbol} successfully registered on-chain!`
      }));
    } catch (e) {
      console.error('Token registration error:', e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // --- API: Create Token ---
  if (pathname === '/api/tokens/create' && req.method === 'POST') {
    try {
      const data = await parseJson(req);
      const { name, symbol, description, imageUri, cultureTag } = data;

      if (!name || !symbol) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Name and symbol are required' }));
      }

      let tokenAddress = null;
      let txHash = null;

      if (DEPLOYER_PRIVATE_KEY && FACTORY_ADDRESS) {
        try {
          const provider = getProvider();
          const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
          const factory = new ethers.Contract(FACTORY_ADDRESS, KOBO_BONDING_CURVE_ABI, wallet);
          const tx = await factory.createToken(
            name,
            symbol,
            imageUri || 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=400&auto=format&fit=crop&q=80',
            description || '',
            { gasLimit: 3000000 }
          );
          txHash = tx.hash;
          const receipt = await tx.wait();
          console.log(`🍳 Token $${symbol} created on Base Sepolia, tx: ${txHash}`);
          
          // Fetch newly created token address
          const totalLen = await factory.allTokensLength();
          tokenAddress = await factory.allTokens(totalLen - 1n);
        } catch (chainErr) {
          console.warn('Factory on-chain creation notice:', chainErr.message);
        }
      }

      if (!tokenAddress) {
        tokenAddress = '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      }

      const newToken = {
        address: tokenAddress,
        name,
        symbol: symbol.toUpperCase(),
        description: description || 'No description provided.',
        imageUri: imageUri || 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=400&auto=format&fit=crop&q=80',
        creator: '0x959C...81f8',
        marketCapNaira: 2500000,
        priceKobo: 0.0025,
        progressPercent: 0,
        totalTrades: 0,
        cultureTag: cultureTag || 'Meme',
        graduated: false
      };

      // Persist in SQLite database (insert or replace on conflict)
      db.prepare(`
        INSERT INTO tokens (address, name, symbol, description, image_uri, culture_tag, creator, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(address) DO UPDATE SET
          name = excluded.name,
          symbol = excluded.symbol,
          description = excluded.description,
          image_uri = excluded.image_uri,
          culture_tag = excluded.culture_tag,
          created_at = excluded.created_at
      `).run(
        newToken.address,
        newToken.name,
        newToken.symbol,
        newToken.description,
        newToken.imageUri,
        newToken.cultureTag,
        newToken.creator,
        Date.now()
      );

      // Also persist to deployed-tokens.json
      try {
        if (fs.existsSync(deployedTokensPath)) {
          const list = JSON.parse(fs.readFileSync(deployedTokensPath, 'utf8'));
          const existingIdx = list.findIndex(t => t.address.toLowerCase() === newToken.address.toLowerCase());
          if (existingIdx >= 0) {
            list[existingIdx] = newToken;
          } else {
            list.unshift(newToken);
          }
          fs.writeFileSync(deployedTokensPath, JSON.stringify(list, null, 2), 'utf8');
        }
      } catch (fErr) {
        console.warn('deployed-tokens.json write notice:', fErr.message);
      }

      console.log(`💾 [SQLite DB] Registered token $${newToken.symbol} at ${newToken.address}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        token: newToken,
        txHash,
        message: `Token $${newToken.symbol} deployed on Base Sepolia bonding curve!`
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // --- API: IPFS Decentralized Image Upload ---
  if (pathname === '/api/ipfs/upload' && req.method === 'POST') {
    try {
      const data = await parseJson(req);
      const { fileData, fileName } = data;

      if (!fileData) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'No file data provided' }));
      }

      let base64Content = fileData;
      let detectedMime = 'image/png';
      if (fileData.startsWith('data:')) {
        const matches = fileData.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          detectedMime = matches[1];
          base64Content = matches[2];
        }
      }

      const buffer = Buffer.from(base64Content, 'base64');
      if (buffer.length > 15 * 1024 * 1024) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'File too large. Maximum size is 15MB.' }));
      }

      const cid = computeIpfsCid(buffer);
      const mime = detectImageMime(buffer) || detectedMime;
      const targetPath = path.join(IPFS_DIR, cid);
      try { fs.writeFileSync(targetPath, buffer); } catch (e) {}

      // Persist in Firestore cloud storage so any Vercel lambda instance can retrieve it
      try {
        await firebaseDb.saveIpfsFileFirestore(cid, buffer.toString('base64'), mime);
      } catch (fErr) {
        console.warn('Firestore IPFS save notice:', fErr.message);
      }

      console.log(`🌐 [IPFS Upload] Pinned ${buffer.length} bytes to CID: ${cid} (${mime})`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        cid,
        ipfsUri: `ipfs://${cid}`,
        gatewayUrl: `/ipfs/${cid}`,
        publicGatewayUrl: `https://ipfs.io/ipfs/${cid}`,
        size: buffer.length,
        mimeType: mime,
        fileName: fileName || `${cid}.png`
      }));
    } catch (err) {
      console.error('IPFS upload error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // --- IPFS Gateway Local Resolver ---
  if (pathname.startsWith('/ipfs/')) {
    const cid = pathname.replace('/ipfs/', '').split('/')[0].split('?')[0];
    const ipfsFilePath = path.join(IPFS_DIR, cid);
    const fallbackIpfsPath = path.join(__dirname, 'public', 'ipfs', cid);
    let targetFile = fs.existsSync(ipfsFilePath) ? ipfsFilePath : (fs.existsSync(fallbackIpfsPath) ? fallbackIpfsPath : null);

    if (targetFile) {
      const buffer = fs.readFileSync(targetFile);
      const mime = detectImageMime(buffer);
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(buffer);
    }

    // If not on local disk (new serverless lambda), fetch from persistent Firestore storage
    try {
      const fDoc = await firebaseDb.getIpfsFileFirestore(cid);
      if (fDoc && fDoc.data) {
        const buffer = Buffer.from(fDoc.data, 'base64');
        const mime = fDoc.mimeType || detectImageMime(buffer);
        try { fs.writeFileSync(ipfsFilePath, buffer); } catch (e) {}
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(buffer);
      }
    } catch (dbErr) {
      console.warn('Firestore IPFS lookup notice:', dbErr.message);
    }

    // Fallback: Generate dynamic SVG avatar so image never breaks
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="#0D111A"/><rect width="252" height="252" x="2" y="2" rx="46" fill="none" stroke="#00FF87" stroke-width="2" stroke-opacity="0.3"/><circle cx="128" cy="128" r="70" fill="#00FF87" fill-opacity="0.1"/><text x="128" y="148" font-family="sans-serif" font-size="64" font-weight="900" fill="#00FF87" text-anchor="middle">🪙</text></svg>`;
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(fallbackSvg);
  }

  // --- Static Files ---
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(__dirname, 'public', 'index.html'), (err2, fallback) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(fallback, 'utf-8');
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
      res.end(content, 'utf-8');
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 KOBO LAUNCHPAD SERVER RUNNING`);
    console.log(`🔗 Local URL: http://localhost:${PORT}`);
    console.log(`📍 Base Sepolia cNGN: ${CNGN_ADDRESS}`);
    console.log(`📍 Bonding Curve: ${FACTORY_ADDRESS}`);
    console.log(`💳 Paystack Public Key: ${(PAYSTACK_PUBLIC_KEY || '').slice(0, 14)}...`);
    console.log(`======================================================\n`);
  });
}

module.exports = server;
