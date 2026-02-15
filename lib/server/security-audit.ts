import { ensureDatabaseSchema, getDbPool } from '@/lib/server/db';
import { normalizeWalletAddress } from '@/lib/server/admin-owner';

export interface SecurityAuditLogInput {
  eventType: string;
  result: string;
  address?: string | null;
  ipAddress?: string | null;
  actorPurpose?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeSecurityAuditLog(input: SecurityAuditLogInput): Promise<void> {
  try {
    await ensureDatabaseSchema();
    const pool = getDbPool();
    const metadata = input.metadata ?? {};
    await pool.query(
      `
        INSERT INTO security_audit_logs (
          event_type,
          result,
          address,
          ip_address,
          actor_purpose,
          metadata,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      `,
      [
        input.eventType,
        input.result,
        normalizeWalletAddress(input.address) ?? null,
        input.ipAddress?.trim() || null,
        input.actorPurpose?.trim() || null,
        JSON.stringify(metadata),
        Date.now(),
      ]
    );
  } catch (error) {
    console.error('[security audit log]', error);
  }
}
