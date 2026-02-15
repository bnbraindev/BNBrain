'use client';

import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bot,
  ChevronRight,
  Database,
  LayoutDashboard,
  MessageSquareMore,
  Settings,
  Shield,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from '@/components/language-switcher';

interface AdminShellProps {
  token?: string;
  adminCount: number;
  tokenConfigured: boolean;
  walletSessionAddress?: string | null;
  pageTitleKey: string;
  pageDescriptionKey: string;
  children: ReactNode;
}

interface NavItem {
  href: string;
  labelKey: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/admin/overview',
    labelKey: 'admin.nav.overview',
    icon: LayoutDashboard,
  },
  {
    href: '/admin/models',
    labelKey: 'admin.nav.models',
    icon: Bot,
  },
  {
    href: '/admin/admins',
    labelKey: 'admin.nav.admins',
    icon: ShieldCheck,
  },
  {
    href: '/admin/conversations',
    labelKey: 'admin.nav.conversations',
    icon: MessageSquareMore,
  },
  {
    href: '/admin/runtime',
    labelKey: 'admin.nav.runtime',
    icon: Timer,
  },
  {
    href: '/admin/settings',
    labelKey: 'admin.nav.settings',
    icon: Settings,
  },
];

function withToken(href: string, token?: string): string {
  const normalized = token?.trim();
  if (!normalized) return href;
  return `${href}?token=${encodeURIComponent(normalized)}`;
}

function shortAddress(value: string | null | undefined): string {
  if (!value) return '-';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function AdminShell({
  token,
  adminCount,
  tokenConfigured,
  walletSessionAddress,
  pageTitleKey,
  pageDescriptionKey,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(0,0,0,0.14),transparent_42%),radial-gradient(circle_at_100%_100%,rgba(59,130,246,0.10),transparent_44%)]" />
      <aside className="relative z-10 hidden w-72 shrink-0 overflow-y-auto border-r border-border bg-card/88 p-3 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.42)] backdrop-blur-xl lg:flex lg:flex-col">
        <div className="rounded-2xl border border-border bg-card px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/12">
              <Shield className="size-4 text-primary" aria-hidden={true} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t('admin.brand')}</p>
              <p className="text-xs text-muted-foreground">{t('admin.subtitle')}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
            <p className="flex items-center justify-between">
              <span>{t('admin.meta.adminCount')}</span>
              <span className="font-medium text-foreground">{adminCount}</span>
            </p>
            <p className="flex items-center justify-between">
              <span>{t('admin.meta.authMode')}</span>
              <span className="font-medium text-foreground">
                {token?.trim() ? t('admin.meta.authModeToken') : t('admin.meta.authModeWallet')}
              </span>
            </p>
            <p className="flex items-center justify-between">
              <span>{t('admin.meta.tokenConfigured')}</span>
              <span className="font-medium text-foreground">
                {tokenConfigured ? t('admin.common.enabled') : t('admin.common.disabled')}
              </span>
            </p>
            <p className="flex items-center justify-between">
              <span>{t('admin.meta.session')}</span>
              <span className="font-mono text-foreground">{shortAddress(walletSessionAddress)}</span>
            </p>
          </div>
        </div>

        <nav className="mt-3 space-y-1 rounded-2xl border border-border bg-card p-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={withToken(item.href, token)}
                className={cn(
                  'flex h-9 items-center justify-between rounded-lg px-2.5 text-sm transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <span className="inline-flex items-center gap-2">
                  <Icon className="size-4" aria-hidden={true} />
                  {t(item.labelKey)}
                </span>
                <ChevronRight className="size-3.5 opacity-70" aria-hidden={true} />
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-border bg-card p-2.5">
          <div className="flex items-center justify-between gap-2">
            <LanguageSwitcher />
            <Link
              href="/"
              className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <Database className="mr-1 size-3.5" aria-hidden={true} />
              {t('admin.backToChat')}
            </Link>
          </div>
        </div>
      </aside>

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col p-2 sm:p-3">
        <header className="shrink-0 rounded-2xl border border-border bg-card/90 px-4 py-3 shadow-[0_16px_34px_-26px_rgba(0,0,0,0.48)] backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between gap-2 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/12">
                <Shield className="size-4 text-primary" aria-hidden={true} />
              </div>
              <span className="text-sm font-semibold text-foreground">{t('admin.brand')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <LanguageSwitcher />
              <Link
                href="/"
                className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {t('admin.backToChat')}
              </Link>
            </div>
          </div>

          <div className="mb-2 -mx-1 overflow-x-auto px-1 lg:hidden">
            <div className="flex min-w-max items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={withToken(item.href, token)}
                    className={cn(
                      'inline-flex h-8 items-center rounded-lg px-2.5 text-xs',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'border border-border text-muted-foreground'
                    )}
                  >
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </div>
          </div>

          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            {t('admin.sectionLabel')}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
            {t(pageTitleKey)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t(pageDescriptionKey)}</p>
        </header>
        <main
          id="main-content"
          className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
