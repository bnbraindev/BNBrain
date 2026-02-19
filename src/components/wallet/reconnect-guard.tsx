'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAccount, useReconnect } from 'wagmi';

const RECONNECT_COOLDOWN_MS = 3000;
const RECONNECT_BOOTSTRAP_DELAYS = [0, 900, 2500];

function hasRecentConnectorHint(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const value = window.localStorage.getItem('wagmi.recentConnectorId');
    return Boolean(value && value.trim());
  } catch {
    return false;
  }
}

export function WalletReconnectGuard() {
  const { isConnected, isConnecting, isReconnecting } = useAccount();
  const { reconnect, connectors } = useReconnect();
  const lastAttemptAtRef = useRef(0);
  // Track if the user was ever connected in this session.
  // Once connected then disconnected → user deliberately disconnected, suppress auto-reconnect.
  const wasConnectedRef = useRef(false);

  useEffect(() => {
    if (isConnected) {
      wasConnectedRef.current = true;
    }
  }, [isConnected]);

  const shouldReconnect = useCallback(() => {
    if (isConnected || isConnecting || isReconnecting) return false;
    if (connectors.length === 0) return false;
    // If user was connected and then disconnected, don't auto-reconnect.
    if (wasConnectedRef.current) return false;
    return hasRecentConnectorHint();
  }, [isConnected, isConnecting, isReconnecting, connectors.length]);

  const tryReconnect = useCallback(() => {
    if (!shouldReconnect()) return;
    const now = Date.now();
    if (now - lastAttemptAtRef.current < RECONNECT_COOLDOWN_MS) return;
    lastAttemptAtRef.current = now;
    reconnect({ connectors });
  }, [shouldReconnect, reconnect, connectors]);

  useEffect(() => {
    if (!shouldReconnect()) return;
    const timers = RECONNECT_BOOTSTRAP_DELAYS.map((delay) =>
      setTimeout(() => {
        tryReconnect();
      }, delay)
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [shouldReconnect, tryReconnect]);

  useEffect(() => {
    const onFocus = () => {
      tryReconnect();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tryReconnect();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [tryReconnect]);

  return null;
}
