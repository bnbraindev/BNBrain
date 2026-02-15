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

export function SecurityReport({ data }: SecurityReportProps) {
  const riskColors = getRiskColors(data.riskLevel);
  const scoreColor = getScoreColor(data.riskScore);
  const cardRef = useRef<HTMLDivElement>(null);

  const shareText = `BNBrain Security Report\nRisk: ${data.riskLevel.toUpperCase()} (Score: ${data.riskScore}/100)\nHoneypot: ${data.isHoneypot ? 'YES' : 'No'} | Mintable: ${data.isMintable ? 'YES' : 'No'}\nHolders: ${data.holderCount} | Risks: ${data.risks.length > 0 ? data.risks.join(', ') : 'None'}`;

  return (
    <Card className="overflow-hidden" ref={cardRef}>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-5" style={{ color: BNB_YELLOW }} />
            Security Report
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
            <p className="text-sm text-muted-foreground mb-1">Risk Score (0–100)</p>
            <p className="text-lg font-medium">
              Lower is better. This token scored {data.riskScore} points.
            </p>
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="text-sm font-medium mb-3">Security Checks</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CheckItem label="Honeypot" pass={!data.isHoneypot} passLabel="No" />
            <CheckItem label="Mintable" pass={!data.isMintable} passLabel="No" />
            <CheckItem label="Blacklist" pass={!data.isBlacklisted} passLabel="No" />
            <CheckItem label="Open Source" pass={data.isOpenSource} passLabel="Yes" />
            <CheckItem
              label="Proxy"
              pass={!data.isProxy}
              passLabel="No"
              useWarningIcon
            />
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm">Buy Tax</span>
              <span className="text-sm font-medium">{data.buyTax}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm">Sell Tax</span>
              <span className="text-sm font-medium">{data.sellTax}</span>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="text-sm font-medium mb-3">Holder Info</h4>
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="rounded-lg border px-3 py-2">
              <span className="text-xs text-muted-foreground">Total Holders</span>
              <p className="font-semibold">{data.holderCount.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border px-3 py-2">
              <span className="text-xs text-muted-foreground">LP Holders</span>
              <p className="font-semibold">{data.lpHolderCount.toLocaleString()}</p>
            </div>
          </div>
          {data.holders.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Top Holders</p>
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
                          Contract
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
                Identified Risks
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
            <p className="text-xs text-muted-foreground mb-1">Creator</p>
            <p className="font-mono truncate">{shortenAddress(data.creatorAddress)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Owner</p>
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
}: {
  label: string;
  pass: boolean;
  passLabel: 'Yes' | 'No';
  useWarningIcon?: boolean;
}) {
  const displayText = pass ? passLabel : passLabel === 'Yes' ? 'No' : 'Yes';
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
