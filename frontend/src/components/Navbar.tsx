'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Wallet, 
  PlusCircle, 
  Trophy, 
  Menu, 
  X, 
  LogOut, 
  Building2, 
  ArrowDownUp,
  SendHorizontal
} from 'lucide-react';
import LoginModal from './LoginModal';
import DepositModal from './DepositModal';
import WithdrawModal from './WithdrawModal';
import SwapModal from './SwapModal';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { isLoggedIn, walletAddress, nairaBalance, cngnBalance, logout, connectRealWeb3Wallet } = useAuth();
  
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleConnectWallet = async () => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        await connectRealWeb3Wallet();
      } catch (e) {
        setIsLoginOpen(true);
      }
    } else {
      setIsLoginOpen(true);
    }
  };

  const truncatedAddress = walletAddress 
    ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`
    : '';

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-white/10 glass-card bg-[#070a10]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">

            {/* Brand Logo */}
            <Link href="/" className="flex items-center space-x-2.5 sm:space-x-3 group">
              <img
                src="/kobo-logo.png"
                alt="KOBO Logo"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain bg-white/10 p-0.5 border border-white/20 shadow-md group-hover:scale-105 transition-transform"
              />
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="font-grotesk font-bold text-xl sm:text-2xl tracking-tight text-white">KOBO</span>
                  <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-1.5 sm:px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    Arc Testnet
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-slate-400 font-inter">Naira Memecoin Protocol</p>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center space-x-1 font-grotesk">
              <Link
                href="/"
                className="px-4 py-2 rounded-lg text-sm text-slate-200 hover:text-white hover:bg-white/5 transition-colors"
              >
                Explore
              </Link>
              <Link
                href="/create"
                className="px-4 py-2 rounded-lg text-sm text-[#00E676] hover:bg-emerald-500/10 flex items-center space-x-1.5 transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Launch Token</span>
              </Link>
              <Link
                href="/leaderboard"
                className="px-4 py-2 rounded-lg text-sm text-slate-200 hover:text-white hover:bg-white/5 flex items-center space-x-1.5 transition-colors"
              >
                <Trophy className="w-4 h-4 text-[#FFD700]" />
                <span>Leaderboard</span>
              </Link>
            </nav>

            {/* Desktop Right Action Area */}
            <div className="hidden md:flex items-center space-x-3 font-grotesk">
              {isLoggedIn ? (
                <>
                  {/* Balance Display & Action Pill */}
                  <div className="flex items-center space-x-2 bg-[#0A0E17] border border-white/10 p-1.5 rounded-xl">
                    <div className="px-2.5 py-1 text-xs border-r border-white/10">
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Naira ₦</span>
                      <span className="font-bold text-white font-mono">₦{nairaBalance.toLocaleString('en-NG')}</span>
                    </div>

                    <div className="px-2.5 py-1 text-xs">
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">cNGN</span>
                      <span className="font-bold text-[#00E676] font-mono">₦{cngnBalance.toLocaleString('en-NG')}</span>
                    </div>

                    <button
                      onClick={() => setIsDepositOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-[#00E676] border border-emerald-500/30 text-xs font-bold transition-all flex items-center space-x-1"
                      title="Claim Naira ₦ Faucet"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>+ Naira ₦</span>
                    </button>

                    <button
                      onClick={() => setIsSwapOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-bold transition-all flex items-center space-x-1"
                      title="Swap Naira ₦ ↔ cNGN"
                    >
                      <ArrowDownUp className="w-3.5 h-3.5" />
                      <span>Swap 🔄</span>
                    </button>

                    <button
                      onClick={() => setIsWithdrawOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition-all flex items-center space-x-1"
                      title="Withdraw cNGN or Memecoins"
                    >
                      <SendHorizontal className="w-3.5 h-3.5" />
                      <span>Withdraw</span>
                    </button>
                  </div>

                  {/* Wallet Badge & Logout */}
                  <div className="flex items-center space-x-2">
                    <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-slate-300 flex items-center space-x-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse" />
                      <span>{truncatedAddress}</span>
                    </div>
                    <button
                      onClick={logout}
                      className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Logout"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={handleConnectWallet}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-xs sm:text-sm flex items-center space-x-2 shadow-lg shadow-emerald-500/20 transition-all"
                >
                  <Wallet className="w-4 h-4" />
                  <span>Connect Wallet / Login</span>
                </button>
              )}
            </div>

            {/* Mobile Hamburger Toggle Button */}
            <div className="flex md:hidden items-center space-x-2">
              {isLoggedIn && (
                <button
                  onClick={() => setIsSwapOpen(true)}
                  className="px-2.5 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-xs font-bold"
                >
                  Swap 🔄
                </button>
              )}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>

          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#070a10] px-4 pt-3 pb-6 space-y-3 font-grotesk animate-fadeIn">
            <Link
              href="/"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-white/5"
            >
              Explore Memecoins
            </Link>
            <Link
              href="/create"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm text-[#00E676] hover:bg-emerald-500/10"
            >
              Launch Memecoin
            </Link>
            <Link
              href="/leaderboard"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-white/5"
            >
              Leaderboard
            </Link>

            <div className="pt-2 border-t border-white/10 space-y-2">
              {isLoggedIn ? (
                <>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs font-mono">
                    <div>
                      <span className="text-slate-400 block text-[10px] font-inter">Naira ₦ Balance</span>
                      <span className="font-bold text-white">₦{nairaBalance.toLocaleString('en-NG')}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px] font-inter">cNGN Balance</span>
                      <span className="font-bold text-[#00E676]">₦{cngnBalance.toLocaleString('en-NG')}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs font-bold">
                    <button
                      onClick={() => { setIsDepositOpen(true); setIsMobileMenuOpen(false); }}
                      className="py-2.5 rounded-xl bg-emerald-500/10 text-[#00E676] border border-emerald-500/30 text-center"
                    >
                      + Naira ₦
                    </button>
                    <button
                      onClick={() => { setIsSwapOpen(true); setIsMobileMenuOpen(false); }}
                      className="py-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-center"
                    >
                      Swap 🔄
                    </button>
                    <button
                      onClick={() => { setIsWithdrawOpen(true); setIsMobileMenuOpen(false); }}
                      className="py-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 text-center"
                    >
                      Withdraw
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => { handleConnectWallet(); setIsMobileMenuOpen(false); }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 font-bold text-sm"
                >
                  Connect Wallet / Login
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Modals */}
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
      <DepositModal isOpen={isDepositOpen} onClose={() => setIsDepositOpen(false)} onOpenSwap={() => setIsSwapOpen(true)} />
      <SwapModal isOpen={isSwapOpen} onClose={() => setIsSwapOpen(false)} />
      <WithdrawModal isOpen={isWithdrawOpen} onClose={() => setIsWithdrawOpen(false)} />
    </>
  );
}
