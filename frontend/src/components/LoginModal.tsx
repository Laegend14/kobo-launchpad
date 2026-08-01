'use client';

import React, { useState } from 'react';
import { X, Wallet, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { login, connectRealWeb3Wallet } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [web3Error, setWeb3Error] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleWeb3Connect = async (providerName?: string) => {
    setWeb3Error(null);
    setIsConnecting(true);
    try {
      await connectRealWeb3Wallet();
      setIsConnecting(false);
      onClose();
    } catch (err: any) {
      setIsConnecting(false);
      console.warn("Real Web3 connection notice:", err);
      if (err.message && err.message.includes("detected in browser")) {
        setWeb3Error("No Web3 wallet extension found. Connecting simulated fallback wallet...");
        setTimeout(() => {
          login();
          onClose();
        }, 1000);
      } else {
        setWeb3Error(err.message || "Failed to connect wallet.");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 font-grotesk overflow-y-auto">
      <div className="w-full max-w-md glass-card rounded-3xl p-4 sm:p-6 border border-emerald-500/30 relative shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto my-auto">
        
        {/* Sticky Header with Exit Button */}
        <div className="flex items-center justify-between sticky top-0 bg-[#0A0E17]/95 backdrop-blur-md pb-2 z-20 border-b border-white/10 -mx-1 px-1 pt-1">
          <div className="flex items-center space-x-2 text-[#00E676]">
            <Wallet className="w-4 h-4" />
            <h3 className="font-bold text-lg sm:text-xl text-white">Connect Web3 Wallet</h3>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition-all border border-white/10 flex items-center justify-center shrink-0"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400 font-inter">
          Connect your EVM Web3 Wallet (MetaMask, Coinbase Wallet, Trust Wallet, etc.) to trade cNGN on Arc Testnet.
        </p>

        {web3Error && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium">
            {web3Error}
          </div>
        )}

        {/* Primary Direct Connect Button */}
        <button
          onClick={() => handleWeb3Connect()}
          disabled={isConnecting}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-sm flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 transition-all"
        >
          {isConnecting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Connecting Web3 Wallet...</span>
            </>
          ) : (
            <>
              <Wallet className="w-4 h-4" />
              <span>Connect Available Web3 Wallet</span>
            </>
          )}
        </button>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-white/10"></div>
          <span className="flex-shrink mx-4 text-[10px] uppercase tracking-wider text-slate-400 font-grotesk">Supported Wallets</span>
          <div className="flex-grow border-t border-white/10"></div>
        </div>

        {/* EVM Provider Options */}
        <div className="space-y-2.5 font-grotesk text-xs">
          {[
            { name: 'MetaMask', desc: 'Browser extension or mobile app', icon: '🦊' },
            { name: 'Coinbase Wallet', desc: 'Base & EVM native wallet', icon: '🔵' },
            { name: 'WalletConnect', desc: 'Trust Wallet, Rainbow, OKX & Mobile', icon: '⚡' }
          ].map(p => (
            <button
              key={p.name}
              onClick={() => handleWeb3Connect(p.name)}
              className="w-full p-3 rounded-xl bg-[#0A0E17] hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 text-left flex items-center justify-between transition-all group"
            >
              <div className="flex items-center space-x-3">
                <span className="text-xl">{p.icon}</span>
                <div>
                  <h4 className="font-bold text-white group-hover:text-[#00E676]">{p.name}</h4>
                  <p className="text-[10px] text-slate-400 font-inter">{p.desc}</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-[#00E676] group-hover:translate-x-1 transition-all" />
            </button>
          ))}
        </div>

        <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 text-[11px] text-slate-400 flex items-center space-x-2 font-inter">
          <ShieldCheck className="w-4 h-4 text-[#00E676] shrink-0" />
          <span>Direct Web3 Provider Signature Authentication on Arc Testnet.</span>
        </div>

      </div>
    </div>
  );
}
