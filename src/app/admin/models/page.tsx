import { resolveAdminPageContext } from '@/lib/server/admin-page-context';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminModelPanel } from '@/components/admin/admin-model-panel';
import { AdminUnauthorizedView } from '@/components/admin/admin-unauthorized-view';

export const dynamic = 'force-dynamic';

export default async function AdminModelsPage({
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
      pageTitleKey="admin.nav.models"
      pageDescriptionKey="admin.page.modelsDescription"
    >
      <AdminModelPanel authToken={context.token || undefined} />
    </AdminShell>
  );
}
