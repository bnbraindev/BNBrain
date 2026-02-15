'use client';

import { FileCode2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface TxDecodeCardData {
  method: string;
  contractName: string;
  isMaliciousContract: boolean;
  isRiskySignature: boolean;
  riskDescription: string;
  signatureDetail: string;
  verdict: string;
  params?: Array<{ name: string; type: string; value: unknown }>;
}

export function TxDecodeCard({ data }: { data: TxDecodeCardData }) {
  const risky = data.isRiskySignature || data.isMaliciousContract;
  return (
    <Card className={risky ? 'border-red-500/30 bg-red-500/5' : 'border-border'}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileCode2 className="size-4 text-primary" />
          Transaction Decode
          {risky && <Badge variant="outline" className="ml-auto text-xs border-red-500/30 text-red-500">Risky</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border px-2.5 py-2">
            <p className="text-muted-foreground text-xs">Method</p>
            <p className="font-mono font-medium">{data.method || 'Unknown'}</p>
          </div>
          <div className="rounded-lg border px-2.5 py-2">
            <p className="text-muted-foreground text-xs">Contract</p>
            <p className="font-medium truncate">{data.contractName || 'Unknown'}</p>
          </div>
        </div>

        <div className="flex items-start gap-2 text-sm">
          {risky
            ? <ShieldAlert className="size-4 text-red-500 shrink-0 mt-0.5" />
            : <ShieldCheck className="size-4 text-emerald-500 shrink-0 mt-0.5" />}
          <p>{data.verdict}</p>
        </div>

        {data.riskDescription && risky && (
          <p className="text-xs text-red-500 bg-red-500/5 rounded px-2 py-1.5">{data.riskDescription}</p>
        )}

        {data.params && data.params.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium">Parameters</p>
            {data.params.slice(0, 8).map((p, i) => (
              <div key={i} className="flex items-baseline gap-2 text-xs">
                <span className="text-muted-foreground">{p.name}</span>
                <span className="text-xs text-muted-foreground/70">({p.type})</span>
                <span className="font-mono truncate text-xs">{String(p.value).slice(0, 42)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
