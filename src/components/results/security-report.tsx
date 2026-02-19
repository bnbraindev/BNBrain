'use client';

import { useRef } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ShareButton } from './share-button';

const BNB_YELLOW = '#F0B90B';

function shortenAddress(addr: string) {
  if (!addr || addr === 'native') return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

export interface SecurityReportProps {
  data: {
    isHoneypot: boolean;
    isMintable: boolean;
    isProxy: boolean;
    isBlacklisted: boolean;
    isOpenSource: boolean;
    buyTax: string;
    sellTax: string;
    holderCount: number;
    lpHolderCount: number;
    totalSupply: string;
    creatorAddress: string;
    ownerAddress: string;
    holders: { address: string; percent: string; isContract: boolean }[];
    riskLevel: 'safe' | 'warning' | 'danger';
    riskScore: number;
    risks: string[];
  };
  locale?: string;
}

function getRiskColors(riskLevel: 'safe' | 'warning' | 'danger') {
  switch (riskLevel) {
    case 'safe':
      return { bg: 'bg-emerald-500/20', stroke: 'stroke-emerald-500', text: 'text-emerald-500' };
    case 'warning':
      return { bg: 'bg-amber-500/20', stroke: 'stroke-amber-500', text: 'text-amber-500' };
    case 'danger':
      return { bg: 'bg-red-500/20', stroke: 'stroke-red-500', text: 'text-red-500' };
    default:
      return { bg: 'bg-muted', stroke: 'stroke-muted-foreground', text: 'text-muted-foreground' };
  }
}

function getScoreColor(score: number) {
  if (score < 30) return 'text-emerald-500';
  if (score <= 60) return 'text-amber-500';
  return 'text-red-500';
}

export function SecurityReport({ data, locale = 'en' }: SecurityReportProps) {
  const zh = locale === 'zh';
  const riskColors = getRiskColors(data.riskLevel);
  const scoreColor = getScoreColor(data.riskScore);
  const cardRef = useRef<HTMLDivElement>(null);

  const shareText = zh
    ? `BNBrain 安全报告\n风险: ${data.riskLevel.toUpperCase()} (评分: ${data.riskScore}/100)\n蜜罐: ${data.isHoneypot ? '是' : '否'} | 可增发: ${data.isMintable ? '是' : '否'}\n持有者: ${data.holderCount} | 风险: ${data.risks.length > 0 ? data.risks.join(', ') : '无'}`
    : `BNBrain Security Report\nRisk: ${data.riskLevel.toUpperCase()} (Score: ${data.riskScore}/100)\nHoneypot: ${data.isHoneypot ? 'YES' : 'No'} | Mintable: ${data.isMintable ? 'YES' : 'No'}\nHolders: ${data.holderCount} | Risks: ${data.risks.length > 0 ? data.risks.join(', ') : 'None'}`;

  return (
    <Card className="overflow-hidden" ref={cardRef}>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-5" style={{ color: BNB_YELLOW }} />
            {zh ? '安全报告' : 'Security Report'}
            <ShareButton cardRef={cardRef} shareText={shareText} />
          </CardTitle>
          <Badge
            variant="outline"
            className={cn(
              'font-medium capitalize',
              data.riskLevel === 'safe' && 'border-emerald-500/50 text-emerald-400',
              data.riskLevel === 'warning' && 'border-amber-500/50 text-amber-400',
              data.riskLevel === 'danger' && 'border-red-500/50 text-red-400'
            )}
          >
            {data.riskLevel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div
            className={cn(
              'flex size-24 shrink-0 items-center justify-center rounded-full font-bold text-2xl',
              riskColors.bg,
              scoreColor
            )}
          >
            {data.riskScore}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-sm text-muted-foreground mb-1">{zh ? '风险评分 (0–100)' : 'Risk Score (0–100)'}</p>
            <p className="text-lg font-medium">
              {zh ? `分数越低越好。该代币得分 ${data.riskScore} 分。` : `Lower is better. This token scored ${data.riskScore} points.`}
            </p>
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="text-sm font-medium mb-3">{zh ? '安全检查' : 'Security Checks'}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CheckItem label={zh ? '蜜罐' : 'Honeypot'} pass={!data.isHoneypot} passLabel="No" zh={zh} />
            <CheckItem label={zh ? '可增发' : 'Mintable'} pass={!data.isMintable} passLabel="No" zh={zh} />
            <CheckItem label={zh ? '黑名单' : 'Blacklist'} pass={!data.isBlacklisted} passLabel="No" zh={zh} />
            <CheckItem label={zh ? '开源' : 'Open Source'} pass={data.isOpenSource} passLabel="Yes" zh={zh} />
            <CheckItem
              label={zh ? '代理' : 'Proxy'}
              pass={!data.isProxy}
              passLabel="No"
              useWarningIcon
              zh={zh}
            />
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm">{zh ? '买入税' : 'Buy Tax'}</span>
              <span className="text-sm font-medium">{data.buyTax}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm">{zh ? '卖出税' : 'Sell Tax'}</span>
              <span className="text-sm font-medium">{data.sellTax}</span>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="text-sm font-medium mb-3">{zh ? '持有者信息' : 'Holder Info'}</h4>
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="rounded-lg border px-3 py-2">
              <span className="text-xs text-muted-foreground">{zh ? '总持有者' : 'Total Holders'}</span>
              <p className="font-semibold">{data.holderCount.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border px-3 py-2">
              <span className="text-xs text-muted-foreground">{zh ? 'LP 持有者' : 'LP Holders'}</span>
              <p className="font-semibold">{data.lpHolderCount.toLocaleString()}</p>
            </div>
          </div>
          {data.holders.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{zh ? '前十持有者' : 'Top Holders'}</p>
              <div className="rounded-lg border divide-y">
                {data.holders.slice(0, 10).map((h, i) => (
                  <div
                    key={h.address + i}
                    className="flex items-center justify-between px-3 py-2 gap-2"
                  >
                    <span className="font-mono text-sm truncate">
                      {shortenAddress(h.address)}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-medium">{h.percent}</span>
                      {h.isContract && (
                        <Badge variant="secondary" className="text-xs">
                          {zh ? '合约' : 'Contract'}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {data.risks.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                {zh ? '已识别风险' : 'Identified Risks'}
              </h4>
              <div className="flex flex-wrap gap-2">
                {data.risks.map((risk, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className={
                      data.riskLevel === 'danger'
                        ? 'border-red-500/50 text-red-400'
                        : 'border-amber-500/50 text-amber-400'
                    }
                  >
                    {risk}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{zh ? '创建者' : 'Creator'}</p>
            <p className="font-mono truncate">{shortenAddress(data.creatorAddress)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{zh ? '所有者' : 'Owner'}</p>
            <p className="font-mono truncate">{shortenAddress(data.ownerAddress)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CheckItem({
  label,
  pass,
  passLabel,
  useWarningIcon,
  zh = false,
}: {
  label: string;
  pass: boolean;
  passLabel: 'Yes' | 'No';
  useWarningIcon?: boolean;
  zh?: boolean;
}) {
  const yesText = zh ? '是' : 'Yes';
  const noText = zh ? '否' : 'No';
  const displayText = pass
    ? (passLabel === 'Yes' ? yesText : noText)
    : (passLabel === 'Yes' ? noText : yesText);
  const icon = pass ? (
    <CheckCircle className="size-4 text-emerald-500" />
  ) : useWarningIcon ? (
    <AlertTriangle className="size-4 text-amber-500" />
  ) : (
    <XCircle className="size-4 text-red-500" />
  );

  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {icon}
        {displayText}
      </span>
    </div>
  );
}
