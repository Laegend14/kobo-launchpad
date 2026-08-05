'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { TradeItem, DetailedMetrics, deriveTokenMetrics, quoteBuy, quoteSell, compareTradesDesc, INITIAL_VIRTUAL_CNGN, INITIAL_VIRTUAL_TOKENS, MIGRATION_TARGET_CNGN } from '@/lib/metrics';
import {
  mintCngnOnChain,
  burnCngnOnChain,
  getCngnBalanceOnChain,
  buyTokenOnChain,
  sellTokenOnChain,
  refreshTokenReserves,
  getAllTokensFromChain,
  getRecentTradesFromChainDetailed,
  getLatestBlockNumber,
  ARC_TESTNET_CHAIN_ID,
  ARC_RPC_URL,
  ARC_RPC_FALLBACKS,
  ARC_EXPLORER_URL,
  ChainTokenRecord,
} from '@/lib/onchain';

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
  /** True while the authoritative on-chain cNGN balance is being read. */
  isCngnBalanceSyncing: boolean;
  /** Re-reads the REAL ERC-20 cNGN balance from Arc for the connected wallet. */
  refreshCngnBalance: () => Promise<void>;
  depositNaira: (nairaAmount: number) => void;
  /**
   * Redeems cNGN (burns it on-chain) and credits the fiat Naira side.
   * Named `withdrawCngn` because it debits cNGN — the old `withdrawNaira` name
   * described the opposite of what it actually did.
   */
  withdrawCngn: (cngnAmount: number) => Promise<boolean>;
  swapNairaToCngn: (amount: number) => Promise<boolean>;
  swapCngnToNaira: (amount: number) => Promise<boolean>;
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
  // Naira is SIMULATED fiat (a mock bank balance), so a starting float is fine — it is
  // topped up by the Naira faucet in DepositModal.
  const [nairaBalance, setNairaBalance] = useState<number>(500000);
  // cNGN is a REAL ERC-20 on Arc. It is spent on-chain by every buy (approve +
  // curve.buy) and credited by every sell, so it must NEVER be a fabricated local
  // grant — it starts empty and is overwritten by the authoritative on-chain
  // balanceOf read. Users obtain cNGN by swapping Naira, which mints it on-chain.
  const [cngnBalance, setCngnBalance] = useState<number>(0);
  const [isCngnBalanceSyncing, setIsCngnBalanceSyncing] = useState<boolean>(false);
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
      if (typeof window !== 'undefined' && !localStorage.getItem('kobo_v7_fresh_purge')) {
        localStorage.removeItem('kobo_tokens');
        localStorage.removeItem('kobo_trades');
        localStorage.removeItem('kobo_user_holdings');
        localStorage.removeItem('kobo_v5_fresh_purge');
        localStorage.removeItem('kobo_v6_fresh_purge');
        localStorage.setItem('kobo_v7_fresh_purge', 'true');
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
      // Cached cNGN is only a first-paint placeholder — the authoritative balanceOf
      // read overwrites it moments later. Guard against a corrupted "NaN" entry, which
      // would otherwise render "₦NaN" and break every insufficient-balance check.
      if (savedBalance) {
        const parsed = parseFloat(savedBalance);
        if (Number.isFinite(parsed)) setCngnBalance(parsed);
      }
      if (savedNaira) {
        const parsed = parseFloat(savedNaira);
        if (Number.isFinite(parsed)) setNairaBalance(parsed);
      }
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

        // Merge on-chain registry tokens safely without ever allowing transient RPC glitches
        // or empty sync responses to wipe out existing valid tokens from the dashboard.
        setTokens(prev => {
          if (chainTokens.length === 0 && prev.length > 0) {
            // Keep existing valid tokens intact if RPC sync returns empty
            return prev;
          }

          const fromChainMap = new Map(chainTokens.map(t => [t.address.toLowerCase(), mapChainToken(t)]));
          const chainAddrs = new Set(chainTokens.map(t => t.address.toLowerCase()));

          // 1. Update existing tokens with fresh chain state (reserves, migration status)
          const updatedPrev = prev.map(p => {
            const fresh = fromChainMap.get(p.address.toLowerCase());
            if (fresh) {
              fromChainMap.delete(p.address.toLowerCase());
              return {
                ...p,
                ...fresh,
                description: p.description && !p.description.includes('— launched on Kobo!') ? p.description : fresh.description
              };
            }
            return p;
          });

          // 2. Add new tokens returned from chain that weren't in prev
          const newFromChain = Array.from(fromChainMap.values());

          // 3. Keep tokens that exist on chain OR fresh optimistic tokens (<3 mins old)
          const now = Date.now();
          const validPrev = updatedPrev.filter(p =>
            chainAddrs.has(p.address.toLowerCase()) ||
            (Boolean((p as any).isOptimistic) && (now - Number((p as any).createdAt || 0)) < 180000)
          );

          const merged = [...validPrev, ...newFromChain];
          localStorage.setItem('kobo_tokens', JSON.stringify(merged));
          return merged;
        });

        // Curves to tail come straight from the chain read — NOT from a variable assigned
        // inside the setTokens updater above. React may defer or (in StrictMode) double-invoke
        // an updater, so reading it out here raced: on the first poll it was still empty and
        // the trade tail iterated nothing, leaving trade history and every derived metric
        // blank until a later poll happened to win the race.
        const curvesToTail = chainTokens
          .filter(t => t.curve_address)
          .map(t => ({
            address: t.address.toLowerCase(),
            curve_address: t.curve_address.toLowerCase(),
            fromBlock: Number(t.fromBlock || 0),
          }));

        // Resolve the current head once; every curve tail scans up to this block.
        // Block NUMBER is the canonical clock on Arc (sub-second blocks make timestamps
        // ambiguous), so the sync cursor is denominated in blocks, not time.
        const latestBlock = await getLatestBlockNumber();

        // ── STEP 2: incremental Trade history per curve (bounded, never from block 0) ──
        // Seed each curve's cursor at first observation so we only ever tail the new
        // range. Merge fresh trades into the existing map, de-duping by tx composite key.
        const CONCURRENCY = 3;
        for (let i = 0; i < curvesToTail.length; i += CONCURRENCY) {
          const batch = curvesToTail.slice(i, i + CONCURRENCY);
          const batchResults = await Promise.all(
            batch.map(async (tk) => {
              const addrLower = tk.address;
              const curveLower = tk.curve_address;
              // Seed the cursor at the block where this client first observed the token, so
              // the very first tail starts at the token's own launch block instead of 0.
              const cursor = tradeCursorRef.current[curveLower] || tk.fromBlock || 0;
              try {
                const { trades: chainTrades, scannedToBlock } =
                  await getRecentTradesFromChainDetailed(curveLower, cursor, latestBlock);
                const items: TradeItem[] = chainTrades.map(tr => ({
                  // Keep the composite `${txHash}-${logIndex}` id: one transaction can
                  // emit several Trade logs, so the tx hash alone is not unique and
                  // collapsing to it silently dropped trades.
                  id: tr.id,
                  token_address: addrLower,
                  trader_wallet: tr.trader_wallet,
                  side: tr.side,
                  cngn_amount: tr.cngn_amount,
                  token_amount: tr.token_amount,
                  price: tr.price,
                  timestamp: tr.timestamp,
                  tx_hash: tr.tx_hash,
                  blockNumber: tr.blockNumber,
                  logIndex: tr.logIndex,
                }));
                // Advance the cursor to how far the scan ACTUALLY got — not blindly to
                // the head. A tail can stop short (RPC range limit / per-poll batch cap),
                // and jumping to `latestBlock` anyway would skip those blocks forever.
                // Arc has deterministic finality, so resuming from exactly here processes
                // every block once, with no rescan and no confirmation-depth delay.
                if (scannedToBlock > cursor) tradeCursorRef.current[curveLower] = scannedToBlock;
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
              const existing = next[addr] || prev[addr] || [];
              if (items.length === 0) { next[addr] = existing; continue; }

              // De-dupe on the composite (txHash, logIndex) id. The old key hashed the
              // amounts, so two identical-size trades in the same tx collapsed into one.
              const incomingIds = new Set(items.map((t: TradeItem) => String(t.id)));
              const incomingTxs = new Set(items.map((t: TradeItem) => (t.tx_hash || '').toLowerCase()));

              const kept = existing.filter((t: TradeItem) => {
                if (incomingIds.has(String(t.id))) return false;
                // An optimistic local trade (no blockNumber yet) is superseded the moment
                // its transaction shows up in a block — otherwise it lists twice.
                const isPending = typeof t.blockNumber !== 'number';
                if (isPending && incomingTxs.has((t.tx_hash || '').toLowerCase())) return false;
                return true;
              });

              // Newest first by BLOCK NUMBER, then logIndex. Sorting by timestamp put
              // same-second Arc trades in arbitrary order (and metrics read this array
              // positionally), which is why trading metrics came out wrong.
              next[addr] = [...items, ...kept].sort(compareTradesDesc);
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

  // ── cNGN BALANCE = REAL ON-CHAIN ERC-20 BALANCE ──────────────────────────────
  // cNGN is a live ERC-20 on Arc. Buys spend it (approve + curve.buy) and sells
  // credit it, so the number on screen has to come from `balanceOf`, not from a
  // localStorage counter. A local-only counter drifted from reality the instant a
  // transaction was rejected/failed, or when the same wallet was used on another
  // device — users then saw a healthy balance while trades reverted for insufficient
  // funds. Local writes remain as an optimistic flash; this read is authoritative.
  const refreshCngnBalance = useCallback(async () => {
    if (!walletAddress) return;
    setIsCngnBalanceSyncing(true);
    try {
      const onChain = await getCngnBalanceOnChain(walletAddress);
      // null = RPC hiccup, NOT an empty wallet. Keep the last known value rather than
      // flashing ₦0, which would look like the user's funds vanished.
      if (onChain === null) return;
      setCngnBalance(onChain);
      localStorage.setItem('kobo_balance', onChain.toString());
    } finally {
      setIsCngnBalanceSyncing(false);
    }
  }, [walletAddress]);

  // Keep the displayed cNGN balance reconciled with the chain: on wallet connect /
  // account switch, and on the same 15s cadence as the token sync.
  useEffect(() => {
    if (!walletAddress) {
      setCngnBalance(0);
      return;
    }
    refreshCngnBalance();
    const interval = setInterval(refreshCngnBalance, 15000);
    return () => clearInterval(interval);
  }, [walletAddress, refreshCngnBalance]);

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
          params: [{ chainId: ARC_TESTNET_CHAIN_ID }],
        });
      } catch (switchErr: any) {
        if (switchErr.code === 4902 || switchErr?.data?.originalError?.code === 4902) {
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: ARC_TESTNET_CHAIN_ID,
              chainName: 'Arc Testnet',
              // Arc's native currency IS USDC (18 decimals as the gas token).
              nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
              rpcUrls: [ARC_RPC_URL, ...ARC_RPC_FALLBACKS],
              blockExplorerUrls: [ARC_EXPLORER_URL],
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

  /**
   * Credits the SIMULATED fiat Naira balance (the mock bank account).
   *
   * Naira has no on-chain representation — it is the fiat leg of the ramp. Guarded
   * against NaN/Infinity/negative input so a malformed field value can never corrupt
   * the persisted balance into "NaN" (which then parses back as NaN forever).
   */
  const depositNaira = (nairaAmount: number) => {
    if (!Number.isFinite(nairaAmount) || nairaAmount <= 0) return;
    setNairaBalance(prev => {
      const next = prev + nairaAmount;
      localStorage.setItem('kobo_naira_balance', next.toString());
      return next;
    });
  };

  /**
   * Redeems cNGN: burns the real ERC-20 on Arc, then credits the fiat Naira side.
   *
   * The old `withdrawNaira` only decremented a localStorage number — the on-chain
   * cNGN was never destroyed, so the "withdrawn" balance reappeared on the next
   * authoritative balanceOf read and the user could spend the same cNGN twice.
   */
  const withdrawCngn = async (cngnAmount: number): Promise<boolean> => {
    if (!Number.isFinite(cngnAmount) || cngnAmount <= 0) return false;
    if (cngnBalance < cngnAmount) return false;
    if (!walletAddress) return false;

    await burnCngnOnChain(walletAddress, cngnAmount);
    await refreshCngnBalance();

    setNairaBalance(prev => {
      const next = prev + cngnAmount;
      localStorage.setItem('kobo_naira_balance', next.toString());
      return next;
    });
    return true;
  };

  /**
   * Naira ➔ cNGN (1:1). Debits simulated fiat and MINTS real cNGN on Arc.
   *
   * The mint is awaited, not fire-and-forget. Previously the local cNGN counter was
   * credited immediately and `mintCngnOnChain` was left to fail silently in a
   * `.catch(console.warn)` — so a rejected signature still "gave" the user cNGN that
   * did not exist on-chain, and their next buy reverted. Now the Naira debit is only
   * committed once the mint is actually mined, and the resulting balance is read back
   * from the chain rather than assumed.
   */
  const swapNairaToCngn = async (amount: number): Promise<boolean> => {
    if (!Number.isFinite(amount) || amount <= 0) return false;
    if (nairaBalance < amount) return false;
    if (!walletAddress) {
      throw new Error("Connect a wallet on Arc Testnet to mint cNGN.");
    }

    await mintCngnOnChain(walletAddress, amount);

    setNairaBalance(prev => {
      const next = prev - amount;
      localStorage.setItem('kobo_naira_balance', next.toString());
      return next;
    });
    await refreshCngnBalance();
    return true;
  };

  /**
   * cNGN ➔ Naira (1:1). Burns real cNGN on Arc, then credits simulated fiat.
   * Symmetric with swapNairaToCngn — otherwise on-chain cNGN supply only ever grew.
   */
  const swapCngnToNaira = async (amount: number): Promise<boolean> => {
    if (!Number.isFinite(amount) || amount <= 0) return false;
    if (cngnBalance < amount) return false;
    if (!walletAddress) {
      throw new Error("Connect a wallet on Arc Testnet to redeem cNGN.");
    }

    await burnCngnOnChain(walletAddress, amount);
    await refreshCngnBalance();

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
      description,
      isOptimistic: true,
      createdAt: Date.now()
    } as any;

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

    // Optimistic debit for instant feedback; the on-chain balanceOf read below is
    // authoritative and corrects it (the curve also takes a 1% creator fee, so the
    // exact settled amount is whatever the chain says — never assume).
    setCngnBalance(prev => {
      const next = Math.max(0, prev - cngnAmount);
      localStorage.setItem('kobo_balance', next.toString());
      return next;
    });
    refreshCngnBalance();

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

    // Optimistic credit; reconciled against the real ERC-20 balance right after.
    setCngnBalance(prev => {
      const next = prev + finalCngnOut;
      localStorage.setItem('kobo_balance', next.toString());
      return next;
    });
    refreshCngnBalance();

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
        isCngnBalanceSyncing,
        refreshCngnBalance,
        depositNaira,
        withdrawCngn,
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
