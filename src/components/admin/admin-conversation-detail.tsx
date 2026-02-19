'use client';

import Link from 'next/link';
import { ArrowLeft, Clock3 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';
import { Markdown } from '@/components/chat/markdown';

interface AdminConversationMessage {
  id: string;
  position: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: number;
}

interface AdminConversationDetailData {
  id: string;
  title: string;
  ownerType: 'wallet' | 'guest';
  ownerId: string;
  walletAddress: string | null;
  scope: 'wallet' | 'guest';
  isStarred: boolean;
  isShared: boolean;
  shareToken: string | null;
  shareExpiresAt: number | null;
  createdAt: number;
  updatedAt: number;
  messages: AdminConversationMessage[];
}

interface AdminConversationDetailProps {
  conversation: AdminConversationDetailData;
  token?: string;
  query?: string;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function buildBackHref(token?: string, query?: string): string {
  const params = new URLSearchParams();
  if (token?.trim()) params.set('token', token.trim());
  if (query?.trim()) params.set('q', query.trim());
  const raw = params.toString();
  return raw ? `/admin/conversations?${raw}` : '/admin/conversations';
}

function formatTime(ts?: number | null): string {
  if (!ts) return '-';
  return dateFormatter.format(new Date(ts));
}

export function AdminConversationDetail({
  conversation,
  token,
  query,
}: AdminConversationDetailProps) {
  const { t } = useI18n();
  const backHref = buildBackHref(token, query);

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_14px_30px_-26px_rgba(0,0,0,0.5)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href={backHref}
            className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs text-foreground hover:bg-accent"
          >
            <ArrowLeft className="mr-1 size-3.5" aria-hidden={true} />
            {t('admin.conversations.backToList')}
          </Link>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" aria-hidden={true} />
            {t('admin.conversations.updatedAt')}: {formatTime(conversation.updatedAt)}
          </span>
        </div>

        <div className="mt-3 rounded-xl border border-border bg-muted p-3">
          <p className="text-sm font-semibold text-foreground">{conversation.title || '-'}</p>
          <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <p>
              {t('admin.conversations.tableId')}: <code>{conversation.id}</code>
            </p>
            <p>
              {t('admin.conversations.tableOwner')}: {conversation.ownerType}:{conversation.ownerId}
            </p>
            <p>
              {t('admin.conversations.tableMessages')}: {conversation.messages.length}
            </p>
            <p>
              {t('admin.conversations.createdAt')}: {formatTime(conversation.createdAt)}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_14px_30px_-26px_rgba(0,0,0,0.5)]">
        <h2 className="text-sm font-semibold text-foreground">{t('admin.conversations.messageTimeline')}</h2>
        <div className="mt-3 space-y-2">
          {conversation.messages.map((message) => (
            <article
              key={message.id}
              className={`rounded-xl border px-3 py-2 ${
                message.role === 'user'
                  ? 'border-primary/30 bg-primary/10'
                  : message.role === 'assistant'
                    ? 'border-border bg-muted'
                    : 'border-amber-500/30 bg-amber-500/10'
              }`}
            >
              <header className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {message.role} · #{message.position}
                </span>
                <span>{formatTime(message.createdAt)}</span>
              </header>
              <div className="prose prose-sm max-w-none text-foreground">
                <Markdown content={message.content || ''} />
              </div>
            </article>
          ))}
          {conversation.messages.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('admin.conversations.emptyMessages')}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
