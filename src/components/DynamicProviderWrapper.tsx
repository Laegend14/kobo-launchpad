'use client';

import React, { useEffect, useState } from 'react';
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';

interface Props {
  children: React.ReactNode;
}

export default function DynamicProviderWrapper({ children }: Props) {
  const [mounted, setMounted] = useState(false);
  const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || '56723438-864e-4a04-a970-e168c8cee6b5';

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div style={{ minHeight: '100vh', backgroundColor: '#06080c' }}>{children}</div>;
  }

  return (
    <DynamicContextProvider
      settings={{
        environmentId,
        walletConnectors: [EthereumWalletConnectors],
        appName: 'Kobo Launchpad',
        appLogoUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=80',
        overrides: {
          evmNetworks: [
            {
              blockExplorerUrls: ['https://sepolia.basescan.org'],
              chainId: 84532,
              chainName: 'Base Sepolia',
              iconUrls: ['https://avatars.githubusercontent.com/u/108554348'],
              name: 'Base Sepolia',
              nativeCurrency: {
                decimals: 18,
                name: 'Ether',
                symbol: 'ETH',
              },
              networkId: 84532,
              rpcUrls: ['https://sepolia.base.org'],
              vanityName: 'Base Sepolia',
            },
          ],
        },
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}
