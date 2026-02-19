'use client';

import { useState, useEffect } from 'react';
import { KeyRound, ShieldCheck, Wallet } from 'lucide-react';
import { AdminAuthGate } from '@/components/admin/admin-auth-gate';
import { AdminPasswordForm } from '@/components/admin/admin-password-form';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useI18n } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';

interface AuthMethods {
  password: boolean;
  wallet: boolean;
  token: boolean;
}

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

  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [activeTab, setActiveTab] = useState<'password' | 'wallet'>('password');

  useEffect(() => {
    fetch('/api/auth/methods')
      .then((r) => r.json())
      .then((data: AuthMethods) => {
        setMethods(data);
        // Default to password if available, otherwise wallet
        if (data.password) {
          setActiveTab('password');
        } else if (data.wallet) {
          setActiveTab('wallet');
        }
      })
      .catch(() => {});
  }, []);

  const showPasswordTab = methods?.password ?? false;
  const showWalletTab = (methods?.wallet ?? false) || adminWalletAddresses.length > 0;
  const showTabs = showPasswordTab && showWalletTab;

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
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
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
          </div>

          {/* Auth method tabs */}
          {showTabs && (
            <div className="mt-6 flex gap-1 rounded-lg border border-border bg-muted p-1">
              <button
                onClick={() => setActiveTab('password')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all',
                  activeTab === 'password'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <KeyRound className="size-3.5" />
                {t('admin.auth.tabPassword')}
              </button>
              <button
                onClick={() => setActiveTab('wallet')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all',
                  activeTab === 'wallet'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Wallet className="size-3.5" />
                {t('admin.auth.tabWallet')}
              </button>
            </div>
          )}

          <div className="mt-6">
            {activeTab === 'password' && showPasswordTab ? (
              <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_18px_36px_-26px_rgba(0,0,0,0.44)]">
                <h2 className="mb-1 text-sm font-semibold text-foreground">
                  {t('admin.auth.passwordTitle')}
                </h2>
                <p className="mb-4 text-xs text-muted-foreground">
                  {t('admin.auth.passwordSubtitle')}
                </p>
                <AdminPasswordForm />
              </section>
            ) : activeTab === 'wallet' && showWalletTab ? (
              <AdminAuthGate adminWalletAddresses={adminWalletAddresses} />
            ) : !showPasswordTab && !showWalletTab ? (
              <div className="rounded-2xl border border-border bg-card p-5 text-center">
                <p className="text-sm text-muted-foreground">
                  {t('admin.auth.noMethodsAvailable')}
                </p>
              </div>
            ) : showPasswordTab ? (
              <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_18px_36px_-26px_rgba(0,0,0,0.44)]">
                <h2 className="mb-1 text-sm font-semibold text-foreground">
                  {t('admin.auth.passwordTitle')}
                </h2>
                <p className="mb-4 text-xs text-muted-foreground">
                  {t('admin.auth.passwordSubtitle')}
                </p>
                <AdminPasswordForm />
              </section>
            ) : (
              <AdminAuthGate adminWalletAddresses={adminWalletAddresses} />
            )}
          </div>

          {/* Wallet login hint when only password is available */}
          {showPasswordTab && !showWalletTab && (
            <p className="mt-4 text-xs text-muted-foreground">
              {t('admin.auth.walletLoginHint')}
            </p>
          )}

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
