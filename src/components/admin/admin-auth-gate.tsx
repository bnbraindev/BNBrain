'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldCheck, Wallet } from 'lucide-react';
import { useAccount, useSignMessage } from 'wagmi';
import {
  requestWalletAuthChallenge,
  verifyWalletAuthSignature,
} from '@/lib/services/wallet-auth';
import { useI18n } from '@/lib/i18n/context';

interface AdminAuthGateProps {
  adminWalletAddresses: string[];
}

export function AdminAuthGate({ adminWalletAddresses }: AdminAuthGateProps) {
  const { t } = useI18n();
  const { address: walletAddress, chain } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [isSigning, setIsSigning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const hasBoundAdmins = adminWalletAddresses.length > 0;
  const normalizedWalletAddress = walletAddress?.toLowerCase() ?? null;
  const walletIsAdmin = Boolean(
    normalizedWalletAddress && adminWalletAddresses.includes(normalizedWalletAddress)
  );

  const handleAdminSignIn = async () => {
    const chainId = chain?.id;
    if (!walletAddress || !chainId) {
      setStatus(t('admin.auth.connectWalletFirst'));
      return;
    }
    setIsSigning(true);
    setStatus(null);
    try {
      const challenge = await requestWalletAuthChallenge({
        address: walletAddress,
        chainId,
        purpose: 'admin',
      });
      const signature = await signMessageAsync({ message: challenge.message });
      const session = await verifyWalletAuthSignature({
        address: walletAddress,
        nonce: challenge.nonce,
        signature,
        chainId,
        purpose: 'admin',
        singleDevice: true,
      });
      if (!session.isAdmin) {
        setStatus(t('admin.auth.notInAdminList'));
        return;
      }
      setStatus(t('admin.auth.signSuccessRedirect'));
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('admin.auth.signFailed'));
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_18px_36px_-26px_rgba(0,0,0,0.44)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('admin.auth.title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('admin.auth.subtitle')}
          </p>
        </div>
        <span
          className={
            hasBoundAdmins
              ? 'inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400'
              : 'inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400'
          }
        >
          {hasBoundAdmins
            ? `${adminWalletAddresses.length} ${t('admin.auth.adminsConfigured')}`
            : t('admin.auth.noAdminBound')}
        </span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-muted p-3">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {t('admin.auth.adminList')}
          </p>
          {hasBoundAdmins ? (
            <div className="mt-2 space-y-1.5">
              {adminWalletAddresses.map((address) => (
                <code
                  key={address}
                  className="block rounded bg-card px-2 py-1 text-xs text-foreground"
                >
                  {address}
                </code>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('admin.auth.bootstrapHint')}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-muted p-3">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <Wallet className="size-3.5" aria-hidden="true" />
            {t('admin.auth.connectedWallet')}
          </p>
          <code className="mt-2 block rounded bg-card px-2 py-1 text-xs text-foreground">
            {walletAddress ?? t('admin.auth.notConnected')}
          </code>
          <p className="mt-2 text-xs text-muted-foreground">
            {walletAddress
              ? walletIsAdmin
                ? t('admin.auth.walletInAdminList')
                : t('admin.auth.walletNotInAdminList')
              : t('admin.auth.connectThenSign')}
          </p>
        </div>
      </div>
      {!hasBoundAdmins ? (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          {t('admin.auth.bootstrapMode')}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void handleAdminSignIn();
          }}
          disabled={isSigning}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#F0B90B] px-3 text-xs font-medium text-black disabled:opacity-60"
        >
          {isSigning ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              {t('admin.auth.signing')}
            </>
          ) : (
            t('admin.auth.signInAsAdmin')
          )}
        </button>
        <Link
          href="/"
          className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {t('admin.backToChat')}
        </Link>
      </div>
      {status ? (
        <p className="mt-3 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground">
          {status}
        </p>
      ) : null}
    </section>
  );
}
