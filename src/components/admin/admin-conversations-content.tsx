'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/context';
import { AdminPagination } from './admin-pagination';

interface AdminConversationListItem {
  id: string;
  title: string;
  ownerType: 'wallet' | 'guest';
  ownerId: string;
  walletAddress: string | null;
  scope: 'wallet' | 'guest';
  isStarred: boolean;
  isShared: boolean;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessagePreview: string;
}

interface AdminConversationsContentProps {
  items: AdminConversationListItem[];
  total: number;
  query: string;
  page: number;
  pageSize: number;
  token?: string;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function withToken(path: string, token?: string): string {
  const normalized = token?.trim();
  if (!normalized) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}token=${encodeURIComponent(normalized)}`;
}

function compact(value: string | null | undefined): string {
  if (!value) return '-';
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatTime(ts: number): string {
  if (!ts) return '-';
  return dateFormatter.format(new Date(ts));
}

function buildDetailHref(id: string, token?: string, query?: string): string {
  const base = `/admin/conversations/${encodeURIComponent(id)}`;
  const params = new URLSearchParams();
  if (token?.trim()) params.set('token', token.trim());
  if (query?.trim()) params.set('q', query.trim());
  const raw = params.toString();
  return raw ? `${base}?${raw}` : base;
}

export function AdminConversationsContent({
  items,
  total,
  query,
  page,
  pageSize,
  token,
}: AdminConversationsContentProps) {
  const { t } = useI18n();

  const buildPageHref = (targetPage: number, targetSize: number): string => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (targetPage > 1) params.set('page', String(targetPage));
    if (targetSize !== 10) params.set('size', String(targetSize));
    if (token?.trim()) params.set('token', token.trim());
    const raw = params.toString();
    return raw ? `/admin/conversations?${raw}` : '/admin/conversations';
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_14px_30px_-26px_rgba(0,0,0,0.5)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t('admin.conversations.total')}:&nbsp;
          <span className="font-medium text-foreground">{total}</span>
        </p>
        <form
          method="GET"
          action={withToken('/admin/conversations', token)}
          className="flex items-center gap-2"
        >
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={t('admin.conversations.searchPlaceholder')}
            className="h-8 w-56 rounded-md border border-border bg-card px-2.5 text-xs text-foreground outline-none focus:border-ring"
          />
          <button
            type="submit"
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-white"
          >
            {t('admin.conversations.search')}
          </button>
        </form>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="pb-2">{t('admin.conversations.tableId')}</th>
              <th className="pb-2">{t('admin.conversations.tableTitle')}</th>
              <th className="pb-2">{t('admin.conversations.tableOwner')}</th>
              <th className="pb-2 pr-6 text-right">{t('admin.conversations.tableMessages')}</th>
              <th className="pb-2 pl-2">{t('admin.conversations.tableUpdated')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border/50">
                <td className="py-2 font-mono text-foreground">{compact(item.id)}</td>
                <td className="py-2">
                  <Link
                    href={buildDetailHref(item.id, token, query)}
                    className="inline-flex max-w-[22rem] items-center gap-1 truncate text-primary hover:underline"
                    title={item.title || '-'}
                  >
                    <span className="truncate">{item.title || '-'}</span>
                    {item.isShared ? (
                      <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1 py-0 text-xs text-emerald-400">
                        {t('admin.conversations.shared')}
                      </span>
                    ) : null}
                    {item.isStarred ? (
                      <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0 text-xs text-amber-400">
                        {t('admin.conversations.starred')}
                      </span>
                    ) : null}
                  </Link>
                  {item.lastMessagePreview ? (
                    <p className="mt-0.5 max-w-[22rem] truncate text-xs text-muted-foreground">
                      {item.lastMessagePreview}
                    </p>
                  ) : null}
                </td>
                <td className="py-2 text-foreground">
                  {item.ownerType}:{compact(item.ownerId)}
                </td>
                <td className="py-2 pr-6 text-right text-foreground">{item.messageCount}</td>
                <td className="py-2 pl-2 whitespace-nowrap text-muted-foreground">{formatTime(item.updatedAt)}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-muted-foreground">
                  {t('admin.conversations.empty')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={page}
        pageSize={pageSize}
        total={total}
        buildHref={buildPageHref}
      />
    </section>
  );
}
