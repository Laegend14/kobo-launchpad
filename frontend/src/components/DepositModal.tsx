'use client';

import React, { useState } from 'react';
import { X, Building2, CheckCircle2, Copy, Sparkles, RefreshCw, ArrowRightLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DepositModal({ isOpen, onClose }: DepositModalProps) {
  const { walletAddress, depositNaira } = useAuth();
  const [nairaAmount, setNairaAmount] = useState<number>(50000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const virtualAcct = '9920148592';

  if (!isOpen) return null;

  const handleSimulateTransfer = async () => {
    if (nairaAmount <= 0) return;
    setIsSubmitting(true);

    // Simulate bank API settlement
    await new Promise(res => setTimeout(res, 1200));

    setIsSubmitting(false);
    setIsSuccess(true);
    depositNaira(nairaAmount);
  };

  const handleReset = () => {
    setIsSuccess(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md glass-card rounded-2xl p-6 border border-emerald-500/30 relative shadow-2xl space-y-5">
        
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {!isSuccess ? (
          <div>
            <div className="flex items-center space-x-2 text-[#00E676] mb-2">
              <Sparkles className="w-5 h-5" />
              <h3 className="font-grotesk font-bold text-xl text-white">Deposit Naira (₦ NGN)</h3>
            </div>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Deposit Nigerian Naira via bank transfer. Naira deposited is <strong>automatically converted 1:1 to cNGN</strong> (Nigeria's regulated stablecoin) on Base Sepolia.
            </p>

            {/* Amount Selection */}
            <div className="mb-4">
              <label className="block text-xs font-grotesk font-medium text-slate-300 mb-1.5">
                Amount in Naira (₦ NGN)
              </label>
              <input
                type="number"
                value={nairaAmount}
                onChange={(e) => setNairaAmount(Number(e.target.value))}
                className="w-full py-2.5 px-3.5 rounded-xl bg-[#0A0E17] border border-white/10 text-white font-grotesk font-bold text-lg outline-none focus:border-emerald-500"
              />

              <div className="grid grid-cols-3 gap-2 mt-2">
                {[10000, 50000, 250000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setNairaAmount(val)}
                    className={`py-1.5 px-2 rounded-lg font-grotesk text-xs font-bold border transition-all ${
                      nairaAmount === val
                        ? 'bg-emerald-500/20 border-[#00E676] text-[#00E676]'
                        : 'bg-[#0A0E17] border-white/10 text-slate-300 hover:border-white/30'
                    }`}
                  >
                    ₦{val.toLocaleString('en-NG')}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto Conversion Box */}
            <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex items-center justify-between text-xs font-grotesk mb-4">
              <span className="text-slate-300 flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4 text-[#00E676]" />
                Auto-Conversion Rate:
              </span>
              <span className="font-bold text-[#00E676]">
                ₦{nairaAmount.toLocaleString()} NGN = {nairaAmount.toLocaleString()} cNGN
              </span>
            </div>

            {/* Virtual Bank Account Details */}
            <div className="bg-[#0A0E17] rounded-xl p-4 border border-white/10 mb-5 space-y-2.5 font-grotesk text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#FFD700]" />
                  Bank Name
                </span>
                <span className="font-bold text-white">Wema Bank / cNGN Ramp</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Virtual Account Number</span>
                <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                  <span>{virtualAcct}</span>
                  <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-white cursor-pointer" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Account Name</span>
                <span className="text-slate-300">{walletAddress ? `Kobo Vault (${walletAddress.substring(0, 6)}...)` : 'Kobo Vault User'}</span>
              </div>
            </div>

            {/* Confirm Action Button */}
            <button
              onClick={handleSimulateTransfer}
              disabled={isSubmitting || nairaAmount <= 0}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-grotesk font-bold text-sm flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/25 transition-all"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing Bank Deposit...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simulate Transfer Received (Mint cNGN)</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="text-center py-4 space-y-4 font-grotesk">
            <div className="w-14 h-14 bg-emerald-500/20 text-[#00E676] rounded-full flex items-center justify-center mx-auto border border-emerald-500/40">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h4 className="font-bold text-2xl text-white">Naira Deposited!</h4>
              <p className="text-sm text-slate-300 mt-1">
                Your wallet has been credited with <strong>{nairaAmount.toLocaleString('en-NG')} cNGN</strong>.
              </p>
              <p className="text-xs text-slate-500 mt-2 font-mono">
                Tx: 0xmock_cngn_mint_{Math.random().toString(16).substring(2, 10)}
              </p>
            </div>

            <button
              onClick={handleReset}
              className="w-full py-3 rounded-xl bg-[#11192B] hover:bg-white/10 text-white font-bold text-sm border border-white/10 transition-colors"
            >
              Trade Memecoins Now
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
