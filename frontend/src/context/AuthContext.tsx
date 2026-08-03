'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { TradeItem, DetailedMetrics, deriveTokenMetrics, quoteBuy, quoteSell, INITIAL_VIRTUAL_CNGN, INITIAL_VIRTUAL_TOKENS, MIGRATION_TARGET_CNGN } from '@/lib/metrics';
import { mintCngnOnChain, buyTokenOnChain, sellTokenOnChain, refreshTokenReserves, getAllTokensFromChain, getRecentTradesFromChain, ARC_RPC_URL, ChainTokenRecord } from '@/lib/onchain';
import { ethers } from 'ethers';

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

/** Map a chain-state token record (from getAllTokensFromChain) to a frontend TokenItem. */
function mapChainToken(t: ChainTokenRecord): TokenItem {
  return {
    address: t.address.toLowerCase(),
    curve_address: (t.curve_address || '').toLowerCase(),
    name: t.name || '',
    symbol: t.symbol || '',
    metadata_uri: t.metadata_uri || '/jollof.png',
    creator_wallet: (t.creator_wallet || '').toLowerCase(),
    migrated: Boolean(t.migrated),
    raisedCngn: Number(t.raisedCngn || 0),
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
  // immediate authoritative re-read from chain state, so other tabs update within a
  // beat rather than waiting for the next poll. Cross-browser / cross-device users
  // converge via the 15s poll regardless.
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  // Lets the instant-hint channel (BroadcastChannel) trigger an authoritative chain
  // re-read. Assigned by the chain-sync effect below.
  const chainSyncRef = useRef<{ run: () => void } | null>(null);
  // Per-token trade-tail cursor: the last block we've already scanned Trade events up
  // to. Seeded at first observation so each poll only tails the new block range (never
  // a from-block-0 scan). Keyed by lowercased curve address.
  const tradeCursorRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel('kobo_sync');
    broadcastRef.current = channel;

    channel.onmessage = (event: MessageEvent) => {
      const { type } = event.data || {};
      // Any launch/trade hint from another tab → re-read fresh authoritative chain state.
      if (type === 'TRADE' || type === 'LAUNCH') {
        chainSyncRef.current?.run();
      }
    };

    return () => { channel.close(); broadcastRef.current = null; };
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
        // No backend to reset — chain state re-reads authoritatively on the next poll.
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

  // Chain-state global sync — the Arc chain is the SINGLE source of truth, and EVERY
  // client reads it directly. This is the permanent fix for cross-account divergence:
  // there is no backend, no database, no per-browser log scan. Discovery enumerates
  // the factory's on-chain registry via paced/retried eth_call STATE reads
  // (getAllTokensCount → allTokens → tokenToCurve → tokenMetadataURI + live reserves),
  // the ONLY RPC pattern that works reliably on Arc at ~55M blocks. Because every
  // browser reads the identical on-chain state, every account sees the identical token
  // list, image, price, raised and migrated status.
  //
  // Trade HISTORY is tailed incrementally per curve from each client's first
  // observation forward (bounded block windows, never from block 0). Optimistic local
  // state is only a UX flash; the next chain read is authoritative.
  useEffect(() => {
    let isMounted = true;
    let inFlight = false;

    const fetchGlobalSync = async () => {
      if (inFlight) return; // coalesce overlapping polls / broadcast-triggered refreshes
      inFlight = true;
      try {
        // ── STEP 1: canonical token list straight from on-chain factory registry ──
        const chainTokens = await getAllTokensFromChain();
        if (!isMounted) return;

        // The chain is authoritative: adopt exactly what the registry returns. If it's
        // empty, there genuinely are no tokens (no `length > 0` guard needed — a real
        // launch is always in allTokens[] once its tx is mined).
        const merged: TokenItem[] = chainTokens.map(mapChainToken);
        setTokens(merged);
        localStorage.setItem('kobo_tokens', JSON.stringify(merged));

        // Resolve the current head once; every curve tail scans up to this block.
        let latestBlock = 0;
        try {
          const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
          latestBlock = await provider.getBlockNumber();
        } catch { /* tail readers fall back to their own getBlockNumber */ }

        // ── STEP 2: incremental Trade history per curve (bounded, never from block 0) ──
        // Seed each curve's cursor at first observation so we only ever tail the new
        // range. Merge fresh trades into the existing map, de-duping by tx composite key.
        const CONCURRENCY = 3;
        for (let i = 0; i < merged.length; i += CONCURRENCY) {
          const batch = merged.slice(i, i + CONCURRENCY);
          const batchResults = await Promise.all(
            batch.map(async tk => {
              const addrLower = tk.address.toLowerCase();
              const curveLower = (tk.curve_address || '').toLowerCase();
              if (!curveLower) return [addrLower, [] as TradeItem[]] as const;
              const cursor = tradeCursorRef.current[curveLower] || 0;
              try {
                const chainTrades = await getRecentTradesFromChain(curveLower, cursor, latestBlock);
                const items: TradeItem[] = chainTrades.map(tr => ({
                  id: tr.tx_hash || tr.id,
                  token_address: addrLower,
                  trader_wallet: tr.trader_wallet,
                  side: tr.side,
                  cngn_amount: tr.cngn_amount,
                  token_amount: tr.token_amount,
                  price: tr.price,
                  timestamp: tr.timestamp,
                  tx_hash: tr.tx_hash,
                }));
                // Advance the cursor so the next poll only tails newer blocks.
                if (latestBlock > 0) tradeCursorRef.current[curveLower] = latestBlock;
                return [addrLower, items] as const;
              } catch {
                return [addrLower, [] as TradeItem[]] as const;
              }
            })
          );
          if (!isMounted) return;
          // Merge this batch's fresh trades into the live map (append + de-dupe).
          setTradesMap(prev => {
            const next = { ...prev };
            for (const [addr, items] of batchResults) {
              if (items.length === 0) { if (!next[addr]) next[addr] = next[addr] || (prev[addr] || []); continue; }
              const existing = next[addr] || prev[addr] || [];
              const seen = new Set(existing.map(t => `${t.tx_hash}:${t.side}:${t.cngn_amount}:${t.token_amount}`));
              const additions = items.filter(t => !seen.has(`${t.tx_hash}:${t.side}:${t.cngn_amount}:${t.token_amount}`));
              next[addr] = [...additions, ...existing].sort((a, b) => b.timestamp - a.timestamp);
            }
            localStorage.setItem('kobo_trades', JSON.stringify(next));
            return next;
          });
        }
      } catch (e) {
        console.warn('[Kobo] Global chain sync notice:', e);
      } finally {
        inFlight = false;
      }
    };

    // Expose the runner so BroadcastChannel hints can trigger an immediate authoritative
    // chain re-read instead of writing their own (per-instance) optimistic state.
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
    // on-chain registry — so we refuse to fabricate a phantom address.
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
      // Store the FULL creator address so it matches the on-chain curve's creator
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

    // The image URL + name/symbol/description are already ON-CHAIN: the metadata URI
    // was stored in the factory's tokenMetadataURI at launch, and every client reads
    // it back via getAllTokensFromChain. No file store, no backend, nothing to keep
    // alive. Description is defaulted by the chain reader.

    return newToken;
  };

  const buyToken = async (tokenAddress: string, cngnAmount: number) => {
    const addrLower = tokenAddress.toLowerCase();
    const token = tokens.find(t => t.address.toLowerCase() === addrLower);
    const raised = token?.raisedCngn || 0;

    // A trade must be a real on-chain swap — otherwise it is invisible to every
    // other user (the chain is the single source of truth). Refuse to fabricate an
    // off-chain "simulated" fill.
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

    // Trigger an immediate authoritative chain re-sync so the trade shows for
    // everyone the moment it's mined (falls back to next 15s poll).
    chainSyncRef.current?.run();

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

    // Trigger an immediate authoritative chain re-sync so the sell shows for
    // everyone the moment it's mined (falls back to next 15s poll).
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
