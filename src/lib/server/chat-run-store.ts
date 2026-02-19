import { randomUUID } from 'crypto';
import type { UIMessageChunk } from 'ai';
import { ensureDatabaseSchema, getDbPool } from '@/lib/server/db';
import type { ChatOwner, ChatUserContext } from '@/lib/server/chat-runtime';

export type ChatRunStatus =
  | 'queued'
  | 'running'
  | 'stalled'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ChatRunRecord {
  id: string;
  chatId: string;
  ownerType: ChatOwner['ownerType'];
  ownerId: string;
  trigger: 'submit-message' | 'regenerate-message';
  regenerateMessageId: string | null;
  requestMessages: unknown[];
  userContext: ChatUserContext;
  status: ChatRunStatus;
  errorText: string | null;
  lockToken: string | null;
  lockExpiresAt: number | null;
  cancelRequestedAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  lastEventSeq: number;
  lastEventAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChatRunEventRecord {
  runId: string;
  seq: number;
  chunk: UIMessageChunk;
  createdAt: number;
}

export interface CreateChatRunInput {
  chatId: string;
  owner: ChatOwner;
  trigger: 'submit-message' | 'regenerate-message';
  regenerateMessageId?: string | null;
  requestMessages: unknown[];
  userContext: ChatUserContext;
}

const ACTIVE_STATUSES: ChatRunStatus[] = ['queued', 'running', 'stalled'];
const DEFAULT_TERMINAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_STALE_RUNNING_MS = 15 * 60 * 1000;
const DEFAULT_STALE_QUEUED_MS = 15 * 60 * 1000;
const DEFAULT_CLEANUP_BATCH_SIZE = 300;
const CHAT_RUN_CLEANUP_SNAPSHOT_KEY = 'chat_run_cleanup_snapshot';

export interface ChatRunCleanupOptions {
  now?: number;
  terminalRetentionMs?: number;
  staleRunningMs?: number;
  staleQueuedMs?: number;
  batchSize?: number;
}

export interface ChatRunCleanupResult {
  failedStaleRunningCount: number;
  failedStaleQueuedCount: number;
  deletedTerminalCount: number;
}

export interface ChatRunCleanupSnapshot {
  ranAt: number;
  terminalRetentionMs: number;
  staleRunningMs: number;
  staleQueuedMs: number;
  batchSize: number;
  result: ChatRunCleanupResult;
}

export interface ChatRunRuntimeMetrics {
  generatedAt: number;
  queueDepth: number;
  activeRunCount: number;
  statusCounts: Record<ChatRunStatus, number>;
  oldestQueuedAgeMs: number | null;
  oldestRunningAgeMs: number | null;
  staleCandidateCounts: {
    running: number;
    queued: number;
  };
  terminalGarbageCount: number;
  cleanupConfig: {
    terminalRetentionMs: number;
    staleRunningMs: number;
    staleQueuedMs: number;
    batchSize: number;
  };
  lastCleanup: ChatRunCleanupSnapshot | null;
}

function toPositiveIntegerOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function resolveCleanupConfig(options?: ChatRunCleanupOptions): {
  now: number;
  terminalRetentionMs: number;
  staleRunningMs: number;
  staleQueuedMs: number;
  batchSize: number;
} {
  const envTerminalRetentionMs = toPositiveIntegerOrNull(
    process.env.CHAT_RUN_RETENTION_MS
  );
  const envStaleRunningMs = toPositiveIntegerOrNull(
    process.env.CHAT_RUN_STALE_RUNNING_MS
  );
  const envStaleQueuedMs = toPositiveIntegerOrNull(
    process.env.CHAT_RUN_STALE_QUEUED_MS
  );
  const envBatchSize = toPositiveIntegerOrNull(process.env.CHAT_RUN_CLEANUP_BATCH_SIZE);
  return {
    now: options?.now ?? Date.now(),
    terminalRetentionMs:
      options?.terminalRetentionMs ??
      envTerminalRetentionMs ??
      DEFAULT_TERMINAL_RETENTION_MS,
    staleRunningMs:
      options?.staleRunningMs ?? envStaleRunningMs ?? DEFAULT_STALE_RUNNING_MS,
    staleQueuedMs:
      options?.staleQueuedMs ?? envStaleQueuedMs ?? DEFAULT_STALE_QUEUED_MS,
    batchSize: Math.max(
      50,
      Math.min(
        2000,
        options?.batchSize ?? envBatchSize ?? DEFAULT_CLEANUP_BATCH_SIZE
      )
    ),
  };
}

function toCount(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toTimestamp(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function parseCleanupSnapshot(raw: unknown): ChatRunCleanupSnapshot | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ChatRunCleanupSnapshot>;
    if (!parsed || typeof parsed !== 'object') return null;
    const ranAt = toTimestamp(parsed.ranAt);
    if (!ranAt) return null;
    return {
      ranAt,
      terminalRetentionMs: toCount(parsed.terminalRetentionMs),
      staleRunningMs: toCount(parsed.staleRunningMs),
      staleQueuedMs: toCount(parsed.staleQueuedMs),
      batchSize: toCount(parsed.batchSize),
      result: {
        failedStaleRunningCount: toCount(parsed.result?.failedStaleRunningCount),
        failedStaleQueuedCount: toCount(parsed.result?.failedStaleQueuedCount),
        deletedTerminalCount: toCount(parsed.result?.deletedTerminalCount),
      },
    };
  } catch {
    return null;
  }
}

function isChatRunStatus(value: unknown): value is ChatRunStatus {
  return (
    value === 'queued' ||
    value === 'running' ||
    value === 'stalled' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
  );
}

function normalizeOwner(owner: ChatOwner): ChatOwner {
  return {
    ownerType: owner.ownerType,
    ownerId: owner.ownerType === 'wallet' ? owner.ownerId.toLowerCase() : owner.ownerId,
  };
}

function parseRunRow(row: Record<string, unknown>): ChatRunRecord {
  const status = isChatRunStatus(row.status) ? row.status : 'failed';
  return {
    id: String(row.id),
    chatId: String(row.chat_id),
    ownerType: row.owner_type === 'wallet' ? 'wallet' : 'guest',
    ownerId: String(row.owner_id),
    trigger:
      row.trigger === 'regenerate-message' ? 'regenerate-message' : 'submit-message',
    regenerateMessageId:
      typeof row.regenerate_message_id === 'string' && row.regenerate_message_id
        ? row.regenerate_message_id
        : null,
    requestMessages: Array.isArray(row.request_messages)
      ? (row.request_messages as unknown[])
      : [],
    userContext:
      row.user_context && typeof row.user_context === 'object'
        ? (row.user_context as ChatUserContext)
        : undefined,
    status,
    errorText: typeof row.error_text === 'string' ? row.error_text : null,
    lockToken: typeof row.lock_token === 'string' ? row.lock_token : null,
    lockExpiresAt:
      typeof row.lock_expires_at === 'number'
        ? row.lock_expires_at
        : row.lock_expires_at
          ? Number(row.lock_expires_at)
          : null,
    cancelRequestedAt:
      typeof row.cancel_requested_at === 'number'
        ? row.cancel_requested_at
        : row.cancel_requested_at
          ? Number(row.cancel_requested_at)
          : null,
    startedAt:
      typeof row.started_at === 'number'
        ? row.started_at
        : row.started_at
          ? Number(row.started_at)
          : null,
    finishedAt:
      typeof row.finished_at === 'number'
        ? row.finished_at
        : row.finished_at
          ? Number(row.finished_at)
          : null,
    lastEventSeq: Number(row.last_event_seq ?? 0),
    lastEventAt:
      typeof row.last_event_at === 'number'
        ? row.last_event_at
        : row.last_event_at
          ? Number(row.last_event_at)
          : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function parseEventRow(row: Record<string, unknown>): ChatRunEventRecord {
  return {
    runId: String(row.run_id),
    seq: Number(row.seq),
    chunk: row.chunk as UIMessageChunk,
    createdAt: Number(row.created_at),
  };
}

export function isTerminalChatRunStatus(status: ChatRunStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export async function getActiveChatRunByChatOwner(
  chatId: string,
  ownerInput: ChatOwner
): Promise<ChatRunRecord | null> {
  await ensureDatabaseSchema();
  const owner = normalizeOwner(ownerInput);
  const pool = getDbPool();
  const { rows } = await pool.query(
    `
      SELECT *
      FROM chat_runs
      WHERE chat_id = $1
        AND owner_type = $2
        AND owner_id = $3
        AND status = ANY($4::text[])
        AND cancel_requested_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [chatId, owner.ownerType, owner.ownerId, ACTIVE_STATUSES]
  );
  if (!rows.length) return null;
  return parseRunRow(rows[0] as Record<string, unknown>);
}

export async function getAnyNonTerminalChatRunByChatOwner(
  chatId: string,
  ownerInput: ChatOwner
): Promise<ChatRunRecord | null> {
  await ensureDatabaseSchema();
  const owner = normalizeOwner(ownerInput);
  const pool = getDbPool();
  const { rows } = await pool.query(
    `
      SELECT *
      FROM chat_runs
      WHERE chat_id = $1
        AND owner_type = $2
        AND owner_id = $3
        AND status = ANY($4::text[])
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [chatId, owner.ownerType, owner.ownerId, ACTIVE_STATUSES]
  );
  if (!rows.length) return null;
  return parseRunRow(rows[0] as Record<string, unknown>);
}

export async function getLatestChatRunByChatOwner(
  chatId: string,
  ownerInput: ChatOwner
): Promise<ChatRunRecord | null> {
  await ensureDatabaseSchema();
  const owner = normalizeOwner(ownerInput);
  const pool = getDbPool();
  const { rows } = await pool.query(
    `
      SELECT *
      FROM chat_runs
      WHERE chat_id = $1
        AND owner_type = $2
        AND owner_id = $3
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [chatId, owner.ownerType, owner.ownerId]
  );
  if (!rows.length) return null;
  return parseRunRow(rows[0] as Record<string, unknown>);
}

export async function getChatRunById(runId: string): Promise<ChatRunRecord | null> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    `
      SELECT *
      FROM chat_runs
      WHERE id = $1
      LIMIT 1
    `,
    [runId]
  );
  if (!rows.length) return null;
  return parseRunRow(rows[0] as Record<string, unknown>);
}

export async function createChatRun(input: CreateChatRunInput): Promise<ChatRunRecord> {
  await ensureDatabaseSchema();
  const owner = normalizeOwner(input.owner);
  const now = Date.now();
  const id = randomUUID();
  const pool = getDbPool();
  try {
    const { rows } = await pool.query(
      `
        INSERT INTO chat_runs (
          id,
          chat_id,
          owner_type,
          owner_id,
          trigger,
          regenerate_message_id,
          request_messages,
          user_context,
          status,
          created_at,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$10)
        RETURNING *
      `,
      [
        id,
        input.chatId,
        owner.ownerType,
        owner.ownerId,
        input.trigger,
        input.regenerateMessageId ?? null,
        JSON.stringify(input.requestMessages),
        JSON.stringify(input.userContext ?? null),
        'queued',
        now,
      ]
    );
    return parseRunRow(rows[0] as Record<string, unknown>);
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError?.code === '23505') {
      const existing = await getAnyNonTerminalChatRunByChatOwner(input.chatId, owner);
      if (existing) return existing;
    }
    throw error;
  }
}

export async function claimNextChatRun(params?: {
  leaseMs?: number;
}): Promise<ChatRunRecord | null> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const now = Date.now();
  const leaseMs = Math.max(5000, params?.leaseMs ?? 15000);
  const lockToken = randomUUID();
  const { rows } = await pool.query(
    `
      WITH candidate AS (
        SELECT id
        FROM chat_runs
        WHERE status = ANY($1::text[])
          AND cancel_requested_at IS NULL
          AND (lock_expires_at IS NULL OR lock_expires_at < $2)
        ORDER BY
          CASE
            WHEN status = 'queued' THEN 0
            WHEN status = 'stalled' THEN 1
            ELSE 2
          END,
          created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE chat_runs AS runs
      SET
        lock_token = $3,
        lock_expires_at = $4,
        status = CASE WHEN runs.status IN ('queued', 'stalled') THEN 'running' ELSE runs.status END,
        started_at = COALESCE(runs.started_at, $2),
        updated_at = $2
      FROM candidate
      WHERE runs.id = candidate.id
      RETURNING runs.*
    `,
    [ACTIVE_STATUSES, now, lockToken, now + leaseMs]
  );
  if (!rows.length) return null;
  return parseRunRow(rows[0] as Record<string, unknown>);
}

export async function renewChatRunLease(
  runId: string,
  lockToken: string,
  leaseMs: number
): Promise<boolean> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const now = Date.now();
  const { rowCount } = await pool.query(
    `
      UPDATE chat_runs
      SET lock_expires_at = $3, updated_at = $4
      WHERE id = $1
        AND lock_token = $2
    `,
    [runId, lockToken, now + Math.max(5000, leaseMs), now]
  );
  return Boolean(rowCount);
}

export async function appendChatRunEvent(
  runId: string,
  chunk: UIMessageChunk,
  options?: { setStalled?: boolean }
): Promise<number> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const now = Date.now();
    const { rows } = await client.query(
      `
        UPDATE chat_runs
        SET
          last_event_seq = last_event_seq + 1,
          last_event_at = $2,
          updated_at = $2,
          status = CASE
            WHEN $3::boolean IS TRUE AND status = 'running' THEN 'stalled'
            WHEN $3::boolean IS FALSE AND status = 'stalled' THEN 'running'
            ELSE status
          END
        WHERE id = $1
        RETURNING last_event_seq
      `,
      [runId, now, Boolean(options?.setStalled)]
    );
    if (!rows.length) {
      throw new Error(`Chat run not found: ${runId}`);
    }
    const seq = Number(rows[0]?.last_event_seq ?? 0);
    await client.query(
      `
        INSERT INTO chat_run_events (run_id, seq, chunk, created_at)
        VALUES ($1, $2, $3::jsonb, $4)
      `,
      [runId, seq, JSON.stringify(chunk), now]
    );
    await client.query('COMMIT');
    return seq;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function batchAppendChatRunEvents(
  runId: string,
  chunks: UIMessageChunk[]
): Promise<number> {
  if (chunks.length === 0) return 0;
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const now = Date.now();
    const { rows } = await client.query(
      `
        UPDATE chat_runs
        SET
          last_event_seq = last_event_seq + $2,
          last_event_at = $3,
          updated_at = $3
        WHERE id = $1
        RETURNING last_event_seq
      `,
      [runId, chunks.length, now]
    );
    if (!rows.length) {
      throw new Error(`Chat run not found: ${runId}`);
    }
    const endSeq = Number(rows[0]?.last_event_seq ?? 0);
    const startSeq = endSeq - chunks.length + 1;
    const values: string[] = [];
    const params: unknown[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const seq = startSeq + i;
      const paramOffset = i * 4;
      values.push(`($${paramOffset + 1}, $${paramOffset + 2}, $${paramOffset + 3}::jsonb, $${paramOffset + 4})`);
      params.push(runId, seq, JSON.stringify(chunks[i]), now);
    }
    await client.query(
      `INSERT INTO chat_run_events (run_id, seq, chunk, created_at) VALUES ${values.join(', ')}`,
      params
    );
    await client.query('COMMIT');
    return endSeq;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listChatRunEvents(
  runId: string,
  afterSeq = 0
): Promise<ChatRunEventRecord[]> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    `
      SELECT run_id, seq, chunk, created_at
      FROM chat_run_events
      WHERE run_id = $1
        AND seq > $2
      ORDER BY seq ASC
    `,
    [runId, afterSeq]
  );
  return rows.map((row) => parseEventRow(row as Record<string, unknown>));
}

async function updateChatRunStatus(
  runId: string,
  status: ChatRunStatus,
  errorText?: string | null
): Promise<void> {
  await ensureDatabaseSchema();
  const now = Date.now();
  const pool = getDbPool();
  await pool.query(
    `
      UPDATE chat_runs
      SET
        status = $2,
        error_text = $3,
        finished_at = CASE
          WHEN $2 IN ('completed', 'failed', 'cancelled') THEN $4
          ELSE finished_at
        END,
        lock_token = NULL,
        lock_expires_at = NULL,
        updated_at = $4
      WHERE id = $1
    `,
    [runId, status, errorText ?? null, now]
  );
}

export async function markChatRunCompleted(runId: string): Promise<void> {
  await updateChatRunStatus(runId, 'completed', null);
}

export async function markChatRunFailed(
  runId: string,
  errorText: string
): Promise<void> {
  await updateChatRunStatus(runId, 'failed', errorText);
}

export async function markChatRunCancelled(runId: string): Promise<void> {
  await updateChatRunStatus(runId, 'cancelled', null);
}

export async function requestChatRunCancellation(runId: string): Promise<boolean> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const now = Date.now();
  const { rowCount } = await pool.query(
    `
      UPDATE chat_runs
      SET
        cancel_requested_at = $2,
        status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
        finished_at = CASE WHEN status = 'queued' THEN $2 ELSE finished_at END,
        lock_token = CASE WHEN status = 'queued' THEN NULL ELSE lock_token END,
        lock_expires_at = CASE WHEN status = 'queued' THEN NULL ELSE lock_expires_at END,
        updated_at = $2
      WHERE id = $1
        AND status = ANY($3::text[])
    `,
    [runId, now, ACTIVE_STATUSES]
  );
  return Boolean(rowCount);
}

export async function cleanupChatRuns(
  options?: ChatRunCleanupOptions
): Promise<ChatRunCleanupResult> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const config = resolveCleanupConfig(options);
  const staleRunningBefore = config.now - config.staleRunningMs;
  const staleQueuedBefore = config.now - config.staleQueuedMs;
  const terminalBefore = config.now - config.terminalRetentionMs;

  const staleRunningResult = await pool.query(
    `
      WITH candidate AS (
        SELECT id
        FROM chat_runs
        WHERE status IN ('running', 'stalled')
          AND (
            lock_expires_at IS NULL
            OR lock_expires_at < $1
            OR updated_at < $1
          )
        ORDER BY updated_at ASC
        LIMIT $2
      )
      UPDATE chat_runs AS runs
      SET
        status = 'failed',
        error_text = COALESCE(runs.error_text, 'Run lease expired before completion'),
        finished_at = $3,
        lock_token = NULL,
        lock_expires_at = NULL,
        updated_at = $3
      FROM candidate
      WHERE runs.id = candidate.id
      RETURNING runs.id
    `,
    [staleRunningBefore, config.batchSize, config.now]
  );

  const staleQueuedResult = await pool.query(
    `
      WITH candidate AS (
        SELECT id
        FROM chat_runs
        WHERE status = 'queued'
          AND created_at < $1
        ORDER BY created_at ASC
        LIMIT $2
      )
      UPDATE chat_runs AS runs
      SET
        status = 'failed',
        error_text = COALESCE(runs.error_text, 'Run queue timeout before worker pickup'),
        finished_at = $3,
        lock_token = NULL,
        lock_expires_at = NULL,
        updated_at = $3
      FROM candidate
      WHERE runs.id = candidate.id
      RETURNING runs.id
    `,
    [staleQueuedBefore, config.batchSize, config.now]
  );

  const deleteResult = await pool.query(
    `
      WITH candidate AS (
        SELECT id
        FROM chat_runs
        WHERE status IN ('completed', 'failed', 'cancelled')
          AND COALESCE(finished_at, updated_at, created_at) < $1
        ORDER BY COALESCE(finished_at, updated_at, created_at) ASC
        LIMIT $2
      )
      DELETE FROM chat_runs AS runs
      USING candidate
      WHERE runs.id = candidate.id
      RETURNING runs.id
    `,
    [terminalBefore, config.batchSize]
  );

  const result = {
    failedStaleRunningCount: staleRunningResult.rowCount ?? 0,
    failedStaleQueuedCount: staleQueuedResult.rowCount ?? 0,
    deletedTerminalCount: deleteResult.rowCount ?? 0,
  } satisfies ChatRunCleanupResult;

  const snapshot: ChatRunCleanupSnapshot = {
    ranAt: config.now,
    terminalRetentionMs: config.terminalRetentionMs,
    staleRunningMs: config.staleRunningMs,
    staleQueuedMs: config.staleQueuedMs,
    batchSize: config.batchSize,
    result,
  };

  await pool.query(
    `
      INSERT INTO system_settings (key, value, created_at, updated_at)
      VALUES ($1, $2, $3, $3)
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `,
    [CHAT_RUN_CLEANUP_SNAPSHOT_KEY, JSON.stringify(snapshot), config.now]
  );

  return result;
}

export async function getLastChatRunCleanupSnapshot(): Promise<ChatRunCleanupSnapshot | null> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    `
      SELECT value
      FROM system_settings
      WHERE key = $1
      LIMIT 1
    `,
    [CHAT_RUN_CLEANUP_SNAPSHOT_KEY]
  );
  if (!rows.length) return null;
  return parseCleanupSnapshot(rows[0]?.value);
}

export async function getChatRunRuntimeMetrics(
  options?: ChatRunCleanupOptions
): Promise<ChatRunRuntimeMetrics> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const config = resolveCleanupConfig(options);
  const staleRunningBefore = config.now - config.staleRunningMs;
  const staleQueuedBefore = config.now - config.staleQueuedMs;
  const terminalBefore = config.now - config.terminalRetentionMs;

  const [
    statusRes,
    activeRes,
    oldestRes,
    staleRunningRes,
    staleQueuedRes,
    terminalRes,
    cleanupSnapshot,
  ] = await Promise.all([
    pool.query(
      `
        SELECT status, COUNT(*) AS count
        FROM chat_runs
        GROUP BY status
      `
    ),
    pool.query(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE status = 'queued' AND cancel_requested_at IS NULL
          ) AS queue_depth,
          COUNT(*) FILTER (
            WHERE status IN ('running', 'stalled') AND cancel_requested_at IS NULL
          ) AS active_runs
        FROM chat_runs
      `
    ),
    pool.query(
      `
        SELECT
          MIN(created_at) FILTER (
            WHERE status = 'queued' AND cancel_requested_at IS NULL
          ) AS oldest_queued_created_at,
          MIN(COALESCE(last_event_at, started_at, updated_at)) FILTER (
            WHERE status IN ('running', 'stalled') AND cancel_requested_at IS NULL
          ) AS oldest_running_activity_at
        FROM chat_runs
      `
    ),
    pool.query(
      `
        SELECT COUNT(*) AS count
        FROM chat_runs
        WHERE status IN ('running', 'stalled')
          AND cancel_requested_at IS NULL
          AND (
            lock_expires_at IS NULL
            OR lock_expires_at < $1
            OR updated_at < $1
          )
      `,
      [staleRunningBefore]
    ),
    pool.query(
      `
        SELECT COUNT(*) AS count
        FROM chat_runs
        WHERE status = 'queued'
          AND cancel_requested_at IS NULL
          AND created_at < $1
      `,
      [staleQueuedBefore]
    ),
    pool.query(
      `
        SELECT COUNT(*) AS count
        FROM chat_runs
        WHERE status IN ('completed', 'failed', 'cancelled')
          AND COALESCE(finished_at, updated_at, created_at) < $1
      `,
      [terminalBefore]
    ),
    getLastChatRunCleanupSnapshot(),
  ]);

  const statusCounts: Record<ChatRunStatus, number> = {
    queued: 0,
    running: 0,
    stalled: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const row of statusRes.rows) {
    const status = String(row.status);
    if (!isChatRunStatus(status)) continue;
    statusCounts[status] = toCount(row.count);
  }

  const oldestRow = (oldestRes.rows[0] ?? {}) as Record<string, unknown>;
  const activeRow = (activeRes.rows[0] ?? {}) as Record<string, unknown>;
  const oldestQueuedCreatedAt = toTimestamp(oldestRow.oldest_queued_created_at);
  const oldestRunningActivityAt = toTimestamp(oldestRow.oldest_running_activity_at);
  const queueDepth = toCount(activeRow.queue_depth);
  const activeRunCount = toCount(activeRow.active_runs);

  return {
    generatedAt: config.now,
    queueDepth,
    activeRunCount,
    statusCounts,
    oldestQueuedAgeMs: oldestQueuedCreatedAt
      ? Math.max(0, config.now - oldestQueuedCreatedAt)
      : null,
    oldestRunningAgeMs: oldestRunningActivityAt
      ? Math.max(0, config.now - oldestRunningActivityAt)
      : null,
    staleCandidateCounts: {
      running: toCount(staleRunningRes.rows[0]?.count),
      queued: toCount(staleQueuedRes.rows[0]?.count),
    },
    terminalGarbageCount: toCount(terminalRes.rows[0]?.count),
    cleanupConfig: {
      terminalRetentionMs: config.terminalRetentionMs,
      staleRunningMs: config.staleRunningMs,
      staleQueuedMs: config.staleQueuedMs,
      batchSize: config.batchSize,
    },
    lastCleanup: cleanupSnapshot,
  };
}
