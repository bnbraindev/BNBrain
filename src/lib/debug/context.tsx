'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const DEBUG_MODE_STORAGE_KEY = 'bnbrain-debug-mode';

interface DebugContextValue {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
}

const DebugContext = createContext<DebugContextValue | null>(null);

function readInitialDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DEBUG_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function DebugProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState<boolean>(readInitialDebugMode);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(DEBUG_MODE_STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // Ignore localStorage write errors
    }
  }, [enabled]);

  const value = useMemo<DebugContextValue>(
    () => ({
      enabled,
      setEnabled,
      toggle: () => setEnabled((prev) => !prev),
    }),
    [enabled]
  );

  return <DebugContext.Provider value={value}>{children}</DebugContext.Provider>;
}

export function useDebugMode() {
  const ctx = useContext(DebugContext);
  if (!ctx) {
    throw new Error('useDebugMode must be used inside DebugProvider');
  }
  return ctx;
}
