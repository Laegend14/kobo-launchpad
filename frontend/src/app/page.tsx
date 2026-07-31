'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Search, Sparkles, TrendingUp, ShieldCheck, Flame, PlusCircle, ArrowUpRight } from 'lucide-react';
import CurveProgressBar from '@/components/CurveProgressBar';
import { useAuth } from '@/context/AuthContext';

export default function HomeFeedPage() {
  const { tokens, isLoggedIn, login, getTokenMetrics } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'bonding' | 'migrated'>('all');

  const filteredTokens = tokens.filter(token => {
    const matchesSearch =
      token.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      token.symbol.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;
    if (filter === 'bonding') return !token.migrated;
    if (filter === 'migrated') return token.migrated;
    return true;
  });

  return (
    <div className="space-y-8 font-grotesk">
      
      {/* Hero Section */}
      <div className="glass-card rounded-3xl p-6 sm:p-10 border border-emerald-500/20 relative overflow-hidden bg-gradient-to-br from-emerald-500/10 via-transparent to-cyan-500/10">
        <div className="max-w-2xl space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[#00E676] text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Naira-Native Memecoin Protocol</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
            Create, Buy & Sell Memecoins Priced in <span className="gradient-text">cNGN Stablecoin</span>
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 font-inter leading-relaxed">
            Instant 1:1 Naira NGN to cNGN bank deposits on Arc Testnet. 100% fair-launch bonding curves that automatically migrate liquidity to Uniswap V2 AMM pools at 50,000 cNGN raised.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/create"
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-xs sm:text-sm flex items-center space-x-2 shadow-lg shadow-emerald-500/20 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Launch a Memecoin</span>
            </Link>

            {!isLoggedIn && (
              <button
                onClick={() => login()}
                className="px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs sm:text-sm transition-all"
              >
                Connect Wallet / Login
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Controls Bar: Search & Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search memecoin name or symbol..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-xs outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-2 bg-[#0A0E17] p-1 rounded-xl border border-white/10 text-xs w-full sm:w-auto">
          {[
            { id: 'all', label: 'All Tokens' },
            { id: 'bonding', label: '🔥 Active Curves' },
            { id: 'migrated', label: '🛡️ Graduated (Uniswap)' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                filter === tab.id
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

      </div>

      {/* Memecoins Grid */}
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
                        <h3 className="font-bold text-white text-base group-hover:text-[#00E676] transition-colors">
                          {t.name}
                        </h3>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-[#00E676] border border-emerald-500/20">
                          ${t.symbol}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-inter">
                        by <span className="font-mono text-slate-300">{t.creator_wallet}</span>
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

    </div>
  );
}
