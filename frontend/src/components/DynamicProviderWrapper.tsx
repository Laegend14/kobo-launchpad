'use client';

import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DynamicProvider, useEvent } from '@dynamic-labs-sdk/react-hooks';
import { createWaasWalletAccounts, getChainsMissingWaasWalletAccounts } from '@dynamic-labs-sdk/client/waas';
import { getDynamicClient } from '../lib/dynamicClient';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class SafeErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("Dynamic Provider Error caught safely:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return <>{this.props.children}</>;
    }
    return this.props.children;
  }
}

function WaasBootstrap() {
  useEvent({
    event: "userChanged",
    listener: async (user: any) => {
      if (!user) return;
      try {
        const missingChains = getChainsMissingWaasWalletAccounts();
        if (missingChains.length === 0) return;
        await createWaasWalletAccounts({ chains: missingChains });
      } catch (err) {
        console.warn("WaaS wallet creation skipped or failed:", err);
      }
    },
  });
  return null;
}

export default function DynamicProviderWrapper({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  }));
  const [client, setClient] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const dynamicInstance = getDynamicClient();
      setClient(dynamicInstance);
    } catch (e) {
      console.warn("Failed to retrieve Dynamic Client:", e);
    }
  }, []);

  if (!mounted || !client) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeErrorBoundary>
        <DynamicProvider client={client}>
          <WaasBootstrap />
          {children}
        </DynamicProvider>
      </SafeErrorBoundary>
    </QueryClientProvider>
  );
}
