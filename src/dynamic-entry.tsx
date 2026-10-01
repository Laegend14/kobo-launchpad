import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DynamicContextProvider,
  DynamicWidget,
  useDynamicContext,
  useEmbeddedWallet,
  useUserWallets,
} from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';

const DYNAMIC_ENV_ID = '56723438-864e-4a04-a970-e168c8cee6b5';

declare global {
  interface Window {
    dynamicAddress?: string | null;
    dynamicUser?: any;
    dynamicIsAuthenticated?: boolean;
    dynamicPrimaryWallet?: any;
    dynamicUserWallets?: any[];
    openDynamicModal?: () => void;
    createDynamicEmbeddedWallet?: () => Promise<any>;
    mountDynamicWidget?: (id?: string) => void;
    onDynamicWalletConnected?: (address: string, user: any) => void;
    onDynamicSocialLoggedIn?: (user: any) => void;
    onDynamicWalletDisconnected?: () => void;
  }
}

function DynamicBridge() {
  const { primaryWallet, user, isAuthenticated, setShowAuthFlow, handleLogOut } = useDynamicContext();
  const userWallets = useUserWallets();
  const { createEmbeddedWallet, userHasEmbeddedWallet } = useEmbeddedWallet();

  useEffect(() => {
    window.openDynamicModal = () => {
      setShowAuthFlow(true);
    };
    window.dynamicLogOut = () => {
      handleLogOut();
    };
    window.createDynamicEmbeddedWallet = async () => {
      try {
        console.log('⚡ [Dynamic] Creating embedded wallet...');
        const w = await createEmbeddedWallet();
        return w;
      } catch (e) {
        console.warn('⚠️ [Dynamic] createEmbeddedWallet error:', e);
        throw e;
      }
    };
    window.getDynamicWalletClient = async () => {
      if (primaryWallet && typeof (primaryWallet as any).getWalletClient === 'function') {
        return await (primaryWallet as any).getWalletClient();
      }
      return null;
    };
    window.getDynamicSigner = async () => {
      if (!primaryWallet) return null;
      try {
        if (typeof (primaryWallet as any).getWalletClient === 'function') {
          const client = await (primaryWallet as any).getWalletClient();
          if (client && (window as any).ethers) {
            const provider = new (window as any).ethers.BrowserProvider(client.transport || client);
            return await provider.getSigner();
          }
        }
        if ((primaryWallet as any).connector && typeof (primaryWallet as any).connector.getProvider === 'function') {
          const p = await (primaryWallet as any).connector.getProvider();
          if (p && (window as any).ethers) {
            const provider = new (window as any).ethers.BrowserProvider(p);
            return await provider.getSigner();
          }
        }
      } catch (err) {
        console.warn('⚠️ [Dynamic] Signer extraction error:', err);
      }
      return null;
    };
  }, [setShowAuthFlow, createEmbeddedWallet, primaryWallet]);

  useEffect(() => {
    // 1. Resolve address from any available source
    let address = primaryWallet?.address;

    if (!address && userWallets && userWallets.length > 0) {
      address = userWallets[0]?.address;
    }

    if (!address && user?.verifiedCredentials) {
      const cred = user.verifiedCredentials.find((c: any) => c.address);
      if (cred?.address) address = cred.address;
    }

    // 2. Publish to global window state
    window.dynamicIsAuthenticated = !!isAuthenticated;
    window.dynamicUser = user || null;
    window.dynamicAddress = address || null;
    window.dynamicPrimaryWallet = primaryWallet || null;
    window.dynamicUserWallets = userWallets || [];

    console.log('🔄 [DynamicBridge State]', {
      isAuthenticated: !!isAuthenticated,
      address: address || null,
      email: user?.email || null,
      walletsCount: userWallets ? userWallets.length : 0
    });

    // 3. Dispatch global CustomEvent for app.js
    window.dispatchEvent(new CustomEvent('dynamic:state_change', {
      detail: { isAuthenticated: !!isAuthenticated, address, user, primaryWallet }
    }));

    // 4. Try auto-creating embedded wallet if authenticated without an address
    if (isAuthenticated && !address && typeof userHasEmbeddedWallet === 'function' && !userHasEmbeddedWallet()) {
      console.log('⚡ [Dynamic] Requesting embedded wallet for social user...');
      createEmbeddedWallet().catch((err: any) => {
        console.warn('ℹ️ [Dynamic] Auto embedded wallet notice:', err?.message || err);
      });
    }

    // 5. Fire legacy callbacks
    if (isAuthenticated) {
      if (address && window.onDynamicWalletConnected) {
        window.onDynamicWalletConnected(address, user);
      } else if (!address && window.onDynamicSocialLoggedIn) {
        window.onDynamicSocialLoggedIn(user);
      }
    } else {
      if (window.onDynamicWalletDisconnected) {
        window.onDynamicWalletDisconnected();
      }
    }
  }, [isAuthenticated, primaryWallet?.address, userWallets, user, userHasEmbeddedWallet, createEmbeddedWallet]);

  return null;
}

export function DynamicAuthApp() {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: DYNAMIC_ENV_ID,
        walletConnectors: [EthereumWalletConnectors],
        appName: 'Kobo Launchpad',
        eventsCallbacks: {
          onAuthSuccess: (args: any) => {
            console.log('✅ Dynamic Auth Success Event:', args);
            window.dynamicUser = args.user;
            const primary = args.primaryWallet?.address || 
              args.user?.verifiedCredentials?.find((c: any) => c.address)?.address;
            window.dynamicAddress = primary || null;
            window.dynamicIsAuthenticated = true;
            window.dispatchEvent(new CustomEvent('dynamic:state_change', {
              detail: { isAuthenticated: true, address: primary, user: args.user, primaryWallet: args.primaryWallet }
            }));
            if (primary && window.onDynamicWalletConnected) {
              window.onDynamicWalletConnected(primary, args.user);
            } else if (window.onDynamicSocialLoggedIn) {
              window.onDynamicSocialLoggedIn(args.user);
            }
          },
          onLogout: () => {
            console.log('ℹ️ Dynamic User Logged Out');
            window.dynamicUser = null;
            window.dynamicAddress = null;
            window.dynamicIsAuthenticated = false;
            window.dispatchEvent(new CustomEvent('dynamic:state_change', {
              detail: { isAuthenticated: false, address: null, user: null, primaryWallet: null }
            }));
            if (window.onDynamicWalletDisconnected) {
              window.onDynamicWalletDisconnected();
            }
          },
        },
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
      <DynamicBridge />
      <DynamicWidget />
    </DynamicContextProvider>
  );
}

function mountWidget(containerId = 'dynamic-widget-root') {
  const mountNode = document.getElementById(containerId);
  if (mountNode) {
    const root = createRoot(mountNode);
    root.render(<DynamicAuthApp />);
    console.log(`🚀 [Dynamic] Mounted successfully to #${containerId}`);
    return true;
  }
  return false;
}

window.mountDynamicWidget = mountWidget;

// Auto mount on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountWidget());
} else {
  mountWidget();
}
