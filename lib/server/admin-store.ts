import { ensureDatabaseSchema, getDbPool } from '@/lib/server/db';
import {
  getChatRunRuntimeMetrics,
  type ChatRunRuntimeMetrics,
} from '@/lib/server/chat-run-store';

export interface AdminOverviewData {
  counts: {
    conversations: number;
    messages: number;
    txStates: number;
  };
  ownerBreakdown: Array<{
    ownerType: 'wallet' | 'guest';
    ownerId: string;
    conversationCount: number;
  }>;
  latestConversations: Array<{
    id: string;
    title: string;
    ownerType: 'wallet' | 'guest';
    ownerId: string;
    walletAddress: string | null;
    updatedAt: number;
    messageCount: number;
  }>;
  latestTxStates: Array<{
    conversationId: string;
    txKey: string;
    status: string;
    hash: string | null;
    chainId: number | null;
    updatedAt: number;
  }>;
}

export type AdminChatRunRuntimeMetrics = ChatRunRuntimeMetrics;

export interface AdminConversationListItem {
  id: string;
  title: string;
  ownerType: 'wallet' | 'guest';
  ownerId: string;
  walletAddress: string | null;
  scope: 'wallet' | 'guest';
  isStarred: boolean;
  isShared: boolean;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessagePreview: string;
}

export interface AdminConversationMessage {
  id: string;
  position: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts?: Array<{ type: string; [key: string]: unknown }>;
  createdAt?: number;
}

export interface AdminConversationDetail {
  id: string;
  title: string;
  ownerType: 'wallet' | 'guest';
  ownerId: string;
  walletAddress: string | null;
  scope: 'wallet' | 'guest';
  isStarred: boolean;
  isShared: boolean;
  shareToken: string | null;
  shareExpiresAt: number | null;
  createdAt: number;
  updatedAt: number;
  messages: AdminConversationMessage[];
}

export async function getAdminOverviewData(): Promise<AdminOverviewData> {
  await ensureDatabaseSchema();
  const pool = getDbPool();

  const [countsRes, ownerRes, convRes, txRes] = await Promise.all([
    pool.query(
      `
        SELECT
          (SELECT COUNT(*) FROM conversations) AS conversations,
          (SELECT COUNT(*) FROM conversation_messages) AS messages,
          (SELECT COUNT(*) FROM tx_states) AS tx_states
      `
    ),
    pool.query(
      `
        SELECT owner_type, owner_id, COUNT(*) AS conversation_count
        FROM conversations
        GROUP BY owner_type, owner_id
        ORDER BY conversation_count DESC
        LIMIT 50
      `
    ),
    pool.query(
      `
        SELECT
          c.id,
          c.title,
          c.owner_type,
          c.owner_id,
          c.wallet_address,
          c.updated_at,
          COUNT(m.message_id) AS message_count
        FROM conversations c
        LEFT JOIN conversation_messages m
          ON m.conversation_id = c.id
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        LIMIT 100
      `
    ),
    pool.query(
      `
        SELECT
          conversation_id,
          tx_key,
          status,
          hash,
          chain_id,
          updated_at
        FROM tx_states
        ORDER BY updated_at DESC
        LIMIT 100
      `
    ),
  ]);

  const countRow = countsRes.rows[0] as Record<string, unknown>;
  return {
    counts: {
      conversations: Number(countRow.conversations ?? 0),
      messages: Number(countRow.messages ?? 0),
      txStates: Number(countRow.tx_states ?? 0),
    },
    ownerBreakdown: ownerRes.rows.map((row) => ({
      ownerType: String(row.owner_type) as 'wallet' | 'guest',
      ownerId: String(row.owner_id),
      conversationCount: Number(row.conversation_count ?? 0),
    })),
    latestConversations: convRes.rows.map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ''),
      ownerType: String(row.owner_type) as 'wallet' | 'guest',
      ownerId: String(row.owner_id),
      walletAddress: row.wallet_address ? String(row.wallet_address) : null,
      updatedAt: Number(row.updated_at ?? 0),
      messageCount: Number(row.message_count ?? 0),
    })),
    latestTxStates: txRes.rows.map((row) => ({
      conversationId: String(row.conversation_id),
      txKey: String(row.tx_key),
      status: String(row.status),
      hash: row.hash ? String(row.hash) : null,
      chainId:
        typeof row.chain_id === 'number'
          ? row.chain_id
          : row.chain_id
            ? Number(row.chain_id)
            : null,
      updatedAt: Number(row.updated_at ?? 0),
    })),
  };
}

export async function getAdminChatRunRuntimeMetrics(): Promise<AdminChatRunRuntimeMetrics> {
  return getChatRunRuntimeMetrics();
}

export async function listAdminConversations(options?: {
  limit?: number;
  offset?: number;
  query?: string;
}): Promise<{ total: number; items: AdminConversationListItem[] }> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const limit = Math.max(1, Math.min(200, options?.limit ?? 120));
  const offset = Math.max(0, options?.offset ?? 0);
  const query = options?.query?.trim() ?? '';
  const escapedQuery = query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const queryLike = `%${escapedQuery}%`;
  const hasQuery = query.length > 0;

  const [totalRes, listRes] = await Promise.all([
    pool.query(
      `
        SELECT COUNT(*) AS total
        FROM conversations c
        WHERE ($1 = FALSE OR c.id ILIKE $2 OR c.title ILIKE $2 OR c.owner_id ILIKE $2)
      `,
      [hasQuery, queryLike]
    ),
    pool.query(
      `
        SELECT
          c.id,
          c.title,
          c.owner_type,
          c.owner_id,
          c.wallet_address,
          c.scope,
          c.is_starred,
          c.is_shared,
          c.created_at,
          c.updated_at,
          (
            SELECT COUNT(*)
            FROM conversation_messages m
            WHERE m.conversation_id = c.id
          ) AS message_count,
          (
            SELECT COALESCE(SUBSTRING(m.content, 1, 180), '')
            FROM conversation_messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.position DESC
            LIMIT 1
          ) AS last_message_preview
        FROM conversations c
        WHERE ($1 = FALSE OR c.id ILIKE $2 OR c.title ILIKE $2 OR c.owner_id ILIKE $2)
        ORDER BY c.updated_at DESC
        LIMIT $3
        OFFSET $4
      `,
      [hasQuery, queryLike, limit, offset]
    ),
  ]);

  const total = Number(totalRes.rows[0]?.total ?? 0);
  const items: AdminConversationListItem[] = listRes.rows.map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ''),
    ownerType: row.owner_type === 'wallet' ? 'wallet' : 'guest',
    ownerId: String(row.owner_id ?? ''),
    walletAddress: row.wallet_address ? String(row.wallet_address) : null,
    scope: row.scope === 'wallet' ? 'wallet' : 'guest',
    isStarred: Boolean(row.is_starred),
    isShared: Boolean(row.is_shared),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
    messageCount: Number(row.message_count ?? 0),
    lastMessagePreview: String(row.last_message_preview ?? ''),
  }));

  return { total, items };
}

export async function getAdminConversationDetail(
  conversationId: string
): Promise<AdminConversationDetail | null> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const id = conversationId.trim();
  if (!id) return null;

  const [conversationRes, messagesRes] = await Promise.all([
    pool.query(
      `
        SELECT
          id,
          title,
          owner_type,
          owner_id,
          wallet_address,
          scope,
          is_starred,
          is_shared,
          share_token,
          share_expires_at,
          created_at,
          updated_at
        FROM conversations
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    ),
    pool.query(
      `
        SELECT
          message_id,
          position,
          role,
          content,
          parts,
          created_at
        FROM conversation_messages
        WHERE conversation_id = $1
        ORDER BY position ASC
      `,
      [id]
    ),
  ]);

  if (conversationRes.rows.length === 0) return null;
  const row = conversationRes.rows[0] as Record<string, unknown>;
  const messages: AdminConversationMessage[] = messagesRes.rows.map((msgRow) => {
    const rawParts = msgRow.parts;
    const parsedParts = Array.isArray(rawParts)
      ? (rawParts as Array<{ type: string; [key: string]: unknown }>)
      : undefined;
    return {
      id: String(msgRow.message_id),
      position: Number(msgRow.position ?? 0),
      role:
        msgRow.role === 'user' || msgRow.role === 'system'
          ? msgRow.role
          : 'assistant',
      content: String(msgRow.content ?? ''),
      parts: parsedParts,
      createdAt:
        typeof msgRow.created_at === 'number' && Number.isFinite(msgRow.created_at)
          ? msgRow.created_at
          : msgRow.created_at
            ? Number(msgRow.created_at)
            : undefined,
    };
  });

  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    ownerType: row.owner_type === 'wallet' ? 'wallet' : 'guest',
    ownerId: String(row.owner_id ?? ''),
    walletAddress: row.wallet_address ? String(row.wallet_address) : null,
    scope: row.scope === 'wallet' ? 'wallet' : 'guest',
    isStarred: Boolean(row.is_starred),
    isShared: Boolean(row.is_shared),
    shareToken: row.share_token ? String(row.share_token) : null,
    shareExpiresAt:
      typeof row.share_expires_at === 'number'
        ? row.share_expires_at
        : row.share_expires_at
          ? Number(row.share_expires_at)
          : null,
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
    messages,
  };
}
