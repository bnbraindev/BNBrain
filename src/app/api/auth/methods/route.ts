import { hasAnyAdminCredentials } from '@/lib/server/admin-password';
import { getAdminWalletAddresses } from '@/lib/server/admin-owner';
import { getRequiredAdminToken } from '@/lib/server/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [hasCredentials, walletAddresses, token] = await Promise.all([
    hasAnyAdminCredentials(),
    getAdminWalletAddresses(),
    Promise.resolve(getRequiredAdminToken()),
  ]);

  return Response.json(
    {
      password: hasCredentials,
      wallet: walletAddresses.length > 0,
      token: Boolean(token),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
