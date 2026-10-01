import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import '@/styles/globals.css';

const DynamicProviderWrapper = dynamic(
  () => import('@/components/DynamicProviderWrapper'),
  { ssr: false }
);

export const metadata: Metadata = {
  title: 'Kobo Launchpad | Naija Native Memecoins on Base',
  description: 'The premier memecoin launchpad where cNGN (Naira) is the base currency. Zero rugs, fair bonding curve, and instant Paystack deposits.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body>
        <DynamicProviderWrapper>
          {children}
        </DynamicProviderWrapper>
      </body>
    </html>
  );
}
