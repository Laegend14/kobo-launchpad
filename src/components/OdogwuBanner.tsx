'use client';

import React from 'react';
import { Memecoin } from '@/lib/types';
import { formatNaira, formatKobo } from '@/lib/formatters';
import { Crown, Sparkles, TrendingUp, ShieldCheck, Flame } from 'lucide-react';

interface OdogwuBannerProps {
  topToken: Memecoin | null;
  onTrade: (token: Memecoin) => void;
}

export default function OdogwuBanner({ topToken, onTrade }: OdogwuBannerProps) {
  if (!topToken) return null;

  return (
    <section style={{
      maxWidth: '1280px',
      margin: '24px auto',
      padding: '0 24px',
    }}>
      <div className="card-glass odogwu-glow" style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '28px',
        border: '1px solid rgba(245, 158, 11, 0.35)',
        background: 'linear-gradient(135deg, rgba(16, 21, 32, 0.95), rgba(22, 28, 43, 0.9))',
      }}>
        {/* Subtle decorative background watermarks */}
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '260px',
          height: '260px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245, 158, 11, 0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px',
          flexWrap: 'wrap',
          position: 'relative',
          zIndex: 1,
        }}>
          {/* Left: Token info and cultural badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: '1 1 450px' }}>
            {/* Token Image with Odogwu Crown */}
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                top: '-14px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                borderRadius: '9999px',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 4px 10px rgba(245, 158, 11, 0.5)',
                zIndex: 2,
              }}>
                <Crown size={12} color="#000" strokeWidth={3} />
                <span style={{ fontSize: '9px', fontWeight: 900, color: '#000', letterSpacing: '0.5px' }}>
                  ODOGWU
                </span>
              </div>

              <img
                src={topToken.imageUri}
                alt={topToken.name}
                style={{
                  width: '90px',
                  height: '90px',
                  borderRadius: '20px',
                  objectFit: 'cover',
                  border: '2px solid rgba(245, 158, 11, 0.6)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
                }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span className="arewa-badge">
                  <span>◈ Arewa Knot Lock</span>
                </span>
                <span style={{
                  background: 'rgba(0, 255, 135, 0.12)',
                  color: 'var(--kobo-green)',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(0, 255, 135, 0.3)',
                }}>
                  🔥 OGA AT THE TOP
                </span>
                <span style={{
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#A5B4FC',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '6px',
                }}>
                  {topToken.cultureTag || 'Pan-Naija'} Vibe
                </span>
              </div>

              <h2 style={{
                fontSize: '28px',
                fontWeight: 800,
                marginTop: '8px',
                letterSpacing: '-0.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                {topToken.name}
                <span style={{ color: 'var(--cowrie-gold-light)', fontSize: '20px', fontWeight: 600 }}>
                  ${topToken.symbol}
                </span>
              </h2>

              <p style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                marginTop: '4px',
                maxWidth: '520px',
                lineHeight: 1.5,
              }}>
                {topToken.description}
              </p>
            </div>
          </div>

          {/* Right: Metrics & Graduation Progress */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            minWidth: '280px',
            flex: '0 1 360px',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
            }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Net Worth (Market Cap)
                </span>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF' }}>
                  {formatNaira(topToken.marketCapNaira)}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Current Price
                </span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--kobo-green)' }}>
                  {formatKobo(topToken.priceKobo)}
                </div>
              </div>
            </div>

            {/* Graduation Progress Bar */}
            <div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                fontWeight: 600,
                marginBottom: '6px',
              }}>
                <span style={{ color: 'var(--cowrie-gold-light)' }}>
                  Graduation Meter ({topToken.progressPercent.toFixed(1)}%)
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {topToken.progressPercent >= 80 ? '🚀 Level Don High! Japa Loading...' : 'Target: ₦10M cNGN'}
                </span>
              </div>

              <div style={{
                height: '10px',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '9999px',
                overflow: 'hidden',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, topToken.progressPercent)}%`,
                  background: 'linear-gradient(90deg, #F59E0B, #00FF87)',
                  boxShadow: '0 0 12px rgba(0, 255, 135, 0.6)',
                  borderRadius: '9999px',
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>

            <button
              onClick={() => onTrade(topToken)}
              className="btn-kobo"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '15px',
              }}
            >
              <Flame size={18} />
              <span>Pack Am (Buy ${topToken.symbol})</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
