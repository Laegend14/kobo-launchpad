'use client';

import React, { useState } from 'react';
import { X, Building2, CheckCircle2, Sparkles, RefreshCw, ArrowDownUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSwap?: () => void;
}

// Per-claim cap for the simulated Naira faucet. The amount field is free-form, so
// without a ceiling a user could type an arbitrarily large number (or paste
// `1e21`) and mint themselves a meaningless balance, which then flows straight
// into cNGN via the 1:1 swap and distorts every bonding-curve metric.
const MIN_CLAIM_NGN = 100;
const MAX_CLAIM_NGN = 1_000_000;

export default function DepositModal({ isOpen, onClose, onOpenSwap }: DepositModalProps) {
  const { walletAddress, depositNaira } = useAuth();
  // Held as a string so the field can be cleared while typing. `Number('')` is 0 and
  // `Number('abc')` is NaN — the old numeric state turned both into a silently broken
  // amount that was then added to the persisted balance.
  const [amountInput, setAmountInput] = useState<string>('50000');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  // Snapshot of what was actually credited, so the success screen can never report a
  // different figure from the one that was applied.
  const [claimedAmount, setClaimedAmount] = useState<number>(0);

  if (!isOpen) return null;

  const parsed = parseFloat(amountInput);
  const nairaAmount = Number.isFinite(parsed) ? parsed : 0;
  const isTooSmall = nairaAmount > 0 && nairaAmount < MIN_CLAIM_NGN;
  const isTooLarge = nairaAmount > MAX_CLAIM_NGN;
  const isValidClaim = nairaAmount >= MIN_CLAIM_NGN && nairaAmount <= MAX_CLAIM_NGN;

  const handleClaimNaira = async () => {
    if (!isValidClaim || isSubmitting) return;
    setIsSubmitting(true);

    await new Promise(res => setTimeout(res, 800));

    // Credit FIRST, then show success — the success screen must never claim a deposit
    // that hasn't been applied.
    depositNaira(nairaAmount);
    setClaimedAmount(nairaAmount);
    setIsSubmitting(false);
    setIsSuccess(true);
  };

  // Every exit path resets the success screen. Previously only the "Done" button did,
  // so closing via the X left `isSuccess` latched and the modal reopened showing a
  // stale "Naira Credited!" confirmation for a claim that never happened.
  const handleClose = () => {
    setIsSuccess(false);
    setIsSubmitting(false);
    onClose();
  };

  const handleGoToSwap = () => {
    setIsSuccess(false);
    onClose();
    if (onOpenSwap) onOpenSwap();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 font-grotesk overflow-y-auto">
      <div className="w-full max-w-md glass-card rounded-3xl p-4 sm:p-6 border border-emerald-500/30 relative shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto my-auto">
        
        {/* Sticky Header with Exit Button */}
        <div className="flex items-center justify-between sticky top-0 bg-[#0A0E17]/95 backdrop-blur-md pb-2 z-20 border-b border-white/10 -mx-1 px-1 pt-1">
          <div className="flex items-center space-x-2 text-[#00E676]">
            <Sparkles className="w-4 h-4" />
            <h3 className="font-bold text-lg sm:text-xl text-white">Claim Naira Faucet</h3>
          </div>

          <button
            onClick={handleClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition-all border border-white/10 flex items-center justify-center shrink-0"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isSuccess ? (
          <div className="space-y-4">
            <p className="text-xs text-slate-400 leading-relaxed font-inter">
              Claim testnet Naira (₦ NGN) funds to your wallet. You can swap your Naira to <strong>cNGN stablecoin</strong> anytime to trade memecoins.
            </p>

            {/* Amount Selection */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Amount to Claim (₦ NGN)
              </label>
              <input
                type="number"
                min={MIN_CLAIM_NGN}
                max={MAX_CLAIM_NGN}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="w-full py-2.5 px-3.5 rounded-xl bg-[#0A0E17] border border-white/10 text-white font-bold text-base sm:text-lg outline-none focus:border-emerald-500"
              />

              <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                {[10000, 50000, 250000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmountInput(val.toString())}
                    className={`py-1.5 px-2 rounded-lg font-bold border transition-all ${
                      nairaAmount === val
                        ? 'bg-emerald-500/20 border-[#00E676] text-[#00E676]'
                        : 'bg-[#0A0E17] border-white/10 text-slate-300 hover:border-white/30'
                    }`}
                  >
                    ₦{val.toLocaleString('en-NG')}
                  </button>
                ))}
              </div>

              {/* Bounds feedback. The field is free-form, so the reason a claim is
                  blocked has to be visible — a silently disabled button reads as a
                  broken faucet. */}
              {isTooSmall && (
                <p className="text-[11px] text-rose-400 mt-1.5 font-inter">
                  Minimum claim is ₦{MIN_CLAIM_NGN.toLocaleString('en-NG')}.
                </p>
              )}
              {isTooLarge && (
                <p className="text-[11px] text-rose-400 mt-1.5 font-inter">
                  Maximum claim is ₦{MAX_CLAIM_NGN.toLocaleString('en-NG')} per request.
                </p>
              )}
            </div>

            {/* Virtual Account Details info */}
            <div className="bg-[#0A0E17] rounded-xl p-3.5 border border-white/10 space-y-2 text-xs font-inter">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5 font-grotesk font-bold">
                  <Building2 className="w-4 h-4 text-[#FFD700]" />
                  Bank Gateway
                </span>
                <span className="font-bold text-white">Kobo Testnet Naira Ramp</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Target Wallet</span>
                <span className="font-mono text-emerald-400 font-bold">
                  {walletAddress ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}` : 'Connected Wallet'}
                </span>
              </div>
            </div>

            {/* Confirm Action Button */}
            <button
              onClick={handleClaimNaira}
              disabled={isSubmitting || !isValidClaim}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-sm flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/25 transition-all"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing Naira Deposit...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Claim ₦{nairaAmount.toLocaleString('en-NG')} Naira Faucet</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="text-center py-2 space-y-4 font-grotesk">
            <div className="w-14 h-14 bg-emerald-500/20 text-[#00E676] rounded-full flex items-center justify-center mx-auto border border-emerald-500/40">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h4 className="font-bold text-xl sm:text-2xl text-white">Naira Credited!</h4>
              <p className="text-sm text-slate-300 mt-1">
                Your wallet has been credited with <strong>₦{claimedAmount.toLocaleString('en-NG')} NGN</strong>.
              </p>
              <p className="text-xs text-slate-400 mt-2 font-inter">
                Swap your Naira ₦ to <strong>cNGN</strong> anytime to buy &amp; sell memecoins on Kobo Launchpad.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={handleGoToSwap}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-sm flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 transition-all"
              >
                <ArrowDownUp className="w-4 h-4" />
                <span>Buy cNGN with Naira ₦ Now</span>
              </button>

              <button
                onClick={handleClose}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs border border-white/10 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
