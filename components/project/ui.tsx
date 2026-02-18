'use client';

import { useState, useEffect, useRef, useCallback, createContext, useContext, type ReactNode } from 'react';
import {
  Check, Copy, Rocket, FileCode, BarChart3, FolderGit2,
  Sparkles, CheckCircle, XCircle, AlertTriangle, Zap,
} from 'lucide-react';
import type { ProjectType, ProjectStatus } from './types';

// ============================================================================
// Toast System (reusable context)
// ============================================================================

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: 'info' | 'success' | 'error' | 'warning';
}

const ToastCtx = createContext<{ push: (t: Omit<Toast, 'id'>) => void }>({ push: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((p) => [...p, { ...t, id }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-message-in flex items-start gap-2.5 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md ${
              t.variant === 'success' ? 'border-emerald-500/30 bg-emerald-950/80 text-emerald-300' :
              t.variant === 'error' ? 'border-red-500/30 bg-red-950/80 text-red-300' :
              t.variant === 'warning' ? 'border-amber-500/30 bg-amber-950/80 text-amber-300' :
              'border-blue-500/30 bg-blue-950/80 text-blue-300'
            }`}
          >
            {t.variant === 'success' ? <CheckCircle className="mt-0.5 size-4 shrink-0" /> :
             t.variant === 'error' ? <XCircle className="mt-0.5 size-4 shrink-0" /> :
             t.variant === 'warning' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> :
             <Zap className="mt-0.5 size-4 shrink-0" />}
            <div className="min-w-0">
              <div className="text-sm font-medium">{t.title}</div>
              {t.description && <div className="mt-0.5 text-xs opacity-80">{t.description}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ============================================================================
// Project Type Metadata
// ============================================================================

export const PROJECT_TYPE_META: Record<ProjectType, {
  label: string;
  icon: typeof Rocket;
  color: string;
  bgColor: string;
  description: string;
}> = {
  token: {
    label: 'Token',
    icon: Rocket,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
    description: 'Token deploy, verify & manage',
  },
  nft: {
    label: 'NFT',
    icon: Sparkles,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/20',
    description: 'NFT collection or marketplace',
  },
  defi: {
    label: 'DeFi',
    icon: BarChart3,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
    description: 'DeFi strategy & monitoring',
  },
  custom: {
    label: 'Custom',
    icon: FolderGit2,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/10 border-muted/20',
    description: 'Blank workspace',
  },
};

export const STATUS_META: Record<ProjectStatus, {
  label: string;
  color: string;
  dotColor: string;
}> = {
  draft: { label: 'Draft', color: 'text-muted-foreground bg-muted/20', dotColor: 'bg-muted-foreground' },
  active: { label: 'Active', color: 'text-emerald-400 bg-emerald-500/10', dotColor: 'bg-emerald-400' },
  archived: { label: 'Archived', color: 'text-amber-400 bg-amber-500/10', dotColor: 'bg-amber-400' },
};

// ============================================================================
// Badge Components
// ============================================================================

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.color}`}>
      <span className={`size-1.5 rounded-full ${meta.dotColor}`} />
      {meta.label}
    </span>
  );
}

export function TypeBadge({ type }: { type: ProjectType }) {
  const meta = PROJECT_TYPE_META[type];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.bgColor} ${meta.color}`}>
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

export function ChainBadge({ chainId }: { chainId: number }) {
  const label = chainId === 56 ? 'BSC' : chainId === 204 ? 'opBNB' : chainId === 97 ? 'BSC Testnet' : `Chain ${chainId}`;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
      {label}
    </span>
  );
}

export function UpdatedByBadge({ by }: { by: 'ai' | 'user' | 'system' }) {
  const meta = {
    ai: { label: 'AI', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
    user: { label: 'User', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    system: { label: 'System', color: 'text-muted-foreground bg-muted/10 border-muted/20' },
  }[by];
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${meta.color}`}>
      {meta.label}
    </span>
  );
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
      <CheckCircle className="size-3" /> Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-muted/20 bg-muted/10 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      Unverified
    </span>
  );
}

// ============================================================================
// Utility Components
// ============================================================================

export function CopyBtn({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className={`rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground ${className ?? ''}`}
      title="Copy"
    >
      {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
    </button>
  );
}

export function ShortUrl({ shortId, onClick }: { shortId: string; onClick?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px]">
      <button
        onClick={onClick}
        className="font-mono text-primary/80 underline decoration-primary/30 underline-offset-2 transition-colors hover:text-primary hover:decoration-primary/60"
      >
        /x/{shortId}
      </button>
      <CopyBtn text={`/x/${shortId}`} />
    </span>
  );
}

export function TruncatedAddress({ address, chars = 6 }: { address: string; chars?: number }) {
  const truncated = `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs">
      <span className="text-foreground/80">{truncated}</span>
      <CopyBtn text={address} />
    </span>
  );
}

export function TimeAgo({ date }: { date: string }) {
  const d = new Date(date);
  const now = new Date('2026-02-18T12:00:00Z');
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  const label = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days}d ago`;
  return <span className="text-[10px] text-muted-foreground">{label}</span>;
}

// ============================================================================
// Streaming Text
// ============================================================================

export function StreamingText({ text, speed = 12, onDone }: { text: string; speed?: number; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState('');
  const idx = useRef(0);
  useEffect(() => {
    idx.current = 0;
    setDisplayed('');
    const iv = setInterval(() => {
      const chunk = Math.floor(Math.random() * 3) + 1;
      idx.current = Math.min(idx.current + chunk, text.length);
      setDisplayed(text.slice(0, idx.current));
      if (idx.current >= text.length) {
        clearInterval(iv);
        onDone?.();
      }
    }, speed);
    return () => clearInterval(iv);
  }, [text, speed, onDone]);

  return (
    <span>
      {displayed}
      {displayed.length < text.length && <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-primary" />}
    </span>
  );
}
