import { getAdminChatRunRuntimeMetrics } from '@/lib/server/admin-store';
import { resolveAdminPageContext } from '@/lib/server/admin-page-context';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminRuntimeContent } from '@/components/admin/admin-runtime-content';
import { AdminUnauthorizedView } from '@/components/admin/admin-unauthorized-view';

export const dynamic = 'force-dynamic';

export default async function AdminRuntimePage({
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

  const metrics = await getAdminChatRunRuntimeMetrics();

  return (
    <AdminShell
      token={context.token}
      adminCount={context.adminWalletAddresses.length}
      tokenConfigured={context.tokenConfigured}
      walletSessionAddress={context.walletSessionAddress}
      pageTitleKey="admin.nav.runtime"
      pageDescriptionKey="admin.page.runtimeDescription"
    >
      <AdminRuntimeContent metrics={metrics} />
    </AdminShell>
  );
}
