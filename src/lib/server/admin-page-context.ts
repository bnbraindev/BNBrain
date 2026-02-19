import { cookies } from 'next/headers';
import { AUTH_SESSION_COOKIE_NAME, getWalletAuthSessionFromToken } from '@/lib/server/siwe-auth';
import { getAdminAuthContext, isPasswordSession } from '@/lib/server/admin-auth';

export interface AdminPageContext {
  token: string;
  tokenConfigured: boolean;
  authorized: boolean;
  adminWalletAddress: string | null;
  adminWalletAddresses: string[];
  walletSessionAddress: string | null;
  walletSessionPurpose: string | null;
  hasAdminWalletSession: boolean;
}

function readTokenFromSearchParams(
  params: Record<string, string | string[] | undefined>
): string {
  return typeof params.token === 'string' ? params.token.trim() : '';
}

export async function resolveAdminPageContext(
  searchParams: Promise<Record<string, string | string[] | undefined>>
): Promise<AdminPageContext> {
  const params = await searchParams;
  const token = readTokenFromSearchParams(params);
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value;
  const walletSession = await getWalletAuthSessionFromToken(sessionToken);
  const authContext = await getAdminAuthContext(token, walletSession?.address ?? null, walletSession?.purpose ?? null);
  const hasAdminWalletSession = Boolean(
    walletSession &&
      (isPasswordSession(walletSession.address) ||
        authContext.adminWalletAddresses.includes(walletSession.address))
  );
  return {
    token,
    tokenConfigured: authContext.tokenConfigured,
    authorized: authContext.authorized,
    adminWalletAddress: authContext.adminWalletAddress,
    adminWalletAddresses: authContext.adminWalletAddresses,
    walletSessionAddress: walletSession?.address ?? null,
    walletSessionPurpose: walletSession?.purpose ?? null,
    hasAdminWalletSession,
  };
}
