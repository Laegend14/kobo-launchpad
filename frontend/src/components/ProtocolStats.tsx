'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TrendingUp, Users, Rocket, Layers, ShieldCheck, Activity, BarChart3 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

// Animated counter hook
function useCountUp(target: number, duration = 1200, started = false) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!started) return;
    if (target === 0) { setValue(0); return; }

    const start = performance.now();

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, started, duration]);

  return value;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${n.toLocaleString('en-NG')}`;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  format?: 'compact' | 'number';
  color: string;
  started: boolean;
}

function StatCard({ icon, label, value, format = 'number', color, started }: StatCardProps) {
  const counted = useCountUp(value, 1400, started);
  const display = format === 'compact' ? formatCompact(counted) : counted.toLocaleString();

  return (
    <div className="flex items-center space-x-3 group">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color} transition-all group-hover:scale-110 duration-200`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-grotesk">{label}</p>
        <p className="text-sm font-bold text-white font-mono leading-tight">{display}</p>
      </div>
    </div>
  );
}

export default function ProtocolStats() {
  const { tokens, tradesMap } = useAuth();
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Trigger count-up when panel scrolls into view
  useEffect(() => {
    if (!ref.current || started) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStarted(true); },
      { threshold: 0.2 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [started]);

  // Re-trigger animation when data first loads
  useEffect(() => {
    if (tokens.length > 0 && !started) {
      setStarted(true);
    }
  }, [tokens.length]);

  // Compute all stats from client-side state (authoritative — backed by localStorage)
  const stats = useMemo(() => {
    // All trades flattened from tradesMap
    const allTrades = Object.values(tradesMap).flat();

    // Total cNGN volume = sum of absolute cngn_amount across all trades
    const totalVolumeCngn = allTrades.reduce((acc, tr) => {
      const amt = typeof tr.cngn_amount === 'number' ? Math.abs(tr.cngn_amount) : 0;
      return acc + (isNaN(amt) ? 0 : amt);
    }, 0);

    // Also sum raisedCngn from tokens as a floor (captures buys even if tradesMap is sparse)
    const totalRaisedCngn = tokens.reduce((acc, t) => acc + Math.max(0, t.raisedCngn ?? 0), 0);

    // Use the larger of the two as the best volume estimate
    const bestVolume = Math.max(totalVolumeCngn, totalRaisedCngn);

    // Unique traders (from tradesMap — trader_wallet field)
    const traderWallets = new Set<string>();
    allTrades.forEach(tr => {
      if (tr.trader_wallet) traderWallets.add(tr.trader_wallet.toLowerCase());
    });

    // Unique deployers (creator wallets on tokens)
    const deployerWallets = new Set<string>();
    tokens.forEach(t => {
      if (t.creator_wallet) deployerWallets.add(t.creator_wallet.toLowerCase());
    });

    // Combined unique wallets (union of traders + deployers)
    const allWalletsArr = Array.from(traderWallets);
    deployerWallets.forEach(w => allWalletsArr.push(w));
    const allWallets = new Set(allWalletsArr);

    // Graduated tokens
    const migratedTokens = tokens.filter(t => t.migrated).length;

    return {
      totalVolumeCngn: Math.round(bestVolume),
      totalTrades: allTrades.length,
      totalTokens: tokens.length,
      migratedTokens,
      uniqueTraders: traderWallets.size,
      uniqueDeployers: deployerWallets.size,
      totalUniqueWallets: allWallets.size,
      totalLiquidityLockedCngn: Math.round(totalRaisedCngn),
    };
  }, [tokens, tradesMap]);

  const statItems = [
    {
      icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
      label: 'Total Volume',
      value: stats.totalVolumeCngn,
      format: 'compact' as const,
      color: 'bg-emerald-500/10 border border-emerald-500/20',
    },
    {
      icon: <Activity className="w-4 h-4 text-cyan-400" />,
      label: 'Total Trades',
      value: stats.totalTrades,
      format: 'number' as const,
      color: 'bg-cyan-500/10 border border-cyan-500/20',
    },
    {
      icon: <Rocket className="w-4 h-4 text-amber-400" />,
      label: 'Tokens Launched',
      value: stats.totalTokens,
      format: 'number' as const,
      color: 'bg-amber-500/10 border border-amber-500/20',
    },
    {
      icon: <Users className="w-4 h-4 text-violet-400" />,
      label: 'Unique Wallets',
      value: stats.totalUniqueWallets,
      format: 'number' as const,
      color: 'bg-violet-500/10 border border-violet-500/20',
    },
    {
      icon: <BarChart3 className="w-4 h-4 text-rose-400" />,
      label: 'Traders',
      value: stats.uniqueTraders,
      format: 'number' as const,
      color: 'bg-rose-500/10 border border-rose-500/20',
    },
    {
      icon: <Layers className="w-4 h-4 text-sky-400" />,
      label: 'Deployers',
      value: stats.uniqueDeployers,
      format: 'number' as const,
      color: 'bg-sky-500/10 border border-sky-500/20',
    },
    {
      icon: <ShieldCheck className="w-4 h-4 text-lime-400" />,
      label: 'Graduated',
      value: stats.migratedTokens,
      format: 'number' as const,
      color: 'bg-lime-500/10 border border-lime-500/20',
    },
    {
      icon: <TrendingUp className="w-4 h-4 text-orange-400" />,
      label: 'Curve Liquidity',
      value: stats.totalLiquidityLockedCngn,
      format: 'compact' as const,
      color: 'bg-orange-500/10 border border-orange-500/20',
    },
  ];

  // Render stat cards cleanly even when starting from 0 tokens

  return (
    <div ref={ref} className="glass-card rounded-2xl border border-white/10 p-4 sm:p-5 relative overflow-hidden">
      {/* Subtle top glow line */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] uppercase tracking-widest text-slate-400 font-grotesk font-bold">
            Live Protocol Stats · Arc Testnet
          </span>
        </div>
        <span className="text-[10px] text-slate-600 font-inter hidden sm:block">
          Source: on-chain + local cache
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5">
        {statItems.map((s) => (
          <StatCard key={s.label} {...s} started={started} />
        ))}
      </div>
    </div>
  );
}
