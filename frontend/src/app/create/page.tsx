'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, Sparkles, UploadCloud, Info, CheckCircle2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

import { launchTokenOnChain } from '@/lib/onchain';

export default function CreateTokenPage() {
  const router = useRouter();
  const { isLoggedIn, login, launchToken } = useAuth();
  
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMode, setUploadMode] = useState<'drag' | 'url'>('drag');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [successToken, setSuccessToken] = useState<any>(null);

  const handleFile = (file: File) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, WEBP, GIF, SVG).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImageUrl(result);
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      login();
      return;
    }

    if (!name || !symbol) return;
    setIsDeploying(true);
    setDeployError(null);

    let onChainAddress: string | undefined;
    let onChainCurve: string | undefined;
    let onChainTxHash: string | undefined;

    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        const onChainRes = await launchTokenOnChain(name, symbol, imageUrl);
        onChainAddress = onChainRes.tokenAddress;
        onChainCurve = onChainRes.curveAddress;
        onChainTxHash = onChainRes.txHash;
      } catch (err: any) {
        console.error("On-chain token launch error or cancellation:", err);
        setIsDeploying(false);
        setDeployError(err.message || "Transaction was rejected or cancelled by user.");
        return; // ABORT TOKEN CREATION!
      }
    } else {
      await new Promise(res => setTimeout(res, 800));
    }

    const newToken = launchToken(name, symbol, description, imageUrl, onChainAddress, onChainCurve, onChainTxHash);
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
        
        {deployError && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-inter flex items-start space-x-3">
            <Info className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="font-bold text-amber-200">Token Launch Aborted</p>
              <p className="mt-0.5 opacity-90">{deployError}</p>
            </div>
          </div>
        )}
        
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

          {/* Token Image Aspect (Drag and Drop + URL option) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-300">Token Image / Logo *</label>
              <div className="flex space-x-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setUploadMode('drag')}
                  className={`px-2.5 py-0.5 rounded-lg transition-all ${
                    uploadMode === 'drag'
                      ? 'bg-emerald-500/20 text-[#00E676] font-bold border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Drag & Drop File
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('url')}
                  className={`px-2.5 py-0.5 rounded-lg transition-all ${
                    uploadMode === 'url'
                      ? 'bg-emerald-500/20 text-[#00E676] font-bold border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Image URL
                </button>
              </div>
            </div>

            {uploadMode === 'drag' ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-2xl p-5 text-center transition-all cursor-pointer ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-500/15 scale-[1.01]'
                    : imagePreview || imageUrl
                    ? 'border-emerald-500/40 bg-[#0A0E17]'
                    : 'border-white/15 bg-[#0A0E17] hover:border-emerald-500/50 hover:bg-emerald-500/5'
                }`}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFile(e.target.files[0]);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />

                {imagePreview || (imageUrl && imageUrl.startsWith('data:')) ? (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center space-x-3 text-left">
                      <img
                        src={imagePreview || imageUrl}
                        alt="Preview"
                        className="w-16 h-16 rounded-xl object-cover border border-white/20 shadow-md shrink-0"
                      />
                      <div>
                        <span className="text-xs font-bold text-white block flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#00E676]" /> Image Attached
                        </span>
                        <span className="text-[10px] text-slate-400 block font-inter">Click or drag another image to replace</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImageUrl('');
                        setImagePreview(null);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold border border-rose-500/30 transition-all z-20"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 py-2">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-emerald-400">
                      <UploadCloud className="w-5 h-5" />
                    </div>
                    <p className="text-xs text-white font-medium">
                      Drag & drop your memecoin logo here, or <span className="text-[#00E676] underline">browse file</span>
                    </p>
                    <p className="text-[10px] text-slate-500 font-inter">Supports PNG, JPG, WEBP, GIF or SVG (Max 5MB)</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value);
                    setImagePreview(e.target.value);
                  }}
                  placeholder="https://images.unsplash.com/photo-..."
                  className="w-full py-2.5 pl-3.5 pr-10 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-sm outline-none focus:border-emerald-500 transition-colors"
                />
                <UploadCloud className="w-4 h-4 text-slate-500 absolute right-3 top-3" />
              </div>
            )}
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
