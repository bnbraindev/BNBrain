import { resolveAdminPageContext } from '@/lib/server/admin-page-context';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminSettingsContent } from '@/components/admin/admin-settings-content';
import { AdminUnauthorizedView } from '@/components/admin/admin-unauthorized-view';
import { getSetupConfig } from '@/lib/server/setup-store';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage({
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

  const setupConfig = await getSetupConfig();

  return (
    <AdminShell
      token={context.token}
      adminCount={context.adminWalletAddresses.length}
      tokenConfigured={context.tokenConfigured}
      walletSessionAddress={context.walletSessionAddress}
      pageTitleKey="admin.nav.settings"
      pageDescriptionKey="admin.page.settingsDescription"
    >
      <AdminSettingsContent
        initialConfig={{
          goplus: setupConfig.services.goplus ?? null,
          bscscan: setupConfig.services.bscscan ?? null,
          envVars: {
            hasGoplusKey: Boolean(process.env.GOPLUS_APP_KEY?.trim()),
            hasBscscanKey: Boolean(
              process.env.BSCSCAN_API_KEY?.trim() ||
                process.env.ETHERSCAN_API_KEY?.trim()
            ),
          },
        }}
      />
    </AdminShell>
  );
}
