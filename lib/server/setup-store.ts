/**
 * Setup configuration store — manages first-run setup and API key resolution.
 *
 * Stores service credentials in system_settings, with env var fallback.
 * Uses in-memory cache with 60s TTL to avoid repeated DB reads.
 */

import { ensureDatabaseSchema, getDbPool } from '@/lib/server/db';

const SETUP_CONFIG_KEY = 'setup_config_v1';
const CACHE_TTL = 60_000;

export interface SetupServiceConfig {
  goplus?: { appKey: string; appSecret: string };
  bscscan?: { apiKey: string };
}

export interface SetupConfig {
  completed: boolean;
  completedAt?: number;
  services: SetupServiceConfig;
}

// ── In-memory cache ──────────────────────────────────────────

let cachedConfig: SetupConfig | null = null;
let cacheLoadedAt = 0;

function emptyConfig(): SetupConfig {
  return { completed: false, services: {} };
}

// ── CRUD ─────────────────────────────────────────────────────

export async function getSetupConfig(): Promise<SetupConfig> {
  if (cachedConfig && Date.now() - cacheLoadedAt < CACHE_TTL) {
    return cachedConfig;
  }
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    `SELECT value FROM system_settings WHERE key = $1 LIMIT 1`,
    [SETUP_CONFIG_KEY]
  );
  if (!rows.length) {
    const config = emptyConfig();
    cachedConfig = config;
    cacheLoadedAt = Date.now();
    return config;
  }
  try {
    const parsed = JSON.parse(rows[0].value) as SetupConfig;
    if (typeof parsed !== 'object' || parsed === null) throw new Error('bad');
    const config: SetupConfig = {
      completed: Boolean(parsed.completed),
      completedAt:
        typeof parsed.completedAt === 'number' ? parsed.completedAt : undefined,
      services: parsed.services && typeof parsed.services === 'object'
        ? parsed.services
        : {},
    };
    cachedConfig = config;
    cacheLoadedAt = Date.now();
    return config;
  } catch {
    const config = emptyConfig();
    cachedConfig = config;
    cacheLoadedAt = Date.now();
    return config;
  }
}

export async function saveSetupConfig(config: SetupConfig): Promise<void> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const now = Date.now();
  await pool.query(
    `INSERT INTO system_settings (key, value, created_at, updated_at)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [SETUP_CONFIG_KEY, JSON.stringify(config), now]
  );
  cachedConfig = config;
  cacheLoadedAt = Date.now();
}

export function invalidateSetupCache(): void {
  cachedConfig = null;
  cacheLoadedAt = 0;
}

// ── Setup completion detection ───────────────────────────────

/**
 * Setup is "completed" if:
 *  1. The setup_config explicitly marks completed, OR
 *  2. ANTHROPIC_API_KEY env var is set (implicit setup via env), OR
 *  3. Models are already configured in DB
 */
export async function isSetupCompleted(): Promise<boolean> {
  const config = await getSetupConfig();
  if (config.completed) return true;

  // Env var provides implicit model — no setup needed
  if (process.env.ANTHROPIC_API_KEY?.trim()) return true;

  // Check if models are configured in DB
  try {
    const pool = getDbPool();
    const { rows } = await pool.query(
      `SELECT value FROM system_settings WHERE key = 'chat_models_config_v1' LIMIT 1`
    );
    if (rows.length) {
      const parsed = JSON.parse(rows[0].value);
      if (Array.isArray(parsed.models) && parsed.models.length > 0) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

// ── Config resolution (DB → env vars) ────────────────────────

export async function resolveGoPlusCredentials(): Promise<{
  appKey: string;
  appSecret: string;
} | null> {
  const config = await getSetupConfig();
  if (config.services.goplus?.appKey && config.services.goplus?.appSecret) {
    return config.services.goplus;
  }
  const appKey = process.env.GOPLUS_APP_KEY?.trim();
  const appSecret = process.env.GOPLUS_APP_SECRET?.trim();
  if (appKey && appSecret) return { appKey, appSecret };
  return null;
}

export async function resolveBscScanApiKey(): Promise<string> {
  const config = await getSetupConfig();
  if (config.services.bscscan?.apiKey) {
    return config.services.bscscan.apiKey;
  }
  return process.env.BSCSCAN_API_KEY ?? process.env.ETHERSCAN_API_KEY ?? '';
}
