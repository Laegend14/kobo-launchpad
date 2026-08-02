'use client';

import React, { useState } from 'react';
import { ArrowDownUp, RefreshCw, Sparkles, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { quoteBuy, quoteSell, INITIAL_VIRTUAL_CNGN, INITIAL_VIRTUAL_TOKENS } from '@/lib/metrics';

interface TradeWidgetProps {
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  isMigrated?: boolean;
}

export default function TradeWidget({
  tokenAddress,
  tokenSymbol,
  tokenName,
  isMigrated = false
}: TradeWidgetProps) {
  const { isLoggedIn, cngnBalance, login, buyToken, sellToken, tokens, getUserTokenHolding } = useAuth();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState<string>('5000');
  const [slippage, setSlippage] = useState<number>(0.5);
  const [isTrading, setIsTrading] = useState<boolean>(false);
  const [tradeSuccessMsg, setTradeSuccessMsg] = useState<string | null>(null);
  const [tradeErrorMsg, setTradeErrorMsg] = useState<string | null>(null);

  const token = tokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
  const raisedCngn = token?.raisedCngn || 0;
  const holding = getUserTokenHolding(tokenAddress);

  const numAmount = parseFloat(amount) || 0;

  // Real bonding curve quote calculation — reserves derived from the on-chain
  // constant-product seed (must match TokenFactory.VIRTUAL_CNGN_RESERVE).
  const virtualCngn = INITIAL_VIRTUAL_CNGN + Math.max(0, raisedCngn);
  const virtualToken = (INITIAL_VIRTUAL_CNGN * INITIAL_VIRTUAL_TOKENS) / virtualCngn;

  let estimatedTokensOut = 0;
  let estimatedCngnOut = 0;
  let priceImpact = 0;

  if (side === 'buy' && numAmount > 0) {
    const q = quoteBuy(numAmount, virtualCngn, virtualToken);
    estimatedTokensOut = Math.round(q.tokensOut);
    priceImpact = q.priceImpactPercent;
  } else if (side === 'sell' && numAmount > 0) {
    const q = quoteSell(numAmount, virtualCngn, virtualToken);
    estimatedCngnOut = Number(q.cngnOut.toFixed(2));
    priceImpact = q.priceImpactPercent;
  }

  const handleTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      login();
      return;
    }

    if (numAmount <= 0) return;
    setIsTrading(true);
    setTradeSuccessMsg(null);
    setTradeErrorMsg(null);

    try {
      if (side === 'buy') {
        const res = await buyToken(tokenAddress, numAmount);
        const shortTx = res.txHash && res.txHash !== '0x...' ? ` (Tx: ${res.txHash.substring(0, 8)}...)` : '';
        setTradeSuccessMsg(`Successfully bought ~${Math.round(res.tokensOut).toLocaleString()} $${tokenSymbol} for ₦${numAmount.toLocaleString()} cNGN!${shortTx}`);
      } else {
        const res = await sellToken(tokenAddress, numAmount);
        const shortTx = res.txHash && res.txHash !== '0x...' ? ` (Tx: ${res.txHash.substring(0, 8)}...)` : '';
        setTradeSuccessMsg(`Successfully sold ${numAmount.toLocaleString()} $${tokenSymbol} for ~₦${res.cngnOut.toLocaleString()} cNGN!${shortTx}`);
      }
    } catch (err: any) {
      setTradeErrorMsg(err.message || "Trade signature was rejected or cancelled.");
    } finally {
      setIsTrading(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-5 border border-white/10 space-y-4 font-grotesk shadow-xl">
      
      {/* Header Tabs */}
      <div className="flex bg-[#0A0E17] p-1 rounded-xl border border-white/10 text-xs">
        <button
          onClick={() => { setSide('buy'); setTradeSuccessMsg(null); }}
          className={`flex-1 py-2 rounded-lg font-bold transition-all ${
            side === 'buy'
              ? 'bg-[#00E676] text-slate-950 shadow-md shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Buy ${tokenSymbol}
        </button>
        <button
          onClick={() => { setSide('sell'); setTradeSuccessMsg(null); }}
          className={`flex-1 py-2 rounded-lg font-bold transition-all ${
            side === 'sell'
              ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Sell ${tokenSymbol}
        </button>
      </div>

      {/* User Position & Holdings Card */}
      {isLoggedIn && (
        <div className="p-3.5 rounded-xl bg-[#0A0E17] border border-emerald-500/30 space-y-2 bg-gradient-to-r from-emerald-500/10 via-transparent to-cyan-500/10">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#00E676]" />
              <span>Your ${tokenSymbol} Balance:</span>
            </span>
            <span className="font-bold text-white font-mono text-sm">{holding.formattedTokenAmount} ${tokenSymbol}</span>
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
            <span className="text-slate-400">Equivalent Value in cNGN:</span>
            <span className="font-bold text-[#00E676] font-mono text-sm">{holding.formattedCngnValue}</span>
          </div>
        </div>
      )}

      {isMigrated && (
        <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-300 flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Token graduated! Trading now routes directly to Uniswap V2 AMM Pool.</span>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleTrade} className="space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1 font-inter">
            <span>You Pay</span>
            <span>Balance: ₦{cngnBalance.toLocaleString('en-NG')} cNGN</span>
          </div>

          <div className="relative">
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full py-3 px-4 rounded-xl bg-[#0A0E17] border border-white/10 text-white text-lg font-bold outline-none focus:border-emerald-500 transition-colors"
            />
            <div className="absolute right-3 top-3 text-xs font-bold px-2 py-1 rounded-md bg-white/5 text-slate-300">
              {side === 'buy' ? 'cNGN ₦' : tokenSymbol}
            </div>
          </div>
        </div>

        {/* Preset Amount Pills */}
        <div className="flex space-x-2 text-[11px]">
          {side === 'buy'
            ? [1000, 5000, 20000, 50000].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAmount(val.toString())}
                  className="flex-1 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-center font-bold"
                >
                  ₦{val >= 1000 ? `${val/1000}k` : val}
                </button>
              ))
            : [25, 50, 75, 100].map(pct => {
                const sellQty = Math.floor((pct / 100) * (holding.tokenAmount || 0));
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setAmount(sellQty > 0 ? sellQty.toString() : '0')}
                    disabled={holding.tokenAmount <= 0}
                    className="flex-1 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-center font-bold disabled:opacity-40"
                  >
                    {pct}%
                  </button>
                );
              })
          }
        </div>

        {/* Arrow Divider */}
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
            <ArrowDownUp className="w-4 h-4" />
          </div>
        </div>

        {/* Receive Preview */}
        <div className="p-3 rounded-xl bg-[#0A0E17] border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-inter">
            <span>You Receive (Estimated)</span>
            <span className="text-[10px] text-slate-400">Slippage {slippage}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-white tracking-tight">
              {side === 'buy'
                ? estimatedTokensOut.toLocaleString()
                : `₦${estimatedCngnOut.toLocaleString()}`}
            </span>
            <span className="text-xs font-bold text-[#00E676]">
              {side === 'buy' ? tokenSymbol : 'cNGN ₦'}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-white/5 text-slate-400">
            <span>Price Impact</span>
            <span className={`font-mono font-bold ${priceImpact > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {priceImpact.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Action Button */}
        {!isLoggedIn ? (
          <button
            type="button"
            onClick={() => login()}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 font-bold text-sm hover:from-emerald-400 hover:to-emerald-500 transition-all shadow-lg shadow-emerald-500/20"
          >
            Connect Wallet / Login to Trade
          </button>
        ) : (
          <button
            type="submit"
            disabled={isTrading || numAmount <= 0 || (side === 'buy' && numAmount > cngnBalance)}
            className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 shadow-lg transition-all ${
              side === 'buy'
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 shadow-emerald-500/20'
                : 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white shadow-rose-500/20'
            }`}
          >
            {isTrading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>
              {isTrading
                ? 'Executing Trade...'
                : numAmount > cngnBalance && side === 'buy'
                ? 'Insufficient cNGN Balance'
                : `${side === 'buy' ? 'Buy' : 'Sell'} ${tokenSymbol}`}
            </span>
          </button>
        )}
      </form>

      {tradeSuccessMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-[#00E676] flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{tradeSuccessMsg}</span>
        </div>
      )}

      {tradeErrorMsg && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>{tradeErrorMsg}</span>
        </div>
      )}

    </div>
  );
}

