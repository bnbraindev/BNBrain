'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';

interface DataSourceHealth {
  name: string;
  healthy: boolean;
  successCount: number;
  failureCount: number;
  avgResponseMs: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

interface AdminDataSourcesContentProps {
  adminToken?: string;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  try {
    return dateFormatter.format(new Date(iso));
  } catch {
    return '-';
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
    return `${Math.round(diff / 86_400_000)}d ago`;
  } catch {
    return '';
  }
}

export function AdminDataSourcesContent({ adminToken }: AdminDataSourcesContentProps) {
  const { t } = useI18n();
  const [sources, setSources] = useState<DataSourceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number>(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = adminToken ? `?token=${encodeURIComponent(adminToken)}` : '';
      const res = await fetch(`/api/admin/data-sources${params}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setSources(data.sources ?? []);
      setLastRefresh(data.generatedAt ?? Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const healthyCount = sources.filter((s) => s.healthy).length;
  const unhealthyCount = sources.filter((s) => !s.healthy).length;
  const totalCalls = sources.reduce((a, s) => a + s.successCount + s.failureCount, 0);

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Activity className="size-4 text-primary" />}
          label={t('admin.dataSources.totalSources')}
          value={String(sources.length)}
        />
        <StatCard
          icon={<CheckCircle2 className="size-4 text-emerald-500" />}
          label={t('admin.dataSources.healthy')}
          value={String(healthyCount)}
        />
        <StatCard
          icon={<XCircle className="size-4 text-red-500" />}
          label={t('admin.dataSources.unhealthy')}
          value={String(unhealthyCount)}
        />
        <StatCard
          icon={<Clock3 className="size-4 text-muted-foreground" />}
          label={t('admin.dataSources.totalCalls')}
          value={totalCalls.toLocaleString()}
        />
      </div>

      {/* Refresh bar */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card/80 px-4 py-2">
        <span className="text-xs text-muted-foreground">
          {lastRefresh ? `${t('admin.dataSources.lastRefresh')}: ${dateFormatter.format(new Date(lastRefresh))}` : ''}
        </span>
        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
          {t('admin.common.refresh')}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Source cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((source) => (
          <SourceCard key={source.name} source={source} />
        ))}
      </div>

      {sources.length === 0 && !loading && !error && (
        <div className="rounded-xl border border-border bg-card/60 p-8 text-center text-sm text-muted-foreground">
          {t('admin.dataSources.noData')}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/80 px-4 py-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SourceCard({ source }: { source: DataSourceHealth }) {
  const totalCalls = source.successCount + source.failureCount;
  const successRate =
    totalCalls > 0
      ? ((source.successCount / totalCalls) * 100).toFixed(1)
      : '-';

  return (
    <div className="rounded-xl border border-border bg-card/80 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`size-2.5 rounded-full ${
              source.healthy ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          />
          <span className="text-sm font-semibold text-foreground">
            {source.name}
          </span>
        </div>
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-medium ${
            source.healthy
              ? 'bg-emerald-500/15 text-emerald-500'
              : 'bg-red-500/15 text-red-500'
          }`}
        >
          {source.healthy ? 'Healthy' : 'Unhealthy'}
        </span>
      </div>

      {/* Metrics grid */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <MetricRow label="Success" value={source.successCount.toLocaleString()} />
        <MetricRow label="Failures" value={source.failureCount.toLocaleString()} />
        <MetricRow label="Success rate" value={successRate === '-' ? '-' : `${successRate}%`} />
        <MetricRow label="Avg latency" value={source.avgResponseMs > 0 ? `${source.avgResponseMs}ms` : '-'} />
        <MetricRow
          label="Last success"
          value={relativeTime(source.lastSuccessAt) || '-'}
          title={formatTime(source.lastSuccessAt)}
        />
        <MetricRow
          label="Last failure"
          value={relativeTime(source.lastFailureAt) || '-'}
          title={formatTime(source.lastFailureAt)}
        />
      </div>

      {/* Consecutive failures + last error */}
      {source.consecutiveFailures > 0 && (
        <div className="mt-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400">
          {source.consecutiveFailures} consecutive failure{source.consecutiveFailures > 1 ? 's' : ''}
          {source.lastError && (
            <p className="mt-0.5 truncate opacity-80" title={source.lastError}>
              {source.lastError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MetricRow({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground" title={title}>
        {value}
      </span>
    </div>
  );
}
