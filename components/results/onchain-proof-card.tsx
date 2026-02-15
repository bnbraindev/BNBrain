'use client';

import { FileCheck, ExternalLink, Copy, Check, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTransactionExecutor } from '@/lib/hooks/use-tx';
import { useState, useCallback } from 'react';

interface OnchainProofData {
  type: string;
  to: string;
  data: string;
  value: string;
  chainId: number;
  reportHash: string;
  description: string;
  metadata: {
    targetAddress: string;
    reportType: string;
    reportHash: string;
    registry: string;
  };
}

const CHAIN_EXPLORERS: Record<number, string> = {
  56: 'https://bscscan.com',
  97: 'https://testnet.bscscan.com',
  204: 'https://opbnbscan.com',
};

function shortenHash(hash: string) {
  return hash.slice(0, 10) + '…' + hash.slice(-8);
}

export function OnchainProofCard({
  data,
  txStateKey,
  conversationId,
  readOnly,
}: {
  data: OnchainProofData;
  txStateKey?: string;
  conversationId?: string;
  readOnly?: boolean;
}) {
  const { status, hash, error, errorDetails, sendContractCall, reset } =
    useTransactionExecutor({
      cacheKey: txStateKey,
      sync:
        conversationId && txStateKey
          ? {
              conversationId,
              txKey: txStateKey,
              chainId: data.chainId,
            }
          : undefined,
    });
  const [copied, setCopied] = useState(false);

  const explorer = CHAIN_EXPLORERS[data.chainId] ?? CHAIN_EXPLORERS[97];
  const chainName = data.chainId === 97 ? 'BSC Testnet' : data.chainId === 204 ? 'opBNB' : 'BSC';

  const handleStore = useCallback(async () => {
    await sendContractCall({
      to: data.to,
      data: data.data,
      chainId: data.chainId,
    });
  }, [data, sendContractCall]);

  const copyHash = useCallback(() => {
    navigator.clipboard.writeText(data.reportHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data.reportHash]);

  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileCheck className="size-4 text-emerald-500" aria-hidden="true" />
          On-chain Proof
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            {chainName}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3" aria-live="polite">
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Report type</span>
            <span className="font-mono">{data.metadata.reportType}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Report hash</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs">{shortenHash(data.reportHash)}</span>
              <button
                type="button"
                onClick={copyHash}
                className="p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]/60"
                aria-label={copied ? 'Report hash copied' : 'Copy report hash'}
              >
                {copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
              </button>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Target</span>
            <span className="font-mono text-xs">
              {data.metadata.targetAddress.slice(0, 8)}…{data.metadata.targetAddress.slice(-4)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Registry</span>
            <a
              href={`${explorer}/address/${data.metadata.registry}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-[#F0B90B] hover:underline flex items-center gap-1"
            >
              {data.metadata.registry.slice(0, 8)}…{data.metadata.registry.slice(-4)}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </div>
        </div>

        {!readOnly && status === 'idle' && (
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            size="sm"
            onClick={handleStore}
          >
            <ShieldCheck className="size-4 mr-1.5" aria-hidden="true" />
            Sign & Store Proof On-chain
          </Button>
        )}

        {!readOnly && status === 'confirming' && (
          <div className="text-xs text-center text-muted-foreground py-2 animate-pulse">
            Waiting for wallet confirmation…
          </div>
        )}

        {status === 'pending' && hash && (
          <div className="space-y-2">
            <div className="text-xs text-center text-[#F0B90B] py-1 animate-pulse">
              Transaction pending…
            </div>
            <a
              href={`${explorer}/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 text-xs text-[#F0B90B] hover:underline"
            >
              View on explorer <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </div>
        )}

        {status === 'success' && hash && (
          <div className="space-y-2 rounded-lg bg-emerald-500/10 p-3">
            <p className="text-xs text-emerald-400 font-medium text-center">
              Proof stored on-chain successfully!
            </p>
            <a
              href={`${explorer}/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 text-xs text-emerald-400 hover:underline"
            >
              View transaction <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </div>
        )}

        {status === 'cancelled' && (
          <div className="space-y-2 rounded-lg bg-amber-500/10 p-3">
            <p className="text-xs text-amber-300 text-center">
              Wallet request canceled. No proof was stored.
            </p>
            {!readOnly && (
              <Button variant="outline" size="sm" className="w-full" onClick={reset}>
                Try again
              </Button>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-2">
            <p className="text-xs text-destructive text-center">{error ?? 'Transaction failed'}</p>
            {errorDetails ? (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground text-center">
                  Technical details
                </summary>
                <p className="mt-1 text-xs text-muted-foreground break-all whitespace-pre-wrap">
                  {errorDetails}
                </p>
              </details>
            ) : null}
            {!readOnly && (
              <Button variant="outline" size="sm" className="w-full" onClick={reset}>
                Try again
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface VerifyResultData {
  reportHash: string;
  exists: boolean;
  chainId: number;
  registry: string;
  message: string;
}

export function VerifyReportCard({ data }: { data: VerifyResultData }) {
  const explorer = CHAIN_EXPLORERS[data.chainId] ?? CHAIN_EXPLORERS[97];

  return (
    <Card className={data.exists ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck
            className={`size-4 ${data.exists ? 'text-emerald-500' : 'text-amber-500'}`}
            aria-hidden="true"
          />
          Report Verification
          <Badge
            variant="outline"
            className={`ml-auto text-xs ${data.exists ? 'text-emerald-400 border-emerald-500/30' : 'text-amber-400 border-amber-500/30'}`}
          >
            {data.exists ? 'Verified' : 'Not Found'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm">{data.message}</p>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Hash</span>
          <span className="font-mono text-xs">{shortenHash(data.reportHash)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Registry</span>
          <a
            href={`${explorer}/address/${data.registry}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-[#F0B90B] hover:underline flex items-center gap-1"
          >
            {data.registry.slice(0, 8)}…{data.registry.slice(-4)}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
