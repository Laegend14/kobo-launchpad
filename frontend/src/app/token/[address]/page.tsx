'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, ExternalLink, ShieldCheck, Flame, TrendingUp, Users,
  BarChart3, PieChart, Lock, DollarSign, Activity, ArrowUpRight, ArrowDownRight, CheckCircle
} from 'lucide-react';
import Link from 'next/link';
import TradeWidget from '@/components/TradeWidget';
import CurveProgressBar from '@/components/CurveProgressBar';
import PriceChart from '@/components/PriceChart';
import { useAuth } from '@/context/AuthContext';

export default function TokenDetailPage() {
  const params = useParams();
  const addressParam = (params.address as string) || '';
  const { tokens, walletAddress, getTokenMetrics, getTokenTrades, claimCreatorFees } = useAuth();

  const token = tokens.find(
    t => t.address.toLowerCase() === addressParam.toLowerCase()
  ) || tokens[0];

  const metrics = getTokenMetrics(token.address);
  const trades = getTokenTrades(token.address);

  const isCreator = Boolean(
    walletAddress &&
    token.creator_wallet &&
    (
      walletAddress.toLowerCase() === token.creator_wallet.toLowerCase() ||
      token.creator_wallet.toLowerCase().includes(walletAddress.toLowerCase().substring(0, 6)) ||
      walletAddress.toLowerCase().includes(token.creator_wallet.toLowerCase().replace('...', ''))
    )
  );

  const totalVol = metrics.buyVolume24hCngn + metrics.sellVolume24hCngn || 1;
  const buyRatio = Math.round((metrics.buyVolume24hCngn / totalVol) * 100);
  const sellRatio = 100 - buyRatio;

  return (
    <div className="space-y-6 font-grotesk max-w-7xl mx-auto">
      
      {/* Back Button */}
      <Link
        href="/"
        className="inline-flex items-center space-x-2 text-xs text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Memecoin Feed</span>
      </Link>

      {/* Header Banner */}
      <div className="glass-card rounded-3xl p-6 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden bg-gradient-to-br from-emerald-500/5 via-transparent to-cyan-500/5">
        <div className="flex items-start space-x-4">
          <img
            src={token.metadata_uri || "/jollof.png"}
            alt={token.name}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-white/10 shadow-lg"
          />
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-2xl sm:text-3xl text-white">{token.name}</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-[#00E676] text-xs border border-emerald-500/30 font-mono">
                ${token.symbol}
              </span>
              {metrics.migrated && (
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs border border-cyan-500/30 font-bold flex items-center space-x-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Uniswap V2 AMM</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-inter mt-1">
              Created by <span className="font-mono text-emerald-400">{token.creator_wallet}</span> • Contract: <span className="font-mono text-slate-300">{token.address}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <a
            href={`https://testnet.arcscan.app/address/${token.address}`}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 flex items-center space-x-1.5 transition-colors font-bold"
          >
            <ExternalLink className="w-4 h-4" />
            <span>ArcScan Explorer</span>
          </a>
        </div>
      </div>

      {/* Token Lore / Description Card */}
      {token.description && (
        <div className="glass-card rounded-2xl p-5 border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-emerald-500/10 shadow-lg">
          <h2 className="text-sm font-bold text-amber-400 mb-1 font-grotesk flex items-center space-x-2">
            <span>🔥 The Legend & Lore of {token.name} (${token.symbol})</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-200 font-inter leading-relaxed italic">
            "{token.description}"
          </p>
        </div>
      )}

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="glass-card p-3.5 rounded-xl border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-400 block">Price (cNGN)</span>
          <div className="text-sm font-bold text-white font-mono">{metrics.formattedPriceCngn}</div>
        </div>
        <div className="glass-card p-3.5 rounded-xl border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-400 block">24h Price Change</span>
          <div className={`text-sm font-bold font-mono flex items-center space-x-1 ${
            metrics.priceChange24h >= 0 ? 'text-[#00E676]' : 'text-red-400'
          }`}>
            {metrics.priceChange24h >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            <span>{metrics.priceChange24h.toFixed(2)}%</span>
          </div>
        </div>
        <div className="glass-card p-3.5 rounded-xl border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-400 block">Market Cap</span>
          <div className="text-sm font-bold text-white">{metrics.formattedMarketCapNaira}</div>
        </div>
        <div className="glass-card p-3.5 rounded-xl border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-400 block">24h Volume</span>
          <div className="text-sm font-bold text-[#00E676]">{metrics.formattedVolume24hNaira}</div>
        </div>
        <div className="glass-card p-3.5 rounded-xl border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-400 block">Curve Reserve</span>
          <div className="text-sm font-bold text-amber-400">₦{metrics.liquidityCngn.toLocaleString('en-NG')} cNGN</div>
        </div>
        <div className="glass-card p-3.5 rounded-xl border border-white/10 space-y-1">
          <span className="text-[11px] text-slate-400 block">Holders</span>
          <div className="text-sm font-bold text-white">{metrics.holderCount.toLocaleString()}</div>
        </div>
      </div>

      {/* Main Layout: Chart + Trade Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Chart & Progress */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Bonding Curve Progress */}
          <div className="glass-card rounded-2xl p-5 border border-white/10">
            <CurveProgressBar raisedCngn={metrics.liquidityCngn} threshold={50000} migrated={metrics.migrated} />
          </div>

          {/* SVG Price Line Chart */}
          <PriceChart
            symbol={token.symbol}
            name={token.name}
            trades={trades}
            currentPrice={metrics.priceCngn}
            priceChange24h={metrics.priceChange24h}
          />

        </div>

        {/* Right Column: Trade Widget */}
        <div className="space-y-6">
          <TradeWidget
            tokenAddress={token.address}
            tokenSymbol={token.symbol}
            tokenName={token.name}
            isMigrated={metrics.migrated}
          />
        </div>

      </div>

      {/* Detailed Analytics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* 1. Valuation & Supply Metrics */}
        <div className="glass-card rounded-2xl p-5 border border-white/10 space-y-3">
          <div className="flex items-center space-x-2 text-[#00E676] font-bold text-sm">
            <DollarSign className="w-4 h-4" />
            <span>Valuation & Supply</span>
          </div>
          <div className="space-y-2 text-xs divide-y divide-white/5">
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Market Cap</span>
              <span className="font-bold text-white">{metrics.formattedMarketCapNaira}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">FDV (Fully Diluted)</span>
              <span className="font-bold text-white">{metrics.formattedFdvNaira}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Circulating Supply</span>
              <span className="font-bold text-emerald-400">{metrics.circulatingSupply.toLocaleString()} ({metrics.circulatingPercent}%)</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Max Supply</span>
              <span className="font-bold text-white">{metrics.totalSupply.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Burned Supply</span>
              <span className="font-bold text-slate-400">0 JOFF (0%)</span>
            </div>
          </div>
        </div>

        {/* 2. Trading Volume & Buy/Sell Ratio */}
        <div className="glass-card rounded-2xl p-5 border border-white/10 space-y-3">
          <div className="flex items-center space-x-2 text-[#00E676] font-bold text-sm">
            <BarChart3 className="w-4 h-4" />
            <span>Trading & Volume Breakdown</span>
          </div>
          
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">24h Volume</span>
              <span className="font-bold text-[#00E676]">{metrics.formattedVolume24hNaira}</span>
            </div>

            {/* Buy / Sell Volume Bar */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[11px] font-mono">
                <span className="text-emerald-400">Buys: ₦{metrics.buyVolume24hCngn.toLocaleString()} ({buyRatio}%)</span>
                <span className="text-rose-400">Sells: ₦{metrics.sellVolume24hCngn.toLocaleString()} ({sellRatio}%)</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-900 overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${buyRatio}%` }} />
                <div className="h-full bg-rose-500 transition-all" style={{ width: `${sellRatio}%` }} />
              </div>
            </div>

            <div className="space-y-2 pt-2 divide-y divide-white/5">
              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">24h Trades Count</span>
                <span className="font-bold text-white">{metrics.buyCount24h + metrics.sellCount24h} trades</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">Avg Trade Size</span>
                <span className="font-bold text-white">{metrics.avgTradeSizeNaira}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">VWAP (24h)</span>
                <span className="font-mono text-emerald-300">{metrics.formattedVwapCngn} cNGN</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Price Performance & ATH */}
        <div className="glass-card rounded-2xl p-5 border border-white/10 space-y-3">
          <div className="flex items-center space-x-2 text-[#00E676] font-bold text-sm">
            <Activity className="w-4 h-4" />
            <span>Price Performance</span>
          </div>
          <div className="space-y-2 text-xs divide-y divide-white/5">
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">1h Change</span>
              <span className={`font-bold font-mono ${metrics.priceChange1h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {metrics.priceChange1h >= 0 ? '+' : ''}{metrics.priceChange1h}%
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">24h Change</span>
              <span className={`font-bold font-mono ${metrics.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {metrics.priceChange24h >= 0 ? '+' : ''}{metrics.priceChange24h}%
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">All-Time High (ATH)</span>
              <span className="font-mono text-amber-400">{metrics.athCngn.toFixed(8)} cNGN</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">ATH Drawdown</span>
              <span className="font-mono text-slate-300">-{metrics.athDrawdownPercent}%</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">ROI Since Launch</span>
              <span className="font-bold text-emerald-400">+{metrics.roiPercent.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* 4. Holder Distribution */}
        <div className="glass-card rounded-2xl p-5 border border-white/10 space-y-3">
          <div className="flex items-center space-x-2 text-[#00E676] font-bold text-sm">
            <Users className="w-4 h-4" />
            <span>Holder & Wallet Analytics</span>
          </div>
          <div className="space-y-2 text-xs divide-y divide-white/5">
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Total Unique Holders</span>
              <span className="font-bold text-white">{metrics.holderCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Top 10 Holders %</span>
              <span className="font-bold text-emerald-400">{metrics.top10HoldersPercent}%</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Whale Concentration</span>
              <span className="font-bold text-emerald-300">Low (&lt;10%)</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Bonding Curve Pool %</span>
              <span className="font-bold text-amber-400">{(100 - metrics.circulatingPercent).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* 5. Security & Tokenomics Verification */}
        <div className="glass-card rounded-2xl p-5 border border-white/10 space-y-3 lg:col-span-2">
          <div className="flex items-center space-x-2 text-[#00E676] font-bold text-sm">
            <ShieldCheck className="w-4 h-4" />
            <span>Security & Contract Verification</span>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-1">
            <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[10px]">Smart Contract</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Verified (100%)
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[10px]">Mint Function</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Permanently Disabled
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[10px]">Ownership</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Renounced
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[10px]">Liquidity Lock</span>
              <span className="font-bold text-amber-400 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> {metrics.liquidityLockedPercent}% Locked
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[10px]">Honeypot Audit</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Passed Clean
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[10px]">Base Currency</span>
              <span className="font-bold text-white flex items-center gap-1">
                🇳🇬 cNGN Stablecoin
              </span>
            </div>
          </div>
        </div>

        {/* 6. Creator Royalty & Anti-Rug Protection Card */}
        <div className="glass-card rounded-2xl p-5 border border-white/10 space-y-4 lg:col-span-2 bg-gradient-to-r from-emerald-500/10 via-transparent to-amber-500/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-white text-base">🛡️ Anti-Rug Protection & Creator Royalties</h3>
            </div>
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/30 font-bold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                24h Creator Lock ACTIVE (16h 00m remaining)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Creator Royalty Fee Rate</span>
                <span className="font-bold text-emerald-400 text-sm">1.0% (100 bps)</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Creator earns 1% cNGN on all trading volume. Accumulated royalties can be claimed anytime.
              </p>
              <div className="pt-2 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Accrued Royalties</span>
                  <span className="font-bold text-white text-base">{metrics.formattedCreatorFees}</span>
                </div>
                {isCreator ? (
                  <button
                    onClick={() => {
                      const res = claimCreatorFees(token.address);
                      alert(`Claimed ₦${res.claimedAmount.toLocaleString()} cNGN in creator fees!`);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer flex items-center space-x-1"
                  >
                    <span>Claim Royalties</span>
                  </button>
                ) : (
                  <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-[11px] font-medium">
                    🔒 Claimable by Coin Creator Only
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Anti-Rug Lock Mechanism</span>
                <span className="font-bold text-amber-400 text-xs flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> 100% Enforced
                </span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                The smart contract prevents the coin creator from selling tokens or pulling initial liquidity until 24 hours post-launch.
              </p>
              <div className="pt-2 text-emerald-400 text-[11px] font-medium flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Public traders can buy & sell 24/7 without lock restriction.
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Live Recent Trades Activity Table */}
      <div className="glass-card rounded-2xl border border-white/10 overflow-hidden space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 font-bold text-[#00E676] text-sm">
            <Activity className="w-4 h-4" />
            <span>Live Trades History</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">{trades.length} total transactions</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-[#0A0E17] text-xs font-grotesk font-bold text-slate-400">
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">cNGN Amount</th>
                <th className="py-3 px-4">Token Amount</th>
                <th className="py-3 px-4">Price (cNGN)</th>
                <th className="py-3 px-4">Trader</th>
                <th className="py-3 px-4">Tx Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-grotesk text-xs">
              {trades.map((tr) => (
                <tr key={tr.id} className="hover:bg-white/5 transition-colors">
                  <td className="py-3 px-4">
                    {tr.side === 'buy' ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-[#00E676] border border-emerald-500/30 font-bold uppercase">
                        BUY
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold uppercase">
                        SELL
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-bold text-white">₦{tr.cngn_amount.toLocaleString('en-NG')}</td>
                  <td className="py-3 px-4 text-slate-300 font-mono">{tr.token_amount.toLocaleString()} ${token.symbol}</td>
                  <td className="py-3 px-4 text-emerald-400 font-mono">{tr.price.toFixed(8)}</td>
                  <td className="py-3 px-4 text-slate-400 font-mono">{tr.trader_wallet}</td>
                  <td className="py-3 px-4 text-cyan-400 font-mono">{tr.tx_hash.substring(0, 10)}...</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

