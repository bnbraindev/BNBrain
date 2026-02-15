'use client';

import { Globe, ShieldCheck, ShieldAlert, FileCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface DappSecurityCardData {
  url: string;
  projectName: string;
  isAudit: boolean;
  trustList: boolean;
  verdict: string;
  auditInfo?: Array<{ firm: string; link: string; time: string }>;
  contractsSecurity?: Array<{
    chainId: string;
    contracts: Array<{ address: string; isOpenSource: boolean; isMalicious: boolean }>;
  }>;
}

export function DappSecurityCard({ data }: { data: DappSecurityCardData }) {
  const safe = data.trustList;
  return (
    <Card className={safe ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Globe className="size-4 text-primary" />
          {data.projectName || 'dApp Security'}
          {data.trustList && <Badge variant="outline" className="ml-auto text-xs border-emerald-500/30 text-emerald-500">Trusted</Badge>}
          {data.isAudit && <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-500">Audited</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs font-mono text-muted-foreground break-all">{data.url}</p>
        <p className="text-sm">{data.verdict}</p>

        {data.auditInfo && data.auditInfo.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium flex items-center gap-1"><FileCheck className="size-3" /> Audit Records</p>
            {data.auditInfo.map((a, i) => (
              <div key={i} className="text-xs text-muted-foreground">
                {a.firm} {a.time ? `(${a.time})` : ''}
              </div>
            ))}
          </div>
        )}

        {data.contractsSecurity && data.contractsSecurity.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium">Contracts</p>
            {data.contractsSecurity.flatMap((cs) =>
              cs.contracts.map((c, i) => (
                <div key={`${cs.chainId}-${i}`} className="flex items-center gap-2 text-xs">
                  {c.isMalicious
                    ? <ShieldAlert className="size-3 text-red-500 shrink-0" />
                    : <ShieldCheck className="size-3 text-emerald-500 shrink-0" />}
                  <span className="font-mono truncate">{c.address}</span>
                  {c.isOpenSource && <Badge variant="outline" className="text-xs">Open Source</Badge>}
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
