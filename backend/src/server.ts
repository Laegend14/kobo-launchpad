import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { inMemStore, TokenRecord, TradeRecord } from './db';
import { MockFiatRampAdapter } from './adapters/mockFiatRampAdapter';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const fiatAdapter = new MockFiatRampAdapter();

app.use(cors());
app.use(express.json());

function deriveBackendMetrics(token: TokenRecord) {
  const tokenTrades = inMemStore.trades.filter(tr => tr.token_address.toLowerCase() === token.address.toLowerCase());
  // Use token.raisedCngn as the ground truth (updated by trades), start from 0 not 38500
  const tradeRaised = tokenTrades.reduce((acc, tr) => acc + (tr.side === 'buy' ? Number(tr.cngn_amount) : -Number(tr.cngn_amount)), 0);
  const raisedCngn = Math.max(0, token.raisedCngn !== undefined ? token.raisedCngn : tradeRaised);

  const virtualCngn = 10000 + Math.max(0, raisedCngn);
  const virtualToken = (10000 * 1000000000) / virtualCngn;
  const currentPrice = virtualCngn / virtualToken;

  const totalSupply = 1000000000;
  const circulatingSupply = Math.max(0, totalSupply - virtualToken);
  const marketCapNaira = currentPrice * totalSupply;
  const fdvNaira = currentPrice * totalSupply;

  let buyVolume = 0;
  let sellVolume = 0;
  tokenTrades.forEach(tr => {
    if (tr.side === 'buy') buyVolume += Number(tr.cngn_amount);
    else sellVolume += Number(tr.cngn_amount);
  });

  const volume24hCngn = buyVolume + sellVolume;
  const progressPercent = token.migrated ? 100 : Math.min(100, Math.max(0, (raisedCngn / 50000) * 100));

  // Accurate holder count from trade history
  const walletBalances: Record<string, number> = {};
  tokenTrades.forEach(tr => {
    const w = (tr.trader_wallet || '').toLowerCase();
    if (!w) return;
    if (!walletBalances[w]) walletBalances[w] = 0;
    if (tr.side === 'buy') walletBalances[w] += Number(tr.token_amount);
    else walletBalances[w] = Math.max(0, walletBalances[w] - Number(tr.token_amount));
  });
  const activeHolders = Object.values(walletBalances).filter(bal => bal > 0).length;
  const uniqueTraders = new Set(tokenTrades.map(t => (t.trader_wallet || '').toLowerCase()).filter(Boolean)).size;
  const holderCount = Math.max(activeHolders || uniqueTraders, token.raisedCngn ? 1 : 0);

  return {
    priceCngn: currentPrice,
    formattedPriceCngn: currentPrice.toFixed(8),
    marketCapNaira: Math.round(marketCapNaira),
    formattedMarketCapNaira: `₦${Math.round(marketCapNaira).toLocaleString('en-NG')}`,
    fdvNaira: Math.round(fdvNaira),
    formattedFdvNaira: `₦${Math.round(fdvNaira).toLocaleString('en-NG')}`,
    circulatingSupply: Math.round(circulatingSupply),
    totalSupply,
    volume24hCngn,
    formattedVolume24hNaira: `₦${Math.round(volume24hCngn).toLocaleString('en-NG')}`,
    buyVolume24h: buyVolume,
    sellVolume24h: sellVolume,
    progressPercent: Number(progressPercent.toFixed(2)),
    raisedCngn,
    migrationThreshold: 50000,
    holderCount,
    security: {
      mintDisabled: true,
      renouncedOwnership: true,
      liquidityLockedPercent: token.migrated ? 100 : Number(progressPercent.toFixed(1))
    }
  };
}

// 1. GET /api/tokens - List all tokens
app.get('/api/tokens', (req: Request, res: Response) => {
  const { search } = req.query;
  let list = [...inMemStore.tokens];

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(t => t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q));
  }

  const enriched = list.map(t => ({
    ...t,
    metrics: deriveBackendMetrics(t)
  }));

  res.json({ tokens: enriched });
});

// 2. GET /api/tokens/:address - Single token detail
app.get('/api/tokens/:address', (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();
  const token = inMemStore.tokens.find(t => t.address.toLowerCase() === address);

  if (!token) {
    return res.status(404).json({ error: "Token not found" });
  }

  res.json({
    token: {
      ...token,
      metrics: deriveBackendMetrics(token)
    }
  });
});

// 3. GET /api/tokens/:address/trades - Trade history for chart
app.get('/api/tokens/:address/trades', (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();
  const trades = inMemStore.trades.filter(tr => tr.token_address.toLowerCase() === address);
  res.json({ trades });
});

// 4. POST /api/tokens - Create and broadcast new token globally across all accounts
// Handles BOTH snake_case (from AuthContext) and camelCase (from legacy routes) field names
app.post('/api/tokens', (req: Request, res: Response) => {
  // Support both snake_case and camelCase field names from client
  const address = req.body.address;
  const curve_address = req.body.curve_address || req.body.curveAddress;
  const name = req.body.name;
  const symbol = req.body.symbol;
  const metadata_uri = req.body.metadata_uri || req.body.metadataURI;
  const creator_wallet = req.body.creator_wallet || req.body.creatorWallet;
  const description = req.body.description;

  if (!name || !symbol) {
    return res.status(400).json({ error: "Missing required token fields: name and symbol" });
  }

  // Deduplicate: return existing token if address matches
  if (address) {
    const existing = inMemStore.tokens.find(t => t.address.toLowerCase() === address.toLowerCase());
    if (existing) {
      return res.json({ token: existing });
    }
  }

  const newToken: TokenRecord = {
    id: inMemStore.tokens.length + 1,
    address: address || `0x${Math.random().toString(16).substring(2, 42)}`,
    curve_address: curve_address || `0x${Math.random().toString(16).substring(2, 42)}`,
    name,
    symbol: symbol.toUpperCase(),
    metadata_uri: metadata_uri || "/jollof.png",
    creator_wallet: creator_wallet || "0xUser...1234",
    migrated: false,
    raisedCngn: 0,
    description: description || `${name} ($${symbol.toUpperCase()}) launched on Kobo Launchpad!`,
    created_at: new Date().toISOString()
  };

  inMemStore.tokens.unshift(newToken);
  res.status(201).json({ token: newToken });
});

// 5. POST /api/deposits - Request deposit instructions
app.post('/api/deposits', async (req: Request, res: Response) => {
  const { userWallet, amountNaira } = req.body;
  if (!userWallet || !amountNaira) {
    return res.status(400).json({ error: "userWallet and amountNaira required" });
  }

  try {
    const instructions = await fiatAdapter.requestDeposit(userWallet, Number(amountNaira));
    res.json(instructions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. POST /api/deposits/:id/confirm - Simulate bank transfer received
app.post('/api/deposits/:id/confirm', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await fiatAdapter.confirmDeposit(id);
    res.json({ message: "Deposit confirmed and mcNGN minted", ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. POST /api/withdrawals - Request withdrawal (simulated redemption)
app.post('/api/withdrawals', async (req: Request, res: Response) => {
  const { userWallet, amountNaira } = req.body;
  if (!userWallet || !amountNaira) {
    return res.status(400).json({ error: "userWallet and amountNaira required" });
  }

  try {
    const receipt = await fiatAdapter.requestWithdrawal(userWallet, Number(amountNaira));
    res.json(receipt);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 8. GET /api/users/:wallet/balance - Get user balance
app.get('/api/users/:wallet/balance', async (req: Request, res: Response) => {
  const { wallet } = req.params;
  const cngnBalance = await fiatAdapter.getBalance(wallet);
  res.json({
    wallet,
    cngnBalance,
    formattedCngn: cngnBalance.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })
  });
});

// 9. POST /api/users/kyc - Stub KYC submission
app.post('/api/users/kyc', (req: Request, res: Response) => {
  const { wallet, bvn, nin, fullName } = req.body;
  if (!wallet) return res.status(400).json({ error: "Wallet required" });

  inMemStore.users[wallet.toLowerCase()] = {
    wallet,
    kyc_status: 'approved',
    kyc_fields: { bvn: bvn ? '***masked***' : null, nin: nin ? '***masked***' : null, fullName },
    created_at: new Date().toISOString()
  };

  res.json({ message: "KYC verification successful (Testnet Auto-Approved)", status: 'approved' });
});

// 10. GET /api/leaderboard - Top tokens sorted by raised cNGN
app.get('/api/leaderboard', (req: Request, res: Response) => {
  const sorted = [...inMemStore.tokens]
    .sort((a, b) => (b.raisedCngn || 0) - (a.raisedCngn || 0))
    .map((t, idx) => ({
      rank: idx + 1,
      ...t,
      metrics: deriveBackendMetrics(t)
    }));
  res.json({ leaderboard: sorted });
});

// 11. POST /api/trades - Record a new trade (shared globally)
app.post('/api/trades', (req: Request, res: Response) => {
  const { tokenAddress, traderWallet, side, cngnAmount, tokenAmount, price, txHash } = req.body;
  if (!tokenAddress || !traderWallet || !side || !cngnAmount) {
    return res.status(400).json({ error: "Missing trade parameters" });
  }

  const newTrade: TradeRecord = {
    id: inMemStore.trades.length + 1,
    token_address: tokenAddress.toLowerCase(),
    trader_wallet: traderWallet,
    side,
    cngn_amount: String(cngnAmount),
    token_amount: String(tokenAmount || 0),
    price: String(price || 0),
    tx_hash: txHash || `0x${Math.random().toString(16).substring(2)}${Date.now().toString(16)}`,
    created_at: new Date().toISOString()
  };

  inMemStore.trades.unshift(newTrade);

  // Update token raised reserve
  const token = inMemStore.tokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
  if (token) {
    if (side === 'buy') {
      token.raisedCngn = (token.raisedCngn || 0) + Number(cngnAmount);
      if (token.raisedCngn >= 50000) token.migrated = true;
    } else {
      token.raisedCngn = Math.max(0, (token.raisedCngn || 0) - Number(cngnAmount));
    }
  }

  res.status(201).json({ trade: newTrade });
});

// 12. GET /api/trades - All global trades across tokens
app.get('/api/trades', (req: Request, res: Response) => {
  res.json({ trades: inMemStore.trades, tokens: inMemStore.tokens });
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', tokensCount: inMemStore.tokens.length, tradesCount: inMemStore.trades.length });
});

app.listen(port, () => {
  console.log(`Kobo Launchpad Backend running on http://localhost:${port}`);
});
