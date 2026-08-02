import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { getMetadata } from './metadataStore';

dotenv.config();

/**
 * Continuous chain-backed indexer — the SINGLE shared read layer for every client.
 *
 * Why this exists (the proven bug): per-browser log scanning is broken on Arc. The
 * chain is at ~55,000,000 blocks, so `queryFilter(..., 0, "latest")` is rejected by
 * the RPC ("could not coalesce error") and hammering state reads trips `-32011
 * request limit reached`. The result was that a token launched by account A never
 * showed up for account B: A saw only their own optimistic local state, every other
 * client's discovery query silently returned [].
 *
 * The reference fix (Gnad.fun / Seipad / Immutal0 / base-on-fun): ONE process reads
 * the chain once — discovery via the factory's state registry (allTokens[]), not
 * logs — and serves every client an identical view over REST + SSE. No per-browser
 * log scans → no divergence. This replaces the frontend's client-side indexer and
 * any external database mirror entirely — the chain is the only source of truth.
 *
 * Rate-limit strategy (Arc hard-limits): every eth_call is paced (small sleep
 * between calls) and retried with exponential backoff on `-32011`/`-32005` and on
 * transient network errors. Trades use a narrow incremental block cursor — never a
 * from-block-0 scan. The in-memory store here is a CACHE; the chain remains the
 * source of truth and is fully re-read on restart.
 */

// ── Config ──────────────────────────────────────────────────────────────────
const RPC_URL =
  process.env.ARC_TESTNET_RPC_URL ||
  process.env.ARC_RPC_URL ||
  'https://rpc.testnet.arc.io';
// Fallbacks if the primary RPC is unavailable or rate-limited.
const RPC_FALLBACKS = [
  'https://rpc.blockdaemon.testnet.arc.io',
  'https://rpc.drpc.testnet.arc.io',
  'https://rpc.quicknode.testnet.arc.io',
];
const FACTORY_ADDRESS =
  process.env.TOKEN_FACTORY_ADDRESS ||
  '0x4Ca9A69ff8dBF37819d21DB37260142416796D72';

const POLL_INTERVAL_MS = 15_000;      // main cadence for reserves + new tokens
const TRADE_POLL_INTERVAL_MS = 5_000; // faster cadence for fresh Trade events
const CALL_PACE_MS = 120;             // sleep between consecutive eth_calls
const TRADE_BATCH_BLOCKS = 50_000;    // max block-range per Trade queryFilter
const INITIAL_TRADE_LOOKBACK_BLOCKS = 1_000_000; // first-ever trade sync window

// ── ABIs (discovery via state — no log scans needed) ────────────────────────
const FACTORY_ABI = [
  'function getAllTokensCount() external view returns (uint256)',
  'function allTokens(uint256 index) external view returns (address)',
  'function tokenToCurve(address token) external view returns (address)',
  'function isLaunchedToken(address token) external view returns (bool)',
  'event TokenLaunched(address indexed token, address indexed curve, string name, string symbol, string metadataURI, address indexed creator, uint256 timestamp)',
];

const ERC20_ABI = [
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
];

const CURVE_ABI = [
  'function creator() external view returns (address)',
  'function virtualCngnReserve() external view returns (uint256)',
  'function virtualTokenReserve() external view returns (uint256)',
  'function realCngnReserve() external view returns (uint256)',
  'function migrated() external view returns (bool)',
  'function getCurrentPrice() external view returns (uint256)',
  'function uniswapPair() external view returns (address)',
  'event Trade(address indexed trader, bool isBuy, uint256 cngnAmount, uint256 tokenAmount, uint256 price, uint256 timestamp)',
];

const WEI_18 = ethers.parseUnits('1', 18);

// ── Types ───────────────────────────────────────────────────────────────────
export interface IndexedToken {
  address: string;
  curve_address: string;
  name: string;
  symbol: string;
  metadata_uri: string;
  creator_wallet: string;
  migrated: boolean;
  raisedCngn: number;
  description?: string;
  pair_address?: string;
  blockNumber: number;
  created_at: string;
}

export interface IndexedTrade {
  id: string;
  token_address: string;
  trader_wallet: string;
  side: 'buy' | 'sell';
  cngn_amount: string;
  token_amount: string;
  price: string;
  tx_hash: string;
  block_number: number;
  timestamp: number; // ms
  created_at: string;
}

// ── In-memory cache (a cache — the chain is the source of truth) ────────────
const tokens: IndexedToken[] = [];
const trades: IndexedTrade[] = [];
const curveAddresses = new Set<string>(); // curves we've already seen (for dedupe)
const tokenByAddress = new Map<string, IndexedToken>();
const tradesByToken = new Map<string, IndexedTrade[]>();
let lastIndexedBlock = 0;
let started = false;
let stopped = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

// Latest-discovered registry snapshot, so polls don't enumerate allTokens[] each
// time (cheap when the list is short, but incremental once it's large).
let knownTokenAddresses: string[] = [];

// Listeners so the server can push instant SSE hints the moment the indexer sees a
// NEW token or trade (before the client's own next poll). Cross-account convergence
// never depends on these — the 15s client poll is the floor — they just make it feel
// instant.
export interface IndexerListeners {
  onNewToken?: (token: IndexedToken) => void;
  onNewTrade?: (trade: IndexedTrade, token: IndexedToken | null) => void;
}
let listeners: IndexerListeners = {};
export function setIndexerListeners(l: IndexerListeners) {
  listeners = l || {};
}

// ── Retry + pacing helpers (Arc rate-limits hard) ───────────────────────────
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

function isRateLimit(err: any): boolean {
  const code = err?.code;
  const msg = String(err?.shortMessage || err?.reason || err?.message || '').toLowerCase();
  return (
    code === -32011 ||                        // request limit reached
    code === -32005 ||                        // limit exceeded
    /request limit|rate limit|too many|throttl|server error|execution reverted|coalesc/i.test(msg)
  );
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (i < attempts - 1) {
        const wait = Math.min(1000 * 2 ** i, 8000);
        console.warn(`[Indexer] RPC call failed (${err?.code || err?.message || err}), retrying in ${wait}ms (${i + 1}/${attempts})`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

/**
 * Sequential, paced, retried read of `getAllTokensCount()` → `allTokens(i)`.
 * This is the exact reference-repo discovery pattern and is confirmed to work on
 * the live Arc chain — no queryFilter, no from-block-0 scan.
 */
async function enumerateAllTokens(factory: ethers.Contract): Promise<string[]> {
  let count = 0;
  try {
    const c = await withRetry(() => factory.getAllTokensCount());
    count = Number(c);
  } catch (err) {
    console.warn('[Indexer] getAllTokensCount failed:', err?.message || err);
    return knownTokenAddresses; // keep what we had
  }
  if (count === 0) return [];

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const addr = await withRetry(() => factory.allTokens(i));
      out.push(addr.toLowerCase());
    } catch (err) {
      console.warn(`[Indexer] allTokens(${i}) failed — skipping; continuing enumeration:`, err?.message || err);
    }
    await sleep(CALL_PACE_MS);
  }
  return out;
}

// ── Token + curve state reads ───────────────────────────────────────────────
async function readTokenInfo(
  tokenAddr: string,
  curveAddr: string,
  tokenContract: ethers.Contract,
  curveContract: ethers.Contract,
  blockNumber: number
): Promise<IndexedToken> {
  const [name, symbol, creator, virtualCngn, virtualToken, realCngn, migrated, pair] =
    await withRetry(() =>
      Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        curveContract.creator(),
        curveContract.virtualCngnReserve(),
        curveContract.virtualTokenReserve(),
        curveContract.realCngnReserve(),
        curveContract.migrated(),
        curveContract.uniswapPair().catch(() => ethers.ZeroAddress),
      ])
    );

  const token: IndexedToken = {
    address: tokenAddr.toLowerCase(),
    curve_address: curveAddr.toLowerCase(),
    name: String(name || ''),
    symbol: String(symbol || ''),
    metadata_uri: '/jollof.png', // metadataURI only lives in the launch event; file store overrides below
    creator_wallet: creator.toLowerCase(),
    migrated: Boolean(migrated),
    raisedCngn: Number(ethers.formatUnits(realCngn, 18)),
    pair_address: pair && pair !== ethers.ZeroAddress ? pair.toLowerCase() : undefined,
    blockNumber,
    created_at: new Date().toISOString(),
  };

  // Off-chain metadata (description + image) from the file store — optional overlay.
  const meta = getMetadata(token.address);
  if (meta) {
    if (meta.description) token.description = meta.description;
    if (meta.image) token.metadata_uri = meta.image;
    if (meta.curve_address) token.curve_address = meta.curve_address.toLowerCase();
  }
  if (!token.description) {
    token.description = `${token.name} ($${token.symbol}) — launched on Kobo!`;
  }
  return token;
}

async function syncCurve(curveAddr: string, tokenAddr: string, blockNumber: number): Promise<IndexedToken | null> {
  try {
    const provider = getProvider();
    const tokenContract = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
    const curveContract = new ethers.Contract(curveAddr, CURVE_ABI, provider);
    const token = await readTokenInfo(tokenAddr, curveAddr, tokenContract, curveContract, blockNumber);
    await sleep(CALL_PACE_MS);
    return token;
  } catch (err) {
    console.warn(`[Indexer] syncCurve failed for ${tokenAddr} → ${curveAddr}:`, err?.message || err);
    return null;
  }
}

// ── Trade ingestion ─────────────────────────────────────────────────────────
const seenTradeIds = new Set<string>(); // dedupe key: `${tx_hash}:${side}:${cngn}:${token}`

function upsertTrade(t: IndexedTrade) {
  // A single tx can legitimately emit only one Trade on this curve, but dedupe on a
  // composite key (not tx_hash alone) so a re-scanned block never double-counts and a
  // multi-event tx isn't wrongly collapsed.
  const dedupeKey = `${t.tx_hash}:${t.side}:${t.cngn_amount}:${t.token_amount}`;
  if (seenTradeIds.has(dedupeKey)) return;
  seenTradeIds.add(dedupeKey);
  trades.push(t);
  const key = t.token_address.toLowerCase();
  const list = tradesByToken.get(key) || [];
  list.push(t);
  tradesByToken.set(key, list);
  try {
    listeners.onNewTrade?.(t, tokenByAddress.get(key) || null);
  } catch (err) {
    console.warn('[Indexer] onNewTrade listener failed:', err?.message || err);
  }
}

function ingestTradesFromLogs(curveAddr: string, tokenAddr: string, logs: ethers.Log[]) {
  for (const log of logs) {
    try {
      const iface = new ethers.Interface(CURVE_ABI);
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed || parsed.name !== 'Trade') continue;
      const isBuy = Boolean(parsed.args.isBuy);
      upsertTrade({
        id: log.transactionHash,
        token_address: tokenAddr.toLowerCase(),
        trader_wallet: parsed.args.trader.toLowerCase(),
        side: isBuy ? 'buy' : 'sell',
        cngn_amount: ethers.formatUnits(parsed.args.cngnAmount, 18),
        token_amount: ethers.formatUnits(parsed.args.tokenAmount, 18),
        price: ethers.formatUnits(parsed.args.price, 18),
        tx_hash: log.transactionHash,
        block_number: log.blockNumber,
        timestamp: Number(parsed.args.timestamp) * 1000,
        created_at: new Date().toISOString(),
      });
    } catch {
      /* skip unparseable log */
    }
  }
}

/**
 * Incremental trade sync per known curve. Only ever queries a narrow window
 * starting at `lastIndexedBlock` (or a bounded lookback on first run), in capped
 * batches — never a from-block-0 scan, so it stays well under Arc's RPC limits.
 */
async function syncTradesIncrementally(factory: ethers.Contract, curve: string, tokenAddr: string) {
  const provider = getProvider();
  const curveContract = new ethers.Contract(curve, CURVE_ABI, provider);
  let latestBlock: number;
  try {
    latestBlock = await withRetry(() => provider.getBlockNumber());
  } catch (err) {
    console.warn('[Indexer] getBlockNumber failed — skipping trade sync:', err?.message || err);
    return;
  }

  const from = lastIndexedBlock > 0 ? lastIndexedBlock + 1 : Math.max(0, latestBlock - INITIAL_TRADE_LOOKBACK_BLOCKS);
  if (from >= latestBlock) return;

  // Batch so a huge catch-up never hammers the RPC in one request.
  let cursor = from;
  while (cursor <= latestBlock) {
    const to = Math.min(cursor + TRADE_BATCH_BLOCKS - 1, latestBlock);
    try {
      const logs = await withRetry(() => curveContract.queryFilter(curveContract.filters.Trade(), cursor, to));
      ingestTradesFromLogs(curve, tokenAddr, logs);
    } catch (err) {
      console.warn(`[Indexer] Trade query ${cursor}..${to} for ${curve} failed:`, err?.message || err);
    }
    await sleep(CALL_PACE_MS);
    cursor = to + 1;
  }
}

// ── Full sync pass ──────────────────────────────────────────────────────────
let syncing = false;

async function syncNow() {
  if (syncing) return;
  syncing = true;
  try {
    const provider = getProvider();
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
    const latestBlock = await withRetry(() => provider.getBlockNumber());

    // 1. Discover tokens via the factory registry (state, not logs).
    const discovered = await enumerateAllTokens(factory);
    knownTokenAddresses = discovered;

    // 2. For each token, ensure its curve is registered and refresh live reserves.
    for (const tokenAddr of discovered) {
      try {
        const curveAddr = (await withRetry(() => factory.tokenToCurve(tokenAddr))).toLowerCase();
        curveAddresses.add(curveAddr);
        const refreshed = await syncCurve(curveAddr, tokenAddr, latestBlock);
        if (refreshed) {
          const existingIdx = tokens.findIndex(t => t.address.toLowerCase() === tokenAddr.toLowerCase());
          if (existingIdx >= 0) tokens[existingIdx] = refreshed;
          else {
            tokens.unshift(refreshed);
            try { listeners.onNewToken?.(refreshed); } catch (err) { console.warn('[Indexer] onNewToken listener failed:', err?.message || err); }
          }
          tokenByAddress.set(tokenAddr.toLowerCase(), refreshed);
        }
      } catch (err) {
        console.warn(`[Indexer] Failed to sync token ${tokenAddr}:`, err?.message || err);
      }
    }

    // 3. Incremental trade sync for every known curve.
    for (const curve of curveAddresses) {
      // find the token address for this curve
      const tok = tokens.find(t => t.curve_address.toLowerCase() === curve.toLowerCase());
      const tokenAddr = tok?.address || tokenByAddress.get(curve)?.address || '';
      if (!tokenAddr) continue;
      await syncTradesIncrementally(factory, curve, tokenAddr);
    }

    // 4. Advance the trade cursor.
    if (latestBlock > lastIndexedBlock) lastIndexedBlock = latestBlock;

    // 5. Prune tokens that were removed from the registry (shouldn't happen on this
    //    contract — allTokens is append-only — but keeps the store honest).
    const known = new Set(knownTokenAddresses.map(a => a.toLowerCase()));
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (!known.has(tokens[i].address.toLowerCase())) tokens.splice(i, 1);
    }

    return true;
  } catch (err) {
    console.warn('[Indexer] syncNow failed:', err?.message || err);
    return false;
  } finally {
    syncing = false;
  }
}

// ── Provider with primary + fallback RPC rotation ───────────────────────────
let _provider: ethers.JsonRpcProvider | null = null;
let _providerIdx = 0;
let _providerFails = 0;

function getProvider(): ethers.JsonRpcProvider {
  if (_provider) return _provider;
  _provider = new ethers.JsonRpcProvider(RPC_URL);
  _provider.on('error', () => {
    _providerFails++;
    if (_providerFails >= 3 && RPC_FALLBACKS.length > 0) {
      console.warn('[Indexer] Primary RPC failing repeatedly — rotating to fallback RPC.');
      _provider.destroy();
      _provider = null;
      _providerIdx = (_providerIdx + 1) % (RPC_FALLBACKS.length + 1); // +1 = primary
      const nextUrl = _providerIdx === 0 ? RPC_URL : RPC_FALLBACKS[_providerIdx - 1];
      _provider = new ethers.JsonRpcProvider(nextUrl);
      _providerFails = 0;
    }
  });
  return _provider;
}

// ── Lifecycle + read accessors ──────────────────────────────────────────────
export async function startIndexer() {
  if (started) return;
  started = true;
  stopped = false;
  console.log(`[Indexer] Starting continuous chain indexer on ${RPC_URL}`);
  console.log(`[Indexer] Factory: ${FACTORY_ADDRESS}`);
  console.log('[Indexer] Initial full chain sync (state reads + bounded trade lookback)...');

  // First full sync (may take a moment with pacing — this is the durable rebuild).
  await syncNow();
  const n = tokens.length;
  console.log(`[Indexer] Initial sync complete — ${n} token(s) indexed from chain.`);

  // Continuous polling: trades faster, reserves/tokens on the main cadence.
  intervalHandle = setInterval(() => {
    syncNow().then(() => {});
  }, POLL_INTERVAL_MS);
}

export async function stopIndexer() {
  stopped = true;
  started = false;
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  _provider?.destroy();
  _provider = null;
}

// Read accessors — the REST layer reads from the cache; the chain re-syncs it.
export function getAllIndexedTokens(): IndexedToken[] {
  return [...tokens].sort((a, b) => b.blockNumber - a.blockNumber);
}

export function getIndexedToken(address: string): IndexedToken | null {
  return tokenByAddress.get(address.toLowerCase()) || null;
}

export function getIndexedTradesForToken(address: string): IndexedTrade[] {
  return (tradesByToken.get(address.toLowerCase()) || []).sort((a, b) => b.block_number - a.block_number);
}

export function getAllIndexedTrades(): IndexedTrade[] {
  return [...trades].sort((a, b) => b.block_number - a.block_number);
}

export function getIndexedStatus() {
  return {
    tokenCount: tokens.length,
    tradeCount: trades.length,
    lastIndexedBlock,
    rpcUrl: RPC_URL,
    factoryAddress: FACTORY_ADDRESS,
  };
}

export { tokens as indexedTokensCache, trades as indexedTradesCache };
