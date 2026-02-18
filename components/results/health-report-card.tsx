'use client';

import { useRef } from 'react';
import { HeartPulse, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ShareButton } from './share-button';

const BNB_YELLOW = '#F0B90B';

function shortenAddress(addr: string) {
  if (!addr) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

export interface HealthReportCardProps {
  data: {
    address: string;
    chainId: number;
    score: number;
    level: 'healthy' | 'warning' | 'danger';
    nativeBalance: string;
    tokenCount: number;
    riskyTokens: string[];
    approvalCount: number;
    riskyApprovals: number;
    issues: string[];
    recommendations: string[];
    error?: string;
  };
  locale?: string;
}

function getLevelColors(level: string) {
  switch (level) {
    case 'healthy':
      return { bg: 'bg-emerald-500/20', text: 'text-emerald-500', border: 'border-emerald-500/50' };
    case 'warning':
      return { bg: 'bg-amber-500/20', text: 'text-amber-500', border: 'border-amber-500/50' };
    case 'danger':
      return { bg: 'bg-red-500/20', text: 'text-red-500', border: 'border-red-500/50' };
    default:
      return { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-muted' };
  }
}

export function HealthReportCard({ data, locale = 'en' }: HealthReportCardProps) {
  const zh = locale === 'zh';
  const cardRef = useRef<HTMLDivElement>(null);

  if (data.error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{data.error}</p>
        </CardContent>
      </Card>
    );
  }

  const colors = getLevelColors(data.level);

  const shareText = zh
    ? `BNBrain 钱包健康报告\n地址: ${shortenAddress(data.address)}\n评分: ${data.score}/100 (${data.level})\nBNB: ${Number(data.nativeBalance).toFixed(4)} | 代币: ${data.tokenCount}\n授权: ${data.approvalCount} (${data.riskyApprovals} 风险)\n${data.issues.length > 0 ? '问题: ' + data.issues.join('; ') : '未发现问题'}`
    : `BNBrain Wallet Health Report\nAddress: ${shortenAddress(data.address)}\nScore: ${data.score}/100 (${data.level})\nBNB: ${Number(data.nativeBalance).toFixed(4)} | Tokens: ${data.tokenCount}\nApprovals: ${data.approvalCount} (${data.riskyApprovals} risky)\n${data.issues.length > 0 ? 'Issues: ' + data.issues.join('; ') : 'No issues found'}`;

  return (
    <Card ref={cardRef}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <HeartPulse className="size-5" style={{ color: BNB_YELLOW }} />
          {zh ? '钱包健康报告' : 'Wallet Health Report'}
          <ShareButton cardRef={cardRef} shareText={shareText} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score */}
        <div className="flex items-center gap-4">
          <div className={cn('flex size-20 items-center justify-center rounded-full font-bold text-2xl', colors.bg, colors.text)}>
            {data.score}
          </div>
          <div>
            <Badge variant="outline" className={cn('capitalize mb-1', colors.border, colors.text)}>
              {data.level}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {shortenAddress(data.address)}
            </p>
          </div>
        </div>

        <Separator />

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border px-3 py-2">
            <p className="text-xs text-muted-foreground">{zh ? 'BNB 余额' : 'BNB Balance'}</p>
            <p className="font-semibold">{Number(data.nativeBalance).toFixed(4)}</p>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <p className="text-xs text-muted-foreground">{zh ? '持有代币' : 'Tokens Held'}</p>
            <p className="font-semibold">{data.tokenCount}</p>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <p className="text-xs text-muted-foreground">{zh ? '授权' : 'Approvals'}</p>
            <p className="font-semibold">{data.approvalCount}</p>
          </div>
          <div className={cn('rounded-lg border px-3 py-2', data.riskyApprovals > 0 && 'border-amber-500/50')}>
            <p className="text-xs text-muted-foreground">{zh ? '风险授权' : 'Risky Approvals'}</p>
            <p className={cn('font-semibold', data.riskyApprovals > 0 && 'text-amber-500')}>
              {data.riskyApprovals}
            </p>
          </div>
        </div>

        {/* Issues */}
        {data.issues.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                {zh ? '发现问题' : 'Issues Found'}
              </h4>
              <ul className="space-y-1.5">
                {data.issues.map((issue, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="size-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Recommendations */}
        {data.recommendations.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Info className="size-4 text-blue-500" />
                {zh ? '建议' : 'Recommendations'}
              </h4>
              <ul className="space-y-1.5">
                {data.recommendations.map((rec, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <CheckCircle className="size-3.5 text-blue-500 mt-0.5 shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
