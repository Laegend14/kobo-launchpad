'use client';

import React, { useState } from 'react';
import { X, ArrowDownUp, Sparkles, CheckCircle2, ShieldCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDirection?: 'ngnToCngn' | 'cngnToNgn';
}

export default function SwapModal({ isOpen, onClose, defaultDirection = 'ngnToCngn' }: SwapModalProps) {
  const { nairaBalance, cngnBalance, swapNairaToCngn, swapCngnToNaira } = useAuth();
  const [direction, setDirection] = useState<'ngnToCngn' | 'cngnToNgn'>(defaultDirection);
  const [amount, setAmount] = useState('50000');
  const [isSwapping, setIsSwapping] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;
  const sourceBalance = direction === 'ngnToCngn' ? nairaBalance : cngnBalance;
  const isInsufficient = numAmount > sourceBalance;

  const toggleDirection = () => {
    setDirection(prev => (prev === 'ngnToCngn' ? 'cngnToNgn' : 'ngnToCngn'));
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) return;
    if (isInsufficient) {
      setErrorMsg(`Insufficient ${direction === 'ngnToCngn' ? 'Naira (NGN ₦)' : 'cNGN'} balance.`);
      return;
    }

    setIsSwapping(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    await new Promise(res => setTimeout(res, 600));

    try {
      let ok = false;
      if (direction === 'ngnToCngn') {
        ok = await swapNairaToCngn(numAmount);
        if (ok) {
          setSuccessMsg(`Successfully swapped ₦${numAmount.toLocaleString('en-NG')} NGN ➔ ₦${numAmount.toLocaleString('en-NG')} cNGN (1:1 ratio)!`);
        }
      } else {
        ok = await swapCngnToNaira(numAmount);
        if (ok) {
          setSuccessMsg(`Successfully swapped ₦${numAmount.toLocaleString('en-NG')} cNGN ➔ ₦${numAmount.toLocaleString('en-NG')} NGN (1:1 ratio)!`);
        }
      }

      if (!ok) {
        setErrorMsg('Swap failed. Please check your balance.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Swap transaction failed or was rejected.');
    }

    setIsSwapping(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 font-grotesk overflow-y-auto">
      <div className="w-full max-w-md glass-card rounded-3xl p-4 sm:p-6 border border-emerald-500/30 relative shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto my-auto">
        
        {/* Sticky Header with Exit Button */}
        <div className="flex items-center justify-between sticky top-0 bg-[#0A0E17]/95 backdrop-blur-md pb-2 z-20 border-b border-white/10 -mx-1 px-1 pt-1">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-[#00E676]">
              <ArrowDownUp className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-lg sm:text-xl text-white">Buy &amp; Sell cNGN Stablecoin</h3>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition-all border border-white/10 flex items-center justify-center shrink-0"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400 font-inter leading-relaxed">
          cNGN is Nigeria's 1:1 Naira-pegged ERC20 stablecoin on Arc Testnet. Buy cNGN with Naira ₦ or sell cNGN back for Naira ₦ at a 1:1 guaranteed rate.
        </p>

        {/* Direction Indicator Pill */}
        <div className="flex bg-[#0A0E17] p-1 rounded-xl border border-white/10 text-xs font-bold">
          <button
            type="button"
            onClick={() => { setDirection('ngnToCngn'); setErrorMsg(null); setSuccessMsg(null); }}
            className={`flex-1 py-2 rounded-lg transition-all ${
              direction === 'ngnToCngn'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Buy cNGN (with Naira ₦)
          </button>
          <button
            type="button"
            onClick={() => { setDirection('cngnToNgn'); setErrorMsg(null); setSuccessMsg(null); }}
            className={`flex-1 py-2 rounded-lg transition-all ${
              direction === 'cngnToNgn'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sell cNGN (for Naira ₦)
          </button>
        </div>

        <form onSubmit={handleSwap} className="space-y-4">
          
          {/* Pay Input */}
          <div className="p-3.5 rounded-xl bg-[#0A0E17] border border-white/10 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-inter">
              <span>You Pay ({direction === 'ngnToCngn' ? 'Naira ₦ NGN' : 'cNGN Stablecoin'})</span>
              <span className="font-mono text-slate-300">Available: ₦{sourceBalance.toLocaleString('en-NG')}</span>
            </div>
            <div className="relative">
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50000"
                className="w-full py-2.5 px-3 rounded-lg bg-white/5 border border-white/10 text-white font-bold text-base sm:text-lg outline-none focus:border-emerald-500"
              />
              <span className="absolute right-3 top-3 text-xs font-bold text-emerald-400">
                {direction === 'ngnToCngn' ? 'NGN ₦' : 'cNGN ₦'}
              </span>
            </div>

            {/* Quick Percentage Pills */}
            <div className="flex space-x-1.5 text-[11px] pt-1">
              {[25, 50, 75, 100].map(pct => {
                const val = Math.floor((pct / 100) * sourceBalance);
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setAmount(val.toString())}
                    className="flex-1 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 font-bold border border-white/5 text-center"
                  >
                    {pct}%
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toggle Divider Button */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={toggleDirection}
              className="p-2 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-emerald-500/50 transition-all"
              title="Reverse Direction"
            >
              <ArrowDownUp className="w-4 h-4 text-emerald-400" />
            </button>
          </div>

          {/* Receive Output Box */}
          <div className="p-3.5 rounded-xl bg-[#0A0E17] border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400 font-inter">
              <span>You Receive ({direction === 'ngnToCngn' ? 'cNGN Stablecoin' : 'Naira ₦ NGN'})</span>
              <span className="text-emerald-400 text-[10px] font-bold">1:1 Guaranteed Rate</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-base sm:text-lg font-bold text-white font-mono">
                ₦{numAmount.toLocaleString('en-NG')}
              </span>
              <span className="text-xs font-bold text-cyan-400">
                {direction === 'ngnToCngn' ? 'cNGN ₦' : 'NGN ₦'}
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400 font-inter">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-[#00E676] flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSwapping || numAmount <= 0 || isInsufficient}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-sm flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
          >
            {isSwapping ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Processing cNGN Transaction...</span>
              </>
            ) : isInsufficient ? (
              <span>Insufficient {direction === 'ngnToCngn' ? 'Naira ₦' : 'cNGN'} Balance</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>
                  {direction === 'ngnToCngn' ? 'Buy cNGN with Naira ₦' : 'Sell cNGN for Naira ₦'}
                </span>
              </>
            )}
          </button>
        </form>

        <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 text-[11px] text-slate-400 flex items-center space-x-2 font-inter">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Swaps execute instantly with zero slippage and 0% protocol fee.</span>
        </div>

      </div>
    </div>
  );
}
