'use client';

import React, { useState } from 'react';
import { X, CreditCard, Sparkles, CheckCircle2, AlertCircle, ShieldCheck, Coins } from 'lucide-react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import confetti from 'canvas-confetti';

interface PaystackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDepositSuccess: (cngnAmount: number) => void;
}

export default function PaystackModal({
  isOpen,
  onClose,
  onDepositSuccess,
}: PaystackModalProps) {
  const { primaryWallet } = useDynamicContext();
  const [amount, setAmount] = useState<string>('10000');
  const [email, setEmail] = useState<string>('degen@kobo.xyz');
  const [loading, setLoading] = useState<boolean>(false);
  const [faucetLoading, setFaucetLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const numericAmount = parseFloat(amount) || 0;
  const paystackPublicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || 'pk_test_e4af71e0fdd90c6de06dfbaa0cd315397f5a230c';

  // Handle Paystack Checkout
  const handlePaystackPay = () => {
    if (!primaryWallet?.address) {
      setStatusMessage({ type: 'error', text: 'Please connect your wallet first ("Plug In")!' });
      return;
    }

    if (numericAmount <= 0) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid amount' });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    // Load Paystack Inline script if not already present
    const loadScript = () => {
      return new Promise<boolean>((resolve) => {
        if ((window as any).PaystackPop) {
          resolve(true);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://js.paystack.co/v1/inline.js';
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
      });
    };

    loadScript().then((loaded) => {
      if (!loaded || !(window as any).PaystackPop) {
        setLoading(false);
        setStatusMessage({ type: 'error', text: 'Failed to load Paystack gateway. Check internet connection.' });
        return;
      }

      const handler = (window as any).PaystackPop.setup({
        key: paystackPublicKey,
        email: email,
        amount: Math.round(numericAmount * 100), // Paystack expects amount in Kobo (1 NGN = 100 Kobo)
        currency: 'NGN',
        ref: 'KOBO_' + Math.floor(Math.random() * 1000000000 + 1),
        metadata: {
          custom_fields: [
            {
              display_name: 'Wallet Address',
              variable_name: 'wallet_address',
              value: primaryWallet.address,
            },
          ],
        },
        callback: async (response: any) => {
          setLoading(true);
          try {
            // Verify payment on backend and trigger cNGN transfer
            const res = await fetch('/api/paystack/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                reference: response.reference,
                walletAddress: primaryWallet.address,
                amountNgn: numericAmount,
              }),
            });
            const data = await res.json();

            if (data.success) {
              confetti({
                particleCount: 100,
                spread: 80,
                origin: { y: 0.5 },
                colors: ['#00FF87', '#F59E0B'],
              });
              setStatusMessage({
                type: 'success',
                text: `Payment confirmed! ₦${numericAmount.toLocaleString()} cNGN don land for your bag!`,
              });
              onDepositSuccess(numericAmount);
            } else {
              setStatusMessage({
                type: 'error',
                text: data.message || 'Payment received, but cNGN dispatch encountered an issue.',
              });
            }
          } catch (err: any) {
            setStatusMessage({
              type: 'error',
              text: err.message || 'Verification network error.',
            });
          } finally {
            setLoading(false);
          }
        },
        onClose: () => {
          setLoading(false);
        },
      });

      handler.openIframe();
    });
  };

  // Instant Testnet Faucet Claim (Free 500,000 cNGN)
  const handleClaimFaucet = async () => {
    if (!primaryWallet?.address) {
      setStatusMessage({ type: 'error', text: 'Please connect your wallet first ("Plug In")!' });
      return;
    }

    setFaucetLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: primaryWallet.address,
        }),
      });
      const data = await res.json();

      if (data.success) {
        confetti({
          particleCount: 80,
          spread: 70,
          colors: ['#00FF87', '#FFFFFF'],
        });
        setStatusMessage({
          type: 'success',
          text: `Faucet aza don drop! ₦500,000 cNGN sent to your wallet on Base Sepolia!`,
        });
        onDepositSuccess(500000);
      } else {
        setStatusMessage({
          type: 'error',
          text: data.message || 'Faucet claim failed. Chill small and try again.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Faucet error occurred.',
      });
    } finally {
      setFaucetLoading(false);
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
        maxWidth: '500px',
        padding: '28px',
        backgroundColor: '#0F141F',
        border: '1px solid rgba(0, 255, 135, 0.25)',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'rgba(0, 135, 81, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(0, 255, 135, 0.4)',
            }}>
              <CreditCard size={22} color="var(--kobo-green)" />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Fund Bag (Paystack $\to$ cNGN)</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Deposit Naira (₦) & receive cNGN (1:1 parity) on Base Sepolia
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Faucet Shortcut for quick testnet fun */}
        <div style={{
          backgroundColor: 'rgba(0, 255, 135, 0.08)',
          border: '1px dashed rgba(0, 255, 135, 0.4)',
          borderRadius: '14px',
          padding: '14px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--kobo-green)' }}>
              ⚡ Free Testnet Aza
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Claim ₦500,000 cNGN instantly to test without paying real money!
            </div>
          </div>

          <button
            type="button"
            onClick={handleClaimFaucet}
            disabled={faucetLoading}
            style={{
              background: 'rgba(0, 255, 135, 0.2)',
              border: '1px solid rgba(0, 255, 135, 0.5)',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '12px',
              padding: '8px 14px',
              borderRadius: '10px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {faucetLoading ? 'Dispensing...' : 'Claim ₦500k'}
          </button>
        </div>

        <div style={{
          height: '1px',
          backgroundColor: 'var(--border-subtle)',
          marginBottom: '20px',
        }} />

        {/* Paystack Checkout Section */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Your Email (For Paystack Receipt)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '12px 16px',
              color: '#FFF',
              fontSize: '14px',
              outline: 'none',
              marginBottom: '14px',
            }}
          />

          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Amount in Naira (₦)
          </label>
          <div style={{
            position: 'relative',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            <input
              type="number"
              min="500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                padding: '12px 16px',
                color: '#FFF',
                fontSize: '18px',
                fontWeight: 700,
                outline: 'none',
              }}
            />
            <span style={{
              position: 'absolute',
              right: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontWeight: 700,
              color: 'var(--kobo-green)',
            }}>
              ₦ NGN
            </span>
          </div>
        </div>

        {/* Preset Amount Chips */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {[2000, 5000, 10000, 50000, 100000].map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => setAmount(val.toString())}
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ₦{val.toLocaleString()}
            </button>
          ))}
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

        {/* Checkout Button */}
        <button
          onClick={handlePaystackPay}
          disabled={loading || numericAmount <= 0}
          className="btn-kobo"
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '15px',
            opacity: loading ? 0.7 : 1,
          }}
        >
          <CreditCard size={18} />
          <span>
            {loading ? 'Processing with Paystack...' : `Pay ₦${numericAmount.toLocaleString()} via Paystack (Get cNGN)`}
          </span>
        </button>

        <p style={{
          textAlign: 'center',
          fontSize: '11px',
          color: 'var(--text-muted)',
          marginTop: '12px',
        }}>
          🔒 Paystack Test Checkout (Bank Transfer / Card) • 100% Secure
        </p>
      </div>
    </div>
  );
}
