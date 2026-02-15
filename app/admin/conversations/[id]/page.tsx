import { notFound } from 'next/navigation';
import { getAdminConversationDetail } from '@/lib/server/admin-store';
import { resolveAdminPageContext } from '@/lib/server/admin-page-context';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminUnauthorizedView } from '@/components/admin/admin-unauthorized-view';
import { AdminConversationDetail } from '@/components/admin/admin-conversation-detail';

export const dynamic = 'force-dynamic';

export default async function AdminConversationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const query = typeof resolvedSearchParams.q === 'string' ? resolvedSearchParams.q.trim() : '';
  const context = await resolveAdminPageContext(Promise.resolve(resolvedSearchParams));
  if (!context.authorized) {
    return (
      <AdminUnauthorizedView
        tokenConfigured={context.tokenConfigured}
        token={context.token}
        adminWalletAddresses={context.adminWalletAddresses}
      />
    );
  }

  const detail = await getAdminConversationDetail(id);
  if (!detail) {
    notFound();
  }

  return (
    <AdminShell
      token={context.token}
      adminCount={context.adminWalletAddresses.length}
      tokenConfigured={context.tokenConfigured}
      walletSessionAddress={context.walletSessionAddress}
      pageTitleKey="admin.nav.conversations"
      pageDescriptionKey="admin.page.conversationDetailDescription"
    >
      <AdminConversationDetail
        conversation={detail}
        token={context.token || undefined}
        query={query}
      />
    </AdminShell>
  );
}
