import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  inMemStore,
  TokenRecord,
  TradeRecord,
  initDB,
  getAllTokensDB,
  saveTokenDB,
  getAllTradesDB,
  saveTradeDB,
  updateTokenReserveDB,
  clearAllDataDB
} from './db';
import { MockFiatRampAdapter } from './adapters/mockFiatRampAdapter';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const fiatAdapter = new MockFiatRampAdapter();

app.use(cors());
app.use(express.json());

// Bonding-curve constants — MUST match TokenFactory.VIRTUAL_CNGN_RESERVE (3,000)
// and the 50,000 cNGN migration threshold on-chain, and the frontend's
// lib/metrics.ts. Any drift here re-introduces wrong prices / market caps.
const VIRTUAL_CNGN_RESERVE = 3_000;
const VIRTUAL_TOKEN_RESERVE = 1_000_000_000;
const MIGRATION_TARGET_CNGN = 50_000;

// Server-Sent Events (SSE) Client Connections for Realtime Push Sync
const sseClients: Response[] = [];

function broadcastSSE(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client, idx) => {
    try {
      client.write(payload);
    } catch {
      sseClients.splice(idx, 1);
    }
  });
}

function deriveBackendMetrics(token: TokenRecord, allTrades: TradeRecord[]) {
  const tokenTrades = allTrades.filter(tr => tr.token_address.toLowerCase() === token.address.toLowerCase());
  const tradeRaised = tokenTrades.reduce((acc, tr) => acc + (tr.side === 'buy' ? Number(tr.cngn_amount) : -Number(tr.cngn_amount)), 0);
  const raisedCngn = Math.max(0, token.raisedCngn !== undefined ? token.raisedCngn : tradeRaised);

  const virtualCngn = VIRTUAL_CNGN_RESERVE + Math.max(0, raisedCngn);
  const virtualToken = (VIRTUAL_CNGN_RESERVE * VIRTUAL_TOKEN_RESERVE) / virtualCngn;
  const currentPrice = virtualCngn / virtualToken;

  const totalSupply = VIRTUAL_TOKEN_RESERVE;
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
  const progressPercent = token.migrated ? 100 : Math.min(100, Math.max(0, (raisedCngn / MIGRATION_TARGET_CNGN) * 100));

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
    migrationThreshold: MIGRATION_TARGET_CNGN,
    holderCount,
    security: {
      mintDisabled: true,
      renouncedOwnership: true,
      liquidityLockedPercent: token.migrated ? 100 : Number(progressPercent.toFixed(1))
    }
  };
}

// Real-Time SSE Endpoint for Thousands of Concurrent Traders
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.push(res);

  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// 1. GET /api/tokens - List all tokens
app.get('/api/tokens', async (req: Request, res: Response) => {
  const { search } = req.query;
  let list = await getAllTokensDB();
  const allTrades = await getAllTradesDB();

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(t => t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q));
  }

  const enriched = list.map(t => {
    const metrics = deriveBackendMetrics(t, allTrades);
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
app.get('/api/tokens/:address', async (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();
  const list = await getAllTokensDB();
  const token = list.find(t => t.address.toLowerCase() === address);

  if (!token) {
    return res.status(404).json({ error: "Token not found" });
  }

  const allTrades = await getAllTradesDB();
  const metrics = deriveBackendMetrics(token, allTrades);
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
app.get('/api/tokens/:address/trades', async (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();
  const allTrades = await getAllTradesDB();
  const trades = allTrades.filter(tr => tr.token_address.toLowerCase() === address);
  res.json({ trades });
});

// 4. POST /api/tokens - Create and broadcast new token globally
app.post('/api/tokens', async (req: Request, res: Response) => {
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

  // The token must already exist on-chain. The backend never invents addresses —
  // a fabricated address would be undiscoverable on the chain every other client
  // reads. The frontend now writes the off-chain metadata mirror directly to
  // Supabase; this endpoint only exists for backward-compatible enrichment.
  if (!address || !curve_address) {
    return res.status(400).json({
      error: "Token address and curve address are required. Tokens must be deployed on-chain before they can be indexed."
    });
  }

  const existingList = await getAllTokensDB();
  const existing = existingList.find(t => t.address.toLowerCase() === address.toLowerCase());
  if (existing) {
    const allTrades = await getAllTradesDB();
    const metrics = deriveBackendMetrics(existing, allTrades);
    return res.json({ token: { ...existing, raisedCngn: metrics.raisedCngn, migrated: metrics.migrated, metrics } });
  }

  const newToken: TokenRecord = {
    id: existingList.length + 1,
    address: address.toLowerCase(),
    curve_address: curve_address.toLowerCase(),
    name,
    symbol: symbol.toUpperCase(),
    metadata_uri: metadata_uri || "/jollof.png",
    creator_wallet: creator_wallet || "0x0000000000000000000000000000000000000000",
    migrated: false,
    raisedCngn: 0,
    description: description || `${name} ($${symbol.toUpperCase()}) launched on Kobo Launchpad!`,
    created_at: new Date().toISOString()
  };

  const saved = await saveTokenDB(newToken);
  const allTrades = await getAllTradesDB();
  const metrics = deriveBackendMetrics(saved, allTrades);
  const result = { ...saved, raisedCngn: 0, migrated: false, metrics };

  // Broadcast real-time creation to thousands of connected clients
  broadcastSSE('LAUNCH', { token: result });

  res.status(201).json({ token: result });
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

// 6. POST /api/deposits/:id/confirm - Confirm deposit
app.post('/api/deposits/:id/confirm', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await fiatAdapter.confirmDeposit(id);
    res.json({ message: "Deposit confirmed and cNGN minted", ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. POST /api/withdrawals - Request withdrawal
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

// 8. GET /api/users/:wallet/balance
app.get('/api/users/:wallet/balance', async (req: Request, res: Response) => {
  const { wallet } = req.params;
  const cngnBalance = await fiatAdapter.getBalance(wallet);
  res.json({
    wallet,
    cngnBalance,
    formattedCngn: cngnBalance.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })
  });
});

// 9. POST /api/users/kyc
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
app.get('/api/leaderboard', async (req: Request, res: Response) => {
  const tokens = await getAllTokensDB();
  const allTrades = await getAllTradesDB();

  const sorted = [...tokens]
    .sort((a, b) => {
      const mA = deriveBackendMetrics(a, allTrades);
      const mB = deriveBackendMetrics(b, allTrades);
      return mB.raisedCngn - mA.raisedCngn;
    })
    .map((t, idx) => {
      const metrics = deriveBackendMetrics(t, allTrades);
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

// 11. POST /api/trades - Record a trade mirror (off-chain enrichment + SSE hint).
// NOTE: the chain is the source of truth for trades (BondingCurve.Trade events).
// This endpoint only mirrors a REAL, already-executed on-chain trade so other
// clients get an instant SSE hint before their next chain poll. It therefore
// requires a real on-chain tx hash and an already-indexed token — it never
// fabricates a tx hash or auto-registers a phantom token.
app.post('/api/trades', async (req: Request, res: Response) => {
  const { tokenAddress, traderWallet, side, cngnAmount, tokenAmount, price, txHash } = req.body;
  if (!tokenAddress || !traderWallet || !side || !cngnAmount) {
    return res.status(400).json({ error: "Missing trade parameters" });
  }
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return res.status(400).json({ error: "A valid on-chain transaction hash (txHash) is required to record a trade." });
  }

  const addrLower = tokenAddress.toLowerCase();
  const tokens = await getAllTokensDB();

  const token = tokens.find(t => t.address.toLowerCase() === addrLower);
  if (!token) {
    return res.status(404).json({ error: "Unknown token. It must be indexed on-chain before its trades can be mirrored." });
  }

  const newTrade: TradeRecord = {
    id: Date.now(),
    token_address: addrLower,
    trader_wallet: traderWallet,
    side,
    cngn_amount: String(cngnAmount),
    token_amount: String(tokenAmount || 0),
    price: String(price || 0),
    tx_hash: txHash,
    created_at: new Date().toISOString()
  };

  const savedTrade = await saveTradeDB(newTrade);

  // Update token raised reserve
  let newRaised = token.raisedCngn || 0;
  if (side === 'buy') {
    newRaised = newRaised + Number(cngnAmount);
  } else {
    newRaised = Math.max(0, newRaised - Number(cngnAmount));
  }
  const isMigrated = token.migrated || newRaised >= MIGRATION_TARGET_CNGN;
  await updateTokenReserveDB(addrLower, newRaised, isMigrated);

  const updatedToken = { ...token, raisedCngn: newRaised, migrated: isMigrated };
  const allTrades = await getAllTradesDB();
  const metrics = deriveBackendMetrics(updatedToken, allTrades);
  const tokenResult = { ...updatedToken, metrics };

  // Broadcast trade live to thousands of connected browser tabs via SSE
  broadcastSSE('TRADE', { trade: savedTrade, updatedToken: tokenResult });

  res.status(201).json({
    trade: savedTrade,
    token: tokenResult
  });
});

// 12. GET /api/trades - All global trades across tokens
app.get('/api/trades', async (req: Request, res: Response) => {
  const trades = await getAllTradesDB();
  const tokens = await getAllTokensDB();
  res.json({ trades, tokens });
});

// 13. GET /api/stats - Global protocol statistics
app.get('/api/stats', async (req: Request, res: Response) => {
  const trades = await getAllTradesDB();
  const tokens = await getAllTokensDB();

  const totalVolumeCngn = trades.reduce((acc, tr) => acc + Number(tr.cngn_amount), 0);
  const uniqueTraders = new Set(trades.map(t => (t.trader_wallet || '').toLowerCase()).filter(Boolean));
  const uniqueDeployers = new Set(tokens.map(t => (t.creator_wallet || '').toLowerCase()).filter(Boolean));
  const allWallets = new Set([...uniqueTraders, ...uniqueDeployers]);
  const totalTrades = trades.length;
  const totalTokens = tokens.length;
  const migratedTokens = tokens.filter(t => t.migrated).length;
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
    formatted: {
      volume: `₦${Math.round(totalVolumeCngn).toLocaleString('en-NG')}`,
      locked: `₦${Math.round(totalLocked).toLocaleString('en-NG')}`,
    }
  });
});

// Reset / Purge all tokens & trades for fresh testing
app.post('/api/reset', async (req: Request, res: Response) => {
  await clearAllDataDB();
  res.json({ message: "All test tokens and trade records purged successfully. Launch fresh memecoins!" });
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', sseClientsCount: sseClients.length });
});

// Initialize database schema and start server. A durable store is mandatory —
// if initDB throws (no Supabase/Postgres configured or unreachable) we exit rather
// than silently serve volatile per-instance data.
initDB().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Kobo Launchpad Backend running at http://localhost:${port}`);
  });
}).catch((err) => {
  console.error("❌ Backend startup aborted:", err?.message || err);
  process.exit(1);
});
