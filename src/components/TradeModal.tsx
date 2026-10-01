'use client';

import React, { useState, useEffect } from 'react';
import { Memecoin } from '@/lib/types';
import { formatNaira, formatKobo } from '@/lib/formatters';
import { X, Flame, ArrowDownUp, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import confetti from 'canvas-confetti';

interface TradeModalProps {
  token: Memecoin | null;
  isOpen: boolean;
  onClose: () => void;
  onExecuteTrade: (token: Memecoin, isBuy: boolean, amount: number) => Promise<boolean>;
  userCngnBalance: number;
}

export default function TradeModal({
  token,
  isOpen,
  onClose,
  onExecuteTrade,
  userCngnBalance,
}: TradeModalProps) {
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState<string>('5000');
  const [slippage, setSlippage] = useState<number>(1.0);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setStatusMessage(null);
  }, [token, tab]);

  if (!isOpen || !token) return null;

  const numericAmount = parseFloat(amount) || 0;

  // Real-time calculations based on constant product virtual AMM
  // 1.0% platform fee + 0.35% creator fee = 1.35% total fee
  const platformFee = numericAmount * 0.01;
  const creatorFee = numericAmount * 0.0035;
  const netAmount = Math.max(0, numericAmount - platformFee - creatorFee);

  // Approximate tokens out: (netAmount in cNGN / price per token in cNGN)
  const pricePerTokenCngn = token.priceKobo / 100;
  const estimatedTokensOut = pricePerTokenCngn > 0 ? (netAmount / pricePerTokenCngn) : 0;

  // Estimated cNGN out on sell
  const estimatedCngnOutOnSell = (numericAmount * pricePerTokenCngn) * (1 - 0.0135);

  const handleQuickSelect = (val: number) => {
    setAmount(val.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numericAmount <= 0) return;

    setLoading(true);
    setStatusMessage(null);

    try {
      const success = await onExecuteTrade(token, tab === 'buy', numericAmount);
      if (success) {
        if (tab === 'buy') {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#00FF87', '#008751', '#F59E0B'],
          });
        }
        setStatusMessage({
          type: 'success',
          text: tab === 'buy'
            ? `Oshey! You don successfully buy ${estimatedTokensOut.toLocaleString(undefined, { maximumFractionDigits: 0 })} $${token.symbol}!`
            : `Sharp! You don cash out ₦${estimatedCngnOutOnSell.toLocaleString(undefined, { maximumFractionDigits: 0 })} cNGN back to your bag!`,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: 'Trade failed. Please check your cNGN balance or retry.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Transaction error occurred.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(4, 6, 10, 0.85)',
      backdropFilter: 'blur(14px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px',
    }}>
      <div className="card-glass" style={{
        width: '100%',
        maxWidth: '480px',
        padding: '28px',
        backgroundColor: '#0F141F',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
      }}>
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src={token.imageUri}
              alt={token.name}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                objectFit: 'cover',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800 }}>{token.name}</h3>
                <span style={{ color: 'var(--cowrie-gold-light)', fontWeight: 700 }}>
                  ${token.symbol}
                </span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--kobo-green)', fontWeight: 600 }}>
                {formatKobo(token.priceKobo)} per token
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Buy / Sell Tabs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          padding: '4px',
          borderRadius: '14px',
          marginBottom: '20px',
        }}>
          <button
            onClick={() => setTab('buy')}
            style={{
              padding: '10px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: tab === 'buy' ? 'var(--kobo-green)' : 'transparent',
              color: tab === 'buy' ? '#041008' : 'var(--text-secondary)',
            }}
          >
            Pack Am (Buy)
          </button>
          <button
            onClick={() => setTab('sell')}
            style={{
              padding: '10px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: tab === 'sell' ? '#EF4444' : 'transparent',
              color: tab === 'sell' ? '#FFFFFF' : 'var(--text-secondary)',
            }}
          >
            Cash Out (Sell)
          </button>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '12px',
              marginBottom: '8px',
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                {tab === 'buy' ? 'Amount in cNGN (Naira)' : `Amount in $${token.symbol}`}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                Your Bag: ₦{userCngnBalance.toLocaleString()} cNGN
              </span>
            </div>

            <div style={{
              position: 'relative',
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderRadius: '14px',
              border: '1px solid var(--border-subtle)',
              overflow: 'hidden',
            }}>
              <input
                type="number"
                min="100"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  padding: '14px 18px',
                  color: '#FFFFFF',
                  fontSize: '20px',
                  fontWeight: 700,
                  outline: 'none',
                }}
              />
              <span style={{
                position: 'absolute',
                right: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--text-muted)',
              }}>
                {tab === 'buy' ? 'cNGN' : token.symbol}
              </span>
            </div>
          </div>

          {/* Quick Amount Chips */}
          {tab === 'buy' && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {[1000, 5000, 20000, 50000, 100000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickSelect(val)}
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    borderRadius: '8px',
                    padding: '5px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ₦{val.toLocaleString()}
                </button>
              ))}
            </div>
          )}

          {/* Trade Output Simulation */}
          <div style={{
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '14px',
            padding: '14px',
            marginBottom: '20px',
            fontSize: '12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>You will receive:</span>
              <span style={{ fontWeight: 700, color: 'var(--kobo-green)', fontSize: '14px' }}>
                {tab === 'buy'
                  ? `${estimatedTokensOut.toLocaleString(undefined, { maximumFractionDigits: 0 })} $${token.symbol}`
                  : `₦${estimatedCngnOutOnSell.toLocaleString(undefined, { maximumFractionDigits: 0 })} cNGN`}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: 'var(--text-muted)' }}>
              <span>Platform Fee (1.00%)</span>
              <span>₦{platformFee.toFixed(2)} cNGN</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: 'var(--text-muted)' }}>
              <span>Creator Royalty (0.35%)</span>
              <span style={{ color: 'var(--cowrie-gold-light)' }}>
                ₦{creatorFee.toFixed(2)} cNGN
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span>Max Slippage</span>
              <span>{slippage}%</span>
            </div>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px',
              borderRadius: '12px',
              marginBottom: '16px',
              fontSize: '13px',
              backgroundColor: statusMessage.type === 'success' ? 'rgba(0, 255, 135, 0.12)' : 'rgba(239, 68, 68, 0.15)',
              color: statusMessage.type === 'success' ? 'var(--kobo-green)' : '#F87171',
              border: `1px solid ${statusMessage.type === 'success' ? 'rgba(0, 255, 135, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            }}>
              {statusMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || numericAmount <= 0}
            className={tab === 'buy' ? 'btn-kobo' : 'btn-secondary'}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '15px',
              backgroundColor: tab === 'sell' ? '#EF4444' : undefined,
              borderColor: tab === 'sell' ? '#DC2626' : undefined,
              color: tab === 'sell' ? '#FFF' : undefined,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <span>Confirming on Base...</span>
            ) : tab === 'buy' ? (
              <>
                <Flame size={18} />
                <span>Pack Am for ₦{numericAmount.toLocaleString()} cNGN</span>
              </>
            ) : (
              <>
                <ArrowDownUp size={18} />
                <span>Cash Out to Bag</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
