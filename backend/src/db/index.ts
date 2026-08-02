import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export interface TokenRecord {
  id?: number;
  address: string;
  curve_address: string;
  name: string;
  symbol: string;
  metadata_uri: string;
  creator_wallet: string;
  migrated: boolean;
  pair_address?: string;
  created_at: string;
  description?: string;
  raisedCngn?: number;
}

export interface TradeRecord {
  id: number;
  token_address: string;
  trader_wallet: string;
  side: 'buy' | 'sell';
  cngn_amount: string;
  token_amount: string;
  price: string;
  tx_hash: string;
  created_at: string;
}

export interface DepositRecord {
  id: string;
  user_wallet: string;
  amount_naira: number;
  status: 'pending' | 'completed' | 'failed';
  tx_hash?: string;
  created_at: string;
}

export interface WithdrawalRecord {
  id: string;
  user_wallet: string;
  amount_naira: number;
  status: 'pending' | 'completed' | 'failed';
  bank_reference?: string;
  created_at: string;
}

export interface UserRecord {
  wallet: string;
  kyc_status: 'none' | 'pending' | 'approved';
  kyc_fields?: any;
  created_at: string;
}

class InMemStore {
  tokens: TokenRecord[] = [];
  trades: TradeRecord[] = [];
  deposits: DepositRecord[] = [];
  withdrawals: WithdrawalRecord[] = [];
  users: Record<string, UserRecord> = {};
}

export const inMemStore = new InMemStore();

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.POSTGRES_URL;

let pool: Pool | null = null;
if (dbUrl) {
  pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
  });
}

export async function queryDB(text: string, params?: any[]) {
  if (pool) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.warn("Postgres query error, using in-memory store fallback:", err);
    }
  }
  return null;
}

// Auto-initialize DB schema on start
export async function initDB() {
  if (!pool) {
    console.log("ℹ️ No DATABASE_URL provided. Running in high-performance local memory mode.");
    return;
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tokens (
        address VARCHAR(66) PRIMARY KEY,
        curve_address VARCHAR(66) NOT NULL,
        name VARCHAR(100) NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        metadata_uri TEXT DEFAULT '/jollof.png',
        creator_wallet VARCHAR(66) NOT NULL,
        migrated BOOLEAN DEFAULT FALSE,
        raised_cngn NUMERIC(20, 4) DEFAULT 0,
        pair_address VARCHAR(66),
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trades (
        id BIGSERIAL PRIMARY KEY,
        token_address VARCHAR(66) NOT NULL,
        trader_wallet VARCHAR(66) NOT NULL,
        side VARCHAR(10) NOT NULL,
        cngn_amount NUMERIC(20, 4) NOT NULL,
        token_amount NUMERIC(30, 4) NOT NULL,
        price NUMERIC(30, 12) NOT NULL,
        tx_hash VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_trades_token_address ON trades(token_address);
      CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at DESC);
    `);
    console.log("⚡ Database connected & schema initialized successfully for production scale!");
  } catch (err) {
    console.warn("Could not auto-initialize DB schema:", err);
  }
}

// Global Tokens Data Access
export async function getAllTokensDB(): Promise<TokenRecord[]> {
  const dbRes = await queryDB('SELECT * FROM tokens ORDER BY created_at DESC');
  if (dbRes && dbRes.rows) {
    return dbRes.rows.map(r => ({
      address: r.address,
      curve_address: r.curve_address,
      name: r.name,
      symbol: r.symbol,
      metadata_uri: r.metadata_uri,
      creator_wallet: r.creator_wallet,
      migrated: Boolean(r.migrated),
      raisedCngn: Number(r.raised_cngn || 0),
      pair_address: r.pair_address,
      description: r.description,
      created_at: r.created_at
    }));
  }
  return inMemStore.tokens;
}

export async function saveTokenDB(token: TokenRecord): Promise<TokenRecord> {
  // Always keep inMemStore synced
  const existingIdx = inMemStore.tokens.findIndex(t => t.address.toLowerCase() === token.address.toLowerCase());
  if (existingIdx >= 0) {
    inMemStore.tokens[existingIdx] = { ...inMemStore.tokens[existingIdx], ...token };
  } else {
    inMemStore.tokens.unshift(token);
  }

  const dbRes = await queryDB(`
    INSERT INTO tokens (address, curve_address, name, symbol, metadata_uri, creator_wallet, migrated, raised_cngn, description, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (address) DO UPDATE SET
      raised_cngn = GREATEST(tokens.raised_cngn, EXCLUDED.raised_cngn),
      migrated = tokens.migrated OR EXCLUDED.migrated
    RETURNING *
  `, [
    token.address.toLowerCase(),
    token.curve_address.toLowerCase(),
    token.name,
    token.symbol,
    token.metadata_uri || '/jollof.png',
    token.creator_wallet,
    token.migrated || false,
    token.raisedCngn || 0,
    token.description || `${token.name} ($${token.symbol}) launched on Kobo Launchpad!`,
    token.created_at || new Date().toISOString()
  ]);

  if (dbRes && dbRes.rows && dbRes.rows[0]) {
    const r = dbRes.rows[0];
    return {
      address: r.address,
      curve_address: r.curve_address,
      name: r.name,
      symbol: r.symbol,
      metadata_uri: r.metadata_uri,
      creator_wallet: r.creator_wallet,
      migrated: Boolean(r.migrated),
      raisedCngn: Number(r.raised_cngn),
      description: r.description,
      created_at: r.created_at
    };
  }
  return token;
}

export async function updateTokenReserveDB(address: string, raisedCngn: number, migrated: boolean) {
  const addrLower = address.toLowerCase();
  const token = inMemStore.tokens.find(t => t.address.toLowerCase() === addrLower);
  if (token) {
    token.raisedCngn = Math.max(token.raisedCngn || 0, raisedCngn);
    if (migrated) token.migrated = true;
  }

  await queryDB(`
    UPDATE tokens SET
      raised_cngn = $1,
      migrated = $2
    WHERE LOWER(address) = $3
  `, [raisedCngn, migrated, addrLower]);
}

// Global Trades Data Access
export async function getAllTradesDB(): Promise<TradeRecord[]> {
  const dbRes = await queryDB('SELECT * FROM trades ORDER BY created_at DESC LIMIT 500');
  if (dbRes && dbRes.rows) {
    return dbRes.rows.map(r => ({
      id: Number(r.id),
      token_address: r.token_address,
      trader_wallet: r.trader_wallet,
      side: r.side,
      cngn_amount: String(r.cngn_amount),
      token_amount: String(r.token_amount),
      price: String(r.price),
      tx_hash: r.tx_hash,
      created_at: r.created_at
    }));
  }
  return inMemStore.trades;
}

export async function saveTradeDB(trade: TradeRecord): Promise<TradeRecord> {
  // Always keep inMemStore synced
  if (!inMemStore.trades.some(t => t.tx_hash === trade.tx_hash)) {
    inMemStore.trades.unshift(trade);
  }

  const dbRes = await queryDB(`
    INSERT INTO trades (token_address, trader_wallet, side, cngn_amount, token_amount, price, tx_hash, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (tx_hash) DO NOTHING
    RETURNING *
  `, [
    trade.token_address.toLowerCase(),
    trade.trader_wallet,
    trade.side,
    trade.cngn_amount,
    trade.token_amount,
    trade.price,
    trade.tx_hash,
    trade.created_at || new Date().toISOString()
  ]);

  if (dbRes && dbRes.rows && dbRes.rows[0]) {
    const r = dbRes.rows[0];
    return {
      id: Number(r.id),
      token_address: r.token_address,
      trader_wallet: r.trader_wallet,
      side: r.side,
      cngn_amount: String(r.cngn_amount),
      token_amount: String(r.token_amount),
      price: String(r.price),
      tx_hash: r.tx_hash,
      created_at: r.created_at
    };
  }
  return trade;
}
