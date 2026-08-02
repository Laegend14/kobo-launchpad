'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { TradeItem, DetailedMetrics, deriveTokenMetrics, quoteBuy, quoteSell } from '@/lib/metrics';
import { createClient as createSupabaseClient } from '@/utils/supabase/client';
import { mintCngnOnChain, buyTokenOnChain, sellTokenOnChain, getAllTokensFromChain, refreshTokenReserves } from '@/lib/onchain';

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
  buyToken: (tokenAddress: string, cngnAmount: number) => Promise<{ tokensOut: number; priceImpact: number; txHash: string }>;
  sellToken: (tokenAddress: string, tokenAmount: number) => Promise<{ cngnOut: number; priceImpact: number; txHash: string }>;
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
      if (typeof window !== 'undefined' && !localStorage.getItem('kobo_v6_fresh_purge')) {
        localStorage.removeItem('kobo_tokens');
        localStorage.removeItem('kobo_trades');
        localStorage.removeItem('kobo_user_holdings');
        localStorage.removeItem('kobo_v5_fresh_purge');
        localStorage.setItem('kobo_v6_fresh_purge', 'true');
        setTokens([]);
        setTradesMap({});
        setUserHoldings({});

        // Trigger backend & Supabase purge
        const backendUrl = getBackendUrl();
        fetch(`${backendUrl}/api/reset`, { method: 'POST' }).catch(() => {});
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

  // Blockchain-first global sync — reads TokenFactory events as primary source of truth
  useEffect(() => {
    let isMounted = true;

    const fetchGlobalSync = async () => {
      try {
        // ── STEP 1: Read all tokens from TokenFactory.TokenLaunched events on Arc Testnet ──
        // This is the authoritative source — any wallet that launched a token appears here
        const chainTokens = await getAllTokensFromChain();

        if (!isMounted) return;

        if (chainTokens.length > 0) {
          // ── STEP 2: Enrich with Supabase off-chain metadata (images, descriptions) ──
          // Supabase is only used for metadata that can't be stored on-chain efficiently
          let offChainMeta: Record<string, { description?: string; metadata_uri?: string }> = {};
          try {
            const supabase = createSupabaseClient();
            const { data: dbTokens } = await supabase
              .from('tokens')
              .select('address, description, metadata_uri')
              .in('address', chainTokens.map(t => t.address.toLowerCase()));
            if (dbTokens) {
              dbTokens.forEach((row: any) => {
                offChainMeta[row.address.toLowerCase()] = {
                  description: row.description,
                  metadata_uri: row.metadata_uri
                };
              });
            }
          } catch (sbErr) {
            // Non-blocking: Supabase enrichment is optional
          }

          if (!isMounted) return;

          // ── STEP 3: Merge chain data with off-chain metadata and update state ──
          setTokens(prev => {
            const merged: TokenItem[] = chainTokens.map(ct => {
              const addrLower = ct.address.toLowerCase();
              const meta = offChainMeta[addrLower] || {};
              // Preserve any locally-known raisedCngn that might be higher (optimistic local update)
              const existing = prev.find(p => p.address.toLowerCase() === addrLower);
              const localRaised = existing?.raisedCngn ?? 0;
              return {
                address: ct.address,
                curve_address: ct.curve_address,
                name: ct.name,
                symbol: ct.symbol,
                metadata_uri: meta.metadata_uri || ct.metadata_uri || '/jollof.png',
                creator_wallet: ct.creator_wallet,
                raisedCngn: Math.max(localRaised, ct.raisedCngn),
                migrated: (existing?.migrated ?? false) || ct.migrated,
                description: meta.description || `${ct.name} ($${ct.symbol}) — launched on Kobo!`
              };
            });

            // Preserve any locally-known tokens not yet on-chain (just launched, tx pending)
            const chainAddrs = new Set(chainTokens.map(c => c.address.toLowerCase()));
            const localOnly = prev.filter(p => !chainAddrs.has(p.address.toLowerCase()));
            const result = [...merged, ...localOnly];
            localStorage.setItem('kobo_tokens', JSON.stringify(result));
            return result;
          });
        }

        // ── STEP 4: Sync trade history from backend (complements on-chain events) ──
        try {
          const backendUrl = getBackendUrl();
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

              if (!isMounted) return;

              setTradesMap(prev => {
                const merged = { ...prev };
                for (const [addr, trades] of Object.entries(newMap)) {
                  const existingHashes = new Set(
                    (merged[addr] || []).map(t => t.tx_hash).filter(h => h && h !== '0x...')
                  );
                  const toAdd = trades.filter(t =>
                    !t.tx_hash || t.tx_hash === '0x...' || !existingHashes.has(t.tx_hash)
                  );
                  if (toAdd.length > 0) {
                    merged[addr] = [...toAdd, ...(merged[addr] || [])];
                  }
                }
                localStorage.setItem('kobo_trades', JSON.stringify(merged));
                return merged;
              });
            }
          }
        } catch (tradeErr) {
          // Non-blocking
        }
      } catch (e) {
        console.warn('[Kobo] Global sync notice:', e);
      }
    };

    fetchGlobalSync();
    // Poll every 30s for new tokens and price updates (on-chain reads are heavier than DB polls)
    const interval = setInterval(fetchGlobalSync, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
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

    // Execute real on-chain ERC20 cNGN minting on Arc Testnet if wallet is connected
    if (walletAddress) {
      mintCngnOnChain(walletAddress, amount).catch(err => {
        console.warn("[cNGN On-Chain Mint Notice]:", err);
      });
    }

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

    // Direct Supabase Browser SDK Write
    try {
      const supabase = createSupabaseClient();
      supabase.from('tokens').upsert({
        address: tokenAddr.toLowerCase(),
        curve_address: curveAddr.toLowerCase(),
        name,
        symbol: symbol.toUpperCase(),
        metadata_uri: imageUrl || "/jollof.png",
        creator_wallet: newToken.creator_wallet,
        migrated: false,
        raised_cngn: 0,
        description,
        created_at: new Date().toISOString()
      }, { onConflict: 'address' }).then();
    } catch (e) {
      console.warn("Supabase launch token direct write notice:", e);
    }

    // Post new token to backend API for cross-device sync
    const backendUrl = getBackendUrl();
    fetch(`${backendUrl}/api/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newToken)
    }).catch(err => console.warn("Backend token sync notice:", err));

    return newToken;
  };

  const buyToken = async (tokenAddress: string, cngnAmount: number) => {
    const addrLower = tokenAddress.toLowerCase();
    const token = tokens.find(t => t.address.toLowerCase() === addrLower);
    const raised = token?.raisedCngn || 0;

    let realTxHash: string | undefined;
    let onChainTokensOut: number | undefined;

    // Execute real EVM transaction on Arc Testnet if wallet connected
    if (typeof window !== 'undefined' && (window as any).ethereum && token?.curve_address) {
      const res = await buyTokenOnChain(token.curve_address, cngnAmount);
      realTxHash = res.txHash;
      if (res.tokensOut > 0) onChainTokensOut = res.tokensOut;
    }

    const virtualCngn = 10000 + raised;
    const virtualToken = (10000 * 1000000000) / virtualCngn;
    const { tokensOut, priceImpactPercent } = quoteBuy(cngnAmount, virtualCngn, virtualToken);

    const finalTokensOut = onChainTokensOut || tokensOut;
    const newRaised = raised + cngnAmount;
    const isMigrated = (token?.migrated || false) || newRaised >= 50000;
    const executionPrice = (virtualCngn + cngnAmount) / (virtualToken - finalTokensOut);

    const newTrade: TradeItem = {
      id: `${Date.now()}-${Math.random().toString(16).substring(2, 6)}`,
      token_address: tokenAddress,
      trader_wallet: walletAddress || '0xUser...48f2',
      side: 'buy',
      cngn_amount: cngnAmount,
      token_amount: Math.round(finalTokensOut),
      price: executionPrice,
      timestamp: Date.now(),
      tx_hash: realTxHash || `0x${Math.random().toString(16).substring(2, 42)}`
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
      const next = { ...prev, [addrLower]: current + Math.round(finalTokensOut) };
      localStorage.setItem('kobo_user_holdings', JSON.stringify(next));
      return next;
    });

    // Instant cross-tab broadcast so other accounts see this trade immediately
    broadcastRef.current?.postMessage({
      type: 'TRADE',
      payload: {
        trade: newTrade,
        updatedToken: { ...token, address: tokenAddress, raisedCngn: newRaised, migrated: isMigrated }
      }
    });

    // Direct Supabase Browser SDK Write
    try {
      const supabase = createSupabaseClient();
      supabase.from('trades').upsert({
        token_address: tokenAddress.toLowerCase(),
        trader_wallet: walletAddress || '0xUser...48f2',
        side: 'buy',
        cngn_amount: cngnAmount,
        token_amount: Math.round(finalTokensOut),
        price: executionPrice,
        tx_hash: newTrade.tx_hash,
        created_at: new Date().toISOString()
      }, { onConflict: 'tx_hash' }).then();

      supabase.from('tokens').update({
        raised_cngn: newRaised,
        migrated: isMigrated
      }).eq('address', addrLower).then();
    } catch (e) {
      console.warn("Supabase buy trade direct write notice:", e);
    }

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
        tokenAmount: Math.round(finalTokensOut),
        price: executionPrice,
        txHash: newTrade.tx_hash
      })
    }).catch(err => console.warn("Backend trade sync notice:", err));

    // Refresh on-chain reserves after real EVM buy to correct raisedCngn from contract state
    if (realTxHash && token?.curve_address) {
      refreshTokenReserves(token.curve_address).then(reserves => {
        if (!reserves) return;
        setTokens(prev => {
          const updated = prev.map(t => {
            if (t.address.toLowerCase() !== addrLower) return t;
            return { ...t, raisedCngn: reserves.raisedCngn, migrated: reserves.migrated };
          });
          localStorage.setItem('kobo_tokens', JSON.stringify(updated));
          return updated;
        });
      }).catch(() => {});
    }

    return { tokensOut: finalTokensOut, priceImpact: priceImpactPercent, txHash: newTrade.tx_hash };
  };

  const sellToken = async (tokenAddress: string, tokenAmount: number) => {
    const addrLower = tokenAddress.toLowerCase();
    const token = tokens.find(t => t.address.toLowerCase() === addrLower);
    const raised = token?.raisedCngn || 0;

    let realTxHash: string | undefined;
    let onChainCngnOut: number | undefined;

    // Execute real EVM transaction on Arc Testnet if wallet connected
    if (typeof window !== 'undefined' && (window as any).ethereum && token?.curve_address) {
      const res = await sellTokenOnChain(token.address, token.curve_address, tokenAmount);
      realTxHash = res.txHash;
      if (res.cngnOut > 0) onChainCngnOut = res.cngnOut;
    }

    const virtualCngn = 10000 + raised;
    const virtualToken = (10000 * 1000000000) / virtualCngn;
    const { cngnOut, priceImpactPercent } = quoteSell(tokenAmount, virtualCngn, virtualToken);

    const finalCngnOut = onChainCngnOut || cngnOut;
    const newRaised = Math.max(0, raised - finalCngnOut);
    const executionPrice = (virtualCngn - finalCngnOut) / (virtualToken + tokenAmount);

    const newTrade: TradeItem = {
      id: `${Date.now()}-${Math.random().toString(16).substring(2, 6)}`,
      token_address: tokenAddress,
      trader_wallet: walletAddress || '0xUser...48f2',
      side: 'sell',
      cngn_amount: Number(finalCngnOut.toFixed(2)),
      token_amount: tokenAmount,
      price: executionPrice,
      timestamp: Date.now(),
      tx_hash: realTxHash || `0x${Math.random().toString(16).substring(2, 42)}`
    };

    setCngnBalance(prev => {
      const next = prev + finalCngnOut;
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

    // Direct Supabase Browser SDK Write
    try {
      const supabase = createSupabaseClient();
      supabase.from('trades').upsert({
        token_address: tokenAddress.toLowerCase(),
        trader_wallet: walletAddress || '0xUser...48f2',
        side: 'sell',
        cngn_amount: Number(cngnOut.toFixed(2)),
        token_amount: tokenAmount,
        price: executionPrice,
        tx_hash: newTrade.tx_hash,
        created_at: new Date().toISOString()
      }, { onConflict: 'tx_hash' }).then();

      supabase.from('tokens').update({
        raised_cngn: newRaised
      }).eq('address', addrLower).then();
    } catch (e) {
      console.warn("Supabase sell trade direct write notice:", e);
    }

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
        cngnAmount: Number(finalCngnOut.toFixed(2)),
        tokenAmount,
        price: executionPrice,
        txHash: newTrade.tx_hash
      })
    }).catch(err => console.warn("Backend trade sync notice:", err));

    // Refresh on-chain reserves after real EVM sell to correct raisedCngn from contract state
    if (realTxHash && token?.curve_address) {
      refreshTokenReserves(token.curve_address).then(reserves => {
        if (!reserves) return;
        setTokens(prev => {
          const updated = prev.map(t => {
            if (t.address.toLowerCase() !== addrLower) return t;
            return { ...t, raisedCngn: reserves.raisedCngn, migrated: reserves.migrated };
          });
          localStorage.setItem('kobo_tokens', JSON.stringify(updated));
          return updated;
        });
      }).catch(() => {});
    }

    return { cngnOut: finalCngnOut, priceImpact: priceImpactPercent, txHash: newTrade.tx_hash };
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

