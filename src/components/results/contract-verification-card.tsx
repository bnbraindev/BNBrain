'use client';

import { CheckCircle, XCircle, Clock, FileCheck2, ExternalLink, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface VerificationStep {
  key: string;
  label: string;
  status: 'completed' | 'failed' | 'skipped';
  summary: string | null;
  durationMs: number;
}

export interface ContractVerificationCardData {
  address: string;
  contractName: string;
  chainId: number;
  verificationStatus: 'verified' | 'failed' | 'timeout';
  message: string;
  guid?: string;
  reportId?: string;
  reportUrl?: string;
  durationMs: number;
  steps: VerificationStep[];
}

const EXPLORER_URLS: Record<number, string> = {
  56: 'https://bscscan.com',
  204: 'https://opbnb.bscscan.com',
  1: 'https://etherscan.io',
};

function shortenAddr(addr: string) {
  if (addr.length <= 14) return addr;
  return addr.slice(0, 8) + '…' + addr.slice(-4);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ContractVerificationCard({ data, locale = 'en' }: { data: ContractVerificationCardData; locale?: string }) {
  const zh = locale === 'zh';
  const isVerified = data.verificationStatus === 'verified';
  const isTimeout = data.verificationStatus === 'timeout';
  const explorerBase = EXPLORER_URLS[data.chainId] ?? EXPLORER_URLS[56];
  const contractUrl = `${explorerBase}/address/${data.address}#code`;

  const borderColor = isVerified
    ? 'border-emerald-500/30 bg-emerald-500/5'
    : isTimeout
      ? 'border-amber-500/30 bg-amber-500/5'
      : 'border-red-500/30 bg-red-500/5';

  const badgeClass = isVerified
    ? 'border-emerald-500/30 text-emerald-500'
    : isTimeout
      ? 'border-amber-500/30 text-amber-400'
      : 'border-red-500/30 text-red-400';

  const statusText = isVerified
    ? (zh ? '已验证' : 'Verified')
    : isTimeout
      ? (zh ? '已超时' : 'Timed Out')
      : (zh ? '失败' : 'Failed');

  const StatusIcon = isVerified ? CheckCircle : isTimeout ? Clock : XCircle;
  const statusIconColor = isVerified ? 'text-emerald-500' : isTimeout ? 'text-amber-500' : 'text-red-500';

  return (
    <Card className={borderColor}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileCheck2 className="size-4 text-primary" />
          {zh ? '验证: ' : 'Verify: '}{data.contractName}
          <Badge variant="outline" className={`ml-auto text-xs ${badgeClass}`}>
            {statusText}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Status message */}
        <div className="flex items-start gap-2 text-sm">
          <StatusIcon className={`size-4 shrink-0 mt-0.5 ${statusIconColor}`} />
          <span>{data.message}</span>
        </div>

        {/* Contract info grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border px-2.5 py-2">
            <p className="text-muted-foreground text-xs">{zh ? '合约' : 'Contract'}</p>
            <p className="font-mono truncate">{data.contractName}</p>
          </div>
          <div className="rounded-lg border px-2.5 py-2">
            <p className="text-muted-foreground text-xs">{zh ? '耗时' : 'Duration'}</p>
            <p>{formatDuration(data.durationMs)}</p>
          </div>
        </div>

        {/* Steps */}
        {data.steps.length > 0 && (
          <div className="space-y-1">
            {data.steps.map((step) => (
              <div key={step.key} className="flex items-center gap-2 text-xs">
                {step.status === 'completed' ? (
                  <CheckCircle className="size-3 text-emerald-500 shrink-0" />
                ) : step.status === 'failed' ? (
                  <XCircle className="size-3 text-red-500 shrink-0" />
                ) : (
                  <RefreshCw className="size-3 text-muted-foreground shrink-0" />
                )}
                <span className="text-muted-foreground">{step.label}</span>
                {step.summary && (
                  <span className="truncate text-muted-foreground/60">{step.summary}</span>
                )}
                {step.durationMs > 0 && (
                  <span className="ml-auto text-muted-foreground/40 shrink-0">{formatDuration(step.durationMs)}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Links */}
        <div className="flex flex-wrap gap-2 text-xs">
          <a
            href={contractUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            <ExternalLink className="size-3" />
            {zh ? '在浏览器查看' : 'View on Explorer'}
          </a>
          {data.reportUrl && (
            <a
              href={data.reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <FileCheck2 className="size-3" />
              {zh ? '查看报告' : 'View Report'}
            </a>
          )}
        </div>

        {/* Address */}
        <p className="font-mono text-xs text-muted-foreground break-all">{data.address}</p>
      </CardContent>
    </Card>
  );
}
