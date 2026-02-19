'use client';

import { Activity, AlertTriangle, Clock3, Timer } from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';

interface AdminRuntimeContentProps {
  metrics: {
    generatedAt: number;
    queueDepth: number;
    activeRunCount: number;
    statusCounts: Record<string, number>;
    oldestQueuedAgeMs: number | null;
    oldestRunningAgeMs: number | null;
    staleCandidateCounts: {
      running: number;
      queued: number;
    };
    terminalGarbageCount: number;
    cleanupConfig: {
      terminalRetentionMs: number;
      staleRunningMs: number;
      staleQueuedMs: number;
      batchSize: number;
    };
    lastCleanup: {
      ranAt: number;
      terminalRetentionMs: number;
      staleRunningMs: number;
      staleQueuedMs: number;
      batchSize: number;
      result: {
        failedStaleRunningCount: number;
        failedStaleQueuedCount: number;
        deletedTerminalCount: number;
      };
    } | null;
  };
}

const numberFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatCount(value: number): string {
  return numberFormatter.format(Math.max(0, Number.isFinite(value) ? value : 0));
}

function formatTime(value: number | null): string {
  if (!value || !Number.isFinite(value)) return '-';
  return dateFormatter.format(new Date(value));
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function AdminRuntimeContent({ metrics }: AdminRuntimeContentProps) {
  const { t } = useI18n();
  const staleTotal = metrics.staleCandidateCounts.running + metrics.staleCandidateCounts.queued;
  const statusEntries = Object.entries(metrics.statusCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-3">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_14px_30px_-26px_rgba(0,0,0,0.5)]">
          <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            <Activity className="size-3.5 text-primary" aria-hidden="true" />
            {t('admin.runtime.activeRuns')}
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{formatCount(metrics.activeRunCount)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_14px_30px_-26px_rgba(0,0,0,0.5)]">
          <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            <Timer className="size-3.5 text-primary" aria-hidden="true" />
            {t('admin.runtime.queueDepth')}
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{formatCount(metrics.queueDepth)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_14px_30px_-26px_rgba(0,0,0,0.5)]">
          <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            <AlertTriangle className="size-3.5 text-primary" aria-hidden="true" />
            {t('admin.runtime.staleCandidates')}
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{formatCount(staleTotal)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_14px_30px_-26px_rgba(0,0,0,0.5)]">
          <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            <Clock3 className="size-3.5 text-primary" aria-hidden="true" />
            {t('admin.runtime.generatedAt')}
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">{formatTime(metrics.generatedAt)}</p>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_14px_30px_-26px_rgba(0,0,0,0.5)]">
          <h2 className="text-sm font-semibold text-foreground">{t('admin.runtime.statusDistribution')}</h2>
          <div className="mt-3 space-y-2">
            {statusEntries.map(([status, count]) => (
              <div key={status} className="flex items-center justify-between rounded-lg border border-border/50 px-2.5 py-2">
                <span className="text-xs text-muted-foreground">{status}</span>
                <span className="text-xs font-medium text-foreground">{formatCount(count)}</span>
              </div>
            ))}
            {statusEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('admin.runtime.emptyStatus')}</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_14px_30px_-26px_rgba(0,0,0,0.5)]">
          <h2 className="text-sm font-semibold text-foreground">{t('admin.runtime.cleanupPolicy')}</h2>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <p className="flex items-center justify-between">
              <span>{t('admin.runtime.oldestQueued')}</span>
              <span className="font-medium text-foreground">{formatDuration(metrics.oldestQueuedAgeMs)}</span>
            </p>
            <p className="flex items-center justify-between">
              <span>{t('admin.runtime.oldestRunning')}</span>
              <span className="font-medium text-foreground">{formatDuration(metrics.oldestRunningAgeMs)}</span>
            </p>
            <p className="flex items-center justify-between">
              <span>{t('admin.runtime.terminalGarbage')}</span>
              <span className="font-medium text-foreground">{formatCount(metrics.terminalGarbageCount)}</span>
            </p>
            <p className="flex items-center justify-between">
              <span>{t('admin.runtime.cleanupBatchSize')}</span>
              <span className="font-medium text-foreground">{formatCount(metrics.cleanupConfig.batchSize)}</span>
            </p>
            <p className="flex items-center justify-between">
              <span>{t('admin.runtime.lastCleanupAt')}</span>
              <span className="font-medium text-foreground">{formatTime(metrics.lastCleanup?.ranAt ?? null)}</span>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
