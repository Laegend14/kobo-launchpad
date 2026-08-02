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
  // Derive total raised from trades
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
  const holderCount = Math.max(activeHolders || uniqueTraders, raisedCngn > 0 ? 1 : 0);

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
    migrated: Boolean(token.migrated),
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

  const enriched = list.map(t => {
    const metrics = deriveBackendMetrics(t);
    return {
      ...t,
      raisedCngn: metrics.raisedCngn,
      migrated: metrics.migrated,
      metrics
    };
  });

  res.json({ tokens: enriched });
});

// 2. GET /api/tokens/:address - Single token detail
app.get('/api/tokens/:address', (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();
  const token = inMemStore.tokens.find(t => t.address.toLowerCase() === address);

  if (!token) {
    return res.status(404).json({ error: "Token not found" });
  }

  const metrics = deriveBackendMetrics(token);
  res.json({
    token: {
      ...token,
      raisedCngn: metrics.raisedCngn,
      migrated: metrics.migrated,
      metrics
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
app.post('/api/tokens', (req: Request, res: Response) => {
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

  if (address) {
    const existing = inMemStore.tokens.find(t => t.address.toLowerCase() === address.toLowerCase());
    if (existing) {
      const metrics = deriveBackendMetrics(existing);
      return res.json({ token: { ...existing, raisedCngn: metrics.raisedCngn, migrated: metrics.migrated, metrics } });
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
  const metrics = deriveBackendMetrics(newToken);
  res.status(201).json({ token: { ...newToken, raisedCngn: 0, migrated: false, metrics } });
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
    .sort((a, b) => {
      const mA = deriveBackendMetrics(a);
      const mB = deriveBackendMetrics(b);
      return mB.raisedCngn - mA.raisedCngn;
    })
    .map((t, idx) => {
      const metrics = deriveBackendMetrics(t);
      return {
        rank: idx + 1,
        ...t,
        raisedCngn: metrics.raisedCngn,
        migrated: metrics.migrated,
        metrics
      };
    });
  res.json({ leaderboard: sorted });
});

// 11. POST /api/trades - Record a new trade (shared globally)
app.post('/api/trades', (req: Request, res: Response) => {
  const { tokenAddress, tokenName, tokenSymbol, traderWallet, side, cngnAmount, tokenAmount, price, txHash } = req.body;
  if (!tokenAddress || !traderWallet || !side || !cngnAmount) {
    return res.status(400).json({ error: "Missing trade parameters" });
  }

  const addrLower = tokenAddress.toLowerCase();

  // Auto-register missing token on backend if not present
  let token = inMemStore.tokens.find(t => t.address.toLowerCase() === addrLower);
  if (!token) {
    token = {
      id: inMemStore.tokens.length + 1,
      address: addrLower,
      curve_address: addrLower,
      name: tokenName || "Memecoin",
      symbol: (tokenSymbol || "MEME").toUpperCase(),
      metadata_uri: "/jollof.png",
      creator_wallet: traderWallet,
      migrated: false,
      raisedCngn: 0,
      description: `${tokenName || 'Memecoin'} launched on Kobo Launchpad!`,
      created_at: new Date().toISOString()
    };
    inMemStore.tokens.unshift(token);
  }

  const newTrade: TradeRecord = {
    id: inMemStore.trades.length + 1,
    token_address: addrLower,
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
  if (side === 'buy') {
    token.raisedCngn = (token.raisedCngn || 0) + Number(cngnAmount);
    if (token.raisedCngn >= 50000) token.migrated = true;
  } else {
    token.raisedCngn = Math.max(0, (token.raisedCngn || 0) - Number(cngnAmount));
  }

  const metrics = deriveBackendMetrics(token);

  res.status(201).json({
    trade: newTrade,
    token: { ...token, raisedCngn: metrics.raisedCngn, migrated: metrics.migrated, metrics }
  });
});

// 12. GET /api/trades - All global trades across tokens
app.get('/api/trades', (req: Request, res: Response) => {
  res.json({ trades: inMemStore.trades, tokens: inMemStore.tokens });
});

// 13. GET /api/stats - Global protocol statistics
app.get('/api/stats', (req: Request, res: Response) => {
  const trades = inMemStore.trades;
  const tokens = inMemStore.tokens;

  // Total cNGN volume traded (sum of all trade amounts)
  const totalVolumeCngn = trades.reduce((acc, tr) => acc + Number(tr.cngn_amount), 0);

  // Unique trader wallets across all trades
  const uniqueTraders = new Set(trades.map(t => (t.trader_wallet || '').toLowerCase()).filter(Boolean));

  // Unique deployer (creator) wallets
  const uniqueDeployers = new Set(tokens.map(t => (t.creator_wallet || '').toLowerCase()).filter(Boolean));

  // All unique wallets that have interacted (traders + deployers)
  const allWallets = new Set([...uniqueTraders, ...uniqueDeployers]);

  // Total trades
  const totalTrades = trades.length;

  // Tokens launched
  const totalTokens = tokens.length;

  // Tokens that graduated (migrated to Uniswap)
  const migratedTokens = tokens.filter(t => t.migrated).length;

  // Total liquidity locked across all curves (sum of raisedCngn for non-migrated)
  const totalLocked = tokens.reduce((acc, t) => acc + Math.max(0, t.raisedCngn || 0), 0);

  res.json({
    totalVolumeCngn: Math.round(totalVolumeCngn),
    totalTrades,
    totalTokens,
    migratedTokens,
    uniqueTraders: uniqueTraders.size,
    uniqueDeployers: uniqueDeployers.size,
    totalUniqueWallets: allWallets.size,
    totalLiquidityLockedCngn: Math.round(totalLocked),
    // Formatted helpers
    formatted: {
      volume: `₦${Math.round(totalVolumeCngn).toLocaleString('en-NG')}`,
      locked: `₦${Math.round(totalLocked).toLocaleString('en-NG')}`,
    }
  });
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', tokensCount: inMemStore.tokens.length, tradesCount: inMemStore.trades.length });
});

app.listen(port, () => {
  console.log(`Kobo Launchpad Backend running on http://localhost:${port}`);
});
