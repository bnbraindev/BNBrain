/**
 * Admin password credentials — scrypt-based password CRUD for admin login.
 *
 * Stores credentials in `admin_credentials` table (schema v11).
 * Passwords are hashed with Node.js built-in scrypt (N=16384, r=8, p=1).
 */

import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { ensureDatabaseSchema, getDbPool } from '@/lib/server/db';

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SALT_BYTES = 16;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      }
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(password, salt);
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const derived = await scryptAsync(password, salt);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export async function createAdminCredential(
  username: string,
  password: string
): Promise<void> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed || trimmed.length < 2) {
    throw new Error('Username must be at least 2 characters');
  }
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const passwordHash = await hashPassword(password);
  const now = Date.now();
  await pool.query(
    `INSERT INTO admin_credentials (username, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, updated_at = EXCLUDED.updated_at`,
    [trimmed, passwordHash, now]
  );
}

export async function verifyAdminCredential(
  username: string,
  password: string
): Promise<boolean> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return false;
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    `SELECT password_hash FROM admin_credentials WHERE username = $1 LIMIT 1`,
    [trimmed]
  );
  if (rows.length === 0) return false;
  return verifyPassword(password, String(rows[0].password_hash));
}

export async function hasAnyAdminCredentials(): Promise<boolean> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM admin_credentials LIMIT 1`
  );
  return rows.length > 0;
}

export async function listAdminCredentialUsernames(): Promise<string[]> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    `SELECT username FROM admin_credentials ORDER BY created_at ASC`
  );
  return rows.map((row) => String(row.username));
}

export async function deleteAdminCredential(username: string): Promise<boolean> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return false;
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rowCount } = await pool.query(
    `DELETE FROM admin_credentials WHERE username = $1`,
    [trimmed]
  );
  return (rowCount ?? 0) > 0;
}

export async function changeAdminCredentialPassword(
  username: string,
  newPassword: string
): Promise<boolean> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return false;
  if (newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const passwordHash = await hashPassword(newPassword);
  const now = Date.now();
  const { rowCount } = await pool.query(
    `UPDATE admin_credentials SET password_hash = $2, updated_at = $3 WHERE username = $1`,
    [trimmed, passwordHash, now]
  );
  return (rowCount ?? 0) > 0;
}
