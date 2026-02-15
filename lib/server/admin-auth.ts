import { timingSafeEqual } from 'crypto';
import {
  getAdminWalletAddress,
  getAdminWalletAddresses,
  isAdminWalletAddress,
  normalizeWalletAddress,
} from '@/lib/server/admin-owner';

export function getRequiredAdminToken(): string | null {
  const token = process.env.ADMIN_DASHBOARD_TOKEN?.trim();
  return token ? token : null;
}

export function isValidAdminToken(token: string | null | undefined): boolean {
  const required = getRequiredAdminToken();
  if (!required || !token) return false;
  if (token.length !== required.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(required));
}

export function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function readNormalizedAdminAddress(value: string | null | undefined): string | null {
  return normalizeWalletAddress(value);
}

export async function isAuthorizedAdmin(
  token: string | null | undefined,
  sessionAddress: string | null | undefined
): Promise<boolean> {
  if (isValidAdminToken(token)) return true;
  const normalizedAddress = readNormalizedAdminAddress(sessionAddress);
  if (!normalizedAddress) return false;
  return isAdminWalletAddress(normalizedAddress);
}

export async function getAdminAuthContext(
  token: string | null | undefined,
  sessionAddress: string | null | undefined
): Promise<{
  authorized: boolean;
  adminWalletAddress: string | null;
  adminWalletAddresses: string[];
  normalizedSessionAddress: string | null;
  tokenConfigured: boolean;
  usingTokenMode: boolean;
}> {
  const tokenConfigured = Boolean(getRequiredAdminToken());
  const normalizedSessionAddress = readNormalizedAdminAddress(sessionAddress);
  const [adminWalletAddress, adminWalletAddresses, authorized] = await Promise.all([
    getAdminWalletAddress(),
    getAdminWalletAddresses(),
    isAuthorizedAdmin(token, sessionAddress),
  ]);
  return {
    authorized,
    adminWalletAddress,
    adminWalletAddresses,
    normalizedSessionAddress,
    tokenConfigured,
    usingTokenMode: tokenConfigured,
  };
}
