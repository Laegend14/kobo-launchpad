-- =========================================================
-- KOBO Launchpad — PostgreSQL / Supabase Production Schema
-- =========================================================

-- 1. Tokens Table
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

-- 2. Trades Table
CREATE TABLE IF NOT EXISTS trades (
  id BIGSERIAL PRIMARY KEY,
  token_address VARCHAR(66) NOT NULL REFERENCES tokens(address) ON DELETE CASCADE,
  trader_wallet VARCHAR(66) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('buy', 'sell')),
  cngn_amount NUMERIC(20, 4) NOT NULL,
  token_amount NUMERIC(30, 4) NOT NULL,
  price NUMERIC(30, 12) NOT NULL,
  tx_hash VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Deposits Table
CREATE TABLE IF NOT EXISTS deposits (
  id VARCHAR(100) PRIMARY KEY,
  user_wallet VARCHAR(66) NOT NULL,
  amount_naira NUMERIC(20, 4) NOT NULL,
  status VARCHAR(20) DEFAULT 'completed',
  tx_hash VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Withdrawals Table
CREATE TABLE IF NOT EXISTS withdrawals (
  id VARCHAR(100) PRIMARY KEY,
  user_wallet VARCHAR(66) NOT NULL,
  amount_naira NUMERIC(20, 4) NOT NULL,
  status VARCHAR(20) DEFAULT 'completed',
  bank_reference VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Users / KYC Table
CREATE TABLE IF NOT EXISTS users (
  wallet VARCHAR(66) PRIMARY KEY,
  kyc_status VARCHAR(20) DEFAULT 'approved',
  kyc_fields JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes for Scalability (Thousands of Traders)
CREATE INDEX IF NOT EXISTS idx_trades_token_address ON trades(token_address);
CREATE INDEX IF NOT EXISTS idx_trades_trader_wallet ON trades(trader_wallet);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON tokens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_raised_cngn ON tokens(raised_cngn DESC);
