'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Search, Sparkles, Flame, PlusCircle, ArrowUpRight,
  X, TrendingUp, ShieldCheck, Hash
} from 'lucide-react';
import CurveProgressBar from '@/components/CurveProgressBar';
import ProtocolStats from '@/components/ProtocolStats';
import { useAuth } from '@/context/AuthContext';

function highlight(text: string, query: string) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-emerald-500/30 text-emerald-300 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function HomeFeedPage() {
  const { tokens, isLoggedIn, login, connectRealWeb3Wallet, getTokenMetrics } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'bonding' | 'migrated'>('all');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const matchesSearch = (token: typeof tokens[0]) =>
    token.name.toLowerCase().includes(normalizedSearch) ||
    token.symbol.toLowerCase().includes(normalizedSearch) ||
    token.address.toLowerCase().includes(normalizedSearch) ||
    (token.creator_wallet || '').toLowerCase().includes(normalizedSearch);

  // Dropdown: top 6 quick results (search term > 0)
  const dropdownResults = normalizedSearch.length > 0
    ? tokens.filter(matchesSearch).slice(0, 6)
    : [];

  // Main grid: filtered + searched
  const filteredTokens = tokens.filter(token => {
    if (normalizedSearch && !matchesSearch(token)) return false;
    if (filter === 'bonding') return !token.migrated;
    if (filter === 'migrated') return token.migrated;
    return true;
  });

  const clearSearch = () => {
    setSearchTerm('');
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-8 font-grotesk">

      {/* Hero Section */}
      <div className="glass-card rounded-3xl p-6 sm:p-10 border border-emerald-500/20 relative overflow-hidden bg-gradient-to-br from-emerald-500/10 via-transparent to-cyan-500/10">
        <div className="max-w-3xl space-y-5">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[#00E676] text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Naira-Native Memecoin Protocol · Arc Testnet</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
            Create, Buy &amp; Sell Memecoins Priced in <span className="gradient-text">cNGN Stablecoin</span>
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 font-inter leading-relaxed max-w-xl">
            Instant 1:1 Naira NGN to cNGN deposits. 100% fair-launch bonding curves that auto-migrate to Uniswap V2 at 50,000 cNGN raised.
          </p>

          {/* ── PROMINENT HERO SEARCH BAR ── */}
          <div ref={searchRef} className="relative w-full max-w-xl">
            <div className={`flex items-center w-full rounded-2xl border transition-all duration-200 overflow-hidden ${
              showDropdown && dropdownResults.length > 0
                ? 'border-emerald-500 shadow-lg shadow-emerald-500/20 rounded-b-none'
                : 'border-white/20 hover:border-white/30 focus-within:border-emerald-500 focus-within:shadow-lg focus-within:shadow-emerald-500/20'
            } bg-[#0A0E17]`}>
              <Search className="w-5 h-5 text-emerald-400 ml-4 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search by name, symbol, or contract address..."
                className="flex-1 py-3.5 px-3 bg-transparent text-white text-sm outline-none placeholder:text-slate-500 font-inter"
              />
              {searchTerm && (
                <button onClick={clearSearch} className="mr-3 text-slate-400 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
              <span className="mr-4 text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-400 font-mono shrink-0 hidden sm:block">
                ⌘K
              </span>
            </div>

            {/* Instant Results Dropdown */}
            {showDropdown && dropdownResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-[#0D1220] border border-emerald-500/40 border-t-0 rounded-b-2xl z-50 divide-y divide-white/5 shadow-2xl shadow-emerald-900/30 overflow-hidden">
                {dropdownResults.map(t => {
                  const isAddress = normalizedSearch.startsWith('0x');
                  return (
                    <Link
                      key={t.address}
                      href={`/token/${t.address}`}
                      onClick={() => setShowDropdown(false)}
                      className="flex items-center space-x-3 px-4 py-3 hover:bg-emerald-500/10 transition-colors group"
                    >
                      <img
                        src={t.metadata_uri || '/jollof.png'}
                        alt={t.name}
                        className="w-9 h-9 rounded-xl object-cover border border-white/10 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white text-sm">{highlight(t.name, searchTerm)}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-[#00E676] border border-emerald-500/20">
                            ${highlight(t.symbol, searchTerm)}
                          </span>
                          {t.migrated && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
                              Graduated
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono truncate">
                          {isAddress
                            ? highlight(t.address, searchTerm)
                            : `${t.address.slice(0, 10)}...${t.address.slice(-6)}`}
                        </p>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 shrink-0 transition-colors" />
                    </Link>
                  );
                })}
                {tokens.filter(matchesSearch).length > 6 && (
                  <div className="px-4 py-2.5 text-[11px] text-slate-400 font-inter text-center">
                    +{tokens.filter(matchesSearch).length - 6} more results below ↓
                  </div>
                )}
              </div>
            )}

            {showDropdown && normalizedSearch.length > 0 && dropdownResults.length === 0 && (
              <div className="absolute top-full left-0 right-0 bg-[#0D1220] border border-emerald-500/40 border-t-0 rounded-b-2xl z-50 shadow-2xl px-4 py-4 text-center">
                <p className="text-slate-400 text-sm">No coins found for <span className="text-white font-mono">"{searchTerm}"</span></p>
                <p className="text-[11px] text-slate-500 font-inter mt-1">Try searching by contract address (0x...)</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/create"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-xs sm:text-sm flex items-center space-x-2 shadow-lg shadow-emerald-500/20 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Launch a Memecoin</span>
            </Link>

            {!isLoggedIn && (
              <button
                onClick={() => connectRealWeb3Wallet().catch(() => login())}
                className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs sm:text-sm transition-all"
              >
                Connect Web3 Wallet
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Protocol Statistics */}
      <ProtocolStats />

      {/* Controls Bar: Filter Tabs + Result Count */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">

        {/* Filter Pills */}
        <div className="flex items-center space-x-2 bg-[#0A0E17] p-1 rounded-xl border border-white/10 text-xs w-full sm:w-auto">
          {[
            { id: 'all', label: 'All Tokens', icon: <Hash className="w-3 h-3" /> },
            { id: 'bonding', label: '🔥 Active Curves', icon: null },
            { id: 'migrated', label: '🛡️ Graduated', icon: null }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center space-x-1.5 ${
                filter === tab.id
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Result count */}
        <div className="text-xs text-slate-400 font-inter flex items-center space-x-2 shrink-0">
          {normalizedSearch && (
            <span className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[#00E676] font-bold">
              {filteredTokens.length} result{filteredTokens.length !== 1 ? 's' : ''} for "{searchTerm}"
            </span>
          )}
          <span className="text-slate-500">{tokens.length} total token{tokens.length !== 1 ? 's' : ''} on-chain</span>
        </div>
      </div>

      {/* Memecoins Grid */}
      {filteredTokens.length === 0 ? (
        <div className="glass-card rounded-3xl p-12 text-center space-y-4 border border-white/10">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-[#00E676] mx-auto">
            {normalizedSearch ? <Search className="w-7 h-7" /> : <Flame className="w-7 h-7" />}
          </div>
          {normalizedSearch ? (
            <>
              <h3 className="text-xl font-bold text-white">No coins match "{searchTerm}"</h3>
              <p className="text-xs text-slate-400 font-inter max-w-sm mx-auto">
                Try searching by contract address (0x...) or a different name/symbol.
              </p>
              <button
                onClick={clearSearch}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold transition-all"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear Search</span>
              </button>
            </>
          ) : (
            <>
              <h3 className="text-xl font-bold text-white">No Memecoins Active Yet</h3>
              <p className="text-xs text-slate-400 font-inter max-w-sm mx-auto">
                Be the very first creator to launch a Naira-native memecoin on-chain on Arc Testnet!
              </p>
              <Link
                href="/create"
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Launch First Memecoin</span>
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTokens.map((t) => {
            const metrics = getTokenMetrics(t.address);

            return (
              <Link
                key={t.address}
                href={`/token/${t.address}`}
                className="glass-card rounded-2xl p-5 border border-white/10 hover:border-emerald-500/40 transition-all group flex flex-col justify-between space-y-4 hover:-translate-y-1 shadow-lg"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <img
                        src={t.metadata_uri || "/jollof.png"}
                        alt={t.name}
                        className="w-12 h-12 rounded-xl object-cover border border-white/10 group-hover:scale-105 transition-transform"
                      />
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-bold text-[#00E676] text-base">
                            {highlight(t.name, searchTerm)}
                          </h3>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-[#00E676] border border-emerald-500/20">
                            ${highlight(t.symbol, searchTerm)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-inter">
                          by <span className="font-mono text-slate-300">{t.creator_wallet}</span>
                        </p>
                        <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                          {t.address.slice(0, 8)}...{t.address.slice(-6)}
                        </p>
                      </div>
                    </div>

                    <ArrowUpRight className="w-5 h-5 text-slate-500 group-hover:text-[#00E676] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                      <span className="text-[10px] text-slate-400 block">Market Cap</span>
                      <span className="font-bold text-white">{metrics.formattedMarketCapNaira}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                      <span className="text-[10px] text-[#00E676] block">24h Vol</span>
                      <span className="font-bold text-white">{metrics.formattedVolume24hNaira}</span>
                    </div>
                  </div>
                </div>

                {/* Bonding Curve Progress */}
                <div className="pt-2 border-t border-white/5">
                  <CurveProgressBar raisedCngn={metrics.liquidityCngn} threshold={50000} migrated={metrics.migrated} />
                </div>
              </Link>
            );
          })}
        </div>
      )}

    </div>
  );
}
