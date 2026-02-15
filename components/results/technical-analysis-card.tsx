'use client';

import { Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MACDData {
  MACD: number;
  signal: number;
  histogram: number;
}

interface BollingerBandsData {
  upper: number;
  middle: number;
  lower: number;
}

interface Indicators {
  rsi: number | null;
  macd: MACDData | null;
  ma20: number | null;
  ma50: number | null;
  ema12: number | null;
  ema26: number | null;
  bollingerBands: BollingerBandsData | null;
}

export interface TechnicalAnalysisCardData {
  symbol: string;
  interval: string;
  currentPrice: number;
  indicators: Indicators;
  signals: string[];
  overallSignal: 'bullish' | 'bearish' | 'neutral';
  error?: string;
}

function fmtPrice(n: number): string {
  if (n >= 1) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(8);
}

const SIGNAL_STYLES = {
  bullish: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Bullish' },
  bearish: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Bearish' },
  neutral: { bg: 'bg-zinc-500/15', text: 'text-zinc-400', label: 'Neutral' },
} as const;

export function TechnicalAnalysisCard({ data }: { data: TechnicalAnalysisCardData }) {
  if (data.error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="pt-4">
          <p className="text-sm text-destructive">{data.error}</p>
        </CardContent>
      </Card>
    );
  }

  const signalStyle = SIGNAL_STYLES[data.overallSignal] ?? SIGNAL_STYLES.neutral;
  const { indicators } = data;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="size-4 text-primary" />
          Technical Analysis
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
            {data.symbol}
          </span>
          <span className="text-xs text-muted-foreground">{data.interval}</span>
          <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${signalStyle.bg} ${signalStyle.text}`}>
            {signalStyle.label}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current price */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Current Price</p>
          <p className="text-xl font-bold tabular-nums">${fmtPrice(data.currentPrice)}</p>
        </div>

        {/* Indicators grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* RSI */}
          {indicators.rsi !== null && (
            <IndicatorCell
              label="RSI (14)"
              value={indicators.rsi.toFixed(2)}
              status={indicators.rsi > 70 ? 'overbought' : indicators.rsi < 30 ? 'oversold' : 'normal'}
            />
          )}

          {/* MACD */}
          {indicators.macd && (
            <div className="rounded-lg border px-3 py-2">
              <p className="text-xs text-muted-foreground mb-1">MACD</p>
              <div className="space-y-0.5 text-xs tabular-nums">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">MACD</span>
                  <span className="font-medium">{indicators.macd.MACD}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Signal</span>
                  <span className="font-medium">{indicators.macd.signal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Histogram</span>
                  <span className={`font-medium ${indicators.macd.histogram >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {indicators.macd.histogram}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Moving Averages */}
          {(indicators.ma20 !== null || indicators.ma50 !== null) && (
            <div className="rounded-lg border px-3 py-2">
              <p className="text-xs text-muted-foreground mb-1">Moving Averages</p>
              <div className="space-y-0.5 text-xs tabular-nums">
                {indicators.ma20 !== null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">MA20</span>
                    <span className="font-medium">{fmtPrice(indicators.ma20)}</span>
                  </div>
                )}
                {indicators.ma50 !== null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">MA50</span>
                    <span className="font-medium">{fmtPrice(indicators.ma50)}</span>
                  </div>
                )}
                {indicators.ma20 !== null && indicators.ma50 !== null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cross</span>
                    <span className={`font-medium ${indicators.ma20 > indicators.ma50 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {indicators.ma20 > indicators.ma50 ? 'Golden' : 'Death'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bollinger Bands */}
          {indicators.bollingerBands && (
            <div className="rounded-lg border px-3 py-2">
              <p className="text-xs text-muted-foreground mb-1">Bollinger Bands</p>
              <div className="space-y-0.5 text-xs tabular-nums">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Upper</span>
                  <span className="font-medium">{fmtPrice(indicators.bollingerBands.upper)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Middle</span>
                  <span className="font-medium">{fmtPrice(indicators.bollingerBands.middle)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lower</span>
                  <span className="font-medium">{fmtPrice(indicators.bollingerBands.lower)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Signals */}
        {data.signals.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Signals</p>
            {data.signals.map((signal, i) => {
              const isBullish = signal.includes('bullish');
              const isBearish = signal.includes('bearish');
              const dotColor = isBullish ? 'bg-emerald-400' : isBearish ? 'bg-red-400' : 'bg-zinc-400';
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`size-1.5 shrink-0 rounded-full ${dotColor}`} />
                  <span className="text-muted-foreground">{signal}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IndicatorCell({ label, value, status }: { label: string; value: string; status: 'overbought' | 'oversold' | 'normal' }) {
  const statusStyles = {
    overbought: { border: 'border-red-500/30', bg: 'bg-red-500/5', text: 'text-red-400', badge: 'Overbought' },
    oversold: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', text: 'text-emerald-400', badge: 'Oversold' },
    normal: { border: 'border-border', bg: '', text: 'text-foreground', badge: 'Normal' },
  };
  const s = statusStyles[status];

  return (
    <div className={`rounded-lg border px-3 py-2 ${s.border} ${s.bg}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className={`text-lg font-bold tabular-nums ${s.text}`}>{value}</span>
        <span className={`text-xs ${s.text}`}>{s.badge}</span>
      </div>
    </div>
  );
}
