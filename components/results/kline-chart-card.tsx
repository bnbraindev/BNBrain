'use client';

import { useEffect, useRef, useState } from 'react';
import { CandlestickChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface KlineCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  tradeCount: number;
}

export interface KlineChartCardData {
  symbol: string;
  interval: string;
  candles: KlineCandle[];
  count: number;
  error?: string;
}

export function KlineChartCard({ data }: { data: KlineChartCardData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<{ remove(): void } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !data.candles?.length) return;

    let disposed = false;
    let ro: ResizeObserver | undefined;

    (async () => {
      const lc = await import('lightweight-charts');
      if (disposed || !containerRef.current) return;

      const chart = lc.createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 300,
        layout: {
          background: { color: 'transparent' },
          textColor: 'rgba(255,255,255,0.5)',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.05)' },
          horzLines: { color: 'rgba(255,255,255,0.05)' },
        },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
        },
        rightPriceScale: {
          borderColor: 'rgba(255,255,255,0.1)',
        },
        timeScale: {
          borderColor: 'rgba(255,255,255,0.1)',
          timeVisible: true,
          secondsVisible: false,
        },
      });
      chartInstanceRef.current = chart;

      // Candlestick series (v5 API: chart.addSeries with series definition)
      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });

      const candleData = data.candles.map((c) => ({
        time: (c.openTime / 1000) as import('lightweight-charts').UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      candleSeries.setData(candleData);

      // Volume histogram
      const volumeSeries = chart.addSeries(lc.HistogramSeries, {
        priceFormat: { type: 'volume' as const },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      const volumeData = data.candles.map((c) => ({
        time: (c.openTime / 1000) as import('lightweight-charts').UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
      }));
      volumeSeries.setData(volumeData);

      chart.timeScale().fitContent();
      setReady(true);

      // Resize observer
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      });
      ro.observe(containerRef.current);
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [data.candles]);

  if (data.error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="pt-4">
          <p className="text-sm text-destructive">{data.error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CandlestickChart className="size-4 text-primary" />
          K-Line Chart
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
            {data.symbol}
          </span>
          <span className="text-xs text-muted-foreground">
            {data.interval} / {data.count} candles
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="w-full rounded-lg"
          style={{ height: 300 }}
        />
        {!ready && data.candles?.length > 0 && (
          <div className="flex h-[300px] items-center justify-center text-xs text-muted-foreground">
            Loading chart...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
