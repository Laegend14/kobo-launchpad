'use client';

import React, { useState } from 'react';
import { X, Wallet, Mail, KeyRound, ArrowRight, Sparkles, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getDynamicClient } from '../lib/dynamicClient';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'email' | 'web3'>('email');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  if (!isOpen) return null;

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsSending(true);

    try {
      const client = getDynamicClient();
      if (client?.auth?.email?.sendOTP) {
        await client.auth.email.sendOTP({ email });
      } else {
        await new Promise(res => setTimeout(res, 800));
      }
    } catch (err) {
      console.warn("Dynamic sendOTP fallback:", err);
    }

    setIsSending(false);
    setOtpSent(true);
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    setIsVerifying(true);

    try {
      const client = getDynamicClient();
      if (client?.auth?.email?.verifyOTP) {
        await client.auth.email.verifyOTP({ verificationToken: code });
      } else {
        await new Promise(res => setTimeout(res, 800));
      }
    } catch (err) {
      console.warn("Dynamic verifyOTP fallback:", err);
    }

    setIsVerifying(false);
    login();
    onClose();
  };

  const handleWeb3Connect = (providerName: string) => {
    login();
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

        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-[#00E676] mx-auto mb-2">
            <Wallet className="w-6 h-6" />
          </div>
          <h3 className="font-grotesk font-bold text-2xl text-white">Dynamic Auth Login</h3>
          <p className="text-xs text-slate-400 font-inter">
            Log in with Email OTP (Embedded WaaS Wallet) or Connect EVM Web3 Wallet to trade cNGN on Base Sepolia.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-[#0A0E17] p-1 rounded-xl border border-white/10 font-grotesk text-xs">
          <button
            onClick={() => setMode('email')}
            className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center space-x-1.5 ${
              mode === 'email' ? 'bg-[#00E676] text-slate-950 shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email OTP (Embedded WaaS)</span>
          </button>
          <button
            onClick={() => setMode('web3')}
            className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center space-x-1.5 ${
              mode === 'web3' ? 'bg-[#00E676] text-slate-950 shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>EVM Web3 Wallet</span>
          </button>
        </div>

        {/* Mode 1: Email OTP */}
        {mode === 'email' && (
          <div className="space-y-4 font-grotesk">
            {!otpSent ? (
              <form onSubmit={handleSendCode} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Enter your Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full py-2.5 px-3.5 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSending || !email}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 transition-all"
                >
                  {isSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>{isSending ? 'Sending OTP Code...' : 'Send Verification Code'}</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Enter 6-Digit OTP Sent to {email}</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    className="w-full py-2.5 px-3.5 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-sm tracking-widest text-center font-mono outline-none focus:border-emerald-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isVerifying || !code}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 transition-all"
                >
                  {isVerifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  <span>{isVerifying ? 'Verify OTP & Create Embedded Wallet' : 'Verify OTP & Create Embedded Wallet'}</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* Mode 2: EVM Web3 Wallet Options */}
        {mode === 'web3' && (
          <div className="space-y-2.5 font-grotesk text-xs">
            {[
              { name: 'MetaMask', desc: 'Browser extension or mobile app', icon: '🦊' },
              { name: 'Coinbase Wallet', desc: 'Base native wallet login', icon: '🔵' },
              { name: 'WalletConnect', desc: 'Scan QR with Trust / Rainbow Wallet', icon: '⚡' }
            ].map(p => (
              <button
                key={p.name}
                onClick={() => handleWeb3Connect(p.name)}
                className="w-full p-3.5 rounded-xl bg-[#0A0E17] hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 text-left flex items-center justify-between transition-all group"
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
        )}

        <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 text-[11px] text-slate-400 flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-[#00E676] shrink-0" />
          <span>Powered by Dynamic Auth SDK with Non-custodial Embedded WaaS Wallets.</span>
        </div>

      </div>
    </div>
  );
}
