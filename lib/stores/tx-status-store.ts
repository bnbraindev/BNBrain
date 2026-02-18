/**
 * Lightweight zustand store for tx status broadcasting.
 *
 * useTransactionExecutor writes here on every status change.
 * Inline badges (message.tsx) and compact cards read from here
 * to display the correct icon / label without mounting the full hook.
 */
import { create } from 'zustand';
import type { TxStatus } from '@/lib/tx/state';

interface TxStatusState {
  /** txKey → latest TxStatus */
  statuses: Record<string, TxStatus>;
  set: (txKey: string, status: TxStatus) => void;
}

export const useTxStatusStore = create<TxStatusState>((set) => ({
  statuses: {},
  set: (txKey, status) =>
    set((s) => {
      if (s.statuses[txKey] === status) return s;
      return { statuses: { ...s.statuses, [txKey]: status } };
    }),
}));
