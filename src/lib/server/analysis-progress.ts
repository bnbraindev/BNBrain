/**
 * Dual-layer progress store for deep token analysis.
 *
 * Layer 1: In-memory cache (fast reads/writes, lost on process restart)
 * Layer 2: PostgreSQL `chat_runs.progress_json` (persistent, async writes with 500ms debounce)
 *
 * The deepTokenAnalysis tool writes real-time step progress here.
 * Frontend polls via GET /api/deep-analysis/progress?chatId=xxx.
 *
 * Entries auto-expire after 10 minutes in memory cache.
 */

import { ensureDatabaseSchema, getDbPool } from '@/lib/server/db';

export interface StepProgress {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  summary?: string;
  durationMs?: number;
}

export interface AnalysisProgress {
  chatId: string;
  tokenAddress: string;
  tokenName?: string | null;
  tokenSymbol?: string | null;
  phase: string;
  steps: StepProgress[];
  startedAt: number;
  updatedAt: number;
  /** Set when analysis finishes (success or failure). */
  finished?: boolean;
  /** Set on error. */
  error?: string;
  /** Set on success — result data for immediate display. */
  result?: {
    reportId: string;
    reportUrl: string;
    riskScore: number | null;
    summary: string;
    durationMs: number;
  };
}

const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// Global singleton — survives hot reloads in dev
declare global {
  var __analysisProgressMap: Map<string, AnalysisProgress> | undefined;
}

function getMap(): Map<string, AnalysisProgress> {
  if (!globalThis.__analysisProgressMap) {
    globalThis.__analysisProgressMap = new Map();
  }
  return globalThis.__analysisProgressMap;
}

// ── DB write debounce ──────────────────────────────────────

const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleDbWrite(chatId: string) {
  if (pendingWrites.has(chatId)) clearTimeout(pendingWrites.get(chatId)!);
  pendingWrites.set(
    chatId,
    setTimeout(async () => {
      pendingWrites.delete(chatId);
      const progress = getMap().get(chatId);
      if (!progress) return;
      try {
        await ensureDatabaseSchema();
        await getDbPool().query(
          'UPDATE chat_runs SET progress_json = $1 WHERE chat_id = $2 AND status IN ($3, $4)',
          [JSON.stringify(progress), chatId, 'running', 'queued'],
        );
      } catch (err) {
        console.error('[analysis-progress] DB write failed:', err);
      }
    }, 500),
  );
}

// ── Delayed clear ──────────────────────────────────────────

const pendingClears = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleClearAnalysisProgress(chatId: string, delayMs: number): void {
  if (pendingClears.has(chatId)) clearTimeout(pendingClears.get(chatId)!);
  pendingClears.set(
    chatId,
    setTimeout(() => {
      pendingClears.delete(chatId);
      clearAnalysisProgress(chatId);
    }, delayMs),
  );
}

// ── Public API ─────────────────────────────────────────────

export function setAnalysisProgress(
  chatId: string,
  progress: Omit<AnalysisProgress, 'chatId' | 'updatedAt'>,
): void {
  const map = getMap();
  map.set(chatId, {
    ...progress,
    chatId,
    updatedAt: Date.now(),
  });
  // Lazy cleanup: remove expired entries when map grows
  if (map.size > 50) {
    const now = Date.now();
    for (const [key, entry] of map) {
      if (now - entry.updatedAt > EXPIRY_MS) {
        map.delete(key);
      }
    }
    // Hard cap: if still over limit, evict oldest entries
    if (map.size > 500) {
      const entries = [...map.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
      const excess = map.size - 500;
      for (let i = 0; i < excess; i++) {
        map.delete(entries[i][0]);
      }
    }
  }
  // Async persist to DB
  scheduleDbWrite(chatId);
}

export async function getAnalysisProgress(chatId: string): Promise<AnalysisProgress | null> {
  const map = getMap();
  const cached = map.get(chatId);
  if (cached) {
    // Check expiry
    if (Date.now() - cached.updatedAt > EXPIRY_MS) {
      map.delete(chatId);
    } else {
      return cached;
    }
  }

  // DB fallback — look for progress_json on an active run
  try {
    await ensureDatabaseSchema();
    const result = await getDbPool().query(
      'SELECT progress_json FROM chat_runs WHERE chat_id = $1 AND status IN ($2, $3) ORDER BY created_at DESC LIMIT 1',
      [chatId, 'running', 'queued'],
    );
    if (result.rows[0]?.progress_json) {
      const progress = result.rows[0].progress_json as AnalysisProgress;
      map.set(chatId, progress); // backfill cache
      return progress;
    }
  } catch (err) {
    console.error('[analysis-progress] DB read failed:', err);
  }
  return null;
}

export function clearAnalysisProgress(chatId: string): void {
  getMap().delete(chatId);
  // Clear any pending debounced write
  if (pendingWrites.has(chatId)) {
    clearTimeout(pendingWrites.get(chatId)!);
    pendingWrites.delete(chatId);
  }
  // Clear DB
  void ensureDatabaseSchema()
    .then(() => getDbPool().query('UPDATE chat_runs SET progress_json = NULL WHERE chat_id = $1', [chatId]))
    .catch(() => {});
}
