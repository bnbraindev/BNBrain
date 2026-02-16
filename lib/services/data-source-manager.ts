/**
 * Unified data-source degradation middleware.
 *
 * Each third-party service registers a health entry. On every call the manager
 * records latency, success/failure counts and last-error timestamps so the
 * admin panel can visualise live health at a glance.
 *
 * Design decisions (slice-04 D1 + D2):
 *   D1 — Function-level wrapper: each call site wraps its own function via
 *         `withDataSource()`. This is simpler than service-level registration
 *         and matches the existing per-function fallback chains in bscscan.ts.
 *   D2 — Pure in-memory health state (Map). No DB writes. Resets on container
 *         restart, which is acceptable for dynamic third-party status.
 */

// ── Health entry ────────────────────────────────────────────

export interface DataSourceHealth {
  /** Human-readable service name. */
  name: string;
  /** Whether the service is currently considered healthy. */
  healthy: boolean;
  /** Total successful calls since process start. */
  successCount: number;
  /** Total failed calls since process start. */
  failureCount: number;
  /** Rolling average response time in ms (last 50 samples). */
  avgResponseMs: number;
  /** ISO timestamp of the last successful call. */
  lastSuccessAt: string | null;
  /** ISO timestamp of the last failed call. */
  lastFailureAt: string | null;
  /** Most recent error message (null if last call succeeded). */
  lastError: string | null;
  /** Consecutive failure count (resets on success). */
  consecutiveFailures: number;
}

interface HealthEntry {
  name: string;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  /** Rolling window of recent response times (ms). */
  latencies: number[];
}

const MAX_LATENCY_SAMPLES = 50;
const UNHEALTHY_THRESHOLD = 5; // consecutive failures to mark unhealthy

const healthMap = new Map<string, HealthEntry>();

function getOrCreate(name: string): HealthEntry {
  let entry = healthMap.get(name);
  if (!entry) {
    entry = {
      name,
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      latencies: [],
    };
    healthMap.set(name, entry);
  }
  return entry;
}

function recordSuccess(name: string, durationMs: number): void {
  const e = getOrCreate(name);
  e.successCount++;
  e.consecutiveFailures = 0;
  e.lastSuccessAt = Date.now();
  e.lastError = null;
  e.latencies.push(durationMs);
  if (e.latencies.length > MAX_LATENCY_SAMPLES) e.latencies.shift();
}

function recordFailure(name: string, error: unknown): void {
  const e = getOrCreate(name);
  e.failureCount++;
  e.consecutiveFailures++;
  e.lastFailureAt = Date.now();
  e.lastError = error instanceof Error ? error.message : String(error);
}

// ── Public: wrapper for call-site use ───────────────────────

/**
 * Execute `fn` while recording health metrics under `sourceName`.
 *
 * Usage:
 * ```ts
 * const result = await withDataSource('honeypot', () => honeypotCheck(addr));
 * ```
 */
export async function withDataSource<T>(
  sourceName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    recordSuccess(sourceName, Date.now() - start);
    return result;
  } catch (err) {
    recordFailure(sourceName, err);
    throw err;
  }
}

/**
 * Execute a fallback chain: try each source in order, return the first
 * non-null result. All attempts are recorded.
 *
 * Usage:
 * ```ts
 * const src = await withFallbackChain([
 *   { name: 'sourcify', fn: () => sourcifyGetContractSource(addr) },
 *   { name: 'bscscan',  fn: () => bscscanGetContractSource(addr) },
 * ]);
 * ```
 */
export async function withFallbackChain<T>(
  sources: Array<{ name: string; fn: () => Promise<T | null> }>,
): Promise<{ result: T; source: string } | null> {
  for (const { name, fn } of sources) {
    const start = Date.now();
    try {
      const result = await fn();
      if (result !== null && result !== undefined) {
        recordSuccess(name, Date.now() - start);
        console.log(`[data-source] ${name}: success (${Date.now() - start}ms)`);
        return { result, source: name };
      }
      // null result counts as a soft failure (service responded but no data)
      recordSuccess(name, Date.now() - start);
      console.log(`[data-source] ${name}: no data, trying next fallback`);
    } catch (err) {
      recordFailure(name, err);
      console.warn(
        `[data-source] ${name}: failed (${Date.now() - start}ms), ` +
        `fallback_to=${sources.indexOf({ name, fn }) < sources.length - 1 ? sources[sources.indexOf({ name, fn }) + 1]?.name ?? 'none' : 'none'}, ` +
        `reason=${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return null;
}

// ── Public: health snapshot for admin API ────────────────────

/** Ensure a data source appears in the health map (for display even if never called). */
export function registerDataSource(name: string): void {
  getOrCreate(name);
}

/** Return a snapshot of all tracked data sources. */
export function getAllDataSourceHealth(): DataSourceHealth[] {
  const result: DataSourceHealth[] = [];
  for (const e of healthMap.values()) {
    const avg =
      e.latencies.length > 0
        ? Math.round(e.latencies.reduce((a, b) => a + b, 0) / e.latencies.length)
        : 0;

    result.push({
      name: e.name,
      healthy: e.consecutiveFailures < UNHEALTHY_THRESHOLD,
      successCount: e.successCount,
      failureCount: e.failureCount,
      avgResponseMs: avg,
      lastSuccessAt: e.lastSuccessAt ? new Date(e.lastSuccessAt).toISOString() : null,
      lastFailureAt: e.lastFailureAt ? new Date(e.lastFailureAt).toISOString() : null,
      lastError: e.lastError,
      consecutiveFailures: e.consecutiveFailures,
    });
  }
  // Sort: unhealthy first, then alphabetical
  result.sort((a, b) => {
    if (a.healthy !== b.healthy) return a.healthy ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  return result;
}

/** Reset all health entries (mainly for testing). */
export function resetAllDataSourceHealth(): void {
  healthMap.clear();
}

// ── Bootstrap: register known data sources ──────────────────

// Register all known services so they appear in the admin panel
// even before their first call.
registerDataSource('honeypot');
registerDataSource('sourcify');
registerDataSource('nodereal');
registerDataSource('bscscan');
registerDataSource('etherscan-v2');
registerDataSource('dexscreener');
registerDataSource('geckoterminal');
registerDataSource('goplus');
