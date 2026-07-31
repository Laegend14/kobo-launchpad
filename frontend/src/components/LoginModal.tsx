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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md glass-card rounded-2xl p-6 border border-emerald-500/30 relative shadow-2xl space-y-5">
        
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-[#00E676] mx-auto mb-2">
            <Wallet className="w-6 h-6" />
          </div>
          <h3 className="font-grotesk font-bold text-2xl text-white">Connect Web3 Wallet</h3>
          <p className="text-xs text-slate-400 font-inter">
            Connect your EVM Web3 Wallet (MetaMask, Coinbase Wallet, Trust Wallet, etc.) to trade cNGN on Arc Testnet.
          </p>
        </div>

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

        <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 text-[11px] text-slate-400 flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-[#00E676] shrink-0" />
          <span>Direct Web3 Provider Signature Authentication on Arc Testnet.</span>
        </div>

      </div>
    </div>
  );
}
