'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, Sparkles, UploadCloud, Info, CheckCircle2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function CreateTokenPage() {
  const router = useRouter();
  const { isLoggedIn, login, launchToken } = useAuth();
  
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [successToken, setSuccessToken] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      login();
      return;
    }

    if (!name || !symbol) return;
    setIsDeploying(true);

    // Simulate smart contract deployment & TokenFactory tx
    await new Promise(res => setTimeout(res, 1200));

    const newToken = launchToken(name, symbol, description, imageUrl);
    setIsDeploying(false);
    setSuccessToken(newToken);

    setTimeout(() => {
      router.push(`/token/${newToken.address}`);
    }, 1500);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 font-grotesk">
      
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-[#00E676] mx-auto">
          <Rocket className="w-6 h-6" />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Launch a Naira Memecoin</h1>
        <p className="text-xs text-slate-400 font-inter max-w-md mx-auto">
          Deploy your token instantly with zero pre-mine on a 100% fair bonding curve. 
          When 50,000 cNGN is raised, liquidity migrates automatically to Uniswap V2.
        </p>
      </div>

      <div className="glass-card rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl space-y-6">
        
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Token Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Suya Coin"
                className="w-full py-2.5 px-3.5 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-sm outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Ticker Symbol *</label>
              <input
                type="text"
                required
                maxLength={8}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. SUYA"
                className="w-full py-2.5 px-3.5 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-sm uppercase outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Image URL (Unsplash or IPFS)</label>
            <div className="relative">
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://images.unsplash.com/photo-..."
                className="w-full py-2.5 pl-3.5 pr-10 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-sm outline-none focus:border-emerald-500 transition-colors"
              />
              <UploadCloud className="w-4 h-4 text-slate-500 absolute right-3 top-3" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Description & Lore</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell the community why your memecoin is going to the moon..."
              className="w-full py-2.5 px-3.5 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-sm outline-none focus:border-emerald-500 transition-colors resize-none"
            />
          </div>

          {/* Info Banner */}
          <div className="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-slate-300 space-y-1">
            <div className="flex items-center space-x-1.5 font-bold text-[#00E676]">
              <Info className="w-4 h-4" />
              <span>Fair Launch Bonding Curve Rules</span>
            </div>
            <ul className="text-[11px] text-slate-400 space-y-1 list-disc list-inside font-inter">
              <li>100% of initial supply goes to the bonding curve (0% dev allocation).</li>
              <li>Virtual initial offset: 3,000 cNGN.</li>
              <li>Auto migration threshold: 50,000 cNGN.</li>
            </ul>
          </div>

          {/* Deploy Button */}
          {!isLoggedIn ? (
            <button
              type="button"
              onClick={() => login()}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 font-bold text-sm hover:from-emerald-400 hover:to-emerald-500 transition-all shadow-lg shadow-emerald-500/20"
            >
              Connect Wallet / Login to Launch Token
            </button>
          ) : (
            <button
              type="submit"
              disabled={isDeploying || !name || !symbol}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-sm flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
            >
              {isDeploying ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              <span>{isDeploying ? 'Deploying Token Contract...' : 'Launch Memecoin (Free)'}</span>
            </button>
          )}

        </form>

        {successToken && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-[#00E676] flex items-center space-x-3">
            <CheckCircle2 className="w-6 h-6 shrink-0" />
            <div>
              <h4 className="font-bold text-white">Memecoin ${successToken.symbol} Launched Successfully!</h4>
              <p className="text-[11px] text-slate-300 font-inter">Redirecting to live trading terminal...</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
