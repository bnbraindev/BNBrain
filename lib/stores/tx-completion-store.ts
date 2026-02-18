import { create } from 'zustand';

export interface TxCompletionEvent {
  id: string;
  conversationId: string;
  toolName: string;
  mode: string;
  hash: string;
  contractAddress?: string;
  chainId: number;
  extraContext?: string;
  timestamp: number;
}

interface TxCompletionState {
  pending: TxCompletionEvent[];
  sentHashes: Set<string>;
  push: (event: Omit<TxCompletionEvent, 'id' | 'timestamp'>) => void;
  consume: (id: string) => void;
}

export const useTxCompletionStore = create<TxCompletionState>((set, get) => ({
  pending: [],
  sentHashes: new Set(),
  push: (event) => {
    const dedupKey = `tx:${event.hash}`;
    const state = get();
    if (state.sentHashes.has(dedupKey)) return;
    if (state.pending.some((e) => e.id === dedupKey)) return;
    set((s) => ({
      pending: [
        ...s.pending,
        { ...event, id: dedupKey, timestamp: Date.now() },
      ],
    }));
  },
  consume: (id) => {
    set((s) => ({
      pending: s.pending.filter((e) => e.id !== id),
      sentHashes: new Set([...s.sentHashes, id]),
    }));
  },
}));
