'use client';

import { ShieldCheck, Wallet } from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';
import { AdminTransferPanel } from '@/components/admin/admin-transfer-panel';

interface AdminAdminsContentProps {
  authToken?: string;
  adminWalletAddress: string | null;
  adminWalletAddresses: string[];
  hasAdminWalletSession: boolean;
}

export function AdminAdminsContent({
  authToken,
  adminWalletAddress,
  adminWalletAddresses,
  hasAdminWalletSession,
}: AdminAdminsContentProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_14px_30px_-26px_rgba(0,0,0,0.5)]">
        <h2 className="text-sm font-semibold text-foreground">{t('admin.admins.contextTitle')}</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-muted p-3 text-xs text-foreground">
            <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
              {t('admin.admins.primaryAdmin')}
            </p>
            <p className="mt-1 font-mono">{adminWalletAddress ?? '-'}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted p-3 text-xs text-foreground">
            <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
              <Wallet className="size-3.5 text-primary" aria-hidden="true" />
              {t('admin.admins.walletSession')}
            </p>
            <p className="mt-1">
              {hasAdminWalletSession ? t('admin.admins.sessionReady') : t('admin.admins.sessionNotReady')}
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {adminWalletAddresses.map((address) => (
            <code
              key={address}
              className="block rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs text-foreground"
            >
              {address}
            </code>
          ))}
        </div>
      </section>

      <AdminTransferPanel
        initialAdminWalletAddresses={adminWalletAddresses}
        authToken={authToken}
      />
    </div>
  );
}
