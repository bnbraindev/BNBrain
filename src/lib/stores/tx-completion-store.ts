import { create } from 'zustand';

export const TX_EVENT_TTL_MS = 10 * 60 * 1000;
const TX_SENT_DEDUP_TTL_MS = 10 * 60 * 1000;

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
  sentHashes: Map<string, number>;
  push: (event: Omit<TxCompletionEvent, 'id' | 'timestamp'>) => void;
  consume: (id: string) => void;
  pruneExpired: () => void;
}

function pruneSentHashes(now: number, sent: Map<string, number>): Map<string, number> {
  const next = new Map<string, number>();
  for (const [id, timestamp] of sent) {
    if (now - timestamp <= TX_SENT_DEDUP_TTL_MS) {
      next.set(id, timestamp);
    }
  }
  return next;
}

export const useTxCompletionStore = create<TxCompletionState>((set, get) => ({
  pending: [],
  sentHashes: new Map(),
  push: (event) => {
    const now = Date.now();
    const dedupKey = `tx:${event.conversationId}:${event.hash}`;
    const state = get();
    const prunedPending = state.pending.filter((e) => now - e.timestamp <= TX_EVENT_TTL_MS);
    const prunedSent = pruneSentHashes(now, state.sentHashes);
    if (prunedSent.has(dedupKey)) return;
    if (prunedPending.some((e) => e.id === dedupKey)) return;
    set((s) => ({
      sentHashes: pruneSentHashes(now, s.sentHashes),
      pending: [
        ...s.pending.filter((e) => now - e.timestamp <= TX_EVENT_TTL_MS),
        { ...event, id: dedupKey, timestamp: now },
      ],
    }));
  },
  consume: (id) => {
    const now = Date.now();
    set((s) => ({
      pending: s.pending.filter((e) => e.id !== id && now - e.timestamp <= TX_EVENT_TTL_MS),
      sentHashes: new Map([...pruneSentHashes(now, s.sentHashes), [id, now]]),
    }));
  },
  pruneExpired: () => {
    const now = Date.now();
    set((s) => ({
      pending: s.pending.filter((e) => now - e.timestamp <= TX_EVENT_TTL_MS),
      sentHashes: pruneSentHashes(now, s.sentHashes),
    }));
  },
}));
