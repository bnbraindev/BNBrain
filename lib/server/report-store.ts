import { randomUUID } from 'crypto';
import { ensureDatabaseSchema, getDbPool } from '@/lib/server/db';

export interface ReportStep {
  key: string;
  label: string;
  status: 'completed' | 'failed' | 'skipped';
  summary: string | null;
  durationMs: number;
}

export interface ReportRecord {
  id: string;
  conversationId: string | null;
  tokenAddress: string;
  tokenName: string | null;
  tokenSymbol: string | null;
  chainId: number;
  html: string;
  summary: string;
  riskScore: number | null;
  steps: ReportStep[];
  createdAt: number;
}

export interface CreateReportInput {
  conversationId?: string | null;
  tokenAddress: string;
  tokenName?: string | null;
  tokenSymbol?: string | null;
  chainId: number;
  html: string;
  summary: string;
  riskScore?: number | null;
  steps: ReportStep[];
}

function parseReportRow(row: Record<string, unknown>): ReportRecord {
  return {
    id: String(row.id),
    conversationId: typeof row.conversation_id === 'string' ? row.conversation_id : null,
    tokenAddress: String(row.token_address),
    tokenName: typeof row.token_name === 'string' ? row.token_name : null,
    tokenSymbol: typeof row.token_symbol === 'string' ? row.token_symbol : null,
    chainId: Number(row.chain_id ?? 56),
    html: String(row.html ?? ''),
    summary: String(row.summary ?? ''),
    riskScore: typeof row.risk_score === 'number' ? row.risk_score : row.risk_score != null ? Number(row.risk_score) : null,
    steps: Array.isArray(row.steps) ? (row.steps as ReportStep[]) : [],
    createdAt: Number(row.created_at),
  };
}

export async function createReport(input: CreateReportInput): Promise<ReportRecord> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const id = randomUUID();
  const now = Date.now();
  const { rows } = await pool.query(
    `
      INSERT INTO reports (
        id, conversation_id, token_address, token_name, token_symbol,
        chain_id, html, summary, risk_score, steps, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
      RETURNING *
    `,
    [
      id,
      input.conversationId ?? null,
      input.tokenAddress,
      input.tokenName ?? null,
      input.tokenSymbol ?? null,
      input.chainId,
      input.html,
      input.summary,
      input.riskScore ?? null,
      JSON.stringify(input.steps),
      now,
    ]
  );
  return parseReportRow(rows[0] as Record<string, unknown>);
}

export async function getReportById(id: string): Promise<ReportRecord | null> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    `SELECT * FROM reports WHERE id = $1 LIMIT 1`,
    [id]
  );
  if (!rows.length) return null;
  return parseReportRow(rows[0] as Record<string, unknown>);
}
