'use client';

import { useState } from 'react';
import { Database, Layers3, MessageSquareMore, Users } from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';
import { AdminPagination } from './admin-pagination';

interface AdminOverviewContentProps {
  data: {
    counts: {
      conversations: number;
      messages: number;
      txStates: number;
    };
    ownerBreakdown: Array<{
      ownerType: 'wallet' | 'guest';
      ownerId: string;
      conversationCount: number;
    }>;
    latestConversations: Array<{
      id: string;
      title: string;
      ownerType: 'wallet' | 'guest';
      ownerId: string;
      walletAddress: string | null;
      updatedAt: number;
      messageCount: number;
    }>;
    latestTxStates: Array<{
      conversationId: string;
      txKey: string;
      status: string;
      hash: string | null;
      chainId: number | null;
      updatedAt: number;
    }>;
  };
}

const numberFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatCount(value: number): string {
  return numberFormatter.format(Math.max(0, Number.isFinite(value) ? value : 0));
}

function formatTime(value: number): string {
  if (!value) return '-';
  return dateFormatter.format(new Date(value));
}

function compact(value: string | null | undefined): string {
  if (!value) return '-';
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function AdminOverviewContent({ data }: AdminOverviewContentProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'conversations' | 'tx'>('conversations');
  const [convPage, setConvPage] = useState(1);
  const [convPageSize, setConvPageSize] = useState(10);
  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(10);

  const convSlice = data.latestConversations.slice(
    (convPage - 1) * convPageSize,
    convPage * convPageSize
  );
  const txSlice = data.latestTxStates.slice(
    (txPage - 1) * txPageSize,
    txPage * txPageSize
  );

  return (
    <div className="space-y-3">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_14px_30px_-26px_rgba(0,0,0,0.5)]">
          <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            <MessageSquareMore className="size-3.5 text-primary" aria-hidden="true" />
            {t('admin.overview.conversations')}
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {formatCount(data.counts.conversations)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_14px_30px_-26px_rgba(0,0,0,0.5)]">
          <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            <Layers3 className="size-3.5 text-primary" aria-hidden="true" />
            {t('admin.overview.messages')}
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {formatCount(data.counts.messages)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_14px_30px_-26px_rgba(0,0,0,0.5)]">
          <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            <Database className="size-3.5 text-primary" aria-hidden="true" />
            {t('admin.overview.txStates')}
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {formatCount(data.counts.txStates)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_14px_30px_-26px_rgba(0,0,0,0.5)]">
          <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            <Users className="size-3.5 text-primary" aria-hidden="true" />
            {t('admin.overview.activeOwners')}
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {formatCount(data.ownerBreakdown.length)}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_14px_30px_-26px_rgba(0,0,0,0.5)]">
        <div className="mb-3 inline-flex rounded-lg border border-border bg-muted p-1">
          <button
            type="button"
            onClick={() => setActiveTab('conversations')}
            className={`h-8 rounded-md px-3 text-xs ${
              activeTab === 'conversations'
                ? 'bg-card text-primary shadow-sm'
                : 'text-muted-foreground hover:text-accent-foreground'
            }`}
          >
            {t('admin.overview.latestConversations')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tx')}
            className={`h-8 rounded-md px-3 text-xs ${
              activeTab === 'tx'
                ? 'bg-card text-primary shadow-sm'
                : 'text-muted-foreground hover:text-accent-foreground'
            }`}
          >
            {t('admin.overview.latestTxStates')}
          </button>
        </div>

        {activeTab === 'conversations' ? (
          <>
          <h2 className="text-sm font-semibold text-foreground">{t('admin.overview.latestConversations')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('admin.overview.latestConversationsHint')}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-2">{t('admin.overview.tableConversation')}</th>
                  <th className="pb-2">{t('admin.overview.tableTitle')}</th>
                  <th className="pb-2 pr-6 text-right">{t('admin.overview.tableMessages')}</th>
                  <th className="pb-2 pl-2">{t('admin.overview.tableUpdated')}</th>
                </tr>
              </thead>
              <tbody>
                {convSlice.map((item) => (
                  <tr key={item.id} className="border-t border-border/50">
                    <td className="py-2 font-mono text-foreground">{compact(item.id)}</td>
                    <td className="py-2 text-foreground">
                      <span className="block max-w-[24rem] truncate" title={item.title || '-'}>
                        {item.title || '-'}
                      </span>
                    </td>
                    <td className="py-2 pr-6 text-right text-foreground">{formatCount(item.messageCount)}</td>
                    <td className="py-2 pl-2 whitespace-nowrap text-muted-foreground">{formatTime(item.updatedAt)}</td>
                  </tr>
                ))}
                {convSlice.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-3 text-muted-foreground">
                      {t('admin.overview.emptyConversations')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={convPage}
            pageSize={convPageSize}
            total={data.latestConversations.length}
            onChange={(p, s) => {
              setConvPage(p);
              setConvPageSize(s);
            }}
          />
          </>
        ) : (
          <>
          <h2 className="text-sm font-semibold text-foreground">{t('admin.overview.latestTxStates')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('admin.overview.latestTxStatesHint')}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-2">{t('admin.overview.tableConversation')}</th>
                  <th className="pb-2">{t('admin.overview.tableTxKey')}</th>
                  <th className="pb-2">{t('admin.overview.tableStatus')}</th>
                  <th className="pb-2 pl-2">{t('admin.overview.tableUpdated')}</th>
                </tr>
              </thead>
              <tbody>
                {txSlice.map((item) => (
                  <tr key={`${item.conversationId}-${item.txKey}`} className="border-t border-border/50">
                    <td className="py-2 font-mono text-foreground">{compact(item.conversationId)}</td>
                    <td className="py-2 font-mono text-foreground">{compact(item.txKey)}</td>
                    <td className="py-2 text-foreground">{item.status}</td>
                    <td className="py-2 pl-2 whitespace-nowrap text-muted-foreground">{formatTime(item.updatedAt)}</td>
                  </tr>
                ))}
                {txSlice.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-3 text-muted-foreground">
                      {t('admin.overview.emptyTxStates')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={txPage}
            pageSize={txPageSize}
            total={data.latestTxStates.length}
            onChange={(p, s) => {
              setTxPage(p);
              setTxPageSize(s);
            }}
          />
          </>
        )}
      </section>
    </div>
  );
}
