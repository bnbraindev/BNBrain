'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance, useConfig } from 'wagmi';
import { formatUnits } from 'viem';
import { useDebugMode } from '@/lib/debug/context';
import { useChatStore } from '@/lib/stores/chat-store';
import { cn } from '@/lib/utils';
import { clearWalletSession } from '@/lib/services/wallet-auth';
import { useEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n/context';

function formatBnbBalance(value: bigint, decimals: number): string {
  const formatted = formatUnits(value, decimals);
  const num = parseFloat(formatted);
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  if (num < 1) return num.toFixed(4);
  if (num < 100) return num.toFixed(3);
  if (num < 10000) return num.toFixed(2);
  return num.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function BalanceDisplay() {
  const { address, isConnected, chainId } = useAccount();
  const { enabled: debugEnabled } = useDebugMode();
  const {
    data: balance,
    error,
    status,
    fetchStatus,
  } = useBalance({
    address,
    chainId,
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 15_000,
      staleTime: 10_000,
      retry: 3,
      retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
    },
  });

  if (debugEnabled) {
    console.log('[BalanceDisplay]', {
      address,
      chainId,
      isConnected,
      status,
      fetchStatus,
      balance: balance
        ? `${formatUnits(balance.value, balance.decimals)} ${balance.symbol}`
        : null,
      error: error?.message ?? null,
    });
  }

  if (!isConnected) return null;

  if (!balance && debugEnabled) {
    return (
      <span className="text-xs font-medium text-amber-400 tabular-nums" title={error?.message ?? 'loading'}>
        {status === 'error' ? '⚠ err' : '…'}
      </span>
    );
  }

  if (!balance) return null;

  return (
    <span className="text-xs font-medium text-foreground tabular-nums">
      {formatBnbBalance(balance.value, balance.decimals)} {balance.symbol}
    </span>
  );
}

/**
 * Safety-net: detect partial disconnects and clean up remaining connections.
 *
 * RainbowKit calls wagmi `disconnect()` internally, but wagmi only disconnects
 * the current connector. If two connectors share one wallet provider
 * (injected + metaMaskSDK), one can remain connected unless we force cleanup.
 */
function useDisconnectWatcher() {
  const config = useConfig();
  const forceDisconnectingRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const clearRecentConnectorHint = async () => {
      try {
        await config.storage?.removeItem('recentConnectorId');
      } catch {
        // ignore
      }

      try {
        window.localStorage.removeItem('wagmi.recentConnectorId');
      } catch {
        // ignore
      }
    };

    const forceFullDisconnect = async () => {
      if (forceDisconnectingRef.current) return;
      forceDisconnectingRef.current = true;
      try {
        const connections = Array.from(config.state.connections.values());
        for (const connection of connections) {
          try {
            await connection.connector.disconnect();
          } catch {
            // keep cleaning even if a connector throws
          }
        }

        config.setState((x) => ({
          ...x,
          connections: new Map(),
          current: null,
          status: 'disconnected',
        }));
        await clearRecentConnectorHint();
      } finally {
        forceDisconnectingRef.current = false;
      }
    };

    const unsubscribe = config.subscribe(
      (state) => ({
        size: state.connections.size,
        status: state.status,
        current: state.current,
      }),
      (next, prev) => {
        if (
          prev.size > next.size &&
          next.size > 0 &&
          prev.status === 'connected' &&
          next.status === 'connected' &&
          prev.current !== next.current
        ) {
          void forceFullDisconnect();
          return;
        }

        if (prev.status === 'connected' && next.status === 'disconnected') {
          void clearRecentConnectorHint();
          // Clear server session first, then update local state.
          // Don't call clearWalletConversations here — the sidebar sync
          // effect will handle it after verifying the session is gone,
          // avoiding a race where conversations are deleted prematurely.
          const { authenticatedAddress, setAuthenticatedAddress } = useChatStore.getState();
          if (authenticatedAddress) {
            void clearWalletSession({ allDevices: false })
              .catch(() => undefined)
              .finally(() => {
                useChatStore.getState().setAuthenticatedAddress(null);
              });
          }
        }
      }
    );

    return () => unsubscribe();
  }, [config]);
}

export function WalletButton() {
  useDisconnectWatcher();
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const { address: connectedAddress } = useAccount();
  const authenticatedAddress = useChatStore((s) => s.authenticatedAddress);
  const isMismatch = Boolean(
    authenticatedAddress && connectedAddress &&
    authenticatedAddress.toLowerCase() !== connectedAddress.toLowerCase()
  );

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const connected = mounted && account && chain;

        return (
          <div
            {...(!mounted && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none' as const,
                userSelect: 'none' as const,
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    type="button"
                    onClick={openConnectModal}
                    className="flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-border bg-card/80 px-3 text-sm font-medium text-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-card"
                  >
                    {zh ? '连接钱包' : 'Connect Wallet'}
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    type="button"
                    onClick={openChainModal}
                    className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-xs font-medium text-red-400 shadow-sm transition-colors hover:bg-red-500/15"
                  >
                    <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
                    {zh ? '网络错误' : 'Wrong network'}
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-1.5">
                  {/* Chain button */}
                  <button
                    type="button"
                    onClick={openChainModal}
                    className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-card/80 px-2.5 shadow-sm backdrop-blur-md transition-colors hover:bg-card"
                    title={chain.name}
                  >
                    {chain.hasIcon && chain.iconUrl && (
                      <img
                        src={chain.iconUrl}
                        alt={chain.name ?? 'Chain'}
                        className="size-4 rounded-full"
                      />
                    )}
                  </button>

                  {/* Account button with balance */}
                  <button
                    type="button"
                    onClick={openAccountModal}
                    className={cn(
                      'flex h-9 cursor-pointer items-center gap-2 rounded-xl border px-3 shadow-sm backdrop-blur-md transition-colors',
                      isMismatch
                        ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15'
                        : 'border-border bg-card/80 hover:bg-card'
                    )}
                    title={isMismatch ? (zh ? '钱包地址与登录会话不匹配' : 'Wallet address does not match signed-in session') : undefined}
                  >
                    {isMismatch && (
                      <span className="size-1.5 shrink-0 rounded-full bg-amber-400 animate-pulse" />
                    )}
                    <BalanceDisplay />
                    <span className={cn('text-xs', isMismatch ? 'text-amber-400' : 'text-muted-foreground')}>
                      {account.displayName}
                    </span>
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
