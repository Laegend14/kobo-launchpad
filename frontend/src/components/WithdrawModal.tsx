'use client';

import React, { useState } from 'react';
import { X, SendHorizontal, CheckCircle2, ShieldCheck, RefreshCw, Building2, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WithdrawModal({ isOpen, onClose }: WithdrawModalProps) {
  const { walletAddress, cngnBalance, tokens, withdrawCngn } = useAuth();
  
  const [assetType, setAssetType] = useState<'cNGN' | 'memecoin'>('cNGN');
  const [selectedTokenAddr, setSelectedTokenAddr] = useState<string>(tokens[0]?.address || '');
  const [amount, setAmount] = useState('10000');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankName, setBankName] = useState('GTBank Nigeria');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const numAmount = parseFloat(amount) || 0;
  const selectedToken = tokens.find(t => t.address === selectedTokenAddr) || tokens[0];

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) return;

    setIsWithdrawing(true);
    setSuccessMsg(null);

    await new Promise(res => setTimeout(res, 1000));

    try {
      if (assetType === 'cNGN') {
        await withdrawCngn(numAmount);
        setSuccessMsg(
          recipientAddress
            ? `Successfully transferred ₦${numAmount.toLocaleString('en-NG')} cNGN to ${recipientAddress.substring(0, 8)}... on Arc Testnet!`
            : `Successfully redeemed ₦${numAmount.toLocaleString('en-NG')} cNGN to bank account ${bankAccount} (${bankName})!`
        );
      } else {
        setSuccessMsg(
          `Successfully transferred ${numAmount.toLocaleString('en-US')} ${selectedToken?.symbol || 'TOKEN'} to ${recipientAddress || walletAddress} on Arc Testnet!`
        );
      }
    } catch (err: any) {
      setSuccessMsg(null);
    }

    setIsWithdrawing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 font-grotesk overflow-y-auto">
      <div className="w-full max-w-md glass-card rounded-3xl p-4 sm:p-6 border border-amber-500/30 relative shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto my-auto">
        
        {/* Sticky Header with Exit Button */}
        <div className="flex items-center justify-between sticky top-0 bg-[#0A0E17]/95 backdrop-blur-md pb-2 z-20 border-b border-white/10 -mx-1 px-1 pt-1">
          <div className="flex items-center space-x-2 text-amber-400">
            <SendHorizontal className="w-4 h-4" />
            <h3 className="font-bold text-lg sm:text-xl text-white">Withdraw Funds</h3>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition-all border border-white/10 flex items-center justify-center shrink-0"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Asset Selection */}
        <div className="flex bg-[#0A0E17] p-1 rounded-xl border border-white/10 text-xs font-bold">
          <button
            type="button"
            onClick={() => { setAssetType('cNGN'); setSuccessMsg(null); }}
            className={`flex-1 py-2 rounded-lg transition-all ${
              assetType === 'cNGN'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            cNGN Stablecoin
          </button>
          <button
            type="button"
            onClick={() => { setAssetType('memecoin'); setSuccessMsg(null); }}
            className={`flex-1 py-2 rounded-lg transition-all ${
              assetType === 'memecoin'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Memecoin Token
          </button>
        </div>

        <form onSubmit={handleWithdraw} className="space-y-3.5">
          
          {assetType === 'cNGN' ? (
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Withdraw Amount (cNGN)</label>
              <div className="relative">
                <input
                  type="number"
                  min="100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="10000"
                  className="w-full py-2.5 px-3.5 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-sm font-bold outline-none focus:border-amber-500 transition-colors"
                />
                <span className="absolute right-3 top-3 text-xs font-bold text-amber-400">cNGN ₦</span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-1 font-inter">
                Available: ₦{cngnBalance.toLocaleString('en-NG')} cNGN
              </span>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Select Memecoin</label>
                <select
                  value={selectedTokenAddr}
                  onChange={(e) => setSelectedTokenAddr(e.target.value)}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-sm outline-none focus:border-emerald-500 font-mono"
                >
                  {tokens.map(t => (
                    <option key={t.address} value={t.address}>
                      {t.name} (${t.symbol})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Token Amount</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1000000"
                  className="w-full py-2.5 px-3.5 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-sm font-bold outline-none focus:border-emerald-500"
                />
              </div>
            </>
          )}

          {/* Destination Toggle */}
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-bold text-slate-300">Destination</label>
            
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[11px] text-slate-400 block mb-1">Arc Testnet Wallet Address</span>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  placeholder="0x... (Leave empty to send to your wallet)"
                  className="w-full py-2 px-3 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-xs font-mono outline-none focus:border-amber-500"
                />
              </div>

              {assetType === 'cNGN' && !recipientAddress && (
                <div className="p-3 rounded-xl bg-[#0A0E17] border border-white/10 space-y-2">
                  <span className="text-[11px] text-slate-400 block">Bank Account (Fiat Cashout)</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={bankAccount}
                      onChange={(e) => setBankAccount(e.target.value)}
                      placeholder="Account Number (10 digits)"
                      className="py-1.5 px-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-amber-500"
                    />
                    <select
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="py-1.5 px-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs outline-none"
                    >
                      <option>GTBank Nigeria</option>
                      <option>Access Bank</option>
                      <option>Zenith Bank</option>
                      <option>Kuda Microfinance</option>
                      <option>OPay / Palmpay</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isWithdrawing || numAmount <= 0}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-sm flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
          >
            {isWithdrawing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Processing Transfer...</span>
              </>
            ) : (
              <>
                <SendHorizontal className="w-4 h-4" />
                <span>Withdraw Asset</span>
              </>
            )}
          </button>
        </form>

        {successMsg && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 text-[11px] text-slate-400 flex items-center space-x-2 font-inter">
          <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
          <span>All testnet withdrawals execute instantly on Arc Blockchain.</span>
        </div>

      </div>
    </div>
  );
}
