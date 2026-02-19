export type PersistedPendingRunPhase = 'connecting' | 'streaming' | 'stalled';

export interface PersistedPendingRun {
  conversationId: string;
  phase: PersistedPendingRunPhase;
  startedAt: number;
  firstChunkAt: number | null;
  lastChunkAt: number | null;
  updatedAt: number;
}

const STORAGE_KEY = 'bnbrain-pending-runs-v1';
const MAX_STORED_RUNS = 120;
const RUN_RETENTION_MS = 6 * 60 * 60 * 1000;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function isValidPhase(value: unknown): value is PersistedPendingRunPhase {
  return value === 'connecting' || value === 'streaming' || value === 'stalled';
}

function toFiniteMs(value: unknown): number | null {
  if (!Number.isFinite(value)) return null;
  const parsed = Number(value);
  if (parsed <= 0) return null;
  return Math.floor(parsed);
}

function sanitizeRun(value: unknown): PersistedPendingRun | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.conversationId !== 'string' || !row.conversationId.trim()) return null;
  if (!isValidPhase(row.phase)) return null;
  const startedAt = toFiniteMs(row.startedAt);
  const updatedAt = toFiniteMs(row.updatedAt);
  if (!startedAt || !updatedAt) return null;
  return {
    conversationId: row.conversationId,
    phase: row.phase,
    startedAt,
    firstChunkAt: toFiniteMs(row.firstChunkAt),
    lastChunkAt: toFiniteMs(row.lastChunkAt),
    updatedAt,
  };
}

function readStore(): Record<string, PersistedPendingRun> {
  if (!isBrowser()) return {};
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return {};
  }
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};
  const now = Date.now();
  const result: Record<string, PersistedPendingRun> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const item = sanitizeRun(value);
    if (!item) continue;
    if (now - item.updatedAt > RUN_RETENTION_MS) continue;
    result[key] = item;
  }
  return result;
}

function writeStore(store: Record<string, PersistedPendingRun>): void {
  if (!isBrowser()) return;
  const values = Object.values(store).sort((a, b) => b.updatedAt - a.updatedAt);
  const trimmed = values.slice(0, MAX_STORED_RUNS);
  const next: Record<string, PersistedPendingRun> = {};
  for (const item of trimmed) {
    next[item.conversationId] = item;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage write failures to avoid breaking chat runtime.
  }
}

export function getPendingRun(conversationId: string | null | undefined): PersistedPendingRun | null {
  if (!conversationId) return null;
  const store = readStore();
  return store[conversationId] ?? null;
}

export function upsertPendingRun(
  run: Omit<PersistedPendingRun, 'updatedAt'>
): PersistedPendingRun {
  const normalized: PersistedPendingRun = {
    ...run,
    updatedAt: Date.now(),
  };
  const store = readStore();
  store[normalized.conversationId] = normalized;
  writeStore(store);
  return normalized;
}

export function clearPendingRun(conversationId: string | null | undefined): void {
  if (!conversationId) return;
  const store = readStore();
  if (!(conversationId in store)) return;
  delete store[conversationId];
  writeStore(store);
}
