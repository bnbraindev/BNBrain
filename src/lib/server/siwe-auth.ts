import { createHash, randomBytes } from 'crypto';
import { verifyMessage } from 'viem';
import { ensureDatabaseSchema, getDbPool } from '@/lib/server/db';
import { normalizeWalletAddress } from '@/lib/server/admin-owner';

export type WalletAuthPurpose = 'user' | 'admin';

export interface WalletAuthSession {
  address: string;
  purpose: WalletAuthPurpose;
  expiresAt: number;
  renewAt: number;
}

export interface WalletAuthSessionWithToken extends WalletAuthSession {
  token: string;
}

export interface WalletAuthChallengeResult {
  nonce: string;
  address: string;
  purpose: WalletAuthPurpose;
  chainId: number;
  issuedAt: number;
  expiresAt: number;
  message: string;
}

interface WalletAuthChallenge {
  nonce: string;
  address: string;
  purpose: WalletAuthPurpose;
  domain: string;
  uri: string;
  chainId: number;
  issuedAt: number;
  expiresAt: number;
}

export const AUTH_SESSION_COOKIE_NAME = 'bnb_auth';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_RENEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function getSessionRenewAt(expiresAt: number): number {
  return expiresAt - Math.floor(SESSION_TTL_MS / 2);
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createNonce(): string {
  return randomBytes(16).toString('hex');
}

function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

function parseCookieValue(cookieHeader: string | null, cookieName: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    if (key !== cookieName) continue;
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function isValidPurpose(value: string | null | undefined): value is WalletAuthPurpose {
  return value === 'user' || value === 'admin';
}

export function createSiweMessage(challenge: WalletAuthChallenge): string {
  const statement =
    challenge.purpose === 'admin'
      ? 'Sign in to BNBrain admin dashboard.'
      : 'Sign in to BNBrain.';
  return `${challenge.domain} wants you to sign in with your Ethereum account:
${challenge.address}

${statement}

URI: ${challenge.uri}
Version: 1
Chain ID: ${challenge.chainId}
Nonce: ${challenge.nonce}
Issued At: ${new Date(challenge.issuedAt).toISOString()}
Expiration Time: ${new Date(challenge.expiresAt).toISOString()}`;
}

export async function createWalletAuthChallenge(params: {
  address: string;
  purpose: WalletAuthPurpose;
  domain: string;
  uri: string;
  chainId: number;
}): Promise<WalletAuthChallengeResult> {
  const address = normalizeWalletAddress(params.address);
  if (!address) {
    throw new Error('Invalid wallet address');
  }
  const purpose = params.purpose;
  if (!isValidPurpose(purpose)) {
    throw new Error('Invalid auth purpose');
  }
  const now = Date.now();
  const challenge: WalletAuthChallenge = {
    nonce: createNonce(),
    address,
    purpose,
    domain: params.domain,
    uri: params.uri,
    chainId: Number.isFinite(params.chainId) && params.chainId > 0 ? params.chainId : 56,
    issuedAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
  };
  await ensureDatabaseSchema();
  const pool = getDbPool();
  await pool.query(
    `
      INSERT INTO auth_challenges (
        nonce, address, purpose, domain, uri, chain_id, issued_at, expires_at, used_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL)
    `,
    [
      challenge.nonce,
      challenge.address,
      challenge.purpose,
      challenge.domain,
      challenge.uri,
      challenge.chainId,
      challenge.issuedAt,
      challenge.expiresAt,
    ]
  );
  return {
    nonce: challenge.nonce,
    address: challenge.address,
    purpose: challenge.purpose,
    chainId: challenge.chainId,
    issuedAt: challenge.issuedAt,
    expiresAt: challenge.expiresAt,
    message: createSiweMessage(challenge),
  };
}

/**
 * Atomically claim and return a challenge for verification.
 * Uses UPDATE ... WHERE used_at IS NULL RETURNING * to prevent
 * concurrent nonce reuse (race condition).
 */
async function claimChallengeForVerification(
  nonce: string
): Promise<WalletAuthChallenge | null> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    `
      UPDATE auth_challenges
      SET used_at = $2
      WHERE nonce = $1
        AND used_at IS NULL
      RETURNING nonce, address, purpose, domain, uri, chain_id, issued_at, expires_at
    `,
    [nonce, Date.now()]
  );
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  const purpose = String(row.purpose);
  if (!isValidPurpose(purpose)) return null;
  const challenge: WalletAuthChallenge = {
    nonce: String(row.nonce),
    address: String(row.address).toLowerCase(),
    purpose,
    domain: String(row.domain),
    uri: String(row.uri),
    chainId: Number(row.chain_id),
    issuedAt: Number(row.issued_at),
    expiresAt: Number(row.expires_at),
  };
  if (challenge.expiresAt <= Date.now()) return null;
  return challenge;
}

export async function verifyWalletAuthChallenge(params: {
  address: string;
  nonce: string;
  signature: string;
  purpose: WalletAuthPurpose;
  singleDevice?: boolean;
  expectedDomain?: string;
  expectedUri?: string;
  expectedChainId?: number;
}): Promise<WalletAuthSessionWithToken | null> {
  const normalizedAddress = normalizeWalletAddress(params.address);
  if (!normalizedAddress) return null;
  if (!isValidPurpose(params.purpose)) return null;
  // Atomically claim the challenge (prevents concurrent nonce reuse)
  const challenge = await claimChallengeForVerification(params.nonce);
  if (!challenge) return null;
  if (challenge.address !== normalizedAddress) return null;
  if (challenge.purpose !== params.purpose) return null;
  if (params.expectedDomain && challenge.domain !== params.expectedDomain) return null;
  if (params.expectedUri && challenge.uri !== params.expectedUri) return null;
  if (
    Number.isFinite(params.expectedChainId) &&
    Number(params.expectedChainId) > 0 &&
    challenge.chainId !== Number(params.expectedChainId)
  ) {
    return null;
  }
  const valid = await verifyMessage({
    address: normalizedAddress as `0x${string}`,
    message: createSiweMessage(challenge),
    signature: params.signature as `0x${string}`,
  });
  if (!valid) return null;
  if (params.singleDevice) {
    await revokeWalletAuthSessionsByAddress(normalizedAddress, challenge.purpose);
  }
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const pool = getDbPool();
  await pool.query(
    `
      INSERT INTO auth_sessions (token_hash, address, purpose, created_at, expires_at, revoked_at)
      VALUES ($1,$2,$3,$4,$5,NULL)
    `,
    [tokenHash, normalizedAddress, challenge.purpose, now, expiresAt]
  );
  const session: WalletAuthSessionWithToken = {
    address: normalizedAddress,
    purpose: challenge.purpose,
    expiresAt,
    renewAt: getSessionRenewAt(expiresAt),
    token,
  };
  return session;
}

export async function getWalletAuthSessionFromToken(
  token: string | null | undefined
): Promise<WalletAuthSession | null> {
  if (!token) return null;
  await ensureDatabaseSchema();
  const tokenHash = hashSessionToken(token);
  const pool = getDbPool();
  const { rows } = await pool.query(
    `
      SELECT address, purpose, expires_at, revoked_at
      FROM auth_sessions
      WHERE token_hash = $1
      LIMIT 1
    `,
    [tokenHash]
  );
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  if (row.revoked_at) return null;
  const purpose = String(row.purpose);
  if (!isValidPurpose(purpose)) return null;
  const expiresAt = Number(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return {
    address: String(row.address).toLowerCase(),
    purpose,
    expiresAt,
    renewAt: getSessionRenewAt(expiresAt),
  };
}

export function shouldRenewWalletAuthSession(expiresAt: number): boolean {
  return expiresAt - Date.now() <= SESSION_RENEW_WINDOW_MS;
}

export async function renewWalletAuthSessionToken(
  token: string | null | undefined
): Promise<WalletAuthSessionWithToken | null> {
  if (!token) return null;
  await ensureDatabaseSchema();
  const tokenHash = hashSessionToken(token);
  const pool = getDbPool();
  const now = Date.now();
  const nextExpiresAt = now + SESSION_TTL_MS;
  const nextToken = createSessionToken();
  const nextTokenHash = hashSessionToken(nextToken);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `
        UPDATE auth_sessions
        SET revoked_at = $2
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND expires_at > $2
        RETURNING address, purpose
      `,
      [tokenHash, now]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const row = rows[0] as Record<string, unknown>;
    const purpose = String(row.purpose);
    if (!isValidPurpose(purpose)) {
      await client.query('ROLLBACK');
      return null;
    }
    const address = String(row.address).toLowerCase();
    await client.query(
      `
        INSERT INTO auth_sessions (token_hash, address, purpose, created_at, expires_at, revoked_at)
        VALUES ($1,$2,$3,$4,$5,NULL)
      `,
      [nextTokenHash, address, purpose, now, nextExpiresAt]
    );
    await client.query('COMMIT');
    return {
      address,
      purpose,
      expiresAt: nextExpiresAt,
      renewAt: getSessionRenewAt(nextExpiresAt),
      token: nextToken,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function readAuthSessionTokenFromRequest(req: Request): string | null {
  return parseCookieValue(req.headers.get('cookie'), AUTH_SESSION_COOKIE_NAME);
}

export async function getWalletAuthSessionFromRequest(
  req: Request
): Promise<WalletAuthSession | null> {
  const token = readAuthSessionTokenFromRequest(req);
  return getWalletAuthSessionFromToken(token);
}

export async function revokeWalletAuthSessionToken(
  token: string | null | undefined
): Promise<void> {
  if (!token) return;
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const tokenHash = hashSessionToken(token);
  await pool.query(
    `
      UPDATE auth_sessions
      SET revoked_at = $2
      WHERE token_hash = $1 AND revoked_at IS NULL
    `,
    [tokenHash, Date.now()]
  );
}

export async function revokeWalletAuthSessionsByAddress(
  address: string | null | undefined,
  purpose?: WalletAuthPurpose
): Promise<void> {
  const normalizedAddress = normalizeWalletAddress(address);
  if (!normalizedAddress) return;
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const now = Date.now();
  if (purpose && isValidPurpose(purpose)) {
    await pool.query(
      `
        UPDATE auth_sessions
        SET revoked_at = $3
        WHERE address = $1
          AND purpose = $2
          AND revoked_at IS NULL
      `,
      [normalizedAddress, purpose, now]
    );
    return;
  }
  await pool.query(
    `
      UPDATE auth_sessions
      SET revoked_at = $2
      WHERE address = $1
        AND revoked_at IS NULL
    `,
    [normalizedAddress, now]
  );
}

export function buildAuthSessionCookie(token: string, expiresAt: number): string {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge};${secure}`;
}

export function buildClearedAuthSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return `${AUTH_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;${secure}`;
}

/**
 * Create a session for password-authenticated admin.
 * Uses `password:<username>` as the address to distinguish from wallet sessions.
 */
export async function createPasswordSession(
  username: string
): Promise<WalletAuthSessionWithToken> {
  await ensureDatabaseSchema();
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const address = `password:${username.trim().toLowerCase()}`;
  const pool = getDbPool();
  await pool.query(
    `INSERT INTO auth_sessions (token_hash, address, purpose, created_at, expires_at, revoked_at)
     VALUES ($1,$2,$3,$4,$5,NULL)`,
    [tokenHash, address, 'admin', now, expiresAt]
  );
  return {
    address,
    purpose: 'admin',
    expiresAt,
    renewAt: getSessionRenewAt(expiresAt),
    token,
  };
}
