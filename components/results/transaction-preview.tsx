'use client';

import { Send, Wallet, Loader2, CheckCircle, ExternalLink, XCircle, AlertCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTransactionExecutor } from '@/lib/hooks/use-tx';
import { useAccount } from 'wagmi';
import { EXPLORER_URLS } from '@/lib/utils/constants';

const BNB_YELLOW = '#F0B90B';

function shortenAddress(addr: string) {
  if (!addr) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

export interface TransactionPreviewProps {
  data: {
    type: 'erc20_transfer' | 'native_transfer';
    to: string;
    value?: string;
    data?: string;
    description: string;
    chainId?: number;
    error?: string;
  };
  txStateKey?: string;
  conversationId?: string;
  readOnly?: boolean;
}

export function TransactionPreview({
  data,
  txStateKey,
  conversationId,
  readOnly,
}: TransactionPreviewProps) {
  const { isConnected } = useAccount();
  const chainId = data.chainId ?? 56;
  const tx = useTransactionExecutor({
    cacheKey: txStateKey,
    sync:
      conversationId && txStateKey
        ? {
            conversationId,
            txKey: txStateKey,
            chainId,
          }
        : undefined,
  });
  const explorerBase = EXPLORER_URLS[chainId] ?? EXPLORER_URLS[56];

  if (data.error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="pt-6">
          <p className="font-medium text-destructive">Transfer Error</p>
          <p className="text-sm text-muted-foreground mt-1">{data.error}</p>
        </CardContent>
      </Card>
    );
  }

  const handleConfirm = async () => {
    if (data.type === 'native_transfer') {
      await tx.sendNativeTransfer({
        to: data.to,
        value: data.value ?? '0',
        chainId,
      });
    } else {
      await tx.sendContractCall({
        to: data.to,
        data: data.data ?? '0x',
        value: '0',
        chainId,
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Send className="size-5" style={{ color: BNB_YELLOW }} />
          Transaction Preview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">{data.description}</p>

        <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">To</span>
            <span className="font-mono text-sm">{shortenAddress(data.to)}</span>
          </div>
          {data.type === 'native_transfer' && data.value && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Amount</span>
              <span className="font-medium">{data.value} wei</span>
            </div>
          )}
        </div>

        {/* Transaction status */}
        {tx.status === 'success' && tx.hash && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3">
            <CheckCircle className="size-5 text-emerald-500 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-emerald-400">Transaction Confirmed</p>
              <a
                href={`${explorerBase}/tx/${tx.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-emerald-400/80 hover:underline flex items-center gap-1 mt-0.5"
              >
                {shortenAddress(tx.hash)}
                <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
        )}

        {tx.status === 'error' && tx.error && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
            <XCircle className="size-5 text-destructive shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-destructive">Transaction Failed</p>
              <p className="text-xs text-muted-foreground mt-0.5">{tx.error}</p>
              {tx.errorDetails ? (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-xs text-muted-foreground/80">
                    Technical details
                  </summary>
                  <p className="mt-1 text-xs text-muted-foreground break-all whitespace-pre-wrap">
                    {tx.errorDetails}
                  </p>
                </details>
              ) : null}
            </div>
          </div>
        )}

        {tx.status === 'cancelled' && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
            <AlertCircle className="size-5 text-amber-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-300">Transaction Canceled</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                No transaction was sent. You can review details and try again.
              </p>
            </div>
          </div>
        )}

        {tx.status === 'pending' && (
          <div className="flex items-center gap-3 rounded-lg border border-[#F0B90B]/50 bg-[#F0B90B]/10 px-4 py-3">
            <Loader2 className="size-5 animate-spin text-[#F0B90B] shrink-0" />
            <div>
              <p className="text-sm font-medium">Waiting for confirmation…</p>
              {tx.hash && (
                <a
                  href={`${explorerBase}/tx/${tx.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-muted-foreground hover:underline flex items-center gap-1 mt-0.5"
                >
                  {shortenAddress(tx.hash)}
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Action button — hidden in share/readOnly mode */}
        {!readOnly && tx.status === 'idle' && (
          <>
            {!isConnected ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                Connect your wallet first to sign this transaction
              </p>
            ) : (
              <Button
                className="w-full font-medium"
                style={{ backgroundColor: BNB_YELLOW, color: '#000' }}
                onClick={handleConfirm}
              >
                <Wallet className="size-4 mr-2" />
                Sign & Send
              </Button>
            )}
          </>
        )}

        {!readOnly && tx.status === 'confirming' && (
          <Button className="w-full font-medium" disabled>
            <Loader2 className="size-4 mr-2 animate-spin" />
            Confirm in Wallet…
          </Button>
        )}

        {!readOnly && (tx.status === 'error' || tx.status === 'success' || tx.status === 'cancelled') && (
          <Button variant="outline" className="w-full" onClick={tx.reset}>
            {tx.status === 'success' ? 'New Transaction' : 'Try Again'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
