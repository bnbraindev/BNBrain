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
  nodereal?: { apiKey: string };
  serper?: { apiKey: string };
  steel?: { apiKey: string; apiUrl?: string };
  siwe?: { domain?: string; allowedChainIds?: string };
  rpc?: { url56?: string; url97?: string; url204?: string };
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

export async function resolveNoderealApiKey(): Promise<string> {
  const config = await getSetupConfig();
  if (config.services.nodereal?.apiKey) {
    return config.services.nodereal.apiKey;
  }
  return process.env.NODEREAL_API_KEY ?? '';
}

export async function resolveSerperApiKey(): Promise<string> {
  const config = await getSetupConfig();
  if (config.services.serper?.apiKey) {
    return config.services.serper.apiKey;
  }
  return process.env.SERPER_API_KEY ?? '';
}

export async function resolveSteelConfig(): Promise<{
  apiKey: string;
  apiUrl: string;
} | null> {
  const config = await getSetupConfig();
  const dbSteel = config.services.steel;
  if (dbSteel?.apiKey) {
    return {
      apiKey: dbSteel.apiKey,
      apiUrl: dbSteel.apiUrl?.trim() || 'https://api.steel.dev',
    };
  }
  const envKey = process.env.STEEL_API_KEY?.trim();
  if (envKey) {
    return {
      apiKey: envKey,
      apiUrl: process.env.STEEL_API_URL?.trim() || 'https://api.steel.dev',
    };
  }
  return null;
}

export async function resolveSiweDomain(): Promise<string | undefined> {
  const config = await getSetupConfig();
  if (config.services.siwe?.domain) {
    return config.services.siwe.domain;
  }
  return process.env.SIWE_DOMAIN?.trim() || undefined;
}

export async function resolveSiweAllowedChainIds(): Promise<string | undefined> {
  const config = await getSetupConfig();
  if (config.services.siwe?.allowedChainIds) {
    return config.services.siwe.allowedChainIds;
  }
  return process.env.SIWE_ALLOWED_CHAIN_IDS?.trim() || undefined;
}

const DEFAULT_RPC_URLS = {
  url56: 'https://bsc-dataseed.binance.org',
  url97: 'https://bsc-testnet-dataseed.bnbchain.org',
  url204: 'https://opbnb-mainnet-rpc.bnbchain.org',
};

export async function resolveRpcUrls(): Promise<{
  url56: string;
  url97: string;
  url204: string;
}> {
  const config = await getSetupConfig();
  const dbRpc = config.services.rpc;
  return {
    url56: dbRpc?.url56?.trim() || process.env.RPC_URL_56 || DEFAULT_RPC_URLS.url56,
    url97: dbRpc?.url97?.trim() || process.env.RPC_URL_97 || DEFAULT_RPC_URLS.url97,
    url204: dbRpc?.url204?.trim() || process.env.RPC_URL_204 || DEFAULT_RPC_URLS.url204,
  };
}
