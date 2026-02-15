'use client';

import { ShieldCheck } from 'lucide-react';
import { AdminAuthGate } from '@/components/admin/admin-auth-gate';
import { useI18n } from '@/lib/i18n/context';

interface AdminUnauthorizedViewProps {
  tokenConfigured: boolean;
  token?: string;
  adminWalletAddresses: string[];
}

export function AdminUnauthorizedView({
  tokenConfigured,
  token,
  adminWalletAddresses,
}: AdminUnauthorizedViewProps) {
  const { t } = useI18n();
  const hasToken = Boolean(token?.trim());

  return (
    <main
      id="main-content"
      className="h-[100dvh] overflow-y-auto bg-background text-foreground"
    >
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-10 sm:px-6">
        <section className="w-full rounded-3xl border border-border bg-card/90 p-6 shadow-[0_24px_48px_-32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs uppercase tracking-wide text-muted-foreground">
                <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
                {t('admin.brand')}
              </p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                {t('admin.access.title')}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {t('admin.access.subtitle')}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              <p>
                {t('admin.meta.tokenConfigured')}:&nbsp;
                <span className="text-foreground">
                  {tokenConfigured ? t('admin.common.enabled') : t('admin.common.disabled')}
                </span>
              </p>
              <p className="mt-1">
                {t('admin.meta.authMode')}:&nbsp;
                <span className="text-foreground">
                  {hasToken ? t('admin.meta.authModeToken') : t('admin.meta.authModeWallet')}
                </span>
              </p>
            </div>
          </div>

          <div className="mt-6">
            <AdminAuthGate adminWalletAddresses={adminWalletAddresses} />
          </div>

          {tokenConfigured ? (
            <p className="mt-4 text-xs text-muted-foreground">
              {t('admin.access.tokenHint')}
              &nbsp;
              <code className="rounded bg-muted px-1 py-0.5">/admin/overview?token=...</code>
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
