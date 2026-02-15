'use client';

import { ImageIcon, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface NftSecurityCardData {
  nftName: string;
  nftSymbol: string;
  nftErc: string;
  isOpenSource: boolean;
  isMalicious: boolean;
  isTrustList: boolean;
  ownerNumber: number;
  totalItems: number;
  riskLevel: 'safe' | 'warning' | 'danger';
  risks: string[];
}

export function NftSecurityCard({ data }: { data: NftSecurityCardData }) {
  const danger = data.riskLevel === 'danger';
  const warn = data.riskLevel === 'warning';
  const borderColor = danger ? 'border-red-500/30 bg-red-500/5' : warn ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5';
  const badgeColor = danger ? 'border-red-500/30 text-red-500' : warn ? 'border-amber-500/30 text-amber-400' : 'border-emerald-500/30 text-emerald-500';

  return (
    <Card className={borderColor}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ImageIcon className="size-4 text-primary" />
          {data.nftName || 'NFT'} {data.nftSymbol ? `(${data.nftSymbol})` : ''}
          <Badge variant="outline" className={`ml-auto text-xs ${badgeColor}`}>
            {data.riskLevel.toUpperCase()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border px-2.5 py-2 text-center">
            <p className="text-muted-foreground text-xs">Standard</p>
            <p className="font-medium">{data.nftErc || 'Unknown'}</p>
          </div>
          <div className="rounded-lg border px-2.5 py-2 text-center">
            <p className="text-muted-foreground text-xs">Holders</p>
            <p className="font-medium">{data.ownerNumber.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border px-2.5 py-2 text-center">
            <p className="text-muted-foreground text-xs">Items</p>
            <p className="font-medium">{data.totalItems.toLocaleString()}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {data.isOpenSource && <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-500">Open Source</Badge>}
          {data.isTrustList && <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-500">Trusted</Badge>}
          {data.isMalicious && <Badge variant="outline" className="text-xs border-red-500/30 text-red-500">Malicious</Badge>}
        </div>

        {data.risks.length > 0 && (
          <div className="space-y-1">
            {data.risks.map((r, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs">
                <ShieldAlert className="size-3 text-red-500 shrink-0 mt-0.5" />
                <span>{r}</span>
              </div>
            ))}
          </div>
        )}
        {data.risks.length === 0 && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <ShieldCheck className="size-3.5" /> No risks detected
          </div>
        )}
      </CardContent>
    </Card>
  );
}
