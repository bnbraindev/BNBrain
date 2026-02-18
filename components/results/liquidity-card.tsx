'use client';

import { Droplets } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface LiquidityCardData {
  pairAddress?: string;
  chainId?: string | number;
  dexId?: string;
  baseToken?: { address: string; name: string; symbol: string };
  quoteToken?: { address: string; name: string; symbol: string };
  priceUsd?: number;
  liquidity?: number;
  liquidityFormatted?: string;
  volume24h?: number;
  volume24hFormatted?: string;
  url?: string;
  warning?: string | null;
  // For checkPairReserves
  token0?: string;
  token1?: string;
  reserve0?: string;
  reserve1?: string;
}

function formatUsd(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function shortenAddr(addr: string) {
  if (!addr || addr.length <= 14) return addr || '';
  return addr.slice(0, 8) + '…' + addr.slice(-4);
}

export function LiquidityCard({ data, locale = 'en' }: { data: LiquidityCardData; locale?: string }) {
  const zh = locale === 'zh';
  const isReservesMode = Boolean(data.reserve0 && data.reserve1);
  const lowLiquidity = typeof data.liquidity === 'number' && data.liquidity < 10000;

  return (
    <Card className={data.warning ? 'border-amber-500/30 bg-amber-500/5' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Droplets className="size-4 text-primary" />
          {isReservesMode ? (zh ? '池子储备' : 'Pool Reserves') : (zh ? '交易对流动性' : 'Pair Liquidity')}
          {data.baseToken && data.quoteToken && (
            <span className="text-muted-foreground font-normal">
              {data.baseToken.symbol}/{data.quoteToken.symbol}
            </span>
          )}
          {lowLiquidity && (
            <Badge variant="outline" className="ml-auto text-xs border-amber-500/30 text-amber-400">{zh ? '低流动性' : 'Low Liquidity'}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isReservesMode && (
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border px-2 py-2.5">
              <p className="text-muted-foreground text-xs">{zh ? '价格' : 'Price'}</p>
              <p className="font-bold">${data.priceUsd?.toFixed(4) ?? '—'}</p>
            </div>
            <div className="rounded-lg border px-2 py-2.5">
              <p className="text-muted-foreground text-xs">{zh ? '流动性' : 'Liquidity'}</p>
              <p className="font-bold">{data.liquidityFormatted ?? (typeof data.liquidity === 'number' ? formatUsd(data.liquidity) : '—')}</p>
            </div>
            <div className="rounded-lg border px-2 py-2.5">
              <p className="text-muted-foreground text-xs">{zh ? '24h 成交量' : 'Volume 24h'}</p>
              <p className="font-bold">{data.volume24hFormatted ?? (typeof data.volume24h === 'number' ? formatUsd(data.volume24h) : '—')}</p>
            </div>
          </div>
        )}

        {isReservesMode && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border px-2.5 py-2">
              <p className="text-muted-foreground text-xs">{zh ? '代币 0' : 'Token 0'}</p>
              <p className="font-mono text-xs truncate">{shortenAddr(data.token0 ?? '')}</p>
              <p className="font-bold mt-0.5">{BigInt(data.reserve0 ?? '0').toLocaleString()}</p>
            </div>
            <div className="rounded-lg border px-2.5 py-2">
              <p className="text-muted-foreground text-xs">{zh ? '代币 1' : 'Token 1'}</p>
              <p className="font-mono text-xs truncate">{shortenAddr(data.token1 ?? '')}</p>
              <p className="font-bold mt-0.5">{BigInt(data.reserve1 ?? '0').toLocaleString()}</p>
            </div>
          </div>
        )}

        {data.warning && (
          <p className="text-xs text-amber-400 bg-amber-500/10 rounded px-2 py-1.5">{data.warning}</p>
        )}

        {data.dexId && (
          <p className="text-xs text-muted-foreground">{zh ? 'DEX: ' : 'DEX: '}{data.dexId}</p>
        )}
        {data.pairAddress && (
          <p className="font-mono text-xs text-muted-foreground break-all">{data.pairAddress}</p>
        )}
      </CardContent>
    </Card>
  );
}
