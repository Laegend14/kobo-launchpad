import './globals.css';
import Navbar from '../components/Navbar';
import { AuthProvider } from '../context/AuthContext';
import DynamicProviderWrapper from '../components/DynamicProviderWrapper';

export const metadata = {
  title: 'Kobo — Naira-Native Memecoin Launchpad',
  description: 'Create, buy, and sell memecoins priced and settled in cNGN (Nigeria regulated Naira stablecoin) with automated Uniswap liquidity migration.',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-[#070a10] text-[#e2e8f0] min-h-screen flex flex-col antialiased">
        <DynamicProviderWrapper>
          <AuthProvider>
            {/* Background glow accents */}
            <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none -z-10" />
            <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-[#00B0FF]/10 rounded-full blur-[140px] pointer-events-none -z-10" />

            <Navbar />

            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {children}
            </main>

            <footer className="border-t border-white/10 py-8 text-center text-xs text-slate-500 font-grotesk">
              <p>© 2026 Kobo Protocol — Powered by Dynamic Auth SDK on Base Sepolia with cNGN.</p>
            </footer>
          </AuthProvider>
        </DynamicProviderWrapper>
      </body>
    </html>
  );
}
