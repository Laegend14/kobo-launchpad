'use client';

import React from 'react';
import Link from 'next/link';
import { Trophy, Flame, CheckCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function LeaderboardPage() {
  const { tokens, getTokenMetrics } = useAuth();

  const leaderboard = tokens.map((token, idx) => {
    const metrics = getTokenMetrics(token.address);
    return {
      rank: idx + 1,
      name: token.name,
      symbol: token.symbol,
      volume24h: metrics.formattedVolume24hNaira,
      marketCap: metrics.formattedMarketCapNaira,
      holders: metrics.holderCount,
      migrated: metrics.migrated,
      address: token.address
    };
  });

  return (
    <div className="space-y-6 font-grotesk">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[#FFD700]">
          <Trophy className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-grotesk font-bold text-2xl text-white">Memecoin Leaderboard</h1>
          <p className="text-xs text-slate-400 font-inter">Top performing Naira memecoins by 24h volume and market cap</p>
        </div>
      </div>

      <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-[#0A0E17] text-xs font-grotesk font-bold text-slate-400">
                <th className="py-3.5 px-4">Rank</th>
                <th className="py-3.5 px-4">Token</th>
                <th className="py-3.5 px-4">24h Volume</th>
                <th className="py-3.5 px-4">Market Cap</th>
                <th className="py-3.5 px-4">Holders</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-grotesk text-sm">
              {leaderboard.map((item) => (
                <tr key={item.address} className="hover:bg-white/5 transition-colors">
                  <td className="py-4 px-4 font-bold text-amber-400">#{item.rank}</td>
                  <td className="py-4 px-4 font-bold text-white">
                    <div className="flex items-center space-x-2">
                      <span>{item.name}</span>
                      <span className="text-xs text-[#00E676] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                        ${item.symbol}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-[#00E676] font-semibold">{item.volume24h}</td>
                  <td className="py-4 px-4 text-slate-200">{item.marketCap}</td>
                  <td className="py-4 px-4 text-slate-400">{item.holders.toLocaleString()}</td>
                  <td className="py-4 px-4">
                    {item.migrated ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-[#00E676] border border-emerald-500/30 text-xs font-bold inline-flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> AMM Graduated
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-[#FFD700] border border-amber-500/20 text-xs font-bold inline-flex items-center gap-1">
                        <Flame className="w-3 h-3 animate-pulse" /> Bonding Curve
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <Link
                      href={`/token/${item.address}`}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-[#00E676] border border-emerald-500/30 text-xs font-bold inline-flex items-center space-x-1 transition-all"
                    >
                      <span>Trade</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

