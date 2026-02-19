'use client';

import { ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface ApprovalRiskCardData {
  totalTokensWithApprovals: number;
  totalApprovals: number;
  riskyTokens: number;
  verdict: string;
  riskySpenders: Array<{
    token: string;
    spender: string;
    spenderName: string;
    amount: string;
    risks: string[];
  }>;
  records?: Array<{
    token: string;
    isMalicious: boolean;
    approvalCount: number;
  }>;
}

function shortenAddr(addr: string) {
  if (addr.length <= 14) return addr;
  return addr.slice(0, 8) + '…' + addr.slice(-4);
}

export function ApprovalRiskCard({ data, locale = 'en' }: { data: ApprovalRiskCardData; locale?: string }) {
  const zh = locale === 'zh';
  const hasRisk = data.riskySpenders.length > 0;
  return (
    <Card className={hasRisk ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {hasRisk ? <AlertTriangle className="size-4 text-amber-500" /> : <ShieldCheck className="size-4 text-emerald-500" />}
          {zh ? '授权风险分析' : 'Approval Risk Analysis'}
          <Badge variant="outline" className={`ml-auto text-xs ${hasRisk ? 'border-amber-500/30 text-amber-400' : 'border-emerald-500/30 text-emerald-500'}`}>
            {data.totalApprovals} {zh ? '个授权' : 'Approvals'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-xs text-center">
          <div className="rounded-lg border px-2 py-2">
            <p className="text-muted-foreground text-xs">{zh ? '代币' : 'Tokens'}</p>
            <p className="font-medium text-base">{data.totalTokensWithApprovals}</p>
          </div>
          <div className="rounded-lg border px-2 py-2">
            <p className="text-muted-foreground text-xs">{zh ? '授权数' : 'Approvals'}</p>
            <p className="font-medium text-base">{data.totalApprovals}</p>
          </div>
          <div className="rounded-lg border px-2 py-2">
            <p className="text-muted-foreground text-xs">{zh ? '风险' : 'Risky'}</p>
            <p className={`font-medium text-base ${data.riskyTokens > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{data.riskyTokens}</p>
          </div>
        </div>

        <p className="text-sm">{data.verdict}</p>

        {data.riskySpenders.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium flex items-center gap-1"><ShieldAlert className="size-3 text-red-500" /> {zh ? '风险消费者' : 'Risky Spenders'}</p>
            {data.riskySpenders.slice(0, 5).map((s, i) => (
              <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-2 text-xs space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{s.token}</span>
                  <span className="font-mono text-xs text-muted-foreground">{shortenAddr(s.spender)}</span>
                </div>
                {s.spenderName && <p className="text-muted-foreground">{s.spenderName}</p>}
                {s.risks.map((r, ri) => (
                  <p key={ri} className="text-red-500 text-xs">• {r}</p>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
