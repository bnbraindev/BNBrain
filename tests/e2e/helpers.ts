/**
 * E2E Test Helpers — shared infrastructure for all test files.
 *
 * Zero external dependencies. Matches the style of .claude/scripts/e2e-api-test.ts.
 */

// ── Config ──────────────────────────────────────────────────

export const BASE_URL = process.env.E2E_BASE_URL || 'http://172.18.0.31:3099';
const TIMEOUT_MS = 15_000;

// ── Types ───────────────────────────────────────────────────

export interface TestResult {
  name: string;
  ok: boolean;
  skipped: boolean;
  time: number;
  detail: string;
}

// ── State ───────────────────────────────────────────────────

const results: TestResult[] = [];
let suiteStart = 0;

// ── Guest Identity ──────────────────────────────────────────

let _guestId: string | null = null;

/** Generate a unique guest ID per test run. */
export function getGuestId(): string {
  if (!_guestId) {
    _guestId = `e2e-guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return _guestId;
}

/** Standard owner headers for guest identity. */
export function guestHeaders(): Record<string, string> {
  return {
    'x-bnb-owner-type': 'guest',
    'x-bnb-owner-id': getGuestId(),
  };
}

// ── HTTP Helpers ────────────────────────────────────────────

/** Fetch and parse JSON. Does NOT throw on non-2xx — returns { status, body }. */
export async function fetchJson(
  url: string,
  options?: RequestInit
): Promise<{ status: number; body: any }> {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...options,
  });
  const text = await resp.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: resp.status, body };
}

/** Fetch raw response (for SSE streams, etc). */
export async function fetchRaw(
  url: string,
  options?: RequestInit
): Promise<Response> {
  return fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...options,
  });
}

// ── Assertions ──────────────────────────────────────────────

export function assertStatus(actual: number, expected: number, context?: string): void {
  if (actual !== expected) {
    throw new Error(
      `Expected status ${expected}, got ${actual}${context ? ` (${context})` : ''}`
    );
  }
}

export function assertStatusIn(actual: number, expected: number[], context?: string): void {
  if (!expected.includes(actual)) {
    throw new Error(
      `Expected status in [${expected.join(',')}], got ${actual}${context ? ` (${context})` : ''}`
    );
  }
}

export function assertJsonField(body: any, field: string, message?: string): void {
  const value = field.split('.').reduce((obj, key) => obj?.[key], body);
  if (value === undefined || value === null) {
    throw new Error(message || `Missing field: ${field} in ${JSON.stringify(body).slice(0, 200)}`);
  }
}

export function assertJsonFieldEquals(body: any, field: string, expected: any): void {
  const value = field.split('.').reduce((obj, key) => obj?.[key], body);
  if (value !== expected) {
    throw new Error(`Expected ${field} = ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
  }
}

export function assertTruthy(value: any, message: string): void {
  if (!value) {
    throw new Error(message);
  }
}

// ── Test Runner ─────────────────────────────────────────────

/** Run a single test case. */
export async function test(name: string, fn: () => Promise<string>): Promise<void> {
  const start = Date.now();
  try {
    const detail = await fn();
    const time = Date.now() - start;
    results.push({ name, ok: true, skipped: false, time, detail });
    console.log(`  ✅ ${name} (${time}ms) — ${detail}`);
  } catch (err) {
    const time = Date.now() - start;
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, skipped: false, time, detail: detail.slice(0, 300) });
    console.log(`  ❌ ${name} (${time}ms) — ${detail.slice(0, 200)}`);
  }
}

/** Skip a test with a reason. */
export function skip(name: string, reason: string): void {
  results.push({ name, ok: true, skipped: true, time: 0, detail: reason });
  console.log(`  ⏭️  ${name} — SKIPPED: ${reason}`);
}

/** Mark the start of a test suite. */
export function suiteHeader(title: string): void {
  suiteStart = Date.now();
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(55)}`);
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Time:   ${new Date().toISOString()}`);
}

/** Print summary and exit with appropriate code. */
export function printSummary(): void {
  const totalTime = ((Date.now() - suiteStart) / 1000).toFixed(1);
  const passed = results.filter((r) => r.ok && !r.skipped).length;
  const failed = results.filter((r) => !r.ok).length;
  const skipped = results.filter((r) => r.skipped).length;

  console.log(`\n${'─'.repeat(55)}`);
  console.log(`  SUMMARY`);
  console.log(`${'─'.repeat(55)}`);
  console.log(
    `  Total: ${results.length}  ✅ Passed: ${passed}  ❌ Failed: ${failed}  ⏭️  Skipped: ${skipped}  ⏱ ${totalTime}s`
  );

  if (failed > 0) {
    console.log(`\n  ❌ FAILED TESTS:`);
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`    - ${r.name}: ${r.detail.slice(0, 150)}`);
    }
    process.exit(1);
  } else {
    console.log(`\n  🎉 All tests passed!`);
  }
}

/** Get the results array (for custom reporting). */
export function getResults(): readonly TestResult[] {
  return results;
}
