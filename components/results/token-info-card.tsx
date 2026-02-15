'use client';

import { TrendingUp, TrendingDown, BarChart3, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/utils/format';

const BNB_YELLOW = '#F0B90B';

function fmt(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export interface TokenInfoCardProps {
  data: {
    address: string;
    name: string;
    symbol: string;
    priceUsd: number;
    priceChange24h: number;
    volume24h: number;
    liquidity: number;
    fdv: number;
    pairAddress: string;
    dexName: string;
    chainId: string;
    url: string;
    error?: string;
  };
}

export function TokenInfoCard({ data }: TokenInfoCardProps) {
  if (data.error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{data.error}</p>
        </CardContent>
      </Card>
    );
  }

  const isUp = data.priceChange24h >= 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5" style={{ color: BNB_YELLOW }} />
            {data.name}
            <Badge variant="secondary" className="text-xs font-mono">
              {data.symbol}
            </Badge>
          </CardTitle>
          {data.url && (
            <a
              href={sanitizeUrl(data.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
            >
              {data.dexName} <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold">
            ${data.priceUsd < 0.01 ? data.priceUsd.toPrecision(4) : data.priceUsd.toFixed(2)}
          </span>
          <span
            className={cn(
              'flex items-center gap-1 text-sm font-medium',
              isUp ? 'text-emerald-500' : 'text-red-500'
            )}
          >
            {isUp ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
            {isUp ? '+' : ''}{data.priceChange24h.toFixed(2)}%
          </span>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">24h Volume</p>
            <p className="font-semibold">{fmt(data.volume24h)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Liquidity</p>
            <p className="font-semibold">{fmt(data.liquidity)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">FDV</p>
            <p className="font-semibold">{fmt(data.fdv)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Chain</p>
            <p className="font-semibold uppercase">{data.chainId}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
