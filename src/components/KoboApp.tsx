'use client';

import React, { useState } from 'react';
import Header from '@/components/Header';
import OdogwuBanner from '@/components/OdogwuBanner';
import TokenCard from '@/components/TokenCard';
import TradeModal from '@/components/TradeModal';
import PaystackModal from '@/components/PaystackModal';
import CreateCoinModal from '@/components/CreateCoinModal';
import { Memecoin, TradeActivity } from '@/lib/types';
import { formatNaira, formatKobo, shortenAddress, timeAgo } from '@/lib/formatters';
import { Search, Flame, Sparkles, Filter, Activity, Compass, ShieldCheck } from 'lucide-react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';

// Initial Starter Culturally Rich Memecoins
const INITIAL_TOKENS: Memecoin[] = [
  {
    address: '0x1D4N000000000000000000000000000000000001',
    name: 'Idan Coin',
    symbol: 'IDAN',
    imageUri: 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=400&auto=format&fit=crop&q=80',
    description: 'Idan no dey panic sell. The crowned lion of Nigerian degen culture. Pure Odogwu prestige on Base!',
    creator: '0x959C2c33419b009ce02113BFAee45d4ae72981f8',
    realCngn: '7450000000000',
    realTokens: '210000000000000000000000000',
    virtualCngn: '9950000000000',
    virtualTokens: '251256281000000000000000000',
    graduated: false,
    createdAt: Date.now() - 3600000 * 5,
    totalTrades: 142,
    marketCapNaira: 19850000,
    priceKobo: 0.0396,
    progressPercent: 74.5,
    cultureTag: 'Igbo',
  },
  {
    address: '0x54P4000000000000000000000000000000000002',
    name: 'Sapa Slayer',
    symbol: 'SAPA',
    imageUri: 'https://images.unsplash.com/photo-1579621970795-87facc2f976d?w=400&auto=format&fit=crop&q=80',
    description: 'The official hedge against Nigerian inflation. Buy SAPA, conquer hunger, and chop life.',
    creator: '0x71C...4391',
    realCngn: '4120000000000',
    realTokens: '450000000000000000000000000',
    virtualCngn: '6620000000000',
    virtualTokens: '377643504000000000000000000',
    graduated: false,
    createdAt: Date.now() - 3600000 * 8,
    totalTrades: 89,
    marketCapNaira: 10420000,
    priceKobo: 0.0175,
    progressPercent: 41.2,
    cultureTag: 'Pan-Naija',
  },
  {
    address: '0x4R3W400000000000000000000000000000000003',
    name: 'Arewa Knot',
    symbol: 'AREWA',
    imageUri: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80',
    description: 'Rooted in Northern resilience. Cryptographically secure, unruggable, and deeply cultured.',
    creator: '0x44B...18A2',
    realCngn: '5890000000000',
    realTokens: '320000000000000000000000000',
    virtualCngn: '8390000000000',
    virtualTokens: '297973778000000000000000000',
    graduated: false,
    createdAt: Date.now() - 3600000 * 12,
    totalTrades: 114,
    marketCapNaira: 14750000,
    priceKobo: 0.0281,
    progressPercent: 58.9,
    cultureTag: 'Hausa',
  },
  {
    address: '0x71V0000000000000000000000000000000000004',
    name: 'Tiv Warrior',
    symbol: 'ANGER',
    imageUri: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=400&auto=format&fit=crop&q=80',
    description: 'Inspired by the iconic A\'nger black-and-white stripes of Benue. Pure discipline and community solidarity.',
    creator: '0x889...8821',
    realCngn: '3250000000000',
    realTokens: '520000000000000000000000000',
    virtualCngn: '5750000000000',
    virtualTokens: '434782608000000000000000000',
    graduated: false,
    createdAt: Date.now() - 3600000 * 18,
    totalTrades: 63,
    marketCapNaira: 8100000,
    priceKobo: 0.0132,
    progressPercent: 32.5,
    cultureTag: 'Tiv',
  },
  {
    address: '0x0W4MB30000000000000000000000000000000005',
    name: 'Owambe Party',
    symbol: 'OWAMBE',
    imageUri: 'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=400&auto=format&fit=crop&q=80',
    description: 'Spray money like Saturday in Lagos! The loudest, happiest community token with Aso-Oke style.',
    creator: '0x32A...199C',
    realCngn: '6850000000000',
    realTokens: '250000000000000000000000000',
    virtualCngn: '9350000000000',
    virtualTokens: '267379679000000000000000000',
    graduated: false,
    createdAt: Date.now() - 3600000 * 22,
    totalTrades: 129,
    marketCapNaira: 17200000,
    priceKobo: 0.0349,
    progressPercent: 68.5,
    cultureTag: 'Yoruba',
  },
  {
    address: '0xZ4Z0000000000000000000000000000000000006',
    name: 'Portable Zazu',
    symbol: 'ZAZOO',
    imageUri: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80',
    description: 'Ika of Africa! No dey look Uche face. 100% madness, zero filter, pure street momentum.',
    creator: '0x991...CC41',
    realCngn: '1850000000000',
    realTokens: '640000000000000000000000000',
    virtualCngn: '4350000000000',
    virtualTokens: '574712643000000000000000000',
    graduated: false,
    createdAt: Date.now() - 3600000 * 30,
    totalTrades: 45,
    marketCapNaira: 4800000,
    priceKobo: 0.0075,
    progressPercent: 18.5,
    cultureTag: 'Yoruba',
  },
];

const INITIAL_TRADES: TradeActivity[] = [
  {
    id: 't-1',
    tokenAddress: INITIAL_TOKENS[0].address,
    tokenSymbol: 'IDAN',
    trader: '0x71a2...98f1',
    isBuy: true,
    cngnAmount: 50000,
    tokenAmount: 1262626,
    priceKobo: 0.0396,
    timestamp: Date.now() - 1000 * 45,
  },
  {
    id: 't-2',
    tokenAddress: INITIAL_TOKENS[4].address,
    tokenSymbol: 'OWAMBE',
    trader: '0x34c1...88b2',
    isBuy: true,
    cngnAmount: 100000,
    tokenAmount: 2865329,
    priceKobo: 0.0349,
    timestamp: Date.now() - 1000 * 120,
  },
  {
    id: 't-3',
    tokenAddress: INITIAL_TOKENS[2].address,
    tokenSymbol: 'AREWA',
    trader: '0x92ea...11c4',
    isBuy: true,
    cngnAmount: 25000,
    tokenAmount: 889679,
    priceKobo: 0.0281,
    timestamp: Date.now() - 1000 * 240,
  },
  {
    id: 't-4',
    tokenAddress: INITIAL_TOKENS[1].address,
    tokenSymbol: 'SAPA',
    trader: '0x12bb...45de',
    isBuy: false,
    cngnAmount: 15000,
    tokenAmount: 857142,
    priceKobo: 0.0175,
    timestamp: Date.now() - 1000 * 400,
  },
];

export default function KoboApp() {
  const { primaryWallet } = useDynamicContext();
  const [tokens, setTokens] = useState<Memecoin[]>(INITIAL_TOKENS);
  const [trades, setTrades] = useState<TradeActivity[]>(INITIAL_TRADES);
  const [selectedCulture, setSelectedCulture] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [selectedTokenForTrade, setSelectedTokenForTrade] = useState<Memecoin | null>(null);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [isPaystackModalOpen, setIsPaystackModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // User Balance
  const [cngnBalance, setCngnBalance] = useState<number>(50000); // 50,000 cNGN default test demo

  // Top token (Odogwu) is highest market cap
  const topToken = [...tokens].sort((a, b) => b.marketCapNaira - a.marketCapNaira)[0];

  // Filtering
  const filteredTokens = tokens.filter((t) => {
    const matchesCulture = selectedCulture === 'All' || t.cultureTag === selectedCulture;
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCulture && matchesSearch;
  });

  const handleOpenTrade = (token: Memecoin) => {
    setSelectedTokenForTrade(token);
    setIsTradeModalOpen(true);
  };

  const handleExecuteTrade = async (token: Memecoin, isBuy: boolean, amount: number): Promise<boolean> => {
    if (isBuy && cngnBalance < amount) {
      alert('Insufficient cNGN in bag! Click "Fund Bag (Paystack)" or claim free faucet.');
      return false;
    }

    setTokens((prev) =>
      prev.map((t) => {
        if (t.address === token.address) {
          const deltaCngn = isBuy ? amount : -amount;
          const newMarketCap = Math.max(2500000, t.marketCapNaira + deltaCngn);
          const newProgress = Math.min(100, Math.max(0, t.progressPercent + (deltaCngn / 10000000) * 100));
          const newTrades = t.totalTrades + 1;
          const newPriceKobo = t.priceKobo * (isBuy ? 1.02 : 0.98);

          return {
            ...t,
            marketCapNaira: newMarketCap,
            progressPercent: newProgress,
            totalTrades: newTrades,
            priceKobo: newPriceKobo,
            graduated: newProgress >= 100,
          };
        }
        return t;
      })
    );

    setCngnBalance((prev) => (isBuy ? prev - amount : prev + amount * 0.9865));

    const newTrade: TradeActivity = {
      id: 't-' + Date.now(),
      tokenAddress: token.address,
      tokenSymbol: token.symbol,
      trader: primaryWallet?.address ? shortenAddress(primaryWallet.address) : '0xdegen...77a',
      isBuy,
      cngnAmount: amount,
      tokenAmount: Math.round(amount / (token.priceKobo / 100)),
      priceKobo: token.priceKobo,
      timestamp: Date.now(),
    };
    setTrades((prev) => [newTrade, ...prev.slice(0, 7)]);

    return true;
  };

  const handleCreateTokenSuccess = (newToken: Memecoin) => {
    setTokens((prev) => [newToken, ...prev]);
    setIsCreateModalOpen(false);
  };

  const handleDepositSuccess = (cngnAmount: number) => {
    setCngnBalance((prev) => prev + cngnAmount);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Header
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
        onOpenPaystackModal={() => setIsPaystackModalOpen(true)}
        cngnBalance={cngnBalance.toLocaleString()}
      />

      {/* Main Content */}
      <main style={{ flex: 1, paddingBottom: '60px' }}>
        {/* Odogwu Showcase */}
        <OdogwuBanner topToken={topToken} onTrade={handleOpenTrade} />

        {/* Live Trade Ticker Strip */}
        <section style={{
          maxWidth: '1280px',
          margin: '0 auto 28px auto',
          padding: '0 24px',
        }}>
          <div style={{
            backgroundColor: 'rgba(16, 21, 32, 0.65)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '14px',
            padding: '10px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            overflowX: 'auto',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--kobo-green)',
              fontSize: '12px',
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}>
              <Activity size={15} />
              <span>LIVE DEGEN ACTION:</span>
            </div>

            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flex: 1 }}>
              {trades.slice(0, 4).map((trade) => (
                <div
                  key={trade.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>{trade.trader}</span>
                  <span style={{
                    color: trade.isBuy ? 'var(--kobo-green)' : '#F87171',
                    fontWeight: 700,
                  }}>
                    {trade.isBuy ? 'packed' : 'cashed'} ₦{trade.cngnAmount.toLocaleString()}
                  </span>
                  <span style={{ color: 'var(--cowrie-gold-light)', fontWeight: 600 }}>
                    ${trade.tokenSymbol}
                  </span>
                  <span style={{ color: '#475569', fontSize: '10px' }}>
                    ({timeAgo(trade.timestamp)})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Search & Cultural Navigation */}
        <section style={{
          maxWidth: '1280px',
          margin: '0 auto 24px auto',
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          <div style={{
            display: 'flex',
            gap: '8px',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            padding: '4px',
            borderRadius: '12px',
            border: '1px solid var(--border-subtle)',
            overflowX: 'auto',
          }}>
            {[
              { id: 'All', label: 'All Vibes 🇳🇬' },
              { id: 'Igbo', label: 'Igbo (Isiagu) 🦁' },
              { id: 'Yoruba', label: 'Yoruba (Owambe) 🥁' },
              { id: 'Hausa', label: 'Hausa (Arewa) 🛡️' },
              { id: 'Tiv', label: 'Tiv (A\'nger) 🦓' },
              { id: 'Pan-Naija', label: 'Street Naija ⚡' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCulture(cat.id)}
                style={{
                  background: selectedCulture === cat.id ? 'var(--bg-elevated)' : 'transparent',
                  color: selectedCulture === cat.id ? '#FFFFFF' : 'var(--text-secondary)',
                  border: selectedCulture === cat.id ? '1px solid rgba(255, 255, 255, 0.15)' : 'none',
                  borderRadius: '9px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div style={{
            position: 'relative',
            width: '280px',
          }}>
            <Search
              size={16}
              color="var(--text-muted)"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Find any vibe or token..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '9px 12px 9px 36px',
                color: '#FFFFFF',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
        </section>

        {/* Tokens Grid */}
        <section style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '0 24px',
        }}>
          {filteredTokens.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              backgroundColor: 'var(--bg-card)',
              borderRadius: '20px',
              border: '1px dashed var(--border-subtle)',
            }}>
              <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                No coin found for this category! 🤷‍♂️
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Be di first person to cook one coin for this vibe!
              </p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="btn-kobo"
                style={{ marginTop: '16px' }}
              >
                Cook New Coin
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '20px',
            }}>
              {filteredTokens.map((token) => (
                <TokenCard
                  key={token.address}
                  token={token}
                  onTrade={handleOpenTrade}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Cultural Footer */}
      <footer style={{
        backgroundColor: '#05070B',
        borderTop: '1px solid var(--border-subtle)',
        padding: '40px 24px 20px 24px',
        marginTop: '60px',
      }}>
        <div className="tiv-pattern-ribbon" style={{ marginBottom: '28px' }} />

        <div style={{
          maxWidth: '1280px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#FFF' }}>KOBO LAUNCHPAD</span>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--kobo-green)',
                background: 'rgba(0, 255, 135, 0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}>
                BASE L2
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Built for Nigerian Native Memecoins. Powered by cNGN, Dynamic Auth & Paystack.
            </p>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
          }}>
            <span>Tiv 🦓</span>
            <span>•</span>
            <span>Igbo 🦁</span>
            <span>•</span>
            <span>Yoruba 🥁</span>
            <span>•</span>
            <span>Hausa 🛡️</span>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Zero Rugs • 100% Fair Bonding Curve • Base Sepolia
          </div>
        </div>
      </footer>

      {/* Modals */}
      <TradeModal
        token={selectedTokenForTrade}
        isOpen={isTradeModalOpen}
        onClose={() => setIsTradeModalOpen(false)}
        onExecuteTrade={handleExecuteTrade}
        userCngnBalance={cngnBalance}
      />

      <PaystackModal
        isOpen={isPaystackModalOpen}
        onClose={() => setIsPaystackModalOpen(false)}
        onDepositSuccess={handleDepositSuccess}
      />

      <CreateCoinModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateSuccess={handleCreateTokenSuccess}
      />
    </div>
  );
}
