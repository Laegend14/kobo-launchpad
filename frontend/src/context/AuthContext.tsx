'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { TradeItem, DetailedMetrics, deriveTokenMetrics, quoteBuy, quoteSell, INITIAL_VIRTUAL_CNGN, INITIAL_VIRTUAL_TOKENS, MIGRATION_TARGET_CNGN } from '@/lib/metrics';
import { createClient as createSupabaseClient } from '@/utils/supabase/client';
import { mintCngnOnChain, buyTokenOnChain, sellTokenOnChain, getAllTokensFromChain, getTradingHistoryFromChain, refreshTokenReserves } from '@/lib/onchain';

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

  // BroadcastChannel is a same-browser INSTANT HINT only. It never writes optimistic
  // token/trade values (those diverge across accounts). Instead a hint just triggers an
  // immediate authoritative refetch from the chain, so other tabs update within a beat
  // rather than waiting for the next poll. Cross-browser / cross-device users converge
  // via the 15s chain poll regardless.
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  // Lets the instant-hint channels (BroadcastChannel / SSE) trigger an authoritative
  // chain refetch. Assigned by the chain-sync effect below.
  const chainSyncRef = useRef<{ run: () => void } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel('kobo_sync');
    broadcastRef.current = channel;

    channel.onmessage = (event: MessageEvent) => {
      const { type } = event.data || {};
      // Any launch/trade hint from another tab → pull fresh authoritative chain state.
      if (type === 'TRADE' || type === 'LAUNCH') {
        chainSyncRef.current?.run();
      }
    };

    return () => { channel.close(); broadcastRef.current = null; };
  }, []);

  // Server-Sent Events (SSE) — same pattern as BroadcastChannel: an INSTANT HINT only.
  // When another backend-connected client reports a trade/launch we do NOT apply their
  // optimistic values (per-instance state is what breaks cross-account sync). We just
  // trigger an authoritative chain refetch so everyone converges on the same truth.
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

  // Blockchain-first global sync — the Arc chain is the SINGLE source of truth.
  //
  // Tokens come from TokenFactory.TokenLaunched events; per-token reserves (which
  // drive raisedCngn / price / migration) come from each BondingCurve's live state;
  // trade history comes from BondingCurve.Trade events. Every user, on every device
  // and browser, reads the exact same chain state — which is precisely what fixes the
  // "my coin / my trade doesn't show up for other people" bug. Supabase is used ONLY
  // to enrich with off-chain metadata (description + image) that isn't cheap to store
  // on-chain. We do NOT merge in localStorage optimistic values, backend in-memory
  // trades, or phantom local-only tokens here — those are per-instance and were the
  // source of cross-account divergence.
  useEffect(() => {
    let isMounted = true;
    let inFlight = false;

    const fetchGlobalSync = async () => {
      if (inFlight) return; // coalesce overlapping polls / broadcast-triggered refreshes
      inFlight = true;
      try {
        // ── STEP 1: authoritative token list from TokenFactory.TokenLaunched events ──
        const chainTokens = await getAllTokensFromChain();
        if (!isMounted) return;

        if (chainTokens.length > 0) {
          // ── STEP 2: enrich with Supabase off-chain metadata (image + description) ──
          const offChainMeta: Record<string, { description?: string; metadata_uri?: string }> = {};
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
          } catch {
            // Non-blocking: Supabase enrichment is optional
          }
          if (!isMounted) return;

          // ── STEP 3: chain is authoritative. Build the token list purely from chain
          //            state; only the description/image are taken off-chain. No
          //            Math.max, no local-only preservation — the chain decides. ──
          const merged: TokenItem[] = chainTokens.map(ct => {
            const addrLower = ct.address.toLowerCase();
            const meta = offChainMeta[addrLower] || {};
            return {
              address: ct.address,
              curve_address: ct.curve_address,
              name: ct.name,
              symbol: ct.symbol,
              metadata_uri: meta.metadata_uri || ct.metadata_uri || '/jollof.png',
              creator_wallet: ct.creator_wallet,
              raisedCngn: ct.raisedCngn,        // live realCngnReserve from the curve
              migrated: ct.migrated,            // live migrated() flag from the curve
              description: meta.description || `${ct.name} ($${ct.symbol}) — launched on Kobo!`
            };
          });
          setTokens(merged);
          localStorage.setItem('kobo_tokens', JSON.stringify(merged));

          // ── STEP 4: authoritative trade history from BondingCurve.Trade events ──
          // Fetch per-token Trade logs in parallel (bounded concurrency). This is the
          // same for every viewer, so a trade made on any account is visible to all.
          const CONCURRENCY = 4;
          const tradeMapNext: Record<string, TradeItem[]> = {};
          for (let i = 0; i < chainTokens.length; i += CONCURRENCY) {
            const batch = chainTokens.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.all(
              batch.map(async ct => {
                const addrLower = ct.address.toLowerCase();
                try {
                  const chainTrades = await getTradingHistoryFromChain(ct.address, ct.curve_address);
                  const items: TradeItem[] = chainTrades.map(tr => ({
                    id: tr.tx_hash,
                    token_address: ct.address,
                    trader_wallet: tr.trader_wallet,
                    side: tr.side,
                    cngn_amount: tr.cngn_amount,
                    token_amount: tr.token_amount,
                    price: tr.price,
                    timestamp: tr.timestamp,
                    tx_hash: tr.tx_hash
                  }));
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
        }
      } catch (e) {
        console.warn('[Kobo] Global chain sync notice:', e);
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
    // TokenFactory addresses there is nothing for other users to discover via
    // TokenLaunched events — so we refuse to fabricate a phantom address.
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
      // field once the chain sync overwrites this optimistic entry.
      creator_wallet: walletAddress || tokenAddr,
      migrated: false,
      raisedCngn: 0,
      description
    };

    // Optimistic local insert so the creator sees their token instantly; the 15s
    // chain sync will replace this with the authoritative on-chain record.
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

    // Instant same-browser hint → other tabs pull fresh chain state.
    broadcastRef.current?.postMessage({ type: 'LAUNCH', payload: { token: newToken } });

    // Off-chain metadata enrichment (image + description) — the token itself is
    // discovered on-chain, this only supplies what the event can't carry cheaply.
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

    return newToken;
  };

  const buyToken = async (tokenAddress: string, cngnAmount: number) => {
    const addrLower = tokenAddress.toLowerCase();
    const token = tokens.find(t => t.address.toLowerCase() === addrLower);
    const raised = token?.raisedCngn || 0;

    // A trade must be a real on-chain swap — otherwise it is invisible to every
    // other user (the chain sync is the single source of truth). Refuse to
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

    // Off-chain enrichment mirror only — the trade is authoritative on-chain via
    // the Trade event; this row just speeds up the UI before the next sync.
    try {
      const supabase = createSupabaseClient();
      supabase.from('trades').upsert({
        token_address: tokenAddress.toLowerCase(),
        trader_wallet: walletAddress,
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

    return { tokensOut: finalTokensOut, priceImpact: priceImpactPercent, txHash: newTrade.tx_hash };
  };

  const sellToken = async (tokenAddress: string, tokenAmount: number) => {
    const addrLower = tokenAddress.toLowerCase();
    const token = tokens.find(t => t.address.toLowerCase() === addrLower);
    const raised = token?.raisedCngn || 0;

    // Sells must settle on-chain too — a simulated sell would desync this account
    // from the shared chain state that every other user reads.
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

    // Off-chain enrichment mirror only — authoritative record is the Trade event.
    try {
      const supabase = createSupabaseClient();
      supabase.from('trades').upsert({
        token_address: tokenAddress.toLowerCase(),
        trader_wallet: walletAddress,
        side: 'sell',
        cngn_amount: Number(finalCngnOut.toFixed(2)),
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

