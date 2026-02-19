'use client';

import { ShieldCheck, CheckCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const BNB_YELLOW = '#F0B90B';

function shortenAddress(addr: string) {
  if (!addr) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

export interface ApprovalListProps {
  data: {
    totalApprovals: number;
    approvals: Array<{
      tokenAddress: string;
      spender: string;
      txHash: string;
      timestamp: string;
    }>;
    warning: string | null;
  };
  locale?: string;
}

export function ApprovalList({ data, locale = 'en' }: ApprovalListProps) {
  const zh = locale === 'zh';
  const { totalApprovals, approvals, warning } = data;
  const isEmpty = !approvals || approvals.length === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" style={{ color: BNB_YELLOW }} />
            {zh ? '代币授权' : 'Token Approvals'}
          </CardTitle>
          {!isEmpty && (
            <Badge variant="secondary">{totalApprovals}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {warning && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3">
            <p className="text-sm text-amber-400">{warning}</p>
          </div>
        )}

        {isEmpty ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle className="size-10 text-emerald-500" />
            <p className="text-sm text-muted-foreground">{zh ? '未发现授权' : 'No approvals found'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {approvals.map((approval, i) => (
              <div
                key={approval.txHash + i}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border px-3 py-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-mono">
                      {shortenAddress(approval.tokenAddress)}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-sm font-mono">
                      {shortenAddress(approval.spender)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{approval.timestamp}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-400 shrink-0"
                >
                  {zh ? '撤销' : 'Revoke'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
