'use client';

import React from 'react';
import Link from 'next/link';
import { Flame, CheckCircle, ArrowRight, ShieldAlert } from 'lucide-react';
import CurveProgressBar from './CurveProgressBar';

interface TokenCardProps {
  token: {
    address: string;
    curve_address: string;
    name: string;
    symbol: string;
    metadata_uri?: string;
    creator_wallet: string;
    migrated?: boolean;
    progressPercent?: number;
    raisedCngn?: number;
    marketCapNaira?: string;
    volume24hNaira?: string;
  };
}

export default function TokenCard({ token }: TokenCardProps) {
  const imageSrc = token.metadata_uri || "https://images.unsplash.com/photo-1622979135225-d2ba269bc1bd?w=400";
  const raised = token.raisedCngn || (token.migrated ? 50000 : 22500);

  return (
    <div className="glass-card glass-card-hover rounded-2xl p-5 border border-white/10 flex flex-col justify-between group">
      <div>
        {/* Token Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <img
              src={imageSrc}
              alt={token.name}
              className="w-12 h-12 rounded-xl object-cover border border-white/10 group-hover:scale-105 transition-transform"
            />
            <div>
              <h3 className="font-grotesk font-bold text-lg text-white group-hover:text-[#00E676] transition-colors leading-tight">
                {token.name}
              </h3>
              <span className="font-grotesk font-semibold text-xs text-[#00E676] bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                ${token.symbol}
              </span>
            </div>
          </div>

          {token.migrated ? (
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-[#00E676] border border-emerald-500/30 text-[10px] font-grotesk font-bold flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Graduated
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-[#FFD700] border border-amber-500/20 text-[10px] font-grotesk font-bold flex items-center gap-1">
              <Flame className="w-3 h-3 animate-pulse" /> Bonding
            </span>
          )}
        </div>

        {/* Financial Metrics */}
        <div className="grid grid-cols-2 gap-2 mb-4 bg-[#0A0E17] rounded-xl p-3 border border-white/5 text-xs font-grotesk">
          <div>
            <span className="text-slate-400 block text-[10px]">Market Cap</span>
            <span className="font-bold text-white text-sm">{token.marketCapNaira || '₦42,500,000'}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">24h Volume</span>
            <span className="font-bold text-[#00E676] text-sm">{token.volume24hNaira || '₦18,200,000'}</span>
          </div>
        </div>

        {/* Bonding Curve Progress */}
        <div className="mb-4">
          <CurveProgressBar raisedCngn={raised} threshold={50000} migrated={token.migrated} />
        </div>
      </div>

      {/* Footer Creator & Trade CTA */}
      <div className="pt-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-[11px] text-slate-400 font-mono">
          by {token.creator_wallet.substring(0, 6)}...
        </span>

        <Link
          href={`/token/${token.address}`}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-grotesk font-bold text-xs flex items-center space-x-1 shadow-md shadow-emerald-500/20 transition-all hover:scale-105"
        >
          <span>Trade Token</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
