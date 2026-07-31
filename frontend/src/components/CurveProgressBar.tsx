'use client';

import React from 'react';
import { Flame, CheckCircle, Sparkles } from 'lucide-react';

interface CurveProgressBarProps {
  raisedCngn: number;
  threshold?: number;
  migrated?: boolean;
}

export default function CurveProgressBar({
  raisedCngn,
  threshold = 50000,
  migrated = false
}: CurveProgressBarProps) {
  const percent = migrated ? 100 : Math.min(100, Math.max(0, (raisedCngn / threshold) * 100));

  return (
    <div className="w-full bg-[#0A0E17] rounded-xl p-4 border border-white/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {migrated ? (
            <CheckCircle className="w-4 h-4 text-[#00E676]" />
          ) : (
            <Flame className="w-4 h-4 text-[#FFD700] animate-pulse" />
          )}
          <span className="font-grotesk font-bold text-xs uppercase tracking-wider text-slate-200">
            {migrated ? 'Graduated to Uniswap AMM' : 'Bonding Curve Progress'}
          </span>
        </div>
        <span className="font-grotesk font-bold text-sm text-[#00E676]">
          {percent.toFixed(1)}%
        </span>
      </div>

      {/* Progress Track */}
      <div className="relative w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-white/5">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-[#00B0FF] transition-all duration-500 rounded-full relative"
          style={{ width: `${percent}%` }}
        >
          {percent > 5 && percent < 100 && (
            <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/80 rounded-full shadow-[0_0_8px_#ffffff]" />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400 font-inter">
        <span>Raised: <strong className="text-white font-grotesk">₦{raisedCngn.toLocaleString('en-NG')} cNGN</strong></span>
        <span>Target: <strong className="text-slate-300 font-grotesk">₦{threshold.toLocaleString('en-NG')} cNGN</strong></span>
      </div>

      {migrated && (
        <div className="mt-2 py-1.5 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center space-x-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Liquidity permanently locked & burned on Uniswap V2 AMM pair!</span>
        </div>
      )}
    </div>
  );
}
