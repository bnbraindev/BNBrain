'use client';

import { useRef } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';
import { ShareButton } from './share-button';

const RISK_COLORS: Record<string, string> = {
  conservative: 'text-emerald-500',
  moderate: 'text-blue-500',
  aggressive: 'text-amber-500',
  degen: 'text-red-500',
};

const RISK_BG: Record<string, string> = {
  conservative: 'bg-emerald-500/10 border-emerald-500/30',
  moderate: 'bg-blue-500/10 border-blue-500/30',
  aggressive: 'bg-amber-500/10 border-amber-500/30',
  degen: 'bg-red-500/10 border-red-500/30',
};

interface PersonaData {
  address: string;
  persona: string;
  emoji: string;
  riskLevel: string;
  tags: string[];
  traits: string[];
  stats: {
    bnbBalance: string;
    transactionCount: number;
    approvalCount: number;
    unlimitedApprovals: number;
    dexInteractions: number;
  };
  error?: string;
}

export function PersonaCard({ data, locale = 'en' }: { data: PersonaData; locale?: string }) {
  const zh = locale === 'zh';
  const cardRef = useRef<HTMLDivElement>(null);

  if (data.error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">{zh ? '分析失败' : 'Analysis Failed'}</p>
              <p className="text-sm text-muted-foreground mt-1">{data.error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const riskColor = RISK_COLORS[data.riskLevel] ?? 'text-blue-500';
  const riskBg = RISK_BG[data.riskLevel] ?? 'bg-blue-500/10 border-blue-500/30';
  const shortAddr = data.address ? `${data.address.slice(0, 6)}…${data.address.slice(-4)}` : '';

  return (
    <Card ref={cardRef}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{zh ? '钱包画像' : 'Wallet Persona'}</CardTitle>
          <ShareButton
            cardRef={cardRef}
            shareText={`${data.emoji} ${data.persona}\n\nWallet: ${shortAddr}\nTags: ${data.tags?.join(', ')}\nTraits: ${data.traits?.join(', ')}\n\nPowered by BNBrain`}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Persona hero */}
        <div className={`rounded-xl border p-4 text-center ${riskBg}`}>
          <span className="text-4xl mb-2 block">{data.emoji}</span>
          <p className={`text-xl font-bold ${riskColor}`}>{data.persona}</p>
          <p className="text-xs text-muted-foreground font-mono mt-1">{shortAddr}</p>
        </div>

        {/* Tags */}
        {data.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Traits */}
        {data.traits?.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{zh ? '性格特征' : 'Personality Traits'}</p>
            <ul className="space-y-1">
              {data.traits.map((trait, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-muted-foreground mt-1">•</span>
                  <span>{trait}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Stats */}
        {data.stats && (
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: zh ? 'BNB 余额' : 'BNB Balance', value: data.stats.bnbBalance },
              { label: zh ? '交易数' : 'Transactions', value: String(data.stats.transactionCount) },
              { label: zh ? '授权数' : 'Approvals', value: String(data.stats.approvalCount) },
              { label: zh ? 'DEX 交易' : 'DEX Trades', value: String(data.stats.dexInteractions) },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg bg-muted/30 border border-border/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-sm font-semibold">{stat.value}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
