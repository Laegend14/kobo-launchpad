'use client';

import React from 'react';
import { Memecoin } from '@/lib/types';
import { formatNaira, formatKobo } from '@/lib/formatters';
import { TrendingUp, Users, ArrowUpRight, Flame } from 'lucide-react';

interface TokenCardProps {
  token: Memecoin;
  onTrade: (token: Memecoin) => void;
}

export default function TokenCard({ token, onTrade }: TokenCardProps) {
  // Cultural badge styles
  const getCultureStyle = (tag?: string) => {
    switch (tag) {
      case 'Tiv':
        return {
          bg: '#FFFFFF',
          text: '#000000',
          label: 'Tiv (A\'nger)',
          border: '1px solid #FFF',
        };
      case 'Igbo':
        return {
          bg: 'rgba(239, 68, 68, 0.15)',
          text: '#F87171',
          label: 'Igbo (Isiagu)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
        };
      case 'Yoruba':
        return {
          bg: 'rgba(99, 102, 241, 0.15)',
          text: '#A5B4FC',
          label: 'Yoruba (Owambe)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
        };
      case 'Hausa':
        return {
          bg: 'rgba(245, 158, 11, 0.15)',
          text: '#FCD34D',
          label: 'Hausa (Arewa)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
        };
      default:
        return {
          bg: 'rgba(0, 255, 135, 0.12)',
          text: 'var(--kobo-green)',
          label: 'Pan-Naija',
          border: '1px solid rgba(0, 255, 135, 0.25)',
        };
    }
  };

  const culture = getCultureStyle(token.cultureTag);

  return (
    <div className="card-glass" style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top Banner & Culture Tag */}
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
        }}>
          <span style={{
            fontSize: '10px',
            fontWeight: 700,
            backgroundColor: culture.bg,
            color: culture.text,
            border: culture.border,
            padding: '3px 8px',
            borderRadius: '9999px',
            letterSpacing: '0.4px',
          }}>
            {culture.label}
          </span>

          <span style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            fontWeight: 600,
          }}>
            {token.totalTrades} Trades
          </span>
        </div>

        {/* Token Header */}
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          <img
            src={token.imageUri}
            alt={token.name}
            style={{
              width: '58px',
              height: '58px',
              borderRadius: '16px',
              objectFit: 'cover',
              border: '1px solid var(--border-subtle)',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
            }}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{
              fontSize: '17px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: '#FFFFFF',
            }}>
              {token.name}
            </h3>
            <span style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--cowrie-gold-light)',
            }}>
              ${token.symbol}
            </span>
          </div>
        </div>

        {/* Description */}
        <p style={{
          fontSize: '12px',
          color: 'var(--text-secondary)',
          marginTop: '12px',
          lineHeight: '1.4',
          height: '34px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {token.description}
        </p>
      </div>

      {/* Metrics & Progress Bottom */}
      <div style={{ marginTop: '16px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          padding: '10px 12px',
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
          borderRadius: '12px',
          marginBottom: '12px',
        }}>
          <div>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Net Worth
            </span>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>
              {formatNaira(token.marketCapNaira)}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Price
            </span>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--kobo-green)' }}>
              {formatKobo(token.priceKobo)}
            </div>
          </div>
        </div>

        {/* Graduation Progress */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '10px',
            color: 'var(--text-muted)',
            marginBottom: '4px',
          }}>
            <span>Bonding Curve</span>
            <span style={{ color: 'var(--cowrie-gold-light)', fontWeight: 600 }}>
              {token.progressPercent.toFixed(1)}%
            </span>
          </div>
          <div style={{
            height: '6px',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '9999px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, token.progressPercent)}%`,
              backgroundColor: 'var(--kobo-green)',
              borderRadius: '9999px',
            }} />
          </div>
        </div>

        {/* Trade Button */}
        <button
          onClick={() => onTrade(token)}
          className="btn-secondary"
          style={{
            width: '100%',
            justifyContent: 'center',
            padding: '9px',
            fontSize: '13px',
            borderColor: 'rgba(0, 255, 135, 0.25)',
          }}
        >
          <Flame size={15} color="var(--kobo-green)" />
          <span>Pack Am (Trade)</span>
          <ArrowUpRight size={14} color="var(--text-muted)" />
        </button>
      </div>
    </div>
  );
}
