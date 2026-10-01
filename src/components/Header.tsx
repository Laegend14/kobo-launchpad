'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { Flame, PlusCircle, CreditCard, Sparkles, Coins } from 'lucide-react';

const DynamicWidget = dynamic(
  () => import('@dynamic-labs/sdk-react-core').then((mod) => mod.DynamicWidget),
  { ssr: false }
);

interface HeaderProps {
  onOpenCreateModal: () => void;
  onOpenPaystackModal: () => void;
  cngnBalance: string;
}

export default function Header({
  onOpenCreateModal,
  onOpenPaystackModal,
  cngnBalance,
}: HeaderProps) {
  const { user } = useDynamicContext();

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 50,
      backdropFilter: 'blur(20px)',
      backgroundColor: 'rgba(6, 8, 12, 0.85)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      {/* Top Tiv A'nger Cultural Ribbon */}
      <div className="tiv-pattern-ribbon" />

      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap',
      }}>
        {/* Logo and Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #00FF87, #008751)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(0, 255, 135, 0.4)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
          }}>
            <Coins size={26} color="#06080C" strokeWidth={2.5} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '22px',
                fontWeight: 800,
                letterSpacing: '-0.5px',
                background: 'linear-gradient(to right, #FFFFFF, #00FF87)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                KOBO
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                background: 'rgba(0, 255, 135, 0.15)',
                color: 'var(--kobo-green)',
                padding: '2px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(0, 255, 135, 0.3)',
                letterSpacing: '0.5px',
              }}>
                LAUNCHPAD
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
              Naija Native Memecoins on Base • ₦1 cNGN = ₦1
            </p>
          </div>
        </div>

        {/* Live Network & Parity Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'var(--bg-elevated)',
          padding: '6px 14px',
          borderRadius: '9999px',
          border: '1px solid var(--border-subtle)',
          fontSize: '12px',
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#00FF87',
            boxShadow: '0 0 8px #00FF87',
          }} />
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Base Sepolia</span>
          <span style={{ color: 'var(--border-subtle)' }}>|</span>
          <span style={{ color: 'var(--cowrie-gold-light)', fontWeight: 600 }}>
            ₦1 cNGN : ₦1 NGN
          </span>
        </div>

        {/* Action Buttons & Dynamic Wallet */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Paystack Naira Deposit Button */}
          <button
            onClick={onOpenPaystackModal}
            className="btn-secondary"
            title="Deposit Naira with Paystack to get cNGN"
            style={{
              borderColor: 'rgba(0, 255, 135, 0.3)',
              background: 'rgba(0, 135, 81, 0.12)',
            }}
          >
            <CreditCard size={16} color="var(--kobo-green)" />
            <span>Fund Bag (Paystack)</span>
          </button>

          {/* Create Coin Button */}
          <button
            onClick={onOpenCreateModal}
            className="btn-kobo"
            title="Deploy a new coin on the bonding curve"
          >
            <PlusCircle size={16} />
            <span>Cook New Coin</span>
          </button>

          {/* Dynamic Wallet Widget */}
          <div style={{ minWidth: '150px' }}>
            <DynamicWidget
              innerButtonComponent={
                <span style={{ fontWeight: 700, fontSize: '13px' }}>
                  {user ? 'My Bag' : 'Plug In (Wallet)'}
                </span>
              }
            />
          </div>
        </div>
      </div>
    </header>
  );
}
