import { ensureDatabaseSchema, getDbPool } from '@/lib/server/db';

const LEGACY_ADMIN_OWNER_SETTING_KEY = 'admin_owner_wallet_address';
const ADMIN_OWNERS_SETTING_KEY = 'admin_owner_wallet_addresses';

export function normalizeWalletAddress(address: string | null | undefined): string | null {
  const value = address?.trim();
  if (!value) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  return value.toLowerCase();
}

function normalizeAddressList(addresses: Array<string | null | undefined>): string[] {
  const deduped = new Set<string>();
  for (const address of addresses) {
    const normalized = normalizeWalletAddress(address);
    if (normalized) deduped.add(normalized);
  }
  return Array.from(deduped);
}

function parseAddressListFromSettingValue(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return normalizeAddressList(raw.map((item) => (typeof item === 'string' ? item : null)));
  }
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const directAddress = normalizeWalletAddress(raw);
  if (directAddress) return [directAddress];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeAddressList(
      parsed.map((item) => (typeof item === 'string' ? item : null))
    );
  } catch {
    return [];
  }
}

async function readAdminWalletAddressesWithClient(
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>
): Promise<string[]> {
  const { rows } = await query(
    `
      SELECT key, value
      FROM system_settings
      WHERE key = ANY($1::text[])
    `,
    [[ADMIN_OWNERS_SETTING_KEY, LEGACY_ADMIN_OWNER_SETTING_KEY]]
  );
  const byKey = new Map<string, unknown>();
  for (const row of rows) {
    const key = String(row.key ?? '');
    byKey.set(key, row.value);
  }
  const listFromNewKey = parseAddressListFromSettingValue(
    byKey.get(ADMIN_OWNERS_SETTING_KEY)
  );
  if (listFromNewKey.length > 0) {
    return listFromNewKey;
  }
  const listFromLegacyKey = parseAddressListFromSettingValue(
    byKey.get(LEGACY_ADMIN_OWNER_SETTING_KEY)
  );
  return listFromLegacyKey;
}

async function upsertAdminOwnerSettingsWithClient(
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>,
  addresses: string[]
): Promise<void> {
  const normalizedAddresses = normalizeAddressList(addresses);
  if (normalizedAddresses.length === 0) {
    throw new Error('At least one admin address is required');
  }
  const now = Date.now();
  await query(
    `
      INSERT INTO system_settings (key, value, created_at, updated_at)
      VALUES ($1, $2, $3, $3)
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `,
    [ADMIN_OWNERS_SETTING_KEY, JSON.stringify(normalizedAddresses), now]
  );
  await query(
    `
      INSERT INTO system_settings (key, value, created_at, updated_at)
      VALUES ($1, $2, $3, $3)
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `,
    [LEGACY_ADMIN_OWNER_SETTING_KEY, normalizedAddresses[0], now]
  );
}

async function mutateAdminWalletAddresses(
  mutator: (current: string[]) => string[]
): Promise<string[]> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        SELECT pg_advisory_xact_lock(hashtext($1)::bigint)
      `,
      [ADMIN_OWNERS_SETTING_KEY]
    );
    await client.query(
      `
        SELECT key
        FROM system_settings
        WHERE key = ANY($1::text[])
        FOR UPDATE
      `,
      [[ADMIN_OWNERS_SETTING_KEY, LEGACY_ADMIN_OWNER_SETTING_KEY]]
    );
    const current = await readAdminWalletAddressesWithClient((text, values) =>
      client.query(text, values)
    );
    const next = normalizeAddressList(mutator(current));
    if (next.length === 0) {
      throw new Error('At least one admin address is required');
    }
    await upsertAdminOwnerSettingsWithClient((text, values) => client.query(text, values), next);
    await client.query('COMMIT');
    return next;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getAdminWalletAddresses(): Promise<string[]> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  return readAdminWalletAddressesWithClient((text, values) => pool.query(text, values));
}

export async function getAdminWalletAddress(): Promise<string | null> {
  const addresses = await getAdminWalletAddresses();
  return addresses[0] ?? null;
}

export async function bindInitialAdminWalletAddress(
  candidateAddress: string | null | undefined
): Promise<string | null> {
  const normalized = normalizeWalletAddress(candidateAddress);
  if (!normalized) {
    return getAdminWalletAddress();
  }
  const existing = await getAdminWalletAddresses();
  if (existing.length > 0) {
    return existing[0] ?? null;
  }
  // Use a transaction with advisory lock to prevent two concurrent requests
  // from both seeing an empty admin list and inserting different addresses.
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
      ['bind_initial_admin']
    );
    // Re-check inside the lock to prevent TOCTOU.
    const { rows } = await client.query(
      'SELECT value FROM system_settings WHERE key = $1',
      [ADMIN_OWNERS_SETTING_KEY]
    );
    if (rows.length > 0 && rows[0].value) {
      await client.query('COMMIT');
      return getAdminWalletAddress();
    }
    const now = Date.now();
    await client.query(
      `
        INSERT INTO system_settings (key, value, created_at, updated_at)
        VALUES ($1, $2, $3, $3)
        ON CONFLICT (key) DO NOTHING
      `,
      [ADMIN_OWNERS_SETTING_KEY, JSON.stringify([normalized]), now]
    );
    await client.query(
      `
        INSERT INTO system_settings (key, value, created_at, updated_at)
        VALUES ($1, $2, $3, $3)
        ON CONFLICT (key) DO NOTHING
      `,
      [LEGACY_ADMIN_OWNER_SETTING_KEY, normalized, now]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getAdminWalletAddress();
}

export async function isAdminWalletAddress(
  candidateAddress: string | null | undefined
): Promise<boolean> {
  const normalized = normalizeWalletAddress(candidateAddress);
  if (!normalized) return false;
  const adminAddresses = await getAdminWalletAddresses();
  return adminAddresses.includes(normalized);
}

export async function addAdminWalletAddress(
  candidateAddress: string | null | undefined
): Promise<string[]> {
  const normalized = normalizeWalletAddress(candidateAddress);
  if (!normalized) {
    throw new Error('Invalid admin wallet address');
  }
  return mutateAdminWalletAddresses((current) => {
    if (current.includes(normalized)) return current;
    return [...current, normalized];
  });
}

export async function removeAdminWalletAddress(
  candidateAddress: string | null | undefined
): Promise<string[]> {
  const normalized = normalizeWalletAddress(candidateAddress);
  if (!normalized) {
    throw new Error('Invalid admin wallet address');
  }
  return mutateAdminWalletAddresses((current) => {
    if (!current.includes(normalized)) return current;
    const remaining = current.filter((address) => address !== normalized);
    return remaining.length > 0 ? remaining : current;
  });
}

export async function transferAdminWalletAddress(
  currentAddress: string | null | undefined,
  nextAddress: string | null | undefined
): Promise<string | null> {
  const normalizedCurrentAddress = normalizeWalletAddress(currentAddress);
  const normalizedNextAddress = normalizeWalletAddress(nextAddress);
  if (!normalizedCurrentAddress || !normalizedNextAddress) {
    throw new Error('Invalid admin wallet address');
  }
  const next = await mutateAdminWalletAddresses((current) => {
    if (!current.includes(normalizedCurrentAddress)) return current;
    const replaced = current.map((address) =>
      address === normalizedCurrentAddress ? normalizedNextAddress : address
    );
    return normalizeAddressList(replaced);
  });
  if (!next.includes(normalizedNextAddress)) {
    return getAdminWalletAddress();
  }
  return normalizedNextAddress;
}
