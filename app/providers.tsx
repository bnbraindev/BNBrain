'use client';

import { WagmiProvider, createConfig, http, fallback } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RainbowKitProvider,
  darkTheme,
  connectorsForWallets,
} from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
  coinbaseWallet,
  trustWallet,
} from '@rainbow-me/rainbowkit/wallets';
import '@rainbow-me/rainbowkit/styles.css';
import { bsc, bscTestnet } from 'wagmi/chains';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toast';
import { I18nProvider } from '@/lib/i18n/context';
import { DebugProvider } from '@/lib/debug/context';
import { useState } from 'react';

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'demo';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [injectedWallet, metaMaskWallet, trustWallet, coinbaseWallet, walletConnectWallet],
    },
  ],
  { appName: 'BNBrain', projectId },
);

const config = createConfig({
  connectors,
  chains: [bsc, bscTestnet],
  transports: {
    [bsc.id]: fallback([
      http('https://bsc-dataseed.binance.org'),
      http('https://bsc-dataseed1.defibit.io'),
      http('https://bsc-dataseed1.ninicoin.io'),
    ]),
    [bscTestnet.id]: fallback([
      http('https://bsc-testnet-dataseed.bnbchain.org'),
      http('https://data-seed-prebsc-1-s1.bnbchain.org:8545'),
    ]),
  },
  ssr: false,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#F0B90B',
            accentColorForeground: '#1A1D28',
            borderRadius: 'medium',
          })}
        >
          <I18nProvider>
            <DebugProvider>
              <ToastProvider>
                <TooltipProvider>
                  {children}
                </TooltipProvider>
              </ToastProvider>
            </DebugProvider>
          </I18nProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
