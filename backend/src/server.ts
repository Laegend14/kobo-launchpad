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
  const raisedCngn = tokenTrades.reduce((acc, tr) => acc + (tr.side === 'buy' ? Number(tr.cngn_amount) : -Number(tr.cngn_amount)), 38500);

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

  const volume24hCngn = (buyVolume + sellVolume) || (raisedCngn * 0.7);
  const progressPercent = token.migrated ? 100 : Math.min(100, Math.max(0, (raisedCngn / 50000) * 100));

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
    holderCount: Math.max(142, new Set(tokenTrades.map(t => t.trader_wallet)).size + 140),
    security: {
      mintDisabled: true,
      renouncedOwnership: true,
      liquidityLockedPercent: token.migrated ? 100 : Number(progressPercent.toFixed(1))
    }
  };
}

// 1. GET /api/tokens - List all tokens
app.get('/api/tokens', (req: Request, res: Response) => {
  const { sort, search } = req.query;
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

  // Generate candle data or trades list
  res.json({ trades });
});

// 4. POST /api/tokens - Launch token metadata pre-upload
app.post('/api/tokens', (req: Request, res: Response) => {
  const { name, symbol, metadataURI, creatorWallet, address, curveAddress } = req.body;

  if (!name || !symbol || !creatorWallet) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const newToken: TokenRecord = {
    address: address || `0x${Math.random().toString(16).substring(2)}${Date.now().toString(16)}`.substring(0, 42),
    curve_address: curveAddress || `0x${Math.random().toString(16).substring(2)}${Date.now().toString(16)}`.substring(0, 42),
    name,
    symbol: symbol.toUpperCase(),
    metadata_uri: metadataURI || "https://images.unsplash.com/photo-1622979135225-d2ba269bc1bd?w=400",
    creator_wallet: creatorWallet,
    migrated: false,
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

// 10. GET /api/leaderboard - Top tokens
app.get('/api/leaderboard', (req: Request, res: Response) => {
  const sorted = [...inMemStore.tokens].map((t, idx) => ({
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
    token_amount: String(tokenAmount),
    price: String(price),
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

app.listen(port, () => {
  console.log(`Kobo Launchpad Backend running on http://localhost:${port}`);
});
