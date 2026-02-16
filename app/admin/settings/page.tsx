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
        adminToken={context.token}
        initialConfig={{
          goplus: setupConfig.services.goplus ?? null,
          bscscan: setupConfig.services.bscscan ?? null,
          serper: setupConfig.services.serper ?? null,
          steel: setupConfig.services.steel ?? null,
          siwe: setupConfig.services.siwe ?? null,
          rpc: setupConfig.services.rpc ?? null,
          envVars: {
            hasGoplusKey: Boolean(process.env.GOPLUS_APP_KEY?.trim()),
            hasBscscanKey: Boolean(
              process.env.BSCSCAN_API_KEY?.trim() ||
                process.env.ETHERSCAN_API_KEY?.trim()
            ),
            hasSerperKey: Boolean(process.env.SERPER_API_KEY?.trim()),
            hasSteelKey: Boolean(process.env.STEEL_API_KEY?.trim()),
            hasSiweDomain: Boolean(process.env.SIWE_DOMAIN?.trim()),
            hasSiweChainIds: Boolean(process.env.SIWE_ALLOWED_CHAIN_IDS?.trim()),
            hasRpcUrls: Boolean(
              process.env.RPC_URL_56?.trim() ||
                process.env.RPC_URL_97?.trim() ||
                process.env.RPC_URL_204?.trim()
            ),
          },
        }}
      />
    </AdminShell>
  );
}
