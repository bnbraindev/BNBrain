'use client';

import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const BNB_YELLOW = '#F0B90B';

function shortenAddress(addr: string) {
  if (!addr) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

export interface AddressAnalysisCardProps {
  data: {
    address: string;
    recentTransactionCount: number;
    recentTransactions: Array<{
      hash: string;
      from: string;
      to: string;
      value: string;
      method: string;
      timestamp: string;
    }>;
    summary: string;
    error?: string;
  };
  locale?: string;
}

export function AddressAnalysisCard({ data, locale = 'en' }: AddressAnalysisCardProps) {
  const zh = locale === 'zh';

  if (data.error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{data.error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Search className="size-5" style={{ color: BNB_YELLOW }} />
          {zh ? '地址分析' : 'Address Analysis'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1">{zh ? '地址' : 'Address'}</p>
          <p className="font-mono text-sm truncate">{data.address}</p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary">{data.recentTransactionCount} {zh ? '笔近期交易' : 'recent txs'}</Badge>
          <p className="text-sm text-muted-foreground">{data.summary}</p>
        </div>

        {data.recentTransactions.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{zh ? '近期交易' : 'Recent Transactions'}</p>
            <div className="rounded-lg border divide-y max-h-64 overflow-y-auto">
              {data.recentTransactions.map((t, i) => (
                <div key={t.hash + i} className="px-3 py-2 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-xs">
                      {t.method}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(t.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
                    {shortenAddress(t.from)} → {shortenAddress(t.to)}
                    {Number(t.value) > 0 && (
                      <span className="ml-auto font-medium text-foreground">
                        {Number(t.value).toFixed(4)} BNB
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
