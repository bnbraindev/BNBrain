'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Shield,
  Scan,
  Wallet,
  HeartPulse,
  Zap,
  ArrowLeftRight,
  ShieldAlert,
  Globe,
  UserCircle,
  Search,
  Fuel,
  FileCode,
  Image,
  FileSearch,
  Droplets,
  Rocket,
  Activity,
  RefreshCw,
  Send,
  History,
  DollarSign,
  BarChart3,
  CandlestickChart,
  TrendingUp,
  ShieldCheck,
  Stamp,
  CheckCircle,
  Code2,
  Layers,
  type LucideIcon,
} from 'lucide-react';

import { QUICK_ACTION_KEYS } from './constants';
import type { QuickAction } from './types';

const VISIBLE_COUNT = 4;

interface EmptyStateProps {
  t: (key: string) => string;
  isStreaming: boolean;
  quickActions: QuickAction[];
  onQuickAction: (prompt: string) => void;
}

/** Metadata for each quick-action card, keyed by translation key. */
const ACTION_META: Record<
  string,
  { icon: LucideIcon; color: string; bgColor: string; descKey: string }
> = {
  // Security
  'quick.checkToken': {
    icon: Scan,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/15',
    descKey: 'quick.checkToken.desc',
  },
  'quick.approvals': {
    icon: ShieldAlert,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/15',
    descKey: 'quick.approvals.desc',
  },
  'quick.approvalRisk': {
    icon: ShieldCheck,
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/15',
    descKey: 'quick.approvalRisk.desc',
  },
  'quick.phishing': {
    icon: Globe,
    color: 'text-red-500',
    bgColor: 'bg-red-500/15',
    descKey: 'quick.phishing.desc',
  },
  'quick.nft': {
    icon: Image,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/15',
    descKey: 'quick.nft.desc',
  },
  'quick.dappSecurity': {
    icon: Shield,
    color: 'text-red-400',
    bgColor: 'bg-red-400/15',
    descKey: 'quick.dappSecurity.desc',
  },
  // Wallet
  'quick.balance': {
    icon: Wallet,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/15',
    descKey: 'quick.balance.desc',
  },
  'quick.health': {
    icon: HeartPulse,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/15',
    descKey: 'quick.health.desc',
  },
  'quick.persona': {
    icon: UserCircle,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/15',
    descKey: 'quick.persona.desc',
  },
  'quick.transfer': {
    icon: Send,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/15',
    descKey: 'quick.transfer.desc',
  },
  'quick.transferHistory': {
    icon: History,
    color: 'text-slate-500',
    bgColor: 'bg-slate-500/15',
    descKey: 'quick.transferHistory.desc',
  },
  // Trading / DeFi
  'quick.swap': {
    icon: ArrowLeftRight,
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/15',
    descKey: 'quick.swap.desc',
  },
  'quick.liquidity': {
    icon: Droplets,
    color: 'text-sky-500',
    bgColor: 'bg-sky-500/15',
    descKey: 'quick.liquidity.desc',
  },
  'quick.pairReserves': {
    icon: Layers,
    color: 'text-sky-400',
    bgColor: 'bg-sky-400/15',
    descKey: 'quick.pairReserves.desc',
  },
  // Analysis
  'quick.address': {
    icon: Search,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/15',
    descKey: 'quick.address.desc',
  },
  'quick.txDecode': {
    icon: FileCode,
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/15',
    descKey: 'quick.txDecode.desc',
  },
  'quick.simulate': {
    icon: Activity,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-400/15',
    descKey: 'quick.simulate.desc',
  },
  'quick.tokenSearch': {
    icon: Search,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/15',
    descKey: 'quick.tokenSearch.desc',
  },
  'quick.tokenPrice': {
    icon: DollarSign,
    color: 'text-green-500',
    bgColor: 'bg-green-500/15',
    descKey: 'quick.tokenPrice.desc',
  },
  // Contract
  'quick.contract': {
    icon: FileSearch,
    color: 'text-lime-500',
    bgColor: 'bg-lime-500/15',
    descKey: 'quick.contract.desc',
  },
  'quick.deployToken': {
    icon: Rocket,
    color: 'text-fuchsia-500',
    bgColor: 'bg-fuchsia-500/15',
    descKey: 'quick.deployToken.desc',
  },
  'quick.contractCall': {
    icon: Code2,
    color: 'text-lime-400',
    bgColor: 'bg-lime-400/15',
    descKey: 'quick.contractCall.desc',
  },
  // On-chain proof
  'quick.storeProof': {
    icon: Stamp,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/15',
    descKey: 'quick.storeProof.desc',
  },
  'quick.verifyProof': {
    icon: CheckCircle,
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/15',
    descKey: 'quick.verifyProof.desc',
  },
  // Discovery & utility
  'quick.newTokens': {
    icon: Zap,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/15',
    descKey: 'quick.newTokens.desc',
  },
  'quick.gas': {
    icon: Fuel,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/15',
    descKey: 'quick.gas.desc',
  },
  // CEX data
  'quick.binancePrice': {
    icon: BarChart3,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400/15',
    descKey: 'quick.binancePrice.desc',
  },
  'quick.klineChart': {
    icon: CandlestickChart,
    color: 'text-orange-300',
    bgColor: 'bg-orange-300/15',
    descKey: 'quick.klineChart.desc',
  },
  'quick.technicalAnalysis': {
    icon: TrendingUp,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-400/15',
    descKey: 'quick.technicalAnalysis.desc',
  },
};

/** Pick `count` random unique indices from [0, total). */
function pickRandom(total: number, count: number): number[] {
  const indices = Array.from({ length: total }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count);
}

export function EmptyState({
  t,
  isStreaming,
  quickActions,
  onQuickAction,
}: EmptyStateProps) {
  const total = quickActions.length;
  const count = Math.min(VISIBLE_COUNT, total);

  const [visibleIndices, setVisibleIndices] = useState<number[]>(() =>
    pickRandom(total, count),
  );

  const shuffle = useCallback(() => {
    setVisibleIndices((prev) => {
      // Try to avoid showing the same set
      const prevSet = new Set(prev);
      for (let attempt = 0; attempt < 5; attempt++) {
        const next = pickRandom(total, count);
        if (next.some((i) => !prevSet.has(i))) return next;
      }
      return pickRandom(total, count);
    });
  }, [total, count]);

  const resolvedVisibleIndices = useMemo(() => {
    const valid = visibleIndices.filter((i) => i >= 0 && i < total);
    if (valid.length >= count) {
      return valid.slice(0, count);
    }
    const next = [...valid];
    const existing = new Set(valid);
    for (const idx of pickRandom(total, total)) {
      if (existing.has(idx)) continue;
      next.push(idx);
      if (next.length >= count) break;
    }
    return next;
  }, [visibleIndices, total, count]);

  const visibleActions = useMemo(
    () => resolvedVisibleIndices.map((i) => ({ action: quickActions[i], key: QUICK_ACTION_KEYS[i] })),
    [resolvedVisibleIndices, quickActions],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-[56vh] w-full max-w-2xl flex-col items-center justify-center rounded-2xl border border-border bg-card px-4 py-8 text-center shadow-[0_24px_44px_-34px_rgba(0,0,0,0.6)] sm:min-h-[62vh] sm:rounded-3xl">
        {/* Shield hero with animated glow + scan line */}
        <div className="animate-hero-entrance animate-shield-glow relative mb-5 flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-ring/30 bg-primary/10 shadow-[0_0_0_1px_rgba(0,0,0,0.12)]">
          <Shield className="relative z-10 h-9 w-9 text-primary" />
          <div className="animate-scan-line pointer-events-none absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        </div>

        {/* Title / Subtitle / Tagline */}
        <h1 className="animate-title-slide-up mb-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t('app.title')}
        </h1>
        <p className="animate-title-slide-up mb-1 max-w-md text-sm text-muted-foreground [animation-delay:0.25s] sm:text-base">
          {t('app.subtitle')}
        </p>
        <p className="animate-title-slide-up mb-8 max-w-sm text-xs text-muted-foreground/60 [animation-delay:0.35s]">
          {t('app.tagline')}
        </p>

        {/* Quick action cards */}
        <div className="animate-stagger-in grid w-full max-w-lg grid-cols-2 gap-3">
          {visibleActions.map(({ action, key }) => {
            if (!action || !key) return null;
            const meta = ACTION_META[key];
            if (!meta) return null;

            const Icon = meta.icon;

            return (
              <button
                key={key}
                type="button"
                className="card-hover-lift flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-[0_8px_22px_-20px_rgba(0,0,0,0.45)] transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onQuickAction(action.prompt)}
                disabled={isStreaming}
              >
                <div
                  className={`flex size-9 shrink-0 items-center justify-center rounded-full ${meta.bgColor}`}
                >
                  <Icon className={`size-4 ${meta.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight text-foreground">
                    {action.label}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {t(meta.descKey)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Shuffle button */}
        {total > VISIBLE_COUNT && (
          <button
            type="button"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card disabled:hover:text-muted-foreground"
            onClick={shuffle}
            title={t('empty.shuffleHint')}
            disabled={isStreaming}
            aria-disabled={isStreaming}
          >
            <RefreshCw className="size-3" />
            {t('empty.shuffle')}
          </button>
        )}

        {/* Bottom hints */}
        <p className="mt-8 text-xs text-muted-foreground/40">
          {t('empty.poweredBy')}
        </p>
      </div>
    </div>
  );
}
