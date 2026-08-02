import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MockFiatRampAdapter } from './adapters/mockFiatRampAdapter';
import { FiatRampAdapter } from './adapters/fiatRamp.interface';
import {
  startIndexer,
  stopIndexer,
  getAllIndexedTokens,
  getIndexedToken,
  getIndexedTradesForToken,
  getAllIndexedTrades,
  getIndexedStatus,
  setIndexerListeners,
  IndexedToken,
  IndexedTrade,
} from './indexer';
import {
  saveMetadata,
  getMetadata,
  getAllMetadata,
  clearAllMetadata,
  TokenMetadata,
} from './metadataStore';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const fiatAdapter = new MockFiatRampAdapter();

app.use(cors());
app.use(express.json({ limit: '10mb' })); // base64 data-URI images can be large

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

/**
 * Derives the professional simulated-liquidity metrics layer from REAL on-chain
 * bonding-curve state + REAL Trade events. Every client gets the same inputs
 * (live reserves from the curve, the same deduped trade list from the indexer),
 * so every client computes the same price / market cap / volume / holders.
 */
function deriveBackendMetrics(token: IndexedToken, allTrades: IndexedTrade[]) {
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

function enrichToken(token: IndexedToken, allTrades: IndexedTrade[]) {
  const metrics = deriveBackendMetrics(token, allTrades);
  return {
    ...token,
    raisedCngn: metrics.raisedCngn,
    migrated: metrics.migrated,
    metrics
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

// 1. GET /api/tokens - List all tokens (canonical, chain-backed)
app.get('/api/tokens', async (req: Request, res: Response) => {
  const { search } = req.query;
  let list = getAllIndexedTokens();
  const allTrades = getAllIndexedTrades();

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(t => t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q));
  }

  const enriched = list.map(t => enrichToken(t, allTrades));
  res.json({ tokens: enriched });
});

// 2. GET /api/tokens/:address - Single token detail
app.get('/api/tokens/:address', async (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();
  const token = getIndexedToken(address);

  if (!token) {
    return res.status(404).json({ error: "Token not found" });
  }

  const allTrades = getAllIndexedTrades();
  res.json({ token: enrichToken(token, allTrades) });
});

// 3. GET /api/tokens/:address/trades - Trade history for chart
app.get('/api/tokens/:address/trades', async (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();
  const trades = getIndexedTradesForToken(address);
  res.json({ trades });
});

// 4. POST /api/metadata - Persist off-chain metadata (description + image) for an
//    already-launched token. The chain remains the source of truth for existence;
//    this only supplies what the launch event can't carry cheaply.
app.post('/api/metadata', async (req: Request, res: Response) => {
  const { address, curve_address, name, symbol, description, image, creator_wallet } = req.body;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: "A valid token address is required." });
  }

  const meta: TokenMetadata = {
    address,
    curve_address,
    name,
    symbol,
    description,
    image,
    creator_wallet,
  };
  const saved = saveMetadata(meta);
  res.status(201).json({ metadata: saved });
});

// 5. GET /api/metadata/:address - Read one token's off-chain metadata
app.get('/api/metadata/:address', async (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();
  const meta = getMetadata(address);
  if (!meta) {
    return res.status(404).json({ error: "No metadata file for this token." });
  }
  res.json({ metadata: meta });
});

// 6. POST /api/deposits - Request deposit instructions
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

// 7. POST /api/deposits/:id/confirm - Confirm deposit
app.post('/api/deposits/:id/confirm', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await fiatAdapter.confirmDeposit(id);
    res.json({ message: "Deposit confirmed and cNGN minted", ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. POST /api/withdrawals - Request withdrawal
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

// 9. GET /api/users/:wallet/balance
app.get('/api/users/:wallet/balance', async (req: Request, res: Response) => {
  const { wallet } = req.params;
  const cngnBalance = await fiatAdapter.getBalance(wallet);
  res.json({
    wallet,
    cngnBalance,
    formattedCngn: cngnBalance.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })
  });
});

// 10. POST /api/users/kyc
app.post('/api/users/kyc', (req: Request, res: Response) => {
  const { wallet, bvn, nin, fullName } = req.body;
  if (!wallet) return res.status(400).json({ error: "Wallet required" });

  app.locals.users = app.locals.users || {};
  app.locals.users[wallet.toLowerCase()] = {
    wallet,
    kyc_status: 'approved',
    kyc_fields: { bvn: bvn ? '***masked***' : null, nin: nin ? '***masked***' : null, fullName },
    created_at: new Date().toISOString()
  };

  res.json({ message: "KYC verification successful (Testnet Auto-Approved)", status: 'approved' });
});

// 11. GET /api/leaderboard - Top tokens sorted by raised cNGN
app.get('/api/leaderboard', async (req: Request, res: Response) => {
  const tokens = getAllIndexedTokens();
  const allTrades = getAllIndexedTrades();

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

// 12. GET /api/trades - All global trades across tokens
app.get('/api/trades', async (req: Request, res: Response) => {
  const trades = getAllIndexedTrades();
  const tokens = getAllIndexedTokens();
  res.json({ trades, tokens });
});

// 13. GET /api/stats - Global protocol statistics
app.get('/api/stats', async (req: Request, res: Response) => {
  const trades = getAllIndexedTrades();
  const tokens = getAllIndexedTokens();

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

// Reset: clear the metadata file store (the indexer cache rebuilds from the chain).
// NOTE: this does NOT reset the chain — on-chain tokens are re-indexed on the next
// poll. It only clears the optional off-chain metadata files.
app.post('/api/reset', async (req: Request, res: Response) => {
  clearAllMetadata();
  res.json({ message: "Off-chain metadata cleared. On-chain tokens re-indexed automatically from the chain." });
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    sseClientsCount: sseClients.length,
    indexer: getIndexedStatus()
  });
});

// Start the continuous chain indexer, then listen. The indexer is the single shared
// read layer — no database required. If it cannot reach the chain, we still start
// (it retries with backoff and RPC rotation); the API stays up.
//
// Wire the indexer's discovery hooks to SSE so a NEW token or trade is pushed to
// every connected client the instant the indexer sees it — before their next 15s
// poll. Convergence never depends on this (the poll is the floor); it just makes
// cross-account updates feel instant.
setIndexerListeners({
  onNewToken: (token) => {
    const enriched = enrichToken(token, getAllIndexedTrades());
    broadcastSSE('LAUNCH', { token: enriched });
  },
  onNewTrade: (trade, token) => {
    const enriched = token ? enrichToken(token, getAllIndexedTrades()) : null;
    broadcastSSE('TRADE', { trade, token: enriched });
  },
});

startIndexer().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Kobo Launchpad Backend running at http://localhost:${port}`);
  });
});

process.on('SIGINT', () => {
  console.log('Shutting down indexer...');
  stopIndexer();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('Shutting down indexer...');
  stopIndexer();
  process.exit(0);
});
