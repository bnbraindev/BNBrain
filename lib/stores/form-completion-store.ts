import { create } from 'zustand';

export const FORM_EVENT_TTL_MS = 10 * 60 * 1000;
const FORM_SENT_DEDUP_TTL_MS = 2 * 60 * 1000;

export interface FormCompletionEvent {
  id: string;
  conversationId: string;
  formId: string;
  values: Record<string, unknown>;
  timestamp: number;
}

interface FormCompletionState {
  pending: FormCompletionEvent[];
  sentFormIds: Map<string, number>;
  push: (event: Omit<FormCompletionEvent, 'id' | 'timestamp'>) => void;
  consume: (id: string) => void;
  pruneExpired: () => void;
}

function pruneFormSentIds(now: number, sent: Map<string, number>): Map<string, number> {
  const next = new Map<string, number>();
  for (const [id, timestamp] of sent) {
    if (now - timestamp <= FORM_SENT_DEDUP_TTL_MS) {
      next.set(id, timestamp);
    }
  }
  return next;
}

export const useFormCompletionStore = create<FormCompletionState>((set, get) => ({
  pending: [],
  sentFormIds: new Map(),
  push: (event) => {
    const now = Date.now();
    const dedupKey = `form:${event.conversationId}:${event.formId}`;
    const state = get();
    const prunedPending = state.pending.filter((e) => now - e.timestamp <= FORM_EVENT_TTL_MS);
    const prunedSent = pruneFormSentIds(now, state.sentFormIds);
    if (prunedSent.has(dedupKey)) return;
    if (prunedPending.some((e) => e.id === dedupKey)) return;
    set((s) => ({
      sentFormIds: pruneFormSentIds(now, s.sentFormIds),
      pending: [
        ...s.pending.filter((e) => now - e.timestamp <= FORM_EVENT_TTL_MS),
        { ...event, id: dedupKey, timestamp: now },
      ],
    }));
  },
  consume: (id) => {
    const now = Date.now();
    set((s) => ({
      pending: s.pending.filter((e) => e.id !== id && now - e.timestamp <= FORM_EVENT_TTL_MS),
      sentFormIds: new Map([...pruneFormSentIds(now, s.sentFormIds), [id, now]]),
    }));
  },
  pruneExpired: () => {
    const now = Date.now();
    set((s) => ({
      pending: s.pending.filter((e) => now - e.timestamp <= FORM_EVENT_TTL_MS),
      sentFormIds: pruneFormSentIds(now, s.sentFormIds),
    }));
  },
}));
