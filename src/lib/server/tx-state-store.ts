import { ensureDatabaseSchema, getDbPool } from '@/lib/server/db';
import type { PersistedTxRecord, TxStateSyncPayload } from '@/lib/tx/state';

function mapRowToRecord(row: Record<string, unknown>): PersistedTxRecord {
  return {
    conversationId: String(row.conversation_id),
    txKey: String(row.tx_key),
    status: String(row.status) as PersistedTxRecord['status'],
    hash: row.hash ? (String(row.hash) as `0x${string}`) : undefined,
    chainId:
      typeof row.chain_id === 'number'
        ? row.chain_id
        : row.chain_id
          ? Number(row.chain_id)
          : undefined,
    error: row.error ? String(row.error) : undefined,
    errorDetails: row.error_details ? String(row.error_details) : undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function getTxRecord(
  conversationId: string,
  txKey: string
): Promise<PersistedTxRecord | null> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    `
      SELECT
        conversation_id,
        tx_key,
        status,
        hash,
        chain_id,
        error,
        error_details,
        created_at,
        updated_at
      FROM tx_states
      WHERE conversation_id = $1
        AND tx_key = $2
      LIMIT 1
    `,
    [conversationId, txKey]
  );
  if (rows.length === 0) return null;
  return mapRowToRecord(rows[0] as Record<string, unknown>);
}

export async function listTxRecords(conversationId: string): Promise<PersistedTxRecord[]> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    `
      SELECT
        conversation_id,
        tx_key,
        status,
        hash,
        chain_id,
        error,
        error_details,
        created_at,
        updated_at
      FROM tx_states
      WHERE conversation_id = $1
      ORDER BY updated_at DESC
    `,
    [conversationId]
  );
  return rows.map((row) => mapRowToRecord(row as Record<string, unknown>));
}

export async function upsertTxRecord(
  payload: TxStateSyncPayload
): Promise<PersistedTxRecord> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const now = Date.now();
  const updatedAt =
    typeof payload.updatedAt === 'number' && Number.isFinite(payload.updatedAt)
      ? payload.updatedAt
      : now;

  const { rows } = await pool.query(
    `
      INSERT INTO tx_states (
        conversation_id,
        tx_key,
        status,
        hash,
        chain_id,
        error,
        error_details,
        created_at,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (conversation_id, tx_key) DO UPDATE
        SET status = EXCLUDED.status,
            hash = EXCLUDED.hash,
            chain_id = COALESCE(EXCLUDED.chain_id, tx_states.chain_id),
            error = EXCLUDED.error,
            error_details = EXCLUDED.error_details,
            updated_at = EXCLUDED.updated_at
      RETURNING
        conversation_id,
        tx_key,
        status,
        hash,
        chain_id,
        error,
        error_details,
        created_at,
        updated_at
    `,
    [
      payload.conversationId,
      payload.txKey,
      payload.status,
      payload.hash ?? null,
      payload.chainId ?? null,
      payload.error ?? null,
      payload.errorDetails ?? null,
      now,
      updatedAt,
    ]
  );
  return mapRowToRecord(rows[0] as Record<string, unknown>);
}
