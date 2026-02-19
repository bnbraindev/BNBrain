import { Pool } from 'pg';

declare global {
  var __bnbrainPool: Pool | undefined;
  var __bnbrainSchemaReady: Promise<void> | undefined;
  var __bnbrainSchemaVersion: number | undefined;
}

const SCHEMA_VERSION = 11;

function resolveDatabaseUrl(): string {
  const directUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (directUrl) return directUrl;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const host = process.env.PGHOST ?? 'localhost';
  const port = process.env.PGPORT ?? '5432';
  const database = process.env.PGDATABASE;
  if (user && password && database) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }
  throw new Error('Missing DATABASE_URL (or PGUSER/PGPASSWORD/PGDATABASE)');
}

export function getDbPool(): Pool {
  if (!globalThis.__bnbrainPool) {
    globalThis.__bnbrainPool = new Pool({
      connectionString: resolveDatabaseUrl(),
      max: 20,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalThis.__bnbrainPool;
}

export async function ensureDatabaseSchema(): Promise<void> {
  if (globalThis.__bnbrainSchemaVersion !== SCHEMA_VERSION) {
    globalThis.__bnbrainSchemaVersion = SCHEMA_VERSION;
    globalThis.__bnbrainSchemaReady = undefined;
  }
  if (!globalThis.__bnbrainSchemaReady) {
    globalThis.__bnbrainSchemaReady = (async () => {
      try {
        const pool = getDbPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          owner_type TEXT NOT NULL CHECK (owner_type IN ('wallet', 'guest')),
          owner_id TEXT NOT NULL,
          wallet_address TEXT,
          scope TEXT NOT NULL CHECK (scope IN ('wallet', 'guest')),
          title TEXT NOT NULL,
          is_starred BOOLEAN NOT NULL DEFAULT FALSE,
          is_shared BOOLEAN NOT NULL DEFAULT FALSE,
          shared_at BIGINT,
          share_token TEXT,
          share_expires_at BIGINT,
          forked_from_share_token TEXT,
          context_injection_status TEXT NOT NULL CHECK (context_injection_status IN ('not_injected', 'pending', 'injected', 'stale')),
          context_fingerprint TEXT,
          context_injected_at BIGINT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
      `);
      await pool.query(`
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT FALSE;
      `);
      await pool.query(`
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT FALSE;
      `);
      await pool.query(`
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS shared_at BIGINT;
      `);
      await pool.query(`
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS share_token TEXT;
      `);
      await pool.query(`
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS share_expires_at BIGINT;
      `);
      await pool.query(`
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS forked_from_share_token TEXT;
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_conversations_owner
        ON conversations(owner_type, owner_id, updated_at DESC);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_conversations_owner_starred
        ON conversations(owner_type, owner_id, is_starred DESC, updated_at DESC);
      `);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_share_token
        ON conversations(share_token)
        WHERE share_token IS NOT NULL;
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS conversation_messages (
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          message_id TEXT NOT NULL,
          position INTEGER NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          parts JSONB,
          created_at BIGINT,
          PRIMARY KEY (conversation_id, message_id)
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_position
        ON conversation_messages(conversation_id, position ASC);
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tx_states (
          conversation_id TEXT NOT NULL,
          tx_key TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('idle', 'confirming', 'pending', 'success', 'cancelled', 'error')),
          hash TEXT,
          chain_id INTEGER,
          error TEXT,
          error_details TEXT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (conversation_id, tx_key)
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_tx_states_updated
        ON tx_states(updated_at DESC);
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS auth_challenges (
          nonce TEXT PRIMARY KEY,
          address TEXT NOT NULL,
          purpose TEXT NOT NULL CHECK (purpose IN ('user', 'admin')),
          domain TEXT NOT NULL,
          uri TEXT NOT NULL,
          chain_id INTEGER NOT NULL,
          issued_at BIGINT NOT NULL,
          expires_at BIGINT NOT NULL,
          used_at BIGINT
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_auth_challenges_address
        ON auth_challenges(address, expires_at DESC);
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS auth_sessions (
          token_hash TEXT PRIMARY KEY,
          address TEXT NOT NULL,
          purpose TEXT NOT NULL CHECK (purpose IN ('user', 'admin')),
          created_at BIGINT NOT NULL,
          expires_at BIGINT NOT NULL,
          revoked_at BIGINT
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_address
        ON auth_sessions(address, expires_at DESC);
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS auth_rate_limits (
          key TEXT PRIMARY KEY,
          count INTEGER NOT NULL,
          window_started_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated
        ON auth_rate_limits(updated_at ASC);
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS security_audit_logs (
          id BIGSERIAL PRIMARY KEY,
          event_type TEXT NOT NULL,
          result TEXT NOT NULL,
          address TEXT,
          ip_address TEXT,
          actor_purpose TEXT,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at BIGINT NOT NULL
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_security_audit_logs_event_created
        ON security_audit_logs(event_type, created_at DESC);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_security_audit_logs_created
        ON security_audit_logs(created_at DESC);
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS chat_runs (
          id TEXT PRIMARY KEY,
          chat_id TEXT NOT NULL,
          owner_type TEXT NOT NULL CHECK (owner_type IN ('wallet', 'guest')),
          owner_id TEXT NOT NULL,
          trigger TEXT NOT NULL CHECK (trigger IN ('submit-message', 'regenerate-message')),
          regenerate_message_id TEXT,
          request_messages JSONB NOT NULL,
          user_context JSONB,
          status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'stalled', 'completed', 'failed', 'cancelled')),
          error_text TEXT,
          lock_token TEXT,
          lock_expires_at BIGINT,
          cancel_requested_at BIGINT,
          started_at BIGINT,
          finished_at BIGINT,
          last_event_seq INTEGER NOT NULL DEFAULT 0,
          last_event_at BIGINT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_runs_chat_owner
        ON chat_runs(chat_id, owner_type, owner_id, created_at DESC);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_runs_status
        ON chat_runs(status, created_at ASC);
      `);
      await pool.query('DROP INDEX IF EXISTS idx_chat_runs_active_chat_owner_old');
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_runs_active_chat_owner
        ON chat_runs(chat_id, owner_type, owner_id)
        WHERE status IN ('queued', 'running', 'stalled')
          AND cancel_requested_at IS NULL
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS chat_run_events (
          run_id TEXT NOT NULL REFERENCES chat_runs(id) ON DELETE CASCADE,
          seq INTEGER NOT NULL,
          chunk JSONB NOT NULL,
          created_at BIGINT NOT NULL,
          PRIMARY KEY (run_id, seq)
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_run_events_created
        ON chat_run_events(run_id, created_at ASC);
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY,
          conversation_id TEXT,
          token_address TEXT NOT NULL,
          token_name TEXT,
          token_symbol TEXT,
          chain_id INTEGER NOT NULL DEFAULT 56,
          html TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          risk_score INTEGER,
          steps JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at BIGINT NOT NULL
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reports_token_address
        ON reports(token_address, created_at DESC);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reports_created
        ON reports(created_at DESC);
      `);
      await pool.query(`
        ALTER TABLE tx_states
        DROP CONSTRAINT IF EXISTS tx_states_conversation_id_fkey;
      `);
      await pool.query(`
        ALTER TABLE chat_runs
        ADD COLUMN IF NOT EXISTS progress_json JSONB;
      `);
      await pool.query(`
        ALTER TABLE reports
        ADD COLUMN IF NOT EXISTS report_type TEXT NOT NULL DEFAULT 'deep_analysis';
      `);

      // ── v10: Projects feature ──
      await pool.query(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          short_id VARCHAR(8) UNIQUE NOT NULL,
          owner_type TEXT NOT NULL CHECK (owner_type IN ('wallet', 'guest')),
          owner_id TEXT NOT NULL,
          name VARCHAR(120) NOT NULL,
          description TEXT,
          project_type TEXT NOT NULL DEFAULT 'custom'
            CHECK (project_type IN ('token', 'nft', 'defi', 'custom')),
          status TEXT NOT NULL DEFAULT 'draft'
            CHECK (status IN ('draft', 'active', 'archived')),
          primary_chain_id INTEGER,
          primary_contract_address TEXT,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_projects_owner
        ON projects(owner_type, owner_id, updated_at DESC);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_projects_short_id
        ON projects(short_id);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_projects_contract
        ON projects(primary_chain_id, primary_contract_address)
        WHERE primary_contract_address IS NOT NULL;
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS project_files (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          path VARCHAR(500) NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          content_type VARCHAR(50) NOT NULL DEFAULT 'text/plain',
          size_bytes INTEGER NOT NULL DEFAULT 0,
          updated_by TEXT NOT NULL DEFAULT 'system'
            CHECK (updated_by IN ('ai', 'user', 'system')),
          version INTEGER NOT NULL DEFAULT 1,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          UNIQUE (project_id, path)
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_project_files_project
        ON project_files(project_id, path);
      `);

      await pool.query(`
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_conversations_project
        ON conversations(project_id, updated_at DESC)
        WHERE project_id IS NOT NULL;
      `);

      // ── v11: Admin password credentials ──
      await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_credentials (
          username VARCHAR(100) PRIMARY KEY,
          password_hash TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
      `);
      } catch (error) {
        globalThis.__bnbrainSchemaReady = undefined;
        throw error;
      }
    })();
  }
  return globalThis.__bnbrainSchemaReady;
}
