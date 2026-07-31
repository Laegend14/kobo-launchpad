CREATE TABLE IF NOT EXISTS tokens (
  address           TEXT PRIMARY KEY,
  curve_address     TEXT NOT NULL,
  name              TEXT NOT NULL,
  symbol            TEXT NOT NULL,
  metadata_uri      TEXT,
  creator_wallet    TEXT NOT NULL,
  migrated          BOOLEAN DEFAULT FALSE,
  pair_address      TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trades (
  id                SERIAL PRIMARY KEY,
  token_address     TEXT REFERENCES tokens(address),
  trader_wallet     TEXT NOT NULL,
  side              TEXT CHECK (side IN ('buy','sell')),
  cngn_amount       NUMERIC NOT NULL,
  token_amount      NUMERIC NOT NULL,
  price             NUMERIC NOT NULL,
  tx_hash           TEXT UNIQUE NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deposits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_wallet       TEXT NOT NULL,
  amount_naira      NUMERIC NOT NULL,
  status            TEXT CHECK (status IN ('pending','completed','failed')) DEFAULT 'pending',
  tx_hash           TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_wallet       TEXT NOT NULL,
  amount_naira      NUMERIC NOT NULL,
  status            TEXT CHECK (status IN ('pending','completed','failed')) DEFAULT 'pending',
  bank_reference    TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  wallet            TEXT PRIMARY KEY,
  kyc_status        TEXT CHECK (kyc_status IN ('none','pending','approved')) DEFAULT 'none',
  kyc_fields        JSONB,
  created_at        TIMESTAMPTZ DEFAULT now()
);
