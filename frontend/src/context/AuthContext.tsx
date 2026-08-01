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
  userHoldings: Record<string, number>;
  getUserTokenHolding: (tokenAddress: string) => {
    tokenAmount: number;
    cngnValue: number;
    formattedTokenAmount: string;
    formattedCngnValue: string;
  };
  login: (address?: string) => void;
  connectRealWeb3Wallet: () => Promise<string>;
  logout: () => void;
  depositNaira: (nairaAmount: number) => void;
  withdrawNaira: (nairaAmount: number) => void;
  launchToken: (name: string, symbol: string, description: string, imageUrl: string, customAddress?: string, customCurve?: string, txHash?: string) => TokenItem;
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
    raisedCngn: 15400,
    description: "The undisputed King of West African Cuisine & Unstoppable Meme Powerhouse. Born from firewood smoke, a secret pepper blend of tatashe & rodo, and fierce national pride, Jollof Coin ($JOFF) represents the legendary, undisputed Party Jollof. No competition, no cap — pure golden smokey goodness backed 1:1 by cNGN bonding curves!"
  }
];

const INITIAL_TRADES: Record<string, TradeItem[]> = {
  [JOFF_ADDRESS.toLowerCase()]: [
    {
      id: "1",
      token_address: JOFF_ADDRESS,
      trader_wallet: "0x959C...81f8",
      side: "buy",
      cngn_amount: 5000,
      token_amount: 500000,
      price: 0.01,
      timestamp: Date.now() - 3600000,
      tx_hash: "0x3f8a...91b2"
    }
  ]
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [cngnBalance, setCngnBalance] = useState<number>(250000);
  const [tokens, setTokens] = useState<TokenItem[]>(INITIAL_TOKENS);
  const [tradesMap, setTradesMap] = useState<Record<string, TradeItem[]>>(INITIAL_TRADES);
  const [userHoldings, setUserHoldings] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('kobo_user_holdings');
      if (saved) {
        try { return JSON.parse(saved); } catch (e) {}
      }
    }
    return { [JOFF_ADDRESS.toLowerCase()]: 500000 };
  });

  useEffect(() => {
    const syncState = () => {
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
    };

    syncState();
    window.addEventListener('storage', syncState);

    // Listen to real Web3 window.ethereum account changes
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
          localStorage.setItem('kobo_wallet', accounts[0]);
        } else {
          setWalletAddress(null);
          localStorage.removeItem('kobo_wallet');
        }
      };
      (window as any).ethereum.on('accountsChanged', handleAccountsChanged);
      return () => {
        window.removeEventListener('storage', syncState);
        if ((window as any).ethereum.removeListener) {
          (window as any).ethereum.removeListener('accountsChanged', handleAccountsChanged);
        }
      };
    }

    return () => window.removeEventListener('storage', syncState);
  }, []);

  // Real-time backend API global trade & reserve polling (syncs across all accounts & devices)
  useEffect(() => {
    const fetchGlobalSync = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
        
        // 1. Fetch Tokens list from backend
        const tokenRes = await fetch(`${backendUrl}/api/tokens`).catch(() => null);
        if (tokenRes && tokenRes.ok) {
          const tokenData = await tokenRes.json();
          if (tokenData.tokens && Array.isArray(tokenData.tokens)) {
            setTokens(prev => {
              const existingAddrs = new Set(prev.map(t => t.address.toLowerCase()));
              const brandNewTokens: TokenItem[] = [];

              tokenData.tokens.forEach((bt: any) => {
                if (bt.address && !existingAddrs.has(bt.address.toLowerCase())) {
                  brandNewTokens.push({
                    address: bt.address,
                    curve_address: bt.curve_address || bt.address,
                    name: bt.name,
                    symbol: bt.symbol,
                    metadata_uri: bt.metadata_uri || "/jollof.png",
                    creator_wallet: bt.creator_wallet || "0xUser...1234",
                    migrated: Boolean(bt.migrated),
                    raisedCngn: bt.raisedCngn || 0,
                    description: bt.description || `${bt.name} ($${bt.symbol}) launched on Kobo Launchpad!`
                  });
                }
              });

              const updatedExisting = prev.map(t => {
                const bToken = tokenData.tokens.find((bt: any) => bt.address.toLowerCase() === t.address.toLowerCase());
                if (bToken) {
                  return {
                    ...t,
                    raisedCngn: bToken.raisedCngn !== undefined ? bToken.raisedCngn : t.raisedCngn,
                    migrated: bToken.migrated !== undefined ? bToken.migrated : t.migrated
                  };
                }
                return t;
              });

              const merged = [...brandNewTokens, ...updatedExisting];
              localStorage.setItem('kobo_tokens', JSON.stringify(merged));
              return merged;
            });
          }
        }

        // 2. Fetch Trades history from backend
        const tradeRes = await fetch(`${backendUrl}/api/trades`).catch(() => null);
        if (tradeRes && tradeRes.ok) {
          const tradeData = await tradeRes.json();
          if (tradeData.trades && Array.isArray(tradeData.trades)) {
            const newMap: Record<string, TradeItem[]> = {};
            for (const tr of tradeData.trades) {
              const addr = (tr.token_address || '').toLowerCase();
              if (!addr) continue;
              if (!newMap[addr]) newMap[addr] = [];
              newMap[addr].push({
                id: String(tr.id || Math.random()),
                token_address: tr.token_address,
                trader_wallet: tr.trader_wallet,
                side: tr.side,
                cngn_amount: Number(tr.cngn_amount),
                token_amount: Number(tr.token_amount),
                price: Number(tr.price),
                timestamp: new Date(tr.created_at || Date.now()).getTime(),
                tx_hash: tr.tx_hash || '0x...'
              });
            }

            setTradesMap(prev => {
              const merged = { ...prev };
              for (const [addr, trades] of Object.entries(newMap)) {
                const existingIds = new Set((merged[addr] || []).map(t => t.id));
                const toAdd = trades.filter(t => !existingIds.has(t.id));
                if (toAdd.length > 0) {
                  merged[addr] = [...toAdd, ...(merged[addr] || [])];
                }
              }
              return merged;
            });
          }
        }
      } catch (e) {
        console.warn("Global polling sync notice:", e);
      }
    };

    fetchGlobalSync();
    const interval = setInterval(fetchGlobalSync, 1500);
    return () => clearInterval(interval);
  }, []);

  const connectRealWeb3Wallet = async (): Promise<string> => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts && accounts[0]) {
          const selected = accounts[0];
          setWalletAddress(selected);
          localStorage.setItem('kobo_wallet', selected);

          try {
            await (window as any).ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0x4cef02' }],
            });
          } catch (switchErr: any) {
            if (switchErr.code === 4902) {
              await (window as any).ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: '0x4cef02',
                  chainName: 'Arc Testnet',
                  nativeCurrency: { name: 'Arc Token', symbol: 'ARC', decimals: 18 },
                  rpcUrls: ['https://rpc.testnet.arc.network'],
                  blockExplorerUrls: ['https://testnet.arcscan.app']
                }]
              });
            }
          }
          return selected;
        }
      } catch (err: any) {
        console.error("Web3 wallet connection failed:", err);
      }
    }
    const simulatedAddr = `0x${Math.random().toString(16).substring(2, 10)}...${Math.random().toString(16).substring(2, 6)}`;
    setWalletAddress(simulatedAddr);
    localStorage.setItem('kobo_wallet', simulatedAddr);
    return simulatedAddr;
  };

  const login = async (address?: string) => {
    await connectRealWeb3Wallet();
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

  const launchToken = (
    name: string,
    symbol: string,
    description: string,
    imageUrl: string,
    customAddress?: string,
    customCurve?: string,
    txHash?: string
  ): TokenItem => {
    const tokenAddr = customAddress || `0x${Math.random().toString(16).substring(2, 42)}`;
    const curveAddr = customCurve || `0x${Math.random().toString(16).substring(2, 42)}`;

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

    // Post new token to backend API for instant global cross-account sync
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
    fetch(`${backendUrl}/api/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newToken)
    }).catch(err => console.warn("Backend token sync notice:", err));

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

    setUserHoldings(prev => {
      const current = prev[addrLower] || 0;
      const next = { ...prev, [addrLower]: current + Math.round(tokensOut) };
      localStorage.setItem('kobo_user_holdings', JSON.stringify(next));
      return next;
    });

    // Post trade to backend API for global cross-account sync
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
    fetch(`${backendUrl}/api/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenAddress,
        traderWallet: walletAddress || '0xUser...48f2',
        side: 'buy',
        cngnAmount,
        tokenAmount: Math.round(tokensOut),
        price: executionPrice,
        txHash: newTrade.tx_hash
      })
    }).catch(err => console.warn("Backend trade sync notice:", err));

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

    setUserHoldings(prev => {
      const current = prev[addrLower] || 0;
      const next = { ...prev, [addrLower]: Math.max(0, current - tokenAmount) };
      localStorage.setItem('kobo_user_holdings', JSON.stringify(next));
      return next;
    });

    // Post trade to backend API for global cross-account sync
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
    fetch(`${backendUrl}/api/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenAddress,
        traderWallet: walletAddress || '0xUser...48f2',
        side: 'sell',
        cngnAmount: Number(cngnOut.toFixed(2)),
        tokenAmount,
        price: executionPrice,
        txHash: newTrade.tx_hash
      })
    }).catch(err => console.warn("Backend trade sync notice:", err));

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

  const getUserTokenHolding = (tokenAddress: string) => {
    const addrLower = tokenAddress.toLowerCase();
    const tokenAmount = userHoldings[addrLower] || 0;
    const metrics = getTokenMetrics(tokenAddress);
    const cngnValue = tokenAmount * metrics.priceCngn;

    return {
      tokenAmount,
      cngnValue,
      formattedTokenAmount: tokenAmount.toLocaleString(),
      formattedCngnValue: `₦${cngnValue.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cNGN`
    };
  };

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn: !!walletAddress,
        walletAddress,
        cngnBalance,
        tokens,
        tradesMap,
        userHoldings,
        getUserTokenHolding,
        login,
        connectRealWeb3Wallet,
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

