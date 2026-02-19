import { resolveAdminPageContext } from '@/lib/server/admin-page-context';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminAdminsContent } from '@/components/admin/admin-admins-content';
import { AdminUnauthorizedView } from '@/components/admin/admin-unauthorized-view';

export const dynamic = 'force-dynamic';

export default async function AdminAdminsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await resolveAdminPageContext(searchParams);
  if (!context.authorized) {
    return (
      <AdminUnauthorizedView
        tokenConfigured={context.tokenConfigured}
        token={context.token}
        adminWalletAddresses={context.adminWalletAddresses}
      />
    );
  }

  return (
    <AdminShell
      token={context.token}
      adminCount={context.adminWalletAddresses.length}
      tokenConfigured={context.tokenConfigured}
      walletSessionAddress={context.walletSessionAddress}
      pageTitleKey="admin.nav.admins"
      pageDescriptionKey="admin.page.adminsDescription"
    >
      <AdminAdminsContent
        authToken={context.token || undefined}
        adminWalletAddress={context.adminWalletAddress}
        adminWalletAddresses={context.adminWalletAddresses}
        hasAdminWalletSession={context.hasAdminWalletSession}
      />
    </AdminShell>
  );
}
