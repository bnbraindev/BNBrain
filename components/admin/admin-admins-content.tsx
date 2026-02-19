'use client';

import { useState, useEffect, useCallback } from 'react';
import { KeyRound, Loader2, Plus, ShieldCheck, Trash2, Wallet } from 'lucide-react';
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

      <AdminCredentialsPanel authToken={authToken} />
    </div>
  );
}

/* ─── Password Credentials Panel ─────────────────────────── */

function AdminCredentialsPanel({ authToken }: { authToken?: string }) {
  const { t } = useI18n();
  const [usernames, setUsernames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const isTokenMode = Boolean(authToken?.trim());
  const credentialsApiPath = isTokenMode
    ? `/api/admin/credentials?token=${encodeURIComponent(authToken!.trim())}`
    : '/api/admin/credentials';

  const fetchUsernames = useCallback(async () => {
    try {
      const res = await fetch(credentialsApiPath, { credentials: 'include' });
      const data = await res.json();
      if (data.ok && Array.isArray(data.usernames)) {
        setUsernames(data.usernames);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [credentialsApiPath]);

  useEffect(() => {
    fetchUsernames();
  }, [fetchUsernames]);

  const handleAdd = async () => {
    if (newUsername.trim().length < 2 || newPassword.length < 8) {
      setNotice({ tone: 'error', message: t('admin.credentials.invalidInput') });
      return;
    }
    setActiveAction('add');
    setNotice(null);
    try {
      const res = await fetch(credentialsApiPath, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setNewUsername('');
      setNewPassword('');
      await fetchUsernames();
      setNotice({ tone: 'success', message: t('admin.credentials.added') });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : t('admin.credentials.addFailed') });
    } finally {
      setActiveAction(null);
    }
  };

  const handleDelete = async (username: string) => {
    const confirmed = window.confirm(`${t('admin.credentials.confirmDelete')} "${username}"?`);
    if (!confirmed) return;
    setActiveAction(`delete:${username}`);
    setNotice(null);
    try {
      const res = await fetch(credentialsApiPath, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      await fetchUsernames();
      setNotice({ tone: 'success', message: t('admin.credentials.deleted') });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : t('admin.credentials.deleteFailed') });
    } finally {
      setActiveAction(null);
    }
  };

  const isBusy = activeAction !== null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_16px_34px_-26px_rgba(0,0,0,0.44)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <KeyRound className="size-4 text-primary" aria-hidden="true" />
            {t('admin.credentials.title')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('admin.credentials.subtitle')}
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          {usernames.length} {t('admin.credentials.count')}
        </span>
      </div>

      {/* Add new credential */}
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          type="text"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          placeholder={t('admin.credentials.usernamePlaceholder')}
          className="h-9 rounded-md border border-border bg-card px-3 text-xs text-foreground outline-none transition-colors focus:border-ring"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={t('admin.credentials.passwordPlaceholder')}
          className="h-9 rounded-md border border-border bg-card px-3 text-xs text-foreground outline-none transition-colors focus:border-ring"
        />
        <button
          type="button"
          onClick={() => { void handleAdd(); }}
          disabled={isBusy || newUsername.trim().length < 2 || newPassword.length < 8}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {activeAction === 'add' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          {t('admin.credentials.add')}
        </button>
      </div>

      {/* List */}
      <div className="mt-4 rounded-xl border border-border bg-muted p-3">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-4 animate-spin text-primary" />
          </div>
        ) : usernames.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('admin.credentials.empty')}</p>
        ) : (
          <div className="space-y-2">
            {usernames.map((username) => {
              const deleting = activeAction === `delete:${username}`;
              return (
                <div
                  key={username}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-2.5 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{username}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { void handleDelete(username); }}
                    disabled={isBusy}
                    className="inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-xs text-foreground hover:bg-accent disabled:opacity-50"
                  >
                    {deleting ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                    {t('admin.credentials.delete')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {notice && (
        <p className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
          notice.tone === 'success'
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
            : 'border-red-500/40 bg-red-500/10 text-red-400'
        }`}>
          {notice.message}
        </p>
      )}
    </section>
  );
}
