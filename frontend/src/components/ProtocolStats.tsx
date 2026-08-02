'use client';

import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, Users, Rocket, Layers, ShieldCheck, Activity, BarChart3 } from 'lucide-react';

interface ProtocolStatsData {
  totalVolumeCngn: number;
  totalTrades: number;
  totalTokens: number;
  migratedTokens: number;
  uniqueTraders: number;
  uniqueDeployers: number;
  totalUniqueWallets: number;
  totalLiquidityLockedCngn: number;
  formatted: {
    volume: string;
    locked: string;
  };
}

function getBackendUrl() {
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return '';
  }
  return 'http://localhost:4000';
}

// Animated counter hook
function useCountUp(target: number, duration = 1200, started = false) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!started || target === 0) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const from = 0;

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setValue(Math.round(from + (target - from) * eased));
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
  suffix?: string;
  prefix?: string;
  format?: 'compact' | 'number';
  color: string;
  started: boolean;
}

function StatCard({ icon, label, value, suffix = '', prefix = '', format = 'number', color, started }: StatCardProps) {
  const counted = useCountUp(value, 1200, started);
  const display = format === 'compact' ? formatCompact(counted) : `${prefix}${counted.toLocaleString()}${suffix}`;

  return (
    <div className="flex items-center space-x-3 group">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color} transition-all group-hover:scale-110`}>
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
  const [stats, setStats] = useState<ProtocolStatsData | null>(null);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const fetchStats = async () => {
    try {
      const base = getBackendUrl();
      const res = await fetch(`${base}/api/stats`);
      if (!res.ok) return;
      const data: ProtocolStatsData = await res.json();
      setStats(data);
    } catch {
      // silently fail — stats are non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Poll every 30s for live updates
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Trigger count-up animation when element becomes visible
  useEffect(() => {
    if (!ref.current || started) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStarted(true); },
      { threshold: 0.2 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [started]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl border border-white/10 p-4 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 bg-white/5 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

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
      label: 'Graduated Tokens',
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

  return (
    <div ref={ref} className="glass-card rounded-2xl border border-white/10 p-4 sm:p-5 relative overflow-hidden">
      {/* subtle top glow line */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      {/* Header */}
      <div className="flex items-center space-x-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[11px] uppercase tracking-widest text-slate-400 font-grotesk font-bold">
          Live Protocol Stats · Arc Testnet
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
