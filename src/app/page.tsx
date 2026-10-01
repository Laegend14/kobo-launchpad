'use client';

import dynamic from 'next/dynamic';

const KoboApp = dynamic(() => import('@/components/KoboApp'), {
  ssr: false,
  loading: () => (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#06080C',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#FFFFFF',
      fontFamily: 'sans-serif',
      gap: '16px',
    }}>
      <div style={{
        width: '54px',
        height: '54px',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, #00FF87, #008751)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 30px rgba(0, 255, 135, 0.4)',
        animation: 'pulse 1.5s infinite ease-in-out',
      }}>
        <span style={{ fontSize: '24px', fontWeight: 900, color: '#06080C' }}>₦</span>
      </div>
      <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '1px' }}>
        KOBO LAUNCHPAD
      </div>
      <p style={{ fontSize: '12px', color: '#94A3B8' }}>
        Loading Naija Memecoins on Base...
      </p>
    </div>
  ),
});

export default function Page() {
  return <KoboApp />;
}
