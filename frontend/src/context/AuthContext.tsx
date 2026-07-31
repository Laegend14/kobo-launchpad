'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { TradeItem, DetailedMetrics, deriveTokenMetrics, quoteBuy, quoteSell } from '@/lib/metrics';

export interface TokenItem {
  address: string;
  curve_address: string;
  name: string;
  symbol: string;
  metadata_uri?: string;
  creator_wallet: string;
  migrated?: boolean;
  raisedCngn?: number;
  description?: string;
}

interface AuthContextType {
  isLoggedIn: boolean;
  walletAddress: string | null;
  cngnBalance: number;
  tokens: TokenItem[];
  tradesMap: Record<string, TradeItem[]>;
  login: (address?: string) => void;
  logout: () => void;
  depositNaira: (nairaAmount: number) => void;
  withdrawNaira: (nairaAmount: number) => void;
  launchToken: (name: string, symbol: string, description: string, imageUrl: string) => TokenItem;
  buyToken: (tokenAddress: string, cngnAmount: number) => { tokensOut: number; priceImpact: number };
  sellToken: (tokenAddress: string, tokenAmount: number) => { cngnOut: number; priceImpact: number };
  claimCreatorFees: (tokenAddress: string) => { claimedAmount: number };
  getTokenTrades: (tokenAddress: string) => TradeItem[];
  getTokenMetrics: (tokenAddress: string) => DetailedMetrics;
}

const JOFF_ADDRESS = "0x9EB4d17b401AC28024ee557D5D1947cF0Ddcd301";

const INITIAL_TOKENS: TokenItem[] = [
  {
    address: JOFF_ADDRESS,
    curve_address: "0xe18BB79fC5C0C9759B3A3e6C273c80D010a3F503",
    name: "Jollof Coin",
    symbol: "JOFF",
    metadata_uri: "/jollof.png",
    creator_wallet: "0x959C...81f8",
    migrated: false,
    raisedCngn: 38500,
    description: "The undisputed King of West African Cuisine & Unstoppable Meme Powerhouse. Born from firewood smoke, a secret pepper blend of tatashe & rodo, and fierce national pride, Jollof Coin ($JOFF) represents the legendary, undisputed Party Jollof. No competition, no cap — pure golden smokey goodness backed 1:1 by cNGN bonding curves!"
  }
];

const INITIAL_TRADES: Record<string, TradeItem[]> = {
  [JOFF_ADDRESS.toLowerCase()]: [
    { id: '1', token_address: JOFF_ADDRESS, trader_wallet: '0x89A...41b0', side: 'buy', cngn_amount: 5000, token_amount: 333333333, price: 0.000015, timestamp: Date.now() - 18000000, tx_hash: '0xa71...991a' },
    { id: '2', token_address: JOFF_ADDRESS, trader_wallet: '0x42C...980f', side: 'buy', cngn_amount: 8500, token_amount: 472222222, price: 0.000018, timestamp: Date.now() - 14400000, tx_hash: '0xb82...104c' },
    { id: '3', token_address: JOFF_ADDRESS, trader_wallet: '0x10B...7721', side: 'sell', cngn_amount: 2000, token_amount: 105263157, price: 0.000019, timestamp: Date.now() - 10800000, tx_hash: '0xc93...215d' },
    { id: '4', token_address: JOFF_ADDRESS, trader_wallet: '0x74D...3319', side: 'buy', cngn_amount: 12000, token_amount: 545454545, price: 0.000022, timestamp: Date.now() - 7200000, tx_hash: '0xd04...326e' },
    { id: '5', token_address: JOFF_ADDRESS, trader_wallet: '0x99E...5501', side: 'buy', cngn_amount: 15000, token_amount: 576923076, price: 0.000026, timestamp: Date.now() - 3600000, tx_hash: '0xe15...437f' },
    { id: '6', token_address: JOFF_ADDRESS, trader_wallet: '0x22F...1188', side: 'sell', cngn_amount: 3500, token_amount: 125000000, price: 0.000028, timestamp: Date.now() - 1800000, tx_hash: '0xf26...5480' }
  ]
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [cngnBalance, setCngnBalance] = useState<number>(250000);
  const [tokens, setTokens] = useState<TokenItem[]>(INITIAL_TOKENS);
  const [tradesMap, setTradesMap] = useState<Record<string, TradeItem[]>>(INITIAL_TRADES);

  useEffect(() => {
    const savedWallet = localStorage.getItem('kobo_wallet');
    const savedBalance = localStorage.getItem('kobo_balance');
    const savedTokens = localStorage.getItem('kobo_tokens');
    const savedTrades = localStorage.getItem('kobo_trades');

    if (savedWallet) setWalletAddress(savedWallet);
    if (savedBalance) setCngnBalance(parseFloat(savedBalance));
    if (savedTokens) {
      try { setTokens(JSON.parse(savedTokens)); } catch (e) {}
    }
    if (savedTrades) {
      try { setTradesMap(JSON.parse(savedTrades)); } catch (e) {}
    }
  }, []);

  const login = (customAddr?: string) => {
    const addr = customAddr || `0x71C${Math.random().toString(16).substring(2, 38)}`;
    setWalletAddress(addr);
    localStorage.setItem('kobo_wallet', addr);
  };

  const logout = () => {
    setWalletAddress(null);
    localStorage.removeItem('kobo_wallet');
  };

  const depositNaira = (nairaAmount: number) => {
    setCngnBalance(prev => {
      const next = prev + nairaAmount;
      localStorage.setItem('kobo_balance', next.toString());
      return next;
    });
  };

  const withdrawNaira = (nairaAmount: number) => {
    setCngnBalance(prev => {
      const next = Math.max(0, prev - nairaAmount);
      localStorage.setItem('kobo_balance', next.toString());
      return next;
    });
  };

  const launchToken = (name: string, symbol: string, description: string, imageUrl: string): TokenItem => {
    const tokenAddr = `0x${Math.random().toString(16).substring(2, 42)}`;
    const curveAddr = `0x${Math.random().toString(16).substring(2, 42)}`;

    const newToken: TokenItem = {
      address: tokenAddr,
      curve_address: curveAddr,
      name,
      symbol: symbol.toUpperCase(),
      metadata_uri: imageUrl || "/jollof.png",
      creator_wallet: walletAddress ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}` : "0xUser...1234",
      migrated: false,
      raisedCngn: 0,
      description
    };

    setTokens(prev => {
      const next = [newToken, ...prev];
      localStorage.setItem('kobo_tokens', JSON.stringify(next));
      return next;
    });

    setTradesMap(prev => {
      const next = { ...prev, [tokenAddr.toLowerCase()]: [] };
      localStorage.setItem('kobo_trades', JSON.stringify(next));
      return next;
    });

    return newToken;
  };

  const buyToken = (tokenAddress: string, cngnAmount: number) => {
    const addrLower = tokenAddress.toLowerCase();
    const token = tokens.find(t => t.address.toLowerCase() === addrLower);
    const raised = token?.raisedCngn || 0;

    const virtualCngn = 10000 + raised;
    const virtualToken = (10000 * 1000000000) / virtualCngn;
    const { tokensOut, priceImpactPercent } = quoteBuy(cngnAmount, virtualCngn, virtualToken);

    const newRaised = raised + cngnAmount;
    const isMigrated = (token?.migrated || false) || newRaised >= 50000;
    const executionPrice = (virtualCngn + cngnAmount) / (virtualToken - tokensOut);

    const newTrade: TradeItem = {
      id: `${Date.now()}-${Math.random().toString(16).substring(2, 6)}`,
      token_address: tokenAddress,
      trader_wallet: walletAddress || '0xUser...48f2',
      side: 'buy',
      cngn_amount: cngnAmount,
      token_amount: Math.round(tokensOut),
      price: executionPrice,
      timestamp: Date.now(),
      tx_hash: `0x${Math.random().toString(16).substring(2, 42)}`
    };

    setCngnBalance(prev => {
      const next = Math.max(0, prev - cngnAmount);
      localStorage.setItem('kobo_balance', next.toString());
      return next;
    });

    setTokens(prev => {
      const updated = prev.map(t => {
        if (t.address.toLowerCase() === addrLower) {
          return {
            ...t,
            raisedCngn: newRaised,
            migrated: isMigrated
          };
        }
        return t;
      });
      localStorage.setItem('kobo_tokens', JSON.stringify(updated));
      return updated;
    });

    setTradesMap(prev => {
      const existing = prev[addrLower] || [];
      const updated = [newTrade, ...existing];
      const next = { ...prev, [addrLower]: updated };
      localStorage.setItem('kobo_trades', JSON.stringify(next));
      return next;
    });

    return { tokensOut, priceImpact: priceImpactPercent };
  };

  const sellToken = (tokenAddress: string, tokenAmount: number) => {
    const addrLower = tokenAddress.toLowerCase();
    const token = tokens.find(t => t.address.toLowerCase() === addrLower);
    const raised = token?.raisedCngn || 0;

    const virtualCngn = 10000 + raised;
    const virtualToken = (10000 * 1000000000) / virtualCngn;
    const { cngnOut, priceImpactPercent } = quoteSell(tokenAmount, virtualCngn, virtualToken);

    const newRaised = Math.max(0, raised - cngnOut);
    const executionPrice = (virtualCngn - cngnOut) / (virtualToken + tokenAmount);

    const newTrade: TradeItem = {
      id: `${Date.now()}-${Math.random().toString(16).substring(2, 6)}`,
      token_address: tokenAddress,
      trader_wallet: walletAddress || '0xUser...48f2',
      side: 'sell',
      cngn_amount: Number(cngnOut.toFixed(2)),
      token_amount: tokenAmount,
      price: executionPrice,
      timestamp: Date.now(),
      tx_hash: `0x${Math.random().toString(16).substring(2, 42)}`
    };

    setCngnBalance(prev => {
      const next = prev + cngnOut;
      localStorage.setItem('kobo_balance', next.toString());
      return next;
    });

    setTokens(prev => {
      const updated = prev.map(t => {
        if (t.address.toLowerCase() === addrLower) {
          return {
            ...t,
            raisedCngn: newRaised
          };
        }
        return t;
      });
      localStorage.setItem('kobo_tokens', JSON.stringify(updated));
      return updated;
    });

    setTradesMap(prev => {
      const existing = prev[addrLower] || [];
      const updated = [newTrade, ...existing];
      const next = { ...prev, [addrLower]: updated };
      localStorage.setItem('kobo_trades', JSON.stringify(next));
      return next;
    });

    return { cngnOut, priceImpact: priceImpactPercent };
  };

  const claimCreatorFees = (tokenAddress: string) => {
    const metrics = getTokenMetrics(tokenAddress);
    const claimedAmount = metrics.accumulatedCreatorFees || 100;
    depositNaira(claimedAmount);
    return { claimedAmount };
  };

  const getTokenTrades = (tokenAddress: string): TradeItem[] => {
    return tradesMap[tokenAddress.toLowerCase()] || [];
  };

  const getTokenMetrics = (tokenAddress: string): DetailedMetrics => {
    const addrLower = tokenAddress.toLowerCase();
    const token = tokens.find(t => t.address.toLowerCase() === addrLower);
    const trades = tradesMap[addrLower] || [];
    return deriveTokenMetrics(token?.raisedCngn || 0, token?.migrated || false, trades);
  };

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn: !!walletAddress,
        walletAddress,
        cngnBalance,
        tokens,
        tradesMap,
        login,
        logout,
        depositNaira,
        withdrawNaira,
        launchToken,
        buyToken,
        sellToken,
        claimCreatorFees,
        getTokenTrades,
        getTokenMetrics
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

