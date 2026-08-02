'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { ExternalLink, Github, Sparkles, ShieldCheck, Layers, TrendingUp, Users, Rocket } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n.toLocaleString()}`;
}

export default function Footer() {
  const { tokens, tradesMap } = useAuth();

  // Compute stats from client-side state (localStorage-backed, always accurate)
  const stats = useMemo(() => {
    const allTrades = Object.values(tradesMap).flat();
    const totalVolumeCngn = allTrades.reduce((acc, tr) => acc + Math.abs(tr.cngn_amount || 0), 0);
    const totalRaisedCngn = tokens.reduce((acc, t) => acc + Math.max(0, t.raisedCngn ?? 0), 0);

    const traderWallets = new Set(allTrades.map(tr => tr.trader_wallet?.toLowerCase()).filter((w): w is string => Boolean(w)));
    const deployerWallets = new Set(tokens.map(t => t.creator_wallet?.toLowerCase()).filter((w): w is string => Boolean(w)));
    const allWalletsArr = Array.from(traderWallets);
    deployerWallets.forEach(w => allWalletsArr.push(w));
    const allWallets = new Set(allWalletsArr);

    return {
      totalVolumeCngn: Math.round(Math.max(totalVolumeCngn, totalRaisedCngn)),
      totalTrades: allTrades.length,
      totalTokens: tokens.length,
      totalUniqueWallets: allWallets.size,
    };
  }, [tokens, tradesMap]);

  return (
    <footer className="border-t border-white/10 bg-[#070a10] pt-12 pb-8 font-grotesk">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          {/* Col 1: Brand */}
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center space-x-3">
              <img
                src="/kobo-logo.png"
                alt="KOBO Logo"
                className="w-8 h-8 rounded-xl object-contain bg-white/10 p-0.5 border border-white/20"
              />
              <span className="font-bold text-xl text-white tracking-tight">KOBO Launchpad</span>
            </div>
            <p className="text-xs text-slate-400 font-inter leading-relaxed">
              Nigeria’s native memecoin launchpad on Arc Testnet. 100% fair-launch bonding curves settled in cNGN with automated Uniswap V2 liquidity migration.
            </p>
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[#00E676] text-[10px] font-bold">
              <ShieldCheck className="w-3 h-3" />
              <span>Chain ID 5042002 · Arc Testnet</span>
            </div>
          </div>

          {/* Col 2: Testnet Faucets */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Gas &amp; Faucets</h4>
            <ul className="space-y-2 text-xs font-inter">
              <li>
                <a
                  href="https://faucet.circle.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 font-bold inline-flex items-center space-x-1.5 transition-colors group"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span>Circle Arc Faucet (faucet.circle.com)</span>
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </a>
              </li>
              <li>
                <a
                  href="https://testnet.arcscan.app"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 hover:text-white inline-flex items-center space-x-1.5 transition-colors"
                >
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  <span>ArcScan Block Explorer</span>
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Protocol Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Open Source &amp; Code</h4>
            <ul className="space-y-2 text-xs font-inter">
              <li>
                <a
                  href="https://github.com/Laegend14/kobo-launchpad"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 font-bold inline-flex items-center space-x-1.5 transition-colors group"
                >
                  <Github className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span>GitHub Repo (Laegend14/kobo-launchpad)</span>
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </a>
              </li>
              <li>
                <Link href="/create" className="text-slate-400 hover:text-white transition-colors">
                  Launch Memecoin
                </Link>
              </li>
              <li>
                <Link href="/leaderboard" className="text-slate-400 hover:text-white transition-colors">
                  Protocol Leaderboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Network Specs */}
          <div className="space-y-3 text-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Arc Network Parameters</h4>
            <div className="p-3 rounded-xl bg-[#0A0E17] border border-white/10 space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between text-slate-400">
                <span>Chain ID:</span>
                <span className="text-white font-bold">5042002 (0x4cef52)</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Native Gas:</span>
                <span className="text-cyan-400 font-bold">USDC (18 dec)</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>RPC URL:</span>
                <span className="text-emerald-400 font-bold truncate ml-2">rpc.testnet.arc.io</span>
              </div>
            </div>
          </div>

        </div>

        {/* Compact Live Stats Strip */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-white/5 border border-white/10">
            <div className="flex items-center space-x-2 text-xs">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <div>
                <span className="text-slate-500 block text-[10px]">Total Volume</span>
                <span className="font-bold text-white font-mono">{formatCompact(stats.totalVolumeCngn)}</span>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <Rocket className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <div>
                <span className="text-slate-500 block text-[10px]">Tokens Launched</span>
                <span className="font-bold text-white font-mono">{stats.totalTokens.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <Users className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <div>
                <span className="text-slate-500 block text-[10px]">Unique Wallets</span>
                <span className="font-bold text-white font-mono">{stats.totalUniqueWallets.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <div>
                <span className="text-slate-500 block text-[10px]">Total Trades</span>
                <span className="font-bold text-white font-mono">{stats.totalTrades.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-inter">
          <p>© 2026 KOBO Protocol. Built for Arc Testnet.</p>
          
          <div className="flex items-center space-x-4">
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-cyan-300 font-bold transition-colors inline-flex items-center space-x-1"
            >
              <span>Circle Faucet</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <a
              href="https://github.com/Laegend14/kobo-launchpad"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-emerald-300 font-bold transition-colors inline-flex items-center space-x-1"
            >
              <Github className="w-3.5 h-3.5" />
              <span>GitHub</span>
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
}
