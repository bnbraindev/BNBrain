import { create } from 'zustand';

export interface FormCompletionEvent {
  id: string;
  conversationId: string;
  formId: string;
  values: Record<string, unknown>;
  timestamp: number;
}

interface FormCompletionState {
  pending: FormCompletionEvent[];
  sentFormIds: Set<string>;
  push: (event: Omit<FormCompletionEvent, 'id' | 'timestamp'>) => void;
  consume: (id: string) => void;
}

export const useFormCompletionStore = create<FormCompletionState>((set, get) => ({
  pending: [],
  sentFormIds: new Set(),
  push: (event) => {
    const dedupKey = `form:${event.formId}`;
    const state = get();
    if (state.sentFormIds.has(dedupKey)) return;
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
      sentFormIds: new Set([...s.sentFormIds, id]),
    }));
  },
}));
