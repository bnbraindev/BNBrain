'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ExternalLink, AlertTriangle, Shield, TrendingUp, TrendingDown } from 'lucide-react';
import { sanitizeUrl } from '@/lib/utils/format';

interface RadarToken {
  address: string;
  name: string;
  symbol: string;
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  dexName: string;
  url: string;
  isHoneypot: boolean;
  isMintable: boolean;
  riskCount: number | null;
}

interface RadarData {
  tokens: RadarToken[];
  scannedAt: string;
  error?: string;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toExponential(2)}`;
}

function shortenAddress(addr: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
}

export function TokenRadarCard({ data }: { data: RadarData }) {
  if (data.error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{data.error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data.tokens?.length) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          No new BSC tokens found.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-[#F0B90B]">New Token Radar</span>
            <Badge variant="outline" className="text-xs">BSC</Badge>
          </CardTitle>
          {data.scannedAt && (
            <span className="text-xs text-muted-foreground">
              {new Date(data.scannedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.tokens.map((token) => (
          <div
            key={token.address}
            className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2.5 hover:bg-muted/30 transition-colors"
          >
            {/* Left: token info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{token.symbol}</span>
                <span className="text-xs text-muted-foreground truncate">{token.name}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-mono text-muted-foreground">{shortenAddress(token.address)}</span>
                {token.dexName && (
                  <Badge variant="outline" className="text-xs h-4">{token.dexName}</Badge>
                )}
              </div>
            </div>

            {/* Middle: price and change */}
            <div className="text-right shrink-0">
              <p className="text-sm font-medium">{formatUsd(token.priceUsd)}</p>
              <div className="flex items-center justify-end gap-1">
                {token.priceChange24h >= 0 ? (
                  <TrendingUp className="size-3 text-emerald-500" />
                ) : (
                  <TrendingDown className="size-3 text-red-500" />
                )}
                <span className={`text-xs font-medium ${token.priceChange24h >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {token.priceChange24h >= 0 ? '+' : ''}{token.priceChange24h.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Right: safety indicators */}
            <div className="flex items-center gap-1.5 shrink-0">
              {token.isHoneypot && (
                <Badge variant="destructive" className="text-xs h-5">Honeypot</Badge>
              )}
              {token.isMintable && (
                <span title="Mintable"><AlertTriangle className="size-3.5 text-amber-500" /></span>
              )}
              {token.riskCount !== null && token.riskCount === 0 && !token.isHoneypot && (
                <span title="Low risk"><Shield className="size-3.5 text-emerald-500" /></span>
              )}
              {token.url && (
                <a
                  href={sanitizeUrl(token.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-0.5 hover:text-[#F0B90B] transition-colors"
                  aria-label={`Open market page for ${token.symbol}`}
                >
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        ))}

        <div className="text-xs text-muted-foreground/50 text-center pt-1">
          Liq: {data.tokens.filter(t => t.liquidity >= 1000).length}/{data.tokens.length} tokens with $1K+ liquidity
        </div>
      </CardContent>
    </Card>
  );
}
