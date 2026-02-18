'use client';

import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface TokenSearchCardData {
  results: Array<{
    address: string;
    name: string;
    symbol: string;
    priceUsd: number;
    volume24h: number;
    liquidity: number;
    dexName: string;
    url: string;
  }>;
  message?: string;
}

function formatUsd(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function TokenSearchCard({ data, locale = 'en' }: { data: TokenSearchCardData; locale?: string }) {
  const zh = locale === 'zh';
  const empty = !data.results || data.results.length === 0;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Search className="size-4 text-primary" />
          {zh ? '代币搜索结果' : 'Token Search Results'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-sm text-muted-foreground text-center py-4">{data.message || (zh ? '未找到代币。' : 'No tokens found.')}</p>
        ) : (
          <div className="space-y-1">
            {data.results.map((t, i) => (
              <div key={t.address + i} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-medium truncate">{t.name} <span className="text-muted-foreground">({t.symbol})</span></p>
                  <p className="font-mono text-xs text-muted-foreground truncate">{t.address}</p>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="font-medium tabular-nums">${t.priceUsd.toFixed(4)}</p>
                  <p className="text-xs text-muted-foreground">{zh ? '成交量 ' : 'Vol '}{formatUsd(t.volume24h)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
