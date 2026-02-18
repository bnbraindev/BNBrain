import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { ensureDatabaseSchema, getDbPool } from '@/lib/server/db';
import type {
  ContextInjectionStatus,
  Conversation,
  ConversationScope,
  StoredMessage,
} from '@/lib/stores/chat-store';

export interface ConversationOwner {
  ownerType: 'wallet' | 'guest';
  ownerId: string;
}

export class ConversationOwnershipConflictError extends Error {
  constructor() {
    super('Conversation ID already belongs to another owner');
    this.name = 'ConversationOwnershipConflictError';
  }
}

function normalizeOwner(owner: ConversationOwner): ConversationOwner {
  return {
    ownerType: owner.ownerType,
    ownerId: owner.ownerType === 'wallet' ? owner.ownerId.toLowerCase() : owner.ownerId,
  };
}

function normalizeConversationForDb(
  owner: ConversationOwner,
  conversation: Conversation
): Conversation {
  const walletAddress = conversation.walletAddress
    ? conversation.walletAddress.toLowerCase()
    : undefined;
  return {
    ...conversation,
    walletAddress,
    isStarred: Boolean(conversation.isStarred),
    isShared: Boolean(conversation.isShared),
    sharedAt:
      typeof conversation.sharedAt === 'number' && Number.isFinite(conversation.sharedAt)
        ? conversation.sharedAt
        : undefined,
    shareToken:
      typeof conversation.shareToken === 'string' && conversation.shareToken.trim()
        ? conversation.shareToken.trim().toLowerCase()
        : undefined,
    shareExpiresAt:
      typeof conversation.shareExpiresAt === 'number' &&
      Number.isFinite(conversation.shareExpiresAt)
        ? conversation.shareExpiresAt
        : undefined,
    forkedFromShareToken:
      typeof conversation.forkedFromShareToken === 'string' &&
      conversation.forkedFromShareToken.trim()
        ? conversation.forkedFromShareToken.trim().toLowerCase()
        : undefined,
    scope: conversation.scope as ConversationScope,
    contextInjectionStatus:
      conversation.contextInjectionStatus as ContextInjectionStatus,
  };
}

function createShareToken(): string {
  return randomUUID().toLowerCase();
}

function normalizeShareToken(token: string): string {
  return token.trim().toLowerCase();
}

function parseOptionalFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseConversationRow(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    title: String(row.title),
    messages: parseMessages(row.messages),
    walletAddress: typeof row.walletAddress === 'string' ? row.walletAddress : undefined,
    isStarred: Boolean(row.isStarred),
    isShared: Boolean(row.isShared),
    sharedAt: parseOptionalFiniteNumber(row.sharedAt),
    shareToken: typeof row.shareToken === 'string' ? row.shareToken : undefined,
    shareExpiresAt: parseOptionalFiniteNumber(row.shareExpiresAt),
    forkedFromShareToken:
      typeof row.forkedFromShareToken === 'string'
        ? row.forkedFromShareToken
        : undefined,
    scope: row.scope as ConversationScope,
    contextInjectionStatus: row.contextInjectionStatus as ContextInjectionStatus,
    contextFingerprint:
      typeof row.contextFingerprint === 'string' ? row.contextFingerprint : undefined,
    contextInjectedAt: parseOptionalFiniteNumber(row.contextInjectedAt),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

function parseMessages(raw: unknown): StoredMessage[] {
  if (!Array.isArray(raw)) return [];
  const parsed: StoredMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const msg = item as Record<string, unknown>;
    const id = typeof msg.id === 'string' ? msg.id : '';
    if (!id) continue;
    const role =
      msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'
        ? msg.role
        : 'assistant';
    const content = typeof msg.content === 'string' ? msg.content : '';
    const parts = Array.isArray(msg.parts)
      ? (msg.parts as Array<{ type: string; [key: string]: unknown }>)
      : undefined;
    const createdAt =
      typeof msg.createdAt === 'number' && Number.isFinite(msg.createdAt)
        ? msg.createdAt
        : undefined;
    parsed.push({ id, role, content, parts, createdAt });
  }
  return parsed;
}

export async function listConversationsByOwner(
  ownerInput: ConversationOwner,
  options?: { projectId?: string }
): Promise<Conversation[]> {
  await ensureDatabaseSchema();
  const owner = normalizeOwner(ownerInput);
  const pool = getDbPool();

  const conditions = ['c.owner_type = $1', 'c.owner_id = $2'];
  const values: unknown[] = [owner.ownerType, owner.ownerId];

  if (options?.projectId) {
    conditions.push(`c.project_id = $${values.length + 1}`);
    values.push(options.projectId);
  }

  const { rows } = await pool.query(
    `
      SELECT
        c.id,
        c.title,
        c.wallet_address AS "walletAddress",
        c.scope,
        c.context_injection_status AS "contextInjectionStatus",
        c.is_starred AS "isStarred",
        c.is_shared AS "isShared",
        c.shared_at AS "sharedAt",
        c.share_token AS "shareToken",
        c.share_expires_at AS "shareExpiresAt",
        c.forked_from_share_token AS "forkedFromShareToken",
        c.context_fingerprint AS "contextFingerprint",
        c.context_injected_at AS "contextInjectedAt",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt",
        COALESCE(
          json_agg(
            json_build_object(
              'id', m.message_id,
              'role', m.role,
              'content', m.content,
              'parts', m.parts,
              'createdAt', m.created_at
            )
            ORDER BY m.position ASC
          ) FILTER (WHERE m.message_id IS NOT NULL),
          '[]'::json
        ) AS messages
      FROM conversations c
      LEFT JOIN conversation_messages m
        ON m.conversation_id = c.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY c.id
      ORDER BY c.is_starred DESC, c.updated_at DESC
    `,
    values
  );

  return rows.map((row) => parseConversationRow(row as Record<string, unknown>));
}

export async function getConversationByOwnerAndId(
  ownerInput: ConversationOwner,
  conversationId: string
): Promise<Conversation | null> {
  await ensureDatabaseSchema();
  const owner = normalizeOwner(ownerInput);
  const pool = getDbPool();

  const { rows } = await pool.query(
    `
      SELECT
        c.id,
        c.title,
        c.wallet_address AS "walletAddress",
        c.scope,
        c.context_injection_status AS "contextInjectionStatus",
        c.is_starred AS "isStarred",
        c.is_shared AS "isShared",
        c.shared_at AS "sharedAt",
        c.share_token AS "shareToken",
        c.share_expires_at AS "shareExpiresAt",
        c.forked_from_share_token AS "forkedFromShareToken",
        c.context_fingerprint AS "contextFingerprint",
        c.context_injected_at AS "contextInjectedAt",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt",
        COALESCE(
          json_agg(
            json_build_object(
              'id', m.message_id,
              'role', m.role,
              'content', m.content,
              'parts', m.parts,
              'createdAt', m.created_at
            )
            ORDER BY m.position ASC
          ) FILTER (WHERE m.message_id IS NOT NULL),
          '[]'::json
        ) AS messages
      FROM conversations c
      LEFT JOIN conversation_messages m
        ON m.conversation_id = c.id
      WHERE c.id = $1
        AND c.owner_type = $2
        AND c.owner_id = $3
      GROUP BY c.id
      LIMIT 1
    `,
    [conversationId, owner.ownerType, owner.ownerId]
  );

  if (!rows.length) return null;
  return parseConversationRow(rows[0] as Record<string, unknown>);
}

export async function getConversationByShareToken(
  shareTokenInput: string
): Promise<Conversation | null> {
  await ensureDatabaseSchema();
  const shareToken = normalizeShareToken(shareTokenInput);
  if (!shareToken) return null;
  const pool = getDbPool();
  const now = Date.now();
  const { rows } = await pool.query(
    `
      SELECT
        c.id,
        c.title,
        c.wallet_address AS "walletAddress",
        c.scope,
        c.context_injection_status AS "contextInjectionStatus",
        c.is_starred AS "isStarred",
        c.is_shared AS "isShared",
        c.shared_at AS "sharedAt",
        c.share_token AS "shareToken",
        c.share_expires_at AS "shareExpiresAt",
        c.forked_from_share_token AS "forkedFromShareToken",
        c.context_fingerprint AS "contextFingerprint",
        c.context_injected_at AS "contextInjectedAt",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt",
        COALESCE(
          json_agg(
            json_build_object(
              'id', m.message_id,
              'role', m.role,
              'content', m.content,
              'parts', m.parts,
              'createdAt', m.created_at
            )
            ORDER BY m.position ASC
          ) FILTER (WHERE m.message_id IS NOT NULL),
          '[]'::json
        ) AS messages
      FROM conversations c
      LEFT JOIN conversation_messages m
        ON m.conversation_id = c.id
      WHERE c.share_token = $1
        AND c.is_shared = TRUE
        AND (c.share_expires_at IS NULL OR c.share_expires_at > $2)
      GROUP BY c.id
      LIMIT 1
    `,
    [shareToken, now]
  );

  if (rows.length === 0) return null;
  return parseConversationRow(rows[0] as Record<string, unknown>);
}

async function syncConversationMessages(
  client: PoolClient,
  conversationId: string,
  messages: StoredMessage[]
) {
  if (messages.length === 0) {
    await client.query('DELETE FROM conversation_messages WHERE conversation_id = $1', [
      conversationId,
    ]);
    return;
  }

  // Deduplicate messages by id — keep the last occurrence (latest position wins).
  // This prevents PostgreSQL error 21000 ("ON CONFLICT DO UPDATE cannot affect
  // row a second time") when the same message_id appears more than once in the
  // batch (e.g. tool-call + text parts sharing an id during streaming).
  const deduped = new Map<string, { msg: StoredMessage; pos: number }>();
  for (let i = 0; i < messages.length; i++) {
    deduped.set(messages[i].id, { msg: messages[i], pos: i });
  }
  const uniqueEntries = Array.from(deduped.values()).sort((a, b) => a.pos - b.pos);

  // Batch upsert with ON CONFLICT — avoids DELETE ALL + re-INSERT every time.
  const BATCH_SIZE = 50;
  for (let offset = 0; offset < uniqueEntries.length; offset += BATCH_SIZE) {
    const batch = uniqueEntries.slice(offset, offset + BATCH_SIZE);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    for (let i = 0; i < batch.length; i++) {
      const { msg, pos } = batch[i];
      const base = i * 7;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
      );
      values.push(
        conversationId,
        msg.id,
        pos,
        msg.role,
        msg.content,
        msg.parts ? JSON.stringify(msg.parts) : null,
        msg.createdAt ?? null
      );
    }
    await client.query(
      `
        INSERT INTO conversation_messages (
          conversation_id, message_id, position, role, content, parts, created_at
        ) VALUES ${placeholders.join(', ')}
        ON CONFLICT (conversation_id, message_id) DO UPDATE
          SET position = EXCLUDED.position,
              role = EXCLUDED.role,
              content = EXCLUDED.content,
              parts = EXCLUDED.parts,
              created_at = EXCLUDED.created_at
      `,
      values
    );
  }

  // Remove stale messages that no longer exist in the local list.
  const currentIds = messages.map((m) => m.id);
  await client.query(
    `
      DELETE FROM conversation_messages
      WHERE conversation_id = $1
        AND message_id != ALL($2::text[])
    `,
    [conversationId, currentIds]
  );
}

export async function upsertConversation(
  ownerInput: ConversationOwner,
  conversationInput: Conversation
): Promise<void> {
  await ensureDatabaseSchema();
  const owner = normalizeOwner(ownerInput);
  const conversation = normalizeConversationForDb(owner, conversationInput);
  const pool = getDbPool();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ownership check inside the transaction to prevent TOCTOU race.
    const existing = await client.query(
      'SELECT owner_type, owner_id, updated_at FROM conversations WHERE id = $1 FOR UPDATE',
      [conversation.id]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0] as {
        owner_type: ConversationOwner['ownerType'];
        owner_id: string;
        updated_at: number | string;
      };
      if (row.owner_type !== owner.ownerType || row.owner_id !== owner.ownerId) {
        throw new ConversationOwnershipConflictError();
      }
      if (Number(row.updated_at) >= conversation.updatedAt) {
        await client.query('COMMIT');
        return;
      }
    }

    await client.query(
      `
        INSERT INTO conversations (
          id,
          owner_type,
          owner_id,
          wallet_address,
          scope,
          title,
          is_starred,
          is_shared,
          shared_at,
          share_token,
          share_expires_at,
          forked_from_share_token,
          context_injection_status,
          context_fingerprint,
          context_injected_at,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (id) DO UPDATE
          SET owner_type = EXCLUDED.owner_type,
              owner_id = EXCLUDED.owner_id,
              wallet_address = EXCLUDED.wallet_address,
              scope = EXCLUDED.scope,
              title = EXCLUDED.title,
              is_starred = EXCLUDED.is_starred,
              is_shared = EXCLUDED.is_shared,
              shared_at = EXCLUDED.shared_at,
              share_token = EXCLUDED.share_token,
              share_expires_at = EXCLUDED.share_expires_at,
              forked_from_share_token = EXCLUDED.forked_from_share_token,
              context_injection_status = EXCLUDED.context_injection_status,
              context_fingerprint = EXCLUDED.context_fingerprint,
              context_injected_at = EXCLUDED.context_injected_at,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at
          WHERE conversations.updated_at < EXCLUDED.updated_at
      `,
      [
        conversation.id,
        owner.ownerType,
        owner.ownerId,
        conversation.walletAddress ?? null,
        conversation.scope,
        conversation.title,
        conversation.isStarred,
        conversation.isShared,
        conversation.sharedAt ?? null,
        conversation.shareToken ?? null,
        conversation.shareExpiresAt ?? null,
        conversation.forkedFromShareToken ?? null,
        conversation.contextInjectionStatus,
        conversation.contextFingerprint ?? null,
        conversation.contextInjectedAt ?? null,
        conversation.createdAt,
        conversation.updatedAt,
      ]
    );

    await syncConversationMessages(client, conversation.id, conversation.messages);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteConversationByOwner(
  ownerInput: ConversationOwner,
  conversationId: string
): Promise<void> {
  await ensureDatabaseSchema();
  const owner = normalizeOwner(ownerInput);
  const pool = getDbPool();
  await pool.query(
    `
      DELETE FROM conversations
      WHERE id = $1
        AND owner_type = $2
        AND owner_id = $3
    `,
    [conversationId, owner.ownerType, owner.ownerId]
  );
}

export async function ensureConversationShareToken(
  ownerInput: ConversationOwner,
  conversationId: string,
  shareExpiresAtInput?: number | null
): Promise<string | null> {
  await ensureDatabaseSchema();
  const owner = normalizeOwner(ownerInput);
  const pool = getDbPool();
  const now = Date.now();
  const nextToken = createShareToken();
  const shouldUpdateExpiresAt = shareExpiresAtInput !== undefined;
  const nextShareExpiresAt =
    shareExpiresAtInput === null
      ? null
      : typeof shareExpiresAtInput === 'number' && Number.isFinite(shareExpiresAtInput)
        ? shareExpiresAtInput
        : null;
  const { rows } = await pool.query(
    `
      UPDATE conversations
      SET is_shared = TRUE,
          shared_at = COALESCE(shared_at, $5),
          share_token = COALESCE(NULLIF(share_token, ''), $1),
          share_expires_at = CASE WHEN $6 THEN $7::bigint ELSE share_expires_at END,
          updated_at = $5
      WHERE id = $2
        AND owner_type = $3
        AND owner_id = $4
      RETURNING share_token AS "shareToken"
    `,
    [
      nextToken,
      conversationId,
      owner.ownerType,
      owner.ownerId,
      now,
      shouldUpdateExpiresAt,
      nextShareExpiresAt,
    ]
  );
  if (rows.length === 0) return null;
  const shareToken = rows[0]?.shareToken;
  return typeof shareToken === 'string' && shareToken ? shareToken : null;
}

export async function updateConversationProject(
  ownerInput: ConversationOwner,
  conversationId: string,
  projectId: string | null
): Promise<boolean> {
  await ensureDatabaseSchema();
  const owner = normalizeOwner(ownerInput);
  const pool = getDbPool();
  const now = Date.now();
  const { rowCount } = await pool.query(
    `
      UPDATE conversations
      SET project_id = $4,
          updated_at = $5
      WHERE id = $1
        AND owner_type = $2
        AND owner_id = $3
    `,
    [conversationId, owner.ownerType, owner.ownerId, projectId, now]
  );
  return (rowCount ?? 0) > 0;
}

export async function clearConversationShareToken(
  ownerInput: ConversationOwner,
  conversationId: string
): Promise<boolean> {
  await ensureDatabaseSchema();
  const owner = normalizeOwner(ownerInput);
  const pool = getDbPool();
  const now = Date.now();
  const { rowCount } = await pool.query(
    `
      UPDATE conversations
      SET is_shared = FALSE,
          shared_at = NULL,
          share_token = NULL,
          share_expires_at = NULL,
          updated_at = $4
      WHERE id = $1
        AND owner_type = $2
        AND owner_id = $3
    `,
    [conversationId, owner.ownerType, owner.ownerId, now]
  );
  return (rowCount ?? 0) > 0;
}
