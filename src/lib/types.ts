export interface Memecoin {
  address: string;
  name: string;
  symbol: string;
  imageUri: string;
  description: string;
  creator: string;
  realCngn: string; // in wei (6 decimals)
  realTokens: string; // in wei (18 decimals)
  virtualCngn: string;
  virtualTokens: string;
  graduated: boolean;
  createdAt: number;
  totalTrades: number;
  marketCapNaira: number;
  priceKobo: number;
  progressPercent: number;
  cultureTag?: 'Tiv' | 'Igbo' | 'Yoruba' | 'Hausa' | 'Pan-Naija';
}

export interface TradeActivity {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  trader: string;
  isBuy: boolean;
  cngnAmount: number;
  tokenAmount: number;
  priceKobo: number;
  timestamp: number;
  txHash?: string;
}

export interface PaystackInitResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}
