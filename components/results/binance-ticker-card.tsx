'use client';

import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface BinanceTickerCardData {
  symbol: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  weightedAvgPrice: number;
  volume: number;
  quoteVolume: number;
  bidPrice: number;
  askPrice: number;
  tradeCount: number;
  openTime: number;
  closeTime: number;
  error?: string;
}

function fmtNum(n: number, decimals = 2): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(decimals);
}

function fmtPrice(n: number): string {
  if (n >= 1) return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(8)}`;
}

export function BinanceTickerCard({ data }: { data: BinanceTickerCardData }) {
  if (data.error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="pt-4">
          <p className="text-sm text-destructive">{data.error}</p>
        </CardContent>
      </Card>
    );
  }

  const isPositive = data.priceChangePercent >= 0;
  const changeColor = isPositive ? 'text-emerald-400' : 'text-red-400';
  const changeBg = isPositive ? 'bg-emerald-500/10' : 'bg-red-500/10';
  const changeSign = isPositive ? '+' : '';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BarChart3 className="size-4 text-primary" />
          Binance 24h Ticker
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
            {data.symbol}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Price + change */}
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold tabular-nums">{fmtPrice(data.lastPrice)}</span>
          <span className={`rounded-md px-2 py-0.5 text-sm font-medium tabular-nums ${changeBg} ${changeColor}`}>
            {changeSign}{data.priceChangePercent.toFixed(2)}%
          </span>
          <span className={`text-sm tabular-nums ${changeColor}`}>
            {changeSign}{fmtPrice(data.priceChange).replace('$', '')}
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <StatCell label="24h High" value={fmtPrice(data.highPrice)} />
          <StatCell label="24h Low" value={fmtPrice(data.lowPrice)} />
          <StatCell label="VWAP" value={fmtPrice(data.weightedAvgPrice)} />
          <StatCell label="Volume" value={fmtNum(data.volume)} />
          <StatCell label="Quote Vol" value={`$${fmtNum(data.quoteVolume)}`} />
          <StatCell label="Trades" value={fmtNum(data.tradeCount, 0)} />
          <StatCell label="Bid" value={fmtPrice(data.bidPrice)} />
          <StatCell label="Ask" value={fmtPrice(data.askPrice)} />
          <StatCell
            label="Spread"
            value={`${((data.askPrice - data.bidPrice) / data.lastPrice * 100).toFixed(4)}%`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-2.5 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}
