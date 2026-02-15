'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  MinusCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/utils/format';
import { useChatStore } from '@/lib/stores/chat-store';

// ── Types ────────────────────────────────────────────────────

interface StepResult {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  summary?: string | null;
  durationMs?: number;
}

interface DeepAnalysisData {
  reportId?: string;
  reportUrl?: string;
  tokenName?: string | null;
  tokenSymbol?: string | null;
  tokenAddress?: string;
  chainId?: number;
  riskScore?: number | null;
  summary?: string;
  steps?: StepResult[];
  durationMs?: number;
  error?: string;
}

interface ProgressResponse {
  active: boolean;
  chatId?: string;
  tokenAddress?: string;
  tokenName?: string | null;
  tokenSymbol?: string | null;
  phase?: string;
  steps?: StepResult[];
  startedAt?: number;
  updatedAt?: number;
  finished?: boolean;
  error?: string;
  result?: {
    reportId: string;
    reportUrl: string;
    riskScore: number | null;
    summary: string;
    durationMs: number;
  };
}

// ── Utilities ────────────────────────────────────────────────

function shortenAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getRiskColor(score: number | null | undefined): string {
  if (score == null) return 'text-muted-foreground';
  if (score <= 30) return 'text-emerald-500';
  if (score <= 60) return 'text-amber-500';
  return 'text-red-500';
}

function getRiskBg(score: number | null | undefined): string {
  if (score == null) return 'bg-muted-foreground/20';
  if (score <= 30) return 'bg-emerald-500/20';
  if (score <= 60) return 'bg-amber-500/20';
  return 'bg-red-500/20';
}

function getRiskLabel(score: number | null | undefined, locale: string): string {
  if (score == null) return locale === 'zh' ? '未知' : 'Unknown';
  if (score <= 30) return locale === 'zh' ? '低风险' : 'Low Risk';
  if (score <= 60) return locale === 'zh' ? '中风险' : 'Medium Risk';
  return locale === 'zh' ? '高风险' : 'High Risk';
}

function formatElapsed(ms: number): string {
  const sec = Math.round(ms / 1000);
  return `${sec}s`;
}

// ── Props ────────────────────────────────────────────────────

export interface DeepAnalysisCardProps {
  data?: DeepAnalysisData;
  isLoading?: boolean;
  locale?: string;
  input?: { tokenAddress?: string };
  /** Conversation ID for polling real-time progress from backend */
  chatId?: string;
}

// ── Main component ──────────────────────────────────────────

export function DeepAnalysisCard({
  data,
  isLoading = false,
  locale = 'en',
  input,
  chatId,
}: DeepAnalysisCardProps) {
  // Error state from tool output
  if (data?.error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="text-sm font-medium">
            {locale === 'zh' ? '深度分析失败' : 'Deep Analysis Failed'}
          </span>
        </div>
        <p className="mt-2 text-xs text-red-400/80">{data.error}</p>
      </div>
    );
  }

  // Complete state — tool returned reportId
  if (!isLoading && data?.reportId) {
    return <CompleteCard data={data} locale={locale} />;
  }

  // Historical incomplete state — tool output is not available and NOT actively streaming.
  // This happens on page refresh for cancelled/interrupted runs. Show interrupted immediately.
  if (!isLoading && !data?.reportId) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-center gap-2 text-amber-400">
          <MinusCircle className="size-4 shrink-0" />
          <span className="text-sm font-medium">
            {locale === 'zh' ? '深度分析未完成' : 'Deep Analysis Incomplete'}
          </span>
        </div>
        <p className="mt-2 text-xs text-amber-400/70">
          {locale === 'zh'
            ? '本次深度分析未完成，可能因服务重启或网络中断。请重新发送消息以重试。'
            : 'This deep analysis did not complete, possibly due to a service restart or network interruption. Please send a new message to retry.'}
        </p>
      </div>
    );
  }

  // Active loading state — poll backend for real progress
  return (
    <ProgressCard
      locale={locale}
      chatId={chatId}
      tokenAddress={input?.tokenAddress || data?.tokenAddress}
      completedData={data}
    />
  );
}

// ── Progress card (polls backend) ────────────────────────────

function ProgressCard({
  locale,
  chatId,
  tokenAddress,
  completedData,
}: {
  locale: string;
  chatId?: string;
  tokenAddress?: string;
  completedData?: DeepAnalysisData;
}) {
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [interrupted, setInterrupted] = useState(false);
  // Track consecutive "no progress" polls to detect stale/completed state
  const noProgressCountRef = useRef(0);
  // Initial grace period: don't count "no progress" for the first 5s
  const INTERRUPT_THRESHOLD = 6;
  const INITIAL_GRACE_MS = 5000;
  const initialGracePeriodRef = useRef(true);

  useEffect(() => {
    startRef.current = Date.now();
    const timer = setTimeout(() => {
      initialGracePeriodRef.current = false;
    }, INITIAL_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  // If completedData arrives (tool output available), use it directly
  const hasCompleted = completedData?.reportId;

  const poll = useCallback(async () => {
    if (!chatId || hasCompleted) return;
    try {
      const { authenticatedAddress, guestId } = useChatStore.getState();
      const ownerHeaders: Record<string, string> = authenticatedAddress
        ? { 'x-bnb-owner-type': 'wallet', 'x-bnb-owner-id': authenticatedAddress.toLowerCase() }
        : { 'x-bnb-owner-type': 'guest', 'x-bnb-owner-id': guestId };
      const res = await fetch(`/api/deep-analysis/progress?chatId=${encodeURIComponent(chatId)}`, {
        headers: ownerHeaders,
      });
      if (!res.ok) return;
      const data: ProgressResponse = await res.json();

      if (!data.active && !data.steps) {
        // No active analysis and no data — either not started or expired
        if (initialGracePeriodRef.current) return; // Don't count during initial grace period
        noProgressCountRef.current += 1;
        // After 6 consecutive polls with no data (~9s), mark as interrupted.
        if (noProgressCountRef.current >= INTERRUPT_THRESHOLD) {
          setInterrupted(true);
        }
        return;
      }
      noProgressCountRef.current = 0;
      setInterrupted(false);

      setProgress(data);
      if (data.startedAt) {
        startRef.current = data.startedAt;
      }

      // If finished with error
      if (data.finished && data.error) {
        setInterrupted(false);
      }
    } catch {
      // Network error — can't confirm backend state, reset interrupt counter
      noProgressCountRef.current = 0;
    }
  }, [chatId, hasCompleted]);

  // Start polling (first poll after 2s delay to let Worker claim the run)
  useEffect(() => {
    if (!chatId || hasCompleted) return;
    const initialDelay = setTimeout(() => {
      poll();
      pollRef.current = setInterval(poll, 1500);
    }, 2000);
    return () => {
      clearTimeout(initialDelay);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [chatId, hasCompleted, poll]);

  // Elapsed timer
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 500);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // Stop polling when finished
  useEffect(() => {
    if (progress?.finished && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [progress?.finished]);

  // If tool output arrived (complete), show CompleteCard
  if (hasCompleted) {
    return <CompleteCard data={completedData!} locale={locale} />;
  }

  // If progress finished with result, show complete
  if (progress?.finished && progress.result) {
    return (
      <CompleteCard
        data={{
          reportId: progress.result.reportId,
          reportUrl: progress.result.reportUrl,
          riskScore: progress.result.riskScore,
          summary: progress.result.summary,
          tokenName: progress.tokenName,
          tokenSymbol: progress.tokenSymbol,
          tokenAddress: progress.tokenAddress || tokenAddress,
          durationMs: progress.result.durationMs,
          steps: progress.steps as StepResult[],
        }}
        locale={locale}
      />
    );
  }

  // If progress finished with error
  if (progress?.finished && progress.error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="text-sm font-medium">
            {locale === 'zh' ? '深度分析失败' : 'Deep Analysis Failed'}
          </span>
        </div>
        <p className="mt-2 text-xs text-red-400/80">{progress.error}</p>
      </div>
    );
  }

  // Interrupted state (lost connection or cancelled)
  if (interrupted) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-center gap-2 text-amber-400">
          <MinusCircle className="size-4 shrink-0" />
          <span className="text-sm font-medium">
            {locale === 'zh' ? '深度分析进度丢失' : 'Deep Analysis Progress Lost'}
          </span>
        </div>
        <p className="mt-2 text-xs text-amber-400/70">
          {locale === 'zh'
            ? '深度分析进度已丢失，后端进程可能已断开。请重新发送消息以重试。'
            : 'Deep analysis progress was lost — the backend process may have disconnected. Please send a new message to retry.'}
        </p>
      </div>
    );
  }

  // chatId not available yet (draft conversation) — show simplified loading UI without polling
  if (!chatId) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="size-4 text-primary animate-pulse" />
          <span className="text-sm font-medium text-foreground">
            {locale === 'zh' ? '深度分析进行中' : 'Deep Analysis in Progress'}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs text-foreground">
          <Loader2 className="size-3.5 shrink-0 text-primary animate-spin" />
          <span>{locale === 'zh' ? '正在准备分析...' : 'Preparing analysis...'}</span>
        </div>
        <div className="mt-3 flex items-center justify-end text-xs text-muted-foreground/60">
          <Clock className="size-3 mr-1" />
          {formatElapsed(elapsed)}
        </div>
      </div>
    );
  }

  const steps = progress?.steps;
  const displayAddr = progress?.tokenAddress || tokenAddress;
  const displayName = progress?.tokenName
    ? `${progress.tokenName}${progress.tokenSymbol ? ` ($${progress.tokenSymbol})` : ''}`
    : null;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Shield className="size-4 text-primary animate-pulse" />
        <span className="text-sm font-medium text-foreground">
          {locale === 'zh' ? '深度分析进行中' : 'Deep Analysis in Progress'}
        </span>
        {displayName && (
          <span className="text-xs text-muted-foreground">{displayName}</span>
        )}
        {!displayName && displayAddr && (
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {shortenAddr(displayAddr)}
          </span>
        )}
      </div>

      {/* Phase indicator */}
      {progress?.phase && (
        <div className="mb-2 text-xs text-primary/70 font-medium">
          {progress.phase}
        </div>
      )}

      {/* Step timeline — real backend data */}
      {steps && steps.length > 0 ? (
        <div className="space-y-1.5">
          {steps.map((step) => (
            <div
              key={step.key}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all duration-300',
                step.status === 'running' && 'bg-primary/10 text-foreground',
                step.status === 'completed' && 'text-muted-foreground',
                step.status === 'failed' && 'text-red-400',
                step.status === 'skipped' && 'text-muted-foreground/50',
                step.status === 'pending' && 'text-muted-foreground/40'
              )}
            >
              {step.status === 'completed' && (
                <CheckCircle className="size-3.5 shrink-0 text-emerald-500" />
              )}
              {step.status === 'running' && (
                <Loader2 className="size-3.5 shrink-0 text-primary animate-spin" />
              )}
              {step.status === 'failed' && (
                <XCircle className="size-3.5 shrink-0 text-red-400" />
              )}
              {step.status === 'skipped' && (
                <MinusCircle className="size-3.5 shrink-0 text-muted-foreground/40" />
              )}
              {step.status === 'pending' && (
                <Clock className="size-3.5 shrink-0 text-muted-foreground/30" />
              )}
              <span className="flex-1">{step.label}</span>
              {step.summary && (
                <span className="text-muted-foreground/60 truncate max-w-[180px]">
                  {step.summary}
                </span>
              )}
              {step.durationMs != null && step.status !== 'pending' && step.status !== 'running' && (
                <span className="text-muted-foreground/40 tabular-nums">
                  {step.durationMs >= 1000
                    ? `${(step.durationMs / 1000).toFixed(1)}s`
                    : `${step.durationMs}ms`}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        // No steps yet — show initialization
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs text-foreground">
          <Loader2 className="size-3.5 shrink-0 text-primary animate-spin" />
          <span>{locale === 'zh' ? '正在初始化分析...' : 'Initializing analysis...'}</span>
        </div>
      )}

      {/* Elapsed time */}
      <div className="mt-3 flex items-center justify-end text-xs text-muted-foreground/60">
        <Clock className="size-3 mr-1" />
        {formatElapsed(elapsed)}
      </div>
    </div>
  );
}

// ── Complete card ────────────────────────────────────────────

function CompleteCard({
  data,
  locale,
}: {
  data: DeepAnalysisData;
  locale: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const nameLabel = data.tokenName
    ? `${data.tokenName}${data.tokenSymbol ? ` ($${data.tokenSymbol})` : ''}`
    : data.tokenAddress
      ? shortenAddr(data.tokenAddress)
      : '';

  const completedSteps = data.steps?.filter((s) => s.status === 'completed').length ?? 0;
  const totalSteps = data.steps?.length ?? 0;
  const durationSec = data.durationMs ? Math.round(data.durationMs / 1000) : 0;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Summary header */}
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {locale === 'zh' ? '深度分析报告' : 'Deep Analysis Report'}
          </span>
          <span className="text-sm text-muted-foreground">— {nameLabel}</span>

          {/* Risk badge */}
          {data.riskScore != null && (
            <span
              className={cn(
                'ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                getRiskBg(data.riskScore),
                getRiskColor(data.riskScore)
              )}
            >
              {data.riskScore}/100 · {getRiskLabel(data.riskScore, locale)}
            </span>
          )}
        </div>

        {/* Sub info */}
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {completedSteps}/{totalSteps} {locale === 'zh' ? '个步骤已完成' : 'steps completed'}
          </span>
          {durationSec > 0 && (
            <span className="flex items-center gap-0.5">
              <Clock className="size-3" />
              {durationSec}s
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2">
          {data.reportUrl && (
            <a
              href={sanitizeUrl(data.reportUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <ExternalLink className="size-3" />
              {locale === 'zh' ? '查看完整报告' : 'View Full Report'}
            </a>
          )}
          {data.steps && data.steps.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
            >
              {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              {locale === 'zh' ? '步骤详情' : 'Step Details'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded step details */}
      {expanded && data.steps && (
        <div className="border-t border-border bg-muted/30 p-3 space-y-1">
          {data.steps.map((step) => (
            <div
              key={step.key}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-xs"
            >
              {step.status === 'completed' && (
                <CheckCircle className="size-3.5 shrink-0 text-emerald-500" />
              )}
              {step.status === 'failed' && (
                <XCircle className="size-3.5 shrink-0 text-red-400" />
              )}
              {step.status === 'skipped' && (
                <MinusCircle className="size-3.5 shrink-0 text-muted-foreground/50" />
              )}
              {(step.status === 'pending' || step.status === 'running') && (
                <Clock className="size-3.5 shrink-0 text-muted-foreground/50" />
              )}
              <span className="font-medium text-foreground">{step.label}</span>
              {step.summary && (
                <span className="text-muted-foreground truncate">{step.summary}</span>
              )}
              {step.durationMs != null && step.durationMs > 0 && (
                <span className="ml-auto text-muted-foreground/50 tabular-nums">
                  {step.durationMs >= 1000
                    ? `${(step.durationMs / 1000).toFixed(1)}s`
                    : `${step.durationMs}ms`}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
