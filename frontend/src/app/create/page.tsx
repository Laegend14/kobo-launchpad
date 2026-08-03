'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, Sparkles, Info, CheckCircle2, RefreshCw, ArrowUpRight, ImageIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

import { launchTokenOnChain } from '@/lib/onchain';

// Turn a pasted page URL into a *direct image* URL where we can. The <img> tag (and
// the token card everywhere else) can only render a link that returns image bytes —
// an imgur gallery page (https://imgur.com/AbC123) returns HTML, not an image, so it
// must become https://i.imgur.com/AbC123.png. Handles the links people actually paste.
function normalizeImageUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return '';

  // Host-specific page → direct-image rewrites run FIRST (before the extension
  // shortcut) so e.g. a github .../blob/....png page becomes raw content.
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();

    // imgur: single-image page or /gallery/ or /a/ → direct i.imgur.com/<id>.png
    if (host === 'imgur.com' || host === 'm.imgur.com') {
      const id = u.pathname.replace(/^\/(gallery|a)\//, '/').replace(/^\//, '').split('/')[0];
      if (id) return `https://i.imgur.com/${id}.png`;
    }
    // i.imgur.com without an extension → append .png
    if (host === 'i.imgur.com') {
      const id = u.pathname.replace(/^\//, '').split('.')[0];
      if (id) return `https://i.imgur.com/${id}.png`;
    }
    // GitHub blob page → raw content
    if (host === 'github.com' && u.pathname.includes('/blob/')) {
      return `https://raw.githubusercontent.com${u.pathname.replace('/blob/', '/')}`;
    }
  } catch {
    // not a parseable URL — fall through
  }

  // Already a direct image (ends in an image extension, optionally with query string).
  if (/\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(url)) return url;

  return url;
}

export default function CreateTokenPage() {
  const router = useRouter();
  const { isLoggedIn, login, launchToken } = useAuth();

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageBroken, setImageBroken] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [successToken, setSuccessToken] = useState<any>(null);

  // A valid on-chain image is a plain http(s) URL. Base64 data: URIs are rejected —
  // they'd blow past EVM calldata limits, so the token's metadataURI must be a link.
  // We normalize first so pasting an imgur/github *page* URL still resolves to an image.
  const normalizedUrl = normalizeImageUrl(imageUrl);
  const isValidUrl = /^https?:\/\/[^\s]+$/i.test(normalizedUrl);
  const wasRewritten = normalizedUrl !== imageUrl.trim() && imageUrl.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      login();
      return;
    }

    if (!name || !symbol) return;
    setIsDeploying(true);
    setDeployError(null);

    // Persist the normalized (direct-image) URL on-chain, not the raw page URL the
    // user may have pasted — so the token image renders on every account.
    const finalImageUrl = normalizedUrl;

    let onChainAddress: string | undefined;
    let onChainCurve: string | undefined;
    let onChainTxHash: string | undefined;

    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        const onChainRes = await launchTokenOnChain(name, symbol, finalImageUrl);
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

    const newToken = launchToken(name, symbol, description, finalImageUrl, onChainAddress, onChainCurve, onChainTxHash);
    setIsDeploying(false);
    setSuccessToken(newToken);

    // The image URL is stored ON-CHAIN in the factory's tokenMetadataURI at launch and
    // read back by every client via getAllTokensFromChain — no backend, no upload host,
    // no database. That's what makes the token (and its image) visible to every account.

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

      {/* Base Sepolia Faucet Gas Banner */}
      <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-xs font-inter flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-white text-xs">Need Base Sepolia ETH Gas to Deploy?</h4>
            <p className="text-[11px] text-slate-300">
              Claim free testnet ETH gas from Coinbase's official Base Sepolia faucet at <span className="font-mono text-cyan-300 font-bold">faucets.chain.link/base-sepolia</span>
            </p>
          </div>
        </div>
        <a
          href="https://faucets.chain.link/base-sepolia"
          target="_blank"
          rel="noreferrer"
          className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-grotesk font-bold text-xs shrink-0 flex items-center space-x-1.5 shadow-md shadow-cyan-500/20 transition-all"
        >
          <span>Claim Base Gas</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="glass-card rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl space-y-6">
        
        {deployError && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-inter space-y-2">
            <div className="flex items-start space-x-3">
              <Info className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
              <div>
                <p className="font-bold text-amber-200">Token Launch Aborted</p>
                <p className="mt-0.5 opacity-90">{deployError}</p>
              </div>
            </div>
            <div className="pt-2 border-t border-amber-500/20 flex items-center justify-between text-[11px]">
              <span className="text-amber-200">Out of testnet gas?</span>
              <a
                href="https://faucet.circle.com"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-300 underline font-bold hover:text-cyan-200"
              >
                Claim Arc Faucet (faucet.circle.com) ➔
              </a>
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

          {/* Token Image — pasted URL stored on-chain in metadataURI */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-300">Token Image / Logo URL *</label>

            <div className="flex items-start gap-3">
              {/* Live preview from the normalized (direct-image) URL */}
              <div className="w-16 h-16 rounded-xl border border-white/15 bg-[#0A0E17] shrink-0 overflow-hidden flex items-center justify-center text-slate-600">
                {isValidUrl && !imageBroken ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={normalizedUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onLoad={() => setImageBroken(false)}
                    onError={() => setImageBroken(true)}
                  />
                ) : (
                  <ImageIcon className="w-6 h-6" />
                )}
              </div>

              <div className="flex-1 space-y-1">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value);
                    setImageBroken(false);
                  }}
                  placeholder="https://i.imgur.com/yourlogo.png"
                  className="w-full py-2.5 px-3.5 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-sm outline-none focus:border-emerald-500 transition-colors"
                />
                {imageUrl.trim() && !isValidUrl ? (
                  <p className="text-[10px] text-amber-400 font-inter">
                    Paste a direct <span className="font-mono">https://</span> link to a PNG/JPG/WEBP/GIF/SVG image.
                  </p>
                ) : isValidUrl && imageBroken ? (
                  <p className="text-[10px] text-rose-400 font-inter">
                    Couldn&apos;t load that image. Open it in a browser — the link must end in
                    {' '}.png/.jpg/.gif/.webp. For imgur, use the <span className="font-mono">i.imgur.com/…</span> link (right-click the image → Copy image address).
                  </p>
                ) : isValidUrl && wasRewritten ? (
                  <p className="text-[10px] text-emerald-400 font-inter flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Using direct link <span className="font-mono truncate max-w-[220px]">{normalizedUrl}</span> — stored on-chain.
                  </p>
                ) : isValidUrl ? (
                  <p className="text-[10px] text-emerald-400 font-inter flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Image loads — this URL is stored on-chain so every account sees it.
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-500 font-inter">
                    Host your logo (imgur, Unsplash, IPFS gateway, etc.) and paste the direct image link.
                  </p>
                )}
              </div>
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
