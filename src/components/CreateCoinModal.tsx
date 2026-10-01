'use client';

import React, { useState } from 'react';
import { X, Flame, Sparkles, AlertCircle, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import confetti from 'canvas-confetti';

interface CreateCoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSuccess: (tokenData: any) => void;
}

export default function CreateCoinModal({
  isOpen,
  onClose,
  onCreateSuccess,
}: CreateCoinModalProps) {
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [cultureTag, setCultureTag] = useState<'Tiv' | 'Igbo' | 'Yoruba' | 'Hausa' | 'Pan-Naija'>('Igbo');
  const [imageUrl, setImageUrl] = useState('');
  const [initialBuy, setInitialBuy] = useState('5000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const presetImages = [
    {
      label: '🦁 Odogwu Lion (Igbo)',
      url: 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=400&auto=format&fit=crop&q=80',
      culture: 'Igbo',
    },
    {
      label: '⚡ Sapa Hunter (Pan-Naija)',
      url: 'https://images.unsplash.com/photo-1579621970795-87facc2f976d?w=400&auto=format&fit=crop&q=80',
      culture: 'Pan-Naija',
    },
    {
      label: '🥁 Gangan Drum (Yoruba)',
      url: 'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=400&auto=format&fit=crop&q=80',
      culture: 'Yoruba',
    },
    {
      label: '🛡️ Arewa Knot (Hausa)',
      url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80',
      culture: 'Hausa',
    },
    {
      label: '🦓 A\'nger Textile (Tiv)',
      url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=400&auto=format&fit=crop&q=80',
      culture: 'Tiv',
    },
  ];

  const handleSelectPreset = (preset: typeof presetImages[0]) => {
    setImageUrl(preset.url);
    setCultureTag(preset.culture as any);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !symbol.trim()) {
      setError('Please provide coin name and ticker symbol');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const chosenImage = imageUrl.trim() || presetImages[0].url;

      const res = await fetch('/api/tokens/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          description: description.trim() || 'No description provided.',
          imageUri: chosenImage,
          cultureTag,
          initialBuyCngn: parseFloat(initialBuy) || 0,
        }),
      });

      const data = await res.json();

      if (data.success) {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#00FF87', '#F59E0B', '#FFFFFF'],
        });
        onCreateSuccess(data.token);
        onClose();
      } else {
        setError(data.message || 'Failed to deploy token on curve.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred while deploying.');
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
        maxWidth: '520px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '28px',
        backgroundColor: '#0F141F',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF' }}>
              Cook New Coin 🍳
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              100% Fair Launch • Zero Pre-Allocation • Locked Curve
            </p>
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

        <form onSubmit={handleSubmit}>
          {/* Cultural Vibe Selection */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--cowrie-gold-light)', marginBottom: '8px' }}>
              Cultural Vibe
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['Igbo', 'Yoruba', 'Hausa', 'Tiv', 'Pan-Naija'] as const).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setCultureTag(tag)}
                  style={{
                    backgroundColor: cultureTag === tag ? 'var(--kobo-green)' : 'var(--bg-elevated)',
                    color: cultureTag === tag ? '#041008' : 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Name & Symbol */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Coin Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Idan Coin"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  color: '#FFF',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Ticker Symbol
              </label>
              <input
                type="text"
                required
                maxLength={8}
                placeholder="e.g. IDAN"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                style={{
                  width: '100%',
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  color: '#FFF',
                  fontSize: '14px',
                  fontWeight: 700,
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Coin Lore & Description
            </label>
            <textarea
              rows={3}
              placeholder="Tell di people why this coin go pump..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '10px 14px',
                color: '#FFF',
                fontSize: '13px',
                outline: 'none',
                resize: 'none',
                lineHeight: 1.4,
              }}
            />
          </div>

          {/* Image Presets & Input */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Coin Avatar (Choose Culture Preset or Paste URL)
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
              {presetImages.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPreset(p)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: imageUrl === p.url ? 'rgba(0, 255, 135, 0.2)' : 'var(--bg-elevated)',
                    border: imageUrl === p.url ? '1px solid var(--kobo-green)' : '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    color: '#FFF',
                    fontSize: '11px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <img src={p.url} alt={p.label} style={{ width: '18px', height: '18px', borderRadius: '4px', objectFit: 'cover' }} />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            <input
              type="url"
              placeholder="Or enter custom image URL"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '10px 14px',
                color: '#FFF',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          {/* Initial Buy Option */}
          <div style={{
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '14px',
            marginBottom: '20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
              <span style={{ fontWeight: 600, color: 'var(--cowrie-gold-light)' }}>
                Initial Buy (Optional Sniper Protection)
              </span>
              <span style={{ color: 'var(--text-muted)' }}>cNGN</span>
            </div>
            <input
              type="number"
              min="0"
              value={initialBuy}
              onChange={(e) => setInitialBuy(e.target.value)}
              placeholder="0"
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                color: '#FFF',
                fontSize: '16px',
                fontWeight: 700,
                outline: 'none',
              }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Creator earns 0.35% royalty on all curve volume + ₦500k bonus at graduation!
            </p>
          </div>

          {/* Error display */}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px',
              borderRadius: '10px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#F87171',
              fontSize: '12px',
              marginBottom: '14px',
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="btn-kobo"
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '15px',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <Flame size={18} />
            <span>{loading ? 'Deploying to Base Sepolia...' : 'Launch Coin on Kobo (Zero Rug)'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
