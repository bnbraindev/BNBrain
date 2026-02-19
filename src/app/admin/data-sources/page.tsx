import { resolveAdminPageContext } from '@/lib/server/admin-page-context';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminDataSourcesContent } from '@/components/admin/admin-datasources-content';
import { AdminUnauthorizedView } from '@/components/admin/admin-unauthorized-view';

export const dynamic = 'force-dynamic';

export default async function AdminDataSourcesPage({
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
      pageTitleKey="admin.nav.dataSources"
      pageDescriptionKey="admin.page.dataSourcesDescription"
    >
      <AdminDataSourcesContent adminToken={context.token} />
    </AdminShell>
  );
}
