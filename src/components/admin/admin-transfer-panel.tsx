'use client';

import { useState } from 'react';
import { CheckCircle2, Copy, Loader2, Plus, Shield, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';

interface AdminTransferPanelProps {
  initialAdminWalletAddresses: string[];
  authToken?: string;
}

type NoticeTone = 'neutral' | 'success' | 'error';

interface NoticeState {
  tone: NoticeTone;
  message: string;
}

function isValidAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function mergeAddressList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeAddress(value);
    if (!isValidAddress(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function parseAdminAddressesFromPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const raw = (payload as { adminWalletAddresses?: unknown }).adminWalletAddresses;
  if (!Array.isArray(raw)) return [];
  return mergeAddressList(
    raw
      .map((item) => (typeof item === 'string' ? item : ''))
      .filter((item) => item.length > 0)
  );
}

function compactAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function AdminTransferPanel({
  initialAdminWalletAddresses,
  authToken,
}: AdminTransferPanelProps) {
  const { t } = useI18n();
  const [adminWalletAddresses, setAdminWalletAddresses] = useState(() =>
    mergeAddressList(initialAdminWalletAddresses)
  );
  const [inputAddress, setInputAddress] = useState('');
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const isTokenMode = Boolean(authToken && authToken.trim());
  const adminsApiPath = isTokenMode
    ? `/api/admin/admins?token=${encodeURIComponent(authToken!.trim())}`
    : '/api/admin/admins';
  const isBusy = activeAction !== null;

  const handleAddAdmin = async () => {
    if (!isValidAddress(inputAddress)) {
      setNotice({ tone: 'error', message: t('admin.transfer.invalidAddress') });
      return;
    }
    const normalizedInput = normalizeAddress(inputAddress);
    if (adminWalletAddresses.includes(normalizedInput)) {
      setNotice({ tone: 'neutral', message: t('admin.transfer.alreadyInList') });
      return;
    }
    setActiveAction('add');
    setNotice(null);
    try {
      const response = await fetch(adminsApiPath, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: normalizedInput }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          payload && typeof payload.error === 'string'
            ? payload.error
            : `Add admin failed (${response.status})`;
        throw new Error(message);
      }
      const nextAddresses = parseAdminAddressesFromPayload(payload);
      if (nextAddresses.length > 0) {
        setAdminWalletAddresses(nextAddresses);
      } else {
        setAdminWalletAddresses((current) => mergeAddressList([...current, normalizedInput]));
      }
      setInputAddress('');
      setNotice({ tone: 'success', message: `${t('admin.transfer.added')}: ${normalizedInput}` });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : t('admin.transfer.addFailed'),
      });
    } finally {
      setActiveAction(null);
    }
  };

  const handleRemoveAdmin = async (targetAddress: string) => {
    if (adminWalletAddresses.length <= 1) {
      setNotice({ tone: 'error', message: t('admin.transfer.cannotRemoveLast') });
      return;
    }
    const confirmed = window.confirm(`${t('admin.transfer.confirmRemove')} ${targetAddress} ?`);
    if (!confirmed) return;
    setActiveAction(`remove:${targetAddress}`);
    setNotice(null);
    try {
      const response = await fetch(adminsApiPath, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: targetAddress }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          payload && typeof payload.error === 'string'
            ? payload.error
            : `Remove admin failed (${response.status})`;
        throw new Error(message);
      }
      const nextAddresses = parseAdminAddressesFromPayload(payload);
      if (nextAddresses.length > 0) {
        setAdminWalletAddresses(nextAddresses);
      } else {
        setAdminWalletAddresses((current) =>
          current.filter((item) => item !== normalizeAddress(targetAddress))
        );
      }
      setNotice({
        tone: 'success',
        message: `${t('admin.transfer.removed')}: ${targetAddress}`,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : t('admin.transfer.removeFailed'),
      });
    } finally {
      setActiveAction(null);
    }
  };

  const handleCopy = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setNotice({
        tone: 'neutral',
        message: `${t('admin.transfer.copied')} ${compactAddress(address)}`,
      });
    } catch {
      setNotice({ tone: 'error', message: t('admin.transfer.copyFailed') });
    }
  };

  const noticeClassName =
    notice?.tone === 'success'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
      : notice?.tone === 'error'
        ? 'border-red-500/40 bg-red-500/10 text-red-400'
        : 'border-border bg-muted text-foreground';
  const canAdd = isValidAddress(inputAddress);
  const hasAdmins = adminWalletAddresses.length > 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_16px_34px_-26px_rgba(0,0,0,0.44)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Shield className="size-4 text-[#F0B90B]" aria-hidden="true" />
            {t('admin.transfer.title')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('admin.transfer.subtitle')}
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          {adminWalletAddresses.length} {t('admin.transfer.admins')}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          name="adminWalletAddress"
          value={inputAddress}
          onChange={(event) => setInputAddress(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleAddAdmin();
            }
          }}
          placeholder={t('admin.transfer.addressPlaceholder')}
          className="h-9 rounded-md border border-border bg-card px-3 font-mono text-xs text-foreground outline-none transition-colors focus:border-ring"
        />
        <button
          type="button"
          onClick={() => { void handleAddAdmin(); }}
          disabled={isBusy || !canAdd}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#F0B90B] px-3 text-xs font-medium text-black disabled:opacity-60"
        >
          {activeAction === 'add' ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              {t('admin.transfer.adding')}
            </>
          ) : (
            <>
              <Plus className="size-3.5" aria-hidden="true" />
              {t('admin.transfer.addAdmin')}
            </>
          )}
        </button>
      </div>
      <div className="mt-4 rounded-xl border border-border bg-muted p-3">
        <p className="text-xs text-muted-foreground">
          {t('admin.meta.authMode')}:&nbsp;
          {isTokenMode ? t('admin.meta.authModeToken') : t('admin.meta.authModeWallet')}
        </p>
        <div className="mt-2 space-y-2">
          {hasAdmins ? (
            adminWalletAddresses.map((address) => {
              const removingCurrent = activeAction === `remove:${address}`;
              return (
                <div
                  key={address}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-2.5 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-foreground">{address}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('admin.transfer.adminWallet')}
                    </p>
                  </div>
                  <div className="ml-3 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => { void handleCopy(address); }}
                      className="inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-xs text-foreground hover:bg-accent"
                      aria-label={`Copy ${address}`}
                    >
                      <Copy className="size-3" aria-hidden="true" />
                      {t('admin.transfer.copy')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { void handleRemoveAdmin(address); }}
                      disabled={isBusy || adminWalletAddresses.length <= 1}
                      className="inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-xs text-foreground hover:bg-accent disabled:opacity-50"
                      aria-label={`Remove ${address}`}
                    >
                      {removingCurrent ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="size-3" aria-hidden="true" />
                      )}
                      {t('admin.transfer.remove')}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-muted-foreground">{t('admin.transfer.noAdminsConfigured')}</p>
          )}
        </div>
      </div>
      {notice ? (
        <p className={`mt-3 rounded-lg border px-3 py-2 text-xs ${noticeClassName}`}>
          <span className="inline-flex items-center gap-1.5">
            {notice.tone === 'success' ? (
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
            ) : null}
            {notice.message}
          </span>
        </p>
      ) : null}
    </section>
  );
}
