'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { TradeItem, DetailedMetrics, deriveTokenMetrics, quoteBuy, quoteSell, INITIAL_VIRTUAL_CNGN, INITIAL_VIRTUAL_TOKENS, MIGRATION_TARGET_CNGN } from '@/lib/metrics';
import { mintCngnOnChain, buyTokenOnChain, sellTokenOnChain, refreshTokenReserves } from '@/lib/onchain';

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

/** Map a backend IndexedTrade (string amounts) to the frontend TradeItem (numbers). */
function mapBackendTrade(tr: any, tokenAddress: string): TradeItem {
  return {
    id: tr.tx_hash || tr.id,
    token_address: tokenAddress.toLowerCase(),
    trader_wallet: (tr.trader_wallet || '').toLowerCase(),
    side: tr.side === 'sell' ? 'sell' : 'buy',
    cngn_amount: Number(tr.cngn_amount),
    token_amount: Number(tr.token_amount),
    price: Number(tr.price),
    timestamp: Number(tr.timestamp) || Date.now(),
    tx_hash: tr.tx_hash || String(tr.id || ''),
  };
}

/** Map a backend token record (already enriched with metrics) to a frontend TokenItem. */
function mapBackendToken(t: any): TokenItem {
  const metrics = t.metrics || {};
  return {
    address: t.address.toLowerCase(),
    curve_address: (t.curve_address || '').toLowerCase(),
    name: t.name || '',
    symbol: t.symbol || '',
    metadata_uri: t.metadata_uri || '/jollof.png',
    creator_wallet: (t.creator_wallet || '').toLowerCase(),
    migrated: Boolean(t.migrated ?? metrics.migrated ?? false),
    raisedCngn: Number(t.raisedCngn ?? metrics.raisedCngn ?? 0),
    description: t.description || `${t.name || ''} ($${t.symbol || ''}) — launched on Kobo!`,
  };
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

  // BroadcastChannel is a same-browser INSTANT HINT only. It never writes optimistic
  // token/trade values (those diverge across accounts). Instead a hint just triggers an
  // immediate authoritative refetch from the backend indexer, so other tabs update
  // within a beat rather than waiting for the next poll. Cross-browser / cross-device
  // users converge via the 15s poll regardless.
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  // Lets the instant-hint channels (BroadcastChannel / SSE) trigger an authoritative
  // refetch. Assigned by the backend-sync effect below.
  const chainSyncRef = useRef<{ run: () => void } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel('kobo_sync');
    broadcastRef.current = channel;

    channel.onmessage = (event: MessageEvent) => {
      const { type } = event.data || {};
      // Any launch/trade hint from another tab → pull fresh authoritative backend state.
      if (type === 'TRADE' || type === 'LAUNCH') {
        chainSyncRef.current?.run();
      }
    };

    return () => { channel.close(); broadcastRef.current = null; };
  }, []);

  // Server-Sent Events (SSE) — same pattern as BroadcastChannel: an INSTANT HINT only.
  // When the backend indexer reports a trade/launch we do NOT apply its optimistic
  // values (per-instance state is what breaks cross-account sync). We just trigger an
  // authoritative backend refetch so everyone converges on the same truth.
  useEffect(() => {
    if (typeof window === 'undefined' || !('EventSource' in window)) return;

    let eventSource: EventSource | null = null;
    try {
      const backendUrl = getBackendUrl();
      eventSource = new EventSource(`${backendUrl}/api/events`);

      const hint = () => chainSyncRef.current?.run();

      eventSource.addEventListener('TRADE', hint);
      eventSource.addEventListener('LAUNCH', hint);
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

        // Trigger backend metadata purge (chain state re-indexes automatically)
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

  // Backend-indexer-first global sync — the Arc chain is the SINGLE source of truth,
  // and the backend indexer is the single shared reader of it. This is the permanent
  // fix for cross-account divergence: one process reads the chain once (via the
  // factory's state registry, not per-browser log scans) and serves EVERY client an
  // identical token + trade view. Optimistic local state is only a UX flash; the next
  // poll (or SSE hint) is authoritative.
  //
  // We do NOT merge localStorage optimistic values, phantom local-only tokens, or
  // per-browser chain scans here — those were the source of the "my coin doesn't
  // show up for other people" bug.
  useEffect(() => {
    let isMounted = true;
    let inFlight = false;

    const fetchGlobalSync = async () => {
      if (inFlight) return; // coalesce overlapping polls / broadcast-triggered refreshes
      inFlight = true;
      try {
        const backendUrl = getBackendUrl();

        // ── STEP 1: canonical token list from the backend indexer (chain-backed) ──
        const tokensRes = await fetch(`${backendUrl}/api/tokens`);
        if (!tokensRes.ok) throw new Error(`Backend tokens fetch failed: ${tokensRes.status}`);
        const { tokens: backendTokens } = await tokensRes.json();
        if (!isMounted) return;

        // The indexer is authoritative: if it returns tokens, we use them. No
        // `if (list.length > 0)` guard — the backend list is never empty-when-tokens-
        // exist because the indexer already read them from the chain.
        const merged: TokenItem[] = (backendTokens || []).map(mapBackendToken);
        setTokens(merged);
        localStorage.setItem('kobo_tokens', JSON.stringify(merged));

        // ── STEP 2: authoritative per-token trade history from the indexer ──
        const CONCURRENCY = 4;
        const tradeMapNext: Record<string, TradeItem[]> = {};
        for (let i = 0; i < merged.length; i += CONCURRENCY) {
          const batch = merged.slice(i, i + CONCURRENCY);
          const batchResults = await Promise.all(
            batch.map(async tk => {
              const addrLower = tk.address.toLowerCase();
              try {
                const tradesRes = await fetch(`${backendUrl}/api/tokens/${addrLower}/trades`);
                if (!tradesRes.ok) throw new Error(`Trades fetch failed: ${tradesRes.status}`);
                const { trades: backendTrades } = await tradesRes.json();
                const items: TradeItem[] = (backendTrades || []).map((tr: any) => mapBackendTrade(tr, addrLower));
                return [addrLower, items] as const;
              } catch {
                return [addrLower, [] as TradeItem[]] as const;
              }
            })
          );
          if (!isMounted) return;
          batchResults.forEach(([addr, items]) => { tradeMapNext[addr] = items; });
        }
        if (!isMounted) return;
        setTradesMap(tradeMapNext);
        localStorage.setItem('kobo_trades', JSON.stringify(tradeMapNext));
      } catch (e) {
        console.warn('[Kobo] Global backend sync notice:', e);
      } finally {
        inFlight = false;
      }
    };

    // Expose the runner so BroadcastChannel / SSE hints can trigger an immediate
    // authoritative refetch instead of writing their own (per-instance) optimistic state.
    chainSyncRef.current = { run: () => { fetchGlobalSync(); } };

    fetchGlobalSync();
    // Poll every 15s so newly-mined tokens and trades surface for everyone quickly.
    const interval = setInterval(fetchGlobalSync, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
      chainSyncRef.current = null;
    };
  }, []);

  const connectRealWeb3Wallet = async (): Promise<string> => {
    // A REAL wallet is mandatory: trades, launches and fees are all executed by the
    // user's own address on-chain. A simulated address would only create phantom
    // state that no other account could ever see — so we refuse rather than fake it.
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error("No Web3 wallet detected. Please install MetaMask or another wallet and connect to Arc Testnet.");
    }

    try {
      const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || !accounts[0]) {
        throw new Error("Wallet connection was cancelled or returned no account.");
      }
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
    } catch (err: any) {
      console.error("Web3 wallet connection failed:", err);
      throw new Error(err?.shortMessage || err?.message || "Failed to connect Web3 wallet.");
    }
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
    // A token only exists if it was actually deployed on-chain. Without the real
    // TokenFactory addresses there is nothing for other users to discover via the
    // backend indexer — so we refuse to fabricate a phantom address.
    if (!customAddress || !customCurve) {
      throw new Error("Token launch requires a confirmed on-chain deployment. No wallet transaction was completed.");
    }
    const tokenAddr = customAddress;
    const curveAddr = customCurve;

    const newToken: TokenItem = {
      address: tokenAddr,
      curve_address: curveAddr,
      name,
      symbol: symbol.toUpperCase(),
      metadata_uri: imageUrl || "/jollof.png",
      // Store the FULL creator address so it matches the on-chain event's creator
      // field once the backend indexer overwrites this optimistic entry.
      creator_wallet: walletAddress || tokenAddr,
      migrated: false,
      raisedCngn: 0,
      description
    };

    // Optimistic local insert so the creator sees their token instantly; the 15s
    // indexer sync will replace this with the authoritative on-chain record.
    setTokens(prev => {
      if (prev.some(t => t.address.toLowerCase() === tokenAddr.toLowerCase())) return prev;
      const next = [newToken, ...prev];
      localStorage.setItem('kobo_tokens', JSON.stringify(next));
      return next;
    });

    setTradesMap(prev => {
      if (prev[tokenAddr.toLowerCase()]) return prev;
      const next = { ...prev, [tokenAddr.toLowerCase()]: [] };
      localStorage.setItem('kobo_trades', JSON.stringify(next));
      return next;
    });

    // Instant same-browser hint → other tabs pull fresh backend state.
    broadcastRef.current?.postMessage({ type: 'LAUNCH', payload: { token: newToken } });

    // Off-chain metadata (description + image) lives in the backend file store, NOT
    // on-chain — the launch event only carries name/symbol/creator. Persist it now so
    // the indexer merges it onto every client's token record.
    try {
      const backendUrl = getBackendUrl();
      fetch(`${backendUrl}/api/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: tokenAddr.toLowerCase(),
          curve_address: curveAddr.toLowerCase(),
          name,
          symbol: symbol.toUpperCase(),
          description,
          image: imageUrl || '/jollof.png',
          creator_wallet: newToken.creator_wallet
        })
      }).catch(err => {
        console.warn("Metadata file-store write notice:", err);
      });
    } catch (e) {
      console.warn("Metadata file-store write notice:", e);
    }

    return newToken;
  };

  const buyToken = async (tokenAddress: string, cngnAmount: number) => {
    const addrLower = tokenAddress.toLowerCase();
    const token = tokens.find(t => t.address.toLowerCase() === addrLower);
    const raised = token?.raisedCngn || 0;

    // A trade must be a real on-chain swap — otherwise it is invisible to every
    // other user (the backend indexer is the single source of truth). Refuse to
    // fabricate an off-chain "simulated" fill.
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error("No Web3 wallet detected. Connect a wallet on Arc Testnet to trade.");
    }
    if (!token?.curve_address) {
      throw new Error("This token has no on-chain bonding curve to trade against.");
    }
    if (!walletAddress) {
      throw new Error("Wallet not connected.");
    }

    const res = await buyTokenOnChain(token.curve_address, cngnAmount);
    const realTxHash = res.txHash;
    const onChainTokensOut = res.tokensOut > 0 ? res.tokensOut : undefined;

    const virtualCngn = INITIAL_VIRTUAL_CNGN + raised;
    const virtualToken = (INITIAL_VIRTUAL_CNGN * INITIAL_VIRTUAL_TOKENS) / virtualCngn;
    const { tokensOut, priceImpactPercent } = quoteBuy(cngnAmount, virtualCngn, virtualToken);

    const finalTokensOut = onChainTokensOut || tokensOut;
    const newRaised = raised + cngnAmount;
    const isMigrated = (token?.migrated || false) || newRaised >= MIGRATION_TARGET_CNGN;
    const executionPrice = (virtualCngn + cngnAmount) / (virtualToken - finalTokensOut);

    const newTrade: TradeItem = {
      id: `${Date.now()}-${Math.random().toString(16).substring(2, 6)}`,
      token_address: tokenAddress,
      trader_wallet: walletAddress,
      side: 'buy',
      cngn_amount: cngnAmount,
      token_amount: Math.round(finalTokensOut),
      price: executionPrice,
      timestamp: Date.now(),
      tx_hash: realTxHash
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

    // Reconcile raisedCngn/migrated from authoritative on-chain reserves.
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

    // Trigger an immediate authoritative backend refetch so the trade shows for
    // everyone the moment the indexer picks it up (falls back to next 15s poll).
    chainSyncRef.current?.run();

    return { tokensOut: finalTokensOut, priceImpact: priceImpactPercent, txHash: newTrade.tx_hash };
  };

  const sellToken = async (tokenAddress: string, tokenAmount: number) => {
    const addrLower = tokenAddress.toLowerCase();
    const token = tokens.find(t => t.address.toLowerCase() === addrLower);
    const raised = token?.raisedCngn || 0;

    // Sells must settle on-chain too — a simulated sell would desync this account
    // from the shared backend state that every other user reads.
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error("No Web3 wallet detected. Connect a wallet on Arc Testnet to trade.");
    }
    if (!token?.curve_address) {
      throw new Error("This token has no on-chain bonding curve to trade against.");
    }
    if (!walletAddress) {
      throw new Error("Wallet not connected.");
    }

    const res = await sellTokenOnChain(token.address, token.curve_address, tokenAmount);
    const realTxHash = res.txHash;
    const onChainCngnOut = res.cngnOut > 0 ? res.cngnOut : undefined;

    const virtualCngn = INITIAL_VIRTUAL_CNGN + raised;
    const virtualToken = (INITIAL_VIRTUAL_CNGN * INITIAL_VIRTUAL_TOKENS) / virtualCngn;
    const { cngnOut, priceImpactPercent } = quoteSell(tokenAmount, virtualCngn, virtualToken);

    const finalCngnOut = onChainCngnOut || cngnOut;
    const newRaised = Math.max(0, raised - finalCngnOut);
    const executionPrice = (virtualCngn - finalCngnOut) / (virtualToken + tokenAmount);

    const newTrade: TradeItem = {
      id: `${Date.now()}-${Math.random().toString(16).substring(2, 6)}`,
      token_address: tokenAddress,
      trader_wallet: walletAddress,
      side: 'sell',
      cngn_amount: Number(finalCngnOut.toFixed(2)),
      token_amount: tokenAmount,
      price: executionPrice,
      timestamp: Date.now(),
      tx_hash: realTxHash
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

    // Reconcile raisedCngn/migrated from authoritative on-chain reserves.
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

    // Trigger an immediate authoritative backend refetch so the sell shows for
    // everyone the moment the indexer picks it up (falls back to next 15s poll).
    chainSyncRef.current?.run();

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
