'use client';

import React, { useState } from 'react';
import { X, SendHorizontal, CheckCircle2, ShieldCheck, RefreshCw, Building2, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WithdrawModal({ isOpen, onClose }: WithdrawModalProps) {
  const { walletAddress, cngnBalance, tokens, withdrawNaira } = useAuth();
  
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

    if (assetType === 'cNGN') {
      withdrawNaira(numAmount);
      setSuccessMsg(
        recipientAddress
          ? `Successfully transferred ₦${numAmount.toLocaleString('en-NG')} cNGN to ${recipientAddress.substring(0, 8)}... on Arc Testnet!`
          : `Successfully redeemed ₦${numAmount.toLocaleString('en-NG')} cNGN to bank account ${bankAccount} (${bankName})!`
      );
    } else {
      setSuccessMsg(
        `Successfully transferred ${numAmount.toLocaleString('en-US')} $${selectedToken?.symbol || 'TOKEN'} to ${recipientAddress || walletAddress} on Arc Testnet!`
      );
    }

    setIsWithdrawing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-grotesk">
      <div className="w-full max-w-md glass-card rounded-2xl p-6 border border-amber-500/30 relative shadow-2xl space-y-5">
        
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-2">
            <SendHorizontal className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-2xl text-white">Withdraw Assets</h3>
          <p className="text-xs text-slate-400 font-inter">
            Withdraw cNGN stablecoin or any launched memecoin to an external wallet or Nigerian bank account.
          </p>
        </div>

        {/* Asset Selector Tabs */}
        <div className="flex bg-[#0A0E17] p-1 rounded-xl border border-white/10 text-xs">
          <button
            onClick={() => { setAssetType('cNGN'); setSuccessMsg(null); }}
            className={`flex-1 py-2 rounded-lg font-bold transition-all ${
              assetType === 'cNGN'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Withdraw cNGN ₦
          </button>
          <button
            onClick={() => { setAssetType('memecoin'); setSuccessMsg(null); }}
            className={`flex-1 py-2 rounded-lg font-bold transition-all ${
              assetType === 'memecoin'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Withdraw Memecoins
          </button>
        </div>

        <form onSubmit={handleWithdraw} className="space-y-3 font-grotesk">
          
          {/* Memecoin Selection Dropdown */}
          {assetType === 'memecoin' && (
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Select Memecoin to Withdraw</label>
              <select
                value={selectedTokenAddr}
                onChange={(e) => setSelectedTokenAddr(e.target.value)}
                className="w-full py-2.5 px-3 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-xs font-bold outline-none focus:border-amber-500"
              >
                {tokens.map(t => (
                  <option key={t.address} value={t.address} className="bg-slate-950 text-white">
                    {t.name} (${t.symbol}) — {t.address.substring(0, 8)}...
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Amount Field */}
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1 font-inter">
              <span>Withdrawal Amount</span>
              {assetType === 'cNGN' && (
                <span>Available: ₦{cngnBalance.toLocaleString('en-NG')} cNGN</span>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10000"
                className="w-full py-2.5 px-3.5 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-sm font-bold outline-none focus:border-amber-500 transition-colors"
              />
              <span className="absolute right-3 top-3 text-xs font-bold text-amber-400">
                {assetType === 'cNGN' ? 'cNGN ₦' : selectedToken?.symbol || 'TOKEN'}
              </span>
            </div>
          </div>

          {/* Destination EVM Address */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Destination EVM Address (Arc Testnet)</label>
            <div className="relative">
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="0x... (leave blank to use connected wallet)"
                className="w-full py-2.5 pl-3.5 pr-8 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-xs font-mono outline-none focus:border-amber-500 transition-colors"
              />
              <Wallet className="w-4 h-4 text-slate-500 absolute right-3 top-3" />
            </div>
          </div>

          {/* Bank Account Details option for cNGN */}
          {assetType === 'cNGN' && !recipientAddress && (
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-400">
                <Building2 className="w-3.5 h-3.5" />
                <span>Or Redeem to Nigerian Bank Account</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  placeholder="NUBAN 10-digit Acct No"
                  className="py-1.5 px-2.5 rounded-lg bg-[#0A0E17] border border-white/10 text-white text-[11px] outline-none"
                />
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="py-1.5 px-2 rounded-lg bg-[#0A0E17] border border-white/10 text-white text-[11px] outline-none"
                >
                  <option value="GTBank Nigeria">GTBank</option>
                  <option value="Zenith Bank">Zenith Bank</option>
                  <option value="Access Bank">Access Bank</option>
                  <option value="Kuda Bank">Kuda Microfinance</option>
                  <option value="OPay">OPay</option>
                </select>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isWithdrawing || numAmount <= 0 || (assetType === 'cNGN' && numAmount > cngnBalance)}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
          >
            {isWithdrawing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
            <span>
              {isWithdrawing
                ? 'Processing Withdrawal...'
                : numAmount > cngnBalance && assetType === 'cNGN'
                ? 'Insufficient Balance'
                : `Withdraw ${assetType === 'cNGN' ? 'cNGN ₦' : selectedToken?.symbol}`}
            </span>
          </button>
        </form>

        {successMsg && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 text-[11px] text-slate-400 flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Withdrawals execute on Arc Testnet with automated off-ramp settlement.</span>
        </div>

      </div>
    </div>
  );
}
