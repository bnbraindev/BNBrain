'use client';

import { ArrowDownLeft, ArrowUpRight, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface TransferHistoryCardData {
  totalFound: number;
  transfers: Array<{
    hash: string;
    from: string;
    to: string;
    tokenName: string;
    tokenSymbol: string;
    amount: string;
    decimals: string;
    contractAddress: string;
    timestamp: string | null;
    direction: 'in' | 'out';
  }>;
  message?: string;
}

function shortenAddr(addr: string) {
  if (!addr || addr.length <= 14) return addr || '';
  return addr.slice(0, 8) + '…' + addr.slice(-4);
}

function formatAmount(raw: string, decimals: string): string {
  const dec = Number(decimals) || 18;
  const val = Number(raw) / 10 ** dec;
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  return val.toFixed(4);
}

function formatTime(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function TransferHistoryCard({ data }: { data: TransferHistoryCardData }) {
  const empty = !data.transfers || data.transfers.length === 0;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="size-4 text-primary" />
          Token Transfers
          {data.totalFound > 0 && (
            <Badge variant="outline" className="ml-auto text-xs">{data.totalFound} found</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-sm text-muted-foreground text-center py-4">{data.message || 'No transfers found.'}</p>
        ) : (
          <div className="space-y-1">
            {data.transfers.map((t, i) => (
              <div key={t.hash + i} className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs">
                {t.direction === 'in'
                  ? <ArrowDownLeft className="size-3.5 text-emerald-500 shrink-0" />
                  : <ArrowUpRight className="size-3.5 text-red-500 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{formatAmount(t.amount, t.decimals)} {t.tokenSymbol}</span>
                    <span className="text-muted-foreground text-xs">
                      {t.direction === 'in' ? 'from' : 'to'} {shortenAddr(t.direction === 'in' ? t.from : t.to)}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground truncate">{shortenAddr(t.hash)}</p>
                </div>
                {t.timestamp && (
                  <span className="text-xs text-muted-foreground shrink-0">{formatTime(t.timestamp)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
