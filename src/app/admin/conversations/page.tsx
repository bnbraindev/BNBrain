import { listAdminConversations } from '@/lib/server/admin-store';
import { resolveAdminPageContext } from '@/lib/server/admin-page-context';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminUnauthorizedView } from '@/components/admin/admin-unauthorized-view';
import { AdminConversationsContent } from '@/components/admin/admin-conversations-content';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 10;
const ALLOWED_PAGE_SIZES = [10, 20, 50];

function parsePageSize(raw: string | string[] | undefined): number {
  const parsed = parseInt(typeof raw === 'string' ? raw : '', 10);
  return ALLOWED_PAGE_SIZES.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
}

export default async function AdminConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.trim() : '';
  const pageSize = parsePageSize(params.size);
  const page = Math.max(1, parseInt(typeof params.page === 'string' ? params.page : '1', 10) || 1);
  const context = await resolveAdminPageContext(Promise.resolve(params));
  if (!context.authorized) {
    return (
      <AdminUnauthorizedView
        tokenConfigured={context.tokenConfigured}
        token={context.token}
        adminWalletAddresses={context.adminWalletAddresses}
      />
    );
  }

  const result = await listAdminConversations({
    query,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return (
    <AdminShell
      token={context.token}
      adminCount={context.adminWalletAddresses.length}
      tokenConfigured={context.tokenConfigured}
      walletSessionAddress={context.walletSessionAddress}
      pageTitleKey="admin.nav.conversations"
      pageDescriptionKey="admin.page.conversationsDescription"
    >
      <AdminConversationsContent
        items={result.items}
        total={result.total}
        query={query}
        page={page}
        pageSize={pageSize}
        token={context.token || undefined}
      />
    </AdminShell>
  );
}
