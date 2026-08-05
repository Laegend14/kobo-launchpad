'use client';

import React, { useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { TradeItem, compareTradesAsc } from '@/lib/metrics';

interface PriceChartProps {
  symbol: string;
  name?: string;
  trades?: TradeItem[];
  currentPrice?: number;
  priceChange24h?: number;
}

export default function PriceChart({
  symbol,
  name,
  trades = [],
  currentPrice = 0.0000385,
  priceChange24h = 42.8
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = '';

    const width = container.clientWidth || 600;
    const height = 280;
    const padding = 20;

    // Generate price series from trades or fallback curve steps
    let pricePoints: number[] = [];
    if (trades.length > 0) {
      // Order by (blockNumber, logIndex), not timestamp. Arc's sub-second blocks share a
      // block.timestamp, so a timestamp sort drew the price series in arbitrary order
      // within each second — the chart zig-zagged instead of tracking the curve.
      const sorted = [...trades].sort(compareTradesAsc);
      pricePoints = sorted.map(t => t.price);
    }
    if (pricePoints.length === 0) {
      pricePoints = [0.00001, 0.000015, 0.000018, 0.000022, 0.000028, currentPrice];
    } else if (pricePoints.length === 1) {
      pricePoints.unshift(pricePoints[0] * 0.8);
    }

    const minPrice = Math.min(...pricePoints) * 0.9;
    const maxPrice = Math.max(...pricePoints) * 1.1;
    const priceRange = maxPrice - minPrice || 1;

    const stepX = (width - padding * 2) / (pricePoints.length - 1 || 1);

    const points: [number, number][] = pricePoints.map((p, idx) => {
      const x = padding + idx * stepX;
      const normalizedY = (p - minPrice) / priceRange;
      const y = height - padding - normalizedY * (height - padding * 2);
      return [x, y];
    });

    const isPositive = priceChange24h >= 0;
    const colorHex = isPositive ? "#00E676" : "#FF5252";

    const pathD = points.reduce((acc, [x, y], i) => `${acc} ${i === 0 ? 'M' : 'L'} ${x} ${y}`, '');
    const lastX = points[points.length - 1][0];
    const firstX = points[0][0];
    const areaD = `${pathD} L ${lastX} ${height} L ${firstX} ${height} Z`;

    const lastPoint = points[points.length - 1];

    const svg = `
      <svg width="100%" height="280" viewBox="0 0 ${width} 280" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartGradient_${symbol}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${colorHex}" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="${colorHex}" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <path d="${areaD}" fill="url(#chartGradient_${symbol})" />
        <path d="${pathD}" stroke="${colorHex}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${lastPoint[0]}" cy="${lastPoint[1]}" r="6" fill="${colorHex}" class="animate-ping" />
        <circle cx="${lastPoint[0]}" cy="${lastPoint[1]}" r="4" fill="#FFFFFF" />
      </svg>
    `;

    container.innerHTML = svg;
  }, [symbol, trades, currentPrice, priceChange24h]);

  const isPositive = priceChange24h >= 0;

  return (
    <div className="w-full glass-card rounded-2xl p-5 border border-white/10 relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          {isPositive ? (
            <TrendingUp className="w-5 h-5 text-[#00E676]" />
          ) : (
            <TrendingDown className="w-5 h-5 text-red-500" />
          )}
          <h3 className="font-grotesk font-bold text-lg text-white">
            ${symbol} / cNGN Live Price Chart
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`text-xs font-grotesk font-bold px-2.5 py-1 rounded-lg border ${
            isPositive
              ? 'bg-emerald-500/10 text-[#00E676] border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            {isPositive ? '+' : ''}{priceChange24h.toFixed(2)}% 24h
          </span>
          <span className="text-xs text-slate-400 font-mono">1m | 5m | 15m | 1h</span>
        </div>
      </div>

      {/* Chart Canvas Container */}
      <div ref={containerRef} className="w-full h-[280px] relative" />

      <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-white/5 font-mono">
        <span>Current Price: <strong className="text-white font-bold">{currentPrice.toFixed(8)} cNGN</strong></span>
        <span>Trades: <strong className="text-emerald-400">{trades.length}</strong></span>
      </div>
    </div>
  );
}

