'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
  nairaBalance: number;
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
  swapNairaToCngn: (amount: number) => boolean;
  swapCngnToNaira: (amount: number) => boolean;
  launchToken: (name: string, symbol: string, description: string, imageUrl: string, customAddress?: string, customCurve?: string, txHash?: string) => TokenItem;
  buyToken: (tokenAddress: string, cngnAmount: number) => { tokensOut: number; priceImpact: number };
  sellToken: (tokenAddress: string, tokenAmount: number) => { cngnOut: number; priceImpact: number };
  claimCreatorFees: (tokenAddress: string) => { claimedAmount: number };
  getTokenTrades: (tokenAddress: string) => TradeItem[];
  getTokenMetrics: (tokenAddress: string) => DetailedMetrics;
}

const INITIAL_TOKENS: TokenItem[] = [];

const INITIAL_TRADES: Record<string, TradeItem[]> = {};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Returns the base URL for backend API calls.
 * - Uses NEXT_PUBLIC_BACKEND_URL env var if set (explicit config)
 * - Uses empty string (relative URL) in production — Vercel rewrites /api/* to backend service
 * - Uses localhost:4000 for local development
 */
function getBackendUrl(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BACKEND_URL) {
    return process.env.NEXT_PUBLIC_BACKEND_URL;
  }
  if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
    return ''; // relative path — Vercel rewrites /api/* → backend service
  }
  return 'http://localhost:4000';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [nairaBalance, setNairaBalance] = useState<number>(500000);
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
    return {};
  });

  // BroadcastChannel for instant cross-tab / cross-account real-time sync (same browser)
  const broadcastRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel('kobo_sync');
    broadcastRef.current = channel;

    channel.onmessage = (event: MessageEvent) => {
      const { type, payload } = event.data || {};
      if (!type || !payload) return;

      if (type === 'TRADE') {
        // Incoming trade from another tab — merge into our tradesMap and tokens
        const { trade, updatedToken } = payload as { trade: TradeItem; updatedToken: TokenItem };
        const addr = trade.token_address.toLowerCase();

        setTradesMap(prev => {
          const existing = prev[addr] || [];
          // Deduplicate by tx_hash — never add the same trade twice
          if (existing.some(t => t.tx_hash === trade.tx_hash)) return prev;
          const next = { ...prev, [addr]: [trade, ...existing] };
          localStorage.setItem('kobo_trades', JSON.stringify(next));
          return next;
        });

        setTokens(prev => {
          const next = prev.map(t => {
            if (t.address.toLowerCase() !== addr) return t;

            const localRaised = t.raisedCngn ?? 0;
            const broadcastRaised = updatedToken.raisedCngn ?? localRaised;

            // For buys: raisedCngn only increases — use Math.max to guard against
            // out-of-order or stale broadcasts overwriting a higher correct value.
            // For sells: raisedCngn decreases — trust the broadcaster's exact value
            // (they computed it from the actual sell amount).
            const safeRaisedCngn = trade.side === 'buy'
              ? Math.max(localRaised, broadcastRaised)
              : broadcastRaised;

            return {
              ...t,
              raisedCngn: safeRaisedCngn,
              // migrated is a one-way door: once graduated it never reverts
              migrated: (t.migrated ?? false) || (updatedToken.migrated ?? false)
            };
          });
          localStorage.setItem('kobo_tokens', JSON.stringify(next));
          return next;
        });
      }

      if (type === 'LAUNCH') {
        const { token } = payload as { token: TokenItem };
        setTokens(prev => {
          if (prev.some(t => t.address.toLowerCase() === token.address.toLowerCase())) return prev;
          const next = [token, ...prev];
          localStorage.setItem('kobo_tokens', JSON.stringify(next));
          return next;
        });
      }
    };

    return () => { channel.close(); broadcastRef.current = null; };
  }, []);

  // Server-Sent Events (SSE) Stream Connection for Instant Multi-User & Multi-Device Real-Time Sync
  useEffect(() => {
    if (typeof window === 'undefined' || !('EventSource' in window)) return;

    let eventSource: EventSource | null = null;
    try {
      const backendUrl = getBackendUrl();
      eventSource = new EventSource(`${backendUrl}/api/events`);

      eventSource.addEventListener('TRADE', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const { trade, updatedToken } = data || {};
          if (!trade || !trade.token_address) return;
          const addr = trade.token_address.toLowerCase();

          const formattedTrade: TradeItem = {
            id: String(trade.id || trade.tx_hash),
            token_address: trade.token_address,
            trader_wallet: trade.trader_wallet,
            side: trade.side,
            cngn_amount: Number(trade.cngn_amount),
            token_amount: Number(trade.token_amount),
            price: Number(trade.price),
            timestamp: new Date(trade.created_at || Date.now()).getTime(),
            tx_hash: trade.tx_hash || '0x...'
          };

          setTradesMap(prev => {
            const existing = prev[addr] || [];
            if (existing.some(t => t.tx_hash === formattedTrade.tx_hash)) return prev;
            const next = { ...prev, [addr]: [formattedTrade, ...existing] };
            localStorage.setItem('kobo_trades', JSON.stringify(next));
            return next;
          });

          if (updatedToken) {
            setTokens(prev => {
              const next = prev.map(t => {
                if (t.address.toLowerCase() !== addr) return t;
                const localRaised = t.raisedCngn ?? 0;
                const streamRaised = updatedToken.raisedCngn ?? localRaised;
                const safeRaised = trade.side === 'buy'
                  ? Math.max(localRaised, streamRaised)
                  : streamRaised;

                return {
                  ...t,
                  raisedCngn: safeRaised,
                  migrated: (t.migrated ?? false) || (updatedToken.migrated ?? false)
                };
              });
              localStorage.setItem('kobo_tokens', JSON.stringify(next));
              return next;
            });
          }
        } catch (err) {
          console.warn("SSE trade parse notice:", err);
        }
      });

      eventSource.addEventListener('LAUNCH', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const { token } = data || {};
          if (!token || !token.address) return;
          setTokens(prev => {
            if (prev.some(t => t.address.toLowerCase() === token.address.toLowerCase())) return prev;
            const next = [token, ...prev];
            localStorage.setItem('kobo_tokens', JSON.stringify(next));
            return next;
          });
        } catch (err) {
          console.warn("SSE launch parse notice:", err);
        }
      });
    } catch (err) {
      console.warn("SSE connection notice:", err);
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  useEffect(() => {
    const syncState = () => {
      // Force purge cached tokens on every new test cycle — bump version to re-trigger
      if (typeof window !== 'undefined' && !localStorage.getItem('kobo_v4_purged')) {
        localStorage.removeItem('kobo_tokens');
        localStorage.removeItem('kobo_trades');
        localStorage.removeItem('kobo_user_holdings');
        localStorage.removeItem('kobo_v3_purged');
        localStorage.setItem('kobo_v4_purged', 'true');
        setTokens([]);
        setTradesMap({});
        setUserHoldings({});
        return;
      }

      const savedWallet = localStorage.getItem('kobo_wallet');
      const savedBalance = localStorage.getItem('kobo_balance');
      const savedNaira = localStorage.getItem('kobo_naira_balance');
      const savedTokens = localStorage.getItem('kobo_tokens');
      const savedTrades = localStorage.getItem('kobo_trades');

      if (savedWallet) setWalletAddress(savedWallet);
      if (savedBalance) setCngnBalance(parseFloat(savedBalance));
      if (savedNaira) setNairaBalance(parseFloat(savedNaira));
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
        const backendUrl = getBackendUrl();
        
        // 1. Fetch Tokens list from backend
        const tokenRes = await fetch(`${backendUrl}/api/tokens`).catch(() => null);
        if (tokenRes && tokenRes.ok) {
          const tokenData = await tokenRes.json();
          if (tokenData.tokens && Array.isArray(tokenData.tokens)) {
            setTokens(prev => {
              const existingAddrs = new Set(prev.map(t => t.address.toLowerCase()));
              const brandNewTokens: TokenItem[] = [];

              tokenData.tokens.forEach((bt: any) => {
                const bRaised = bt.raisedCngn !== undefined ? Number(bt.raisedCngn) : (bt.metrics?.raisedCngn !== undefined ? Number(bt.metrics.raisedCngn) : 0);
                const bMigrated = bt.migrated !== undefined ? Boolean(bt.migrated) : (bt.metrics?.migrated !== undefined ? Boolean(bt.metrics.migrated) : false);

                if (bt.address && !existingAddrs.has(bt.address.toLowerCase())) {
                  brandNewTokens.push({
                    address: bt.address,
                    curve_address: bt.curve_address || bt.address,
                    name: bt.name,
                    symbol: bt.symbol,
                    metadata_uri: bt.metadata_uri || "/jollof.png",
                    creator_wallet: bt.creator_wallet || "0xUser...1234",
                    migrated: bMigrated,
                    raisedCngn: bRaised,
                    description: bt.description || `${bt.name} ($${bt.symbol}) launched on Kobo Launchpad!`
                  });
                }
              });

              const updatedExisting = prev.map(t => {
                const bToken = tokenData.tokens.find((bt: any) => bt.address.toLowerCase() === t.address.toLowerCase());
                if (bToken) {
                  const bRaised = bToken.raisedCngn !== undefined
                    ? Number(bToken.raisedCngn)
                    : (bToken.metrics?.raisedCngn !== undefined ? Number(bToken.metrics.raisedCngn) : t.raisedCngn ?? 0);
                  const bMigrated = bToken.migrated !== undefined
                    ? Boolean(bToken.migrated)
                    : (bToken.metrics?.migrated !== undefined ? Boolean(bToken.metrics.migrated) : t.migrated ?? false);

                  return {
                    ...t,
                    // CRITICAL: Never let a cold-start backend overwrite a higher local raisedCngn.
                    // Local state tracks every trade. Backend is stateless and can return 0 on cold starts.
                    // Only accept backend value if it's HIGHER (means another device traded more).
                    raisedCngn: Math.max(t.raisedCngn ?? 0, bRaised),
                    // migrated is a one-way door: once true it can never revert to false.
                    migrated: (t.migrated ?? false) || bMigrated
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
                id: String(tr.id || tr.tx_hash || Math.random()),
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
              let changed = false;
              for (const [addr, trades] of Object.entries(newMap)) {
                // Build dedup sets from existing local trades
                const existingTxHashes = new Set(
                  (merged[addr] || []).map(t => t.tx_hash).filter(h => h && h !== '0x...')
                );
                // Normalise IDs: strip the backend integer prefix if local IDs use timestamp format
                const existingTxHashSet = existingTxHashes;

                const toAdd = trades.filter(t => {
                  // Primary dedup: by tx_hash (reliable — we write it on trade and send to backend)
                  if (t.tx_hash && t.tx_hash !== '0x...' && existingTxHashSet.has(t.tx_hash)) return false;
                  return true;
                });

                if (toAdd.length > 0) {
                  merged[addr] = [...toAdd, ...(merged[addr] || [])];
                  changed = true;
                }
              }
              if (changed) {
                localStorage.setItem('kobo_trades', JSON.stringify(merged));
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
    // BroadcastChannel handles instant same-device sync; polling is cross-device fallback
    const interval = setInterval(fetchGlobalSync, 4000);
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
              params: [{ chainId: '0x4cef52' }],
            });
          } catch (switchErr: any) {
            if (switchErr.code === 4902) {
              await (window as any).ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: '0x4cef52',
                  chainName: 'Arc Testnet',
                  // Native gas token is USDC (18 decimals internally) per Arc docs
                  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
                  rpcUrls: [
                    'https://rpc.testnet.arc.io',            // Primary (Circle)
                    'https://rpc.blockdaemon.testnet.arc.io', // Blockdaemon
                    'https://rpc.drpc.testnet.arc.io',        // dRPC
                    'https://rpc.quicknode.testnet.arc.io'    // QuickNode
                  ],
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
    setNairaBalance(prev => {
      const next = prev + nairaAmount;
      localStorage.setItem('kobo_naira_balance', next.toString());
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

  const swapNairaToCngn = (amount: number): boolean => {
    if (amount <= 0 || nairaBalance < amount) return false;
    setNairaBalance(prev => {
      const next = prev - amount;
      localStorage.setItem('kobo_naira_balance', next.toString());
      return next;
    });
    setCngnBalance(prev => {
      const next = prev + amount;
      localStorage.setItem('kobo_balance', next.toString());
      return next;
    });
    return true;
  };

  const swapCngnToNaira = (amount: number): boolean => {
    if (amount <= 0 || cngnBalance < amount) return false;
    setCngnBalance(prev => {
      const next = prev - amount;
      localStorage.setItem('kobo_balance', next.toString());
      return next;
    });
    setNairaBalance(prev => {
      const next = prev + amount;
      localStorage.setItem('kobo_naira_balance', next.toString());
      return next;
    });
    return true;
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

    // Instant cross-tab broadcast so other accounts see new token immediately
    broadcastRef.current?.postMessage({ type: 'LAUNCH', payload: { token: newToken } });

    // Post new token to backend API for cross-device sync
    const backendUrl = getBackendUrl();
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

    // Instant cross-tab broadcast so other accounts see this trade immediately (no refresh needed)
    broadcastRef.current?.postMessage({
      type: 'TRADE',
      payload: {
        trade: newTrade,
        updatedToken: { ...token, address: tokenAddress, raisedCngn: newRaised, migrated: isMigrated }
      }
    });

    // Post trade to backend API for cross-device sync
    const backendUrl = getBackendUrl();
    fetch(`${backendUrl}/api/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenAddress,
        tokenName: token?.name,
        tokenSymbol: token?.symbol,
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

    // Instant cross-tab broadcast so other accounts see this sell trade immediately
    broadcastRef.current?.postMessage({
      type: 'TRADE',
      payload: {
        trade: newTrade,
        updatedToken: { ...token, address: tokenAddress, raisedCngn: newRaised }
      }
    });

    // Post trade to backend API for cross-device sync
    const backendUrl = getBackendUrl();
    fetch(`${backendUrl}/api/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenAddress,
        tokenName: token?.name,
        tokenSymbol: token?.symbol,
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
        nairaBalance,
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
        swapNairaToCngn,
        swapCngnToNaira,
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

