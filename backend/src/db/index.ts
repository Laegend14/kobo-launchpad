import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export interface TokenRecord {
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
  tokens: TokenRecord[] = [
    {
      address: "0x9EB4d17b401AC28024ee557D5D1947cF0Ddcd301",
      curve_address: "0xe18BB79fC5C0C9759B3A3e6C273c80D010a3F503",
      name: "Jollof Coin",
      symbol: "JOFF",
      metadata_uri: "/jollof.png",
      creator_wallet: "0x959C...81f8",
      migrated: false,
      created_at: new Date().toISOString(),
      description: "The undisputed King of West African Cuisine & Unstoppable Meme Powerhouse. Born from firewood smoke, a secret pepper blend of tatashe & rodo, and fierce national pride, Jollof Coin ($JOFF) represents the legendary, undisputed Party Jollof. No competition, no cap — pure golden smokey goodness backed 1:1 by cNGN bonding curves!"
    }
  ];
  trades: TradeRecord[] = [];
  deposits: DepositRecord[] = [];
  withdrawals: WithdrawalRecord[] = [];
  users: Record<string, UserRecord> = {};
}

export const inMemStore = new InMemStore();

let pool: Pool | null = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
}

export async function queryDB(text: string, params?: any[]) {
  if (pool) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.warn("Postgres query failed, falling back to in-memory store:", err);
    }
  }
  return null;
}
