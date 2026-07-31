'use client';

import React, { useState } from 'react';
import { X, ArrowDownLeft, Sparkles, CheckCircle2, ShieldCheck, RefreshCw, Copy, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface CngnDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CngnDepositModal({ isOpen, onClose }: CngnDepositModalProps) {
  const { walletAddress, depositNaira } = useAuth();
  const [cngnAmount, setCngnAmount] = useState('50000');
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const numAmount = parseFloat(cngnAmount) || 0;

  const handleCopy = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSimulateDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) return;

    setIsProcessing(true);
    setSuccessMsg(null);

    await new Promise(res => setTimeout(res, 800));

    depositNaira(numAmount);
    setIsProcessing(false);
    setSuccessMsg(`Successfully deposited ₦${numAmount.toLocaleString('en-NG')} cNGN to your Arc Testnet wallet!`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md glass-card rounded-2xl p-6 border border-cyan-500/30 relative shadow-2xl space-y-5 font-grotesk">
        
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto mb-2">
            <ArrowDownLeft className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-2xl text-white">Deposit cNGN Stablecoin</h3>
          <p className="text-xs text-slate-400 font-inter">
            Deposit cNGN directly to your Arc Testnet wallet or claim testnet cNGN faucet tokens.
          </p>
        </div>

        {/* Wallet Address Copy Box */}
        <div className="p-3.5 rounded-xl bg-[#0A0E17] border border-white/10 space-y-1.5">
          <span className="text-[11px] text-slate-400 block font-inter">Your Arc Testnet Deposit Address</span>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-cyan-300 truncate mr-2">
              {walletAddress || '0x71C...1234'}
            </span>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors text-xs flex items-center space-x-1 shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Faucet / Simulation Deposit Form */}
        <form onSubmit={handleSimulateDeposit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Enter cNGN Deposit Amount</label>
            <div className="relative">
              <input
                type="number"
                min="100"
                value={cngnAmount}
                onChange={(e) => setCngnAmount(e.target.value)}
                placeholder="50000"
                className="w-full py-2.5 px-3.5 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-sm font-bold outline-none focus:border-cyan-500 transition-colors"
              />
              <span className="absolute right-3 top-3 text-xs font-bold text-cyan-400">cNGN ₦</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isProcessing || numAmount <= 0}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-cyan-500/20 transition-all"
          >
            {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{isProcessing ? 'Minting Testnet cNGN...' : 'Claim cNGN Faucet Tokens'}</span>
          </button>
        </form>

        {successMsg && (
          <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-300 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 text-[11px] text-slate-400 flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>cNGN is Nigeria's regulated stablecoin running natively on Arc Blockchain.</span>
        </div>

      </div>
    </div>
  );
}
