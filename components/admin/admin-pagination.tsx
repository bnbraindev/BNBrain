'use client';

import { useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

interface AdminPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** Server-side mode: build <Link> href for each page. */
  buildHref?: (page: number, pageSize: number) => string;
  /** Client-side mode: callback when page/size changes. */
  onChange?: (page: number, pageSize: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Build an array of page numbers + ellipsis markers to render.
 * Always shows first, last, and a window around the current page.
 */
function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  pages.push(1);
  if (left > 2) pages.push('...');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push('...');
  pages.push(total);
  return pages;
}

export function AdminPagination({
  page,
  pageSize,
  total,
  buildHref,
  onChange,
}: AdminPaginationProps) {
  const { t } = useI18n();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const [jumpValue, setJumpValue] = useState('');

  const navigate = (nextPage: number, nextSize?: number) => {
    const size = nextSize ?? pageSize;
    const clamped = clamp(nextPage, 1, Math.max(1, Math.ceil(total / size)));
    if (buildHref) {
      // Server-side: navigation handled by <Link>, this is fallback for jump input
      window.location.href = buildHref(clamped, size);
    } else {
      onChange?.(clamped, size);
    }
  };

  const handleJump = () => {
    const parsed = parseInt(jumpValue, 10);
    if (Number.isFinite(parsed)) {
      navigate(parsed);
      setJumpValue('');
    }
  };

  const handleJumpKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleJump();
  };

  const handlePageSizeChange = (nextSize: number) => {
    // Recalculate page so current first item stays visible
    const firstItem = (page - 1) * pageSize;
    const newPage = Math.floor(firstItem / nextSize) + 1;
    navigate(newPage, nextSize);
  };

  const rangeText = t('admin.pagination.rangeInfo')
    .replace('{from}', String(from))
    .replace('{to}', String(to))
    .replace('{total}', String(total));

  const pageNumbers = getPageNumbers(page, totalPages);

  const renderPageButton = (p: number, isCurrent: boolean) => {
    const cls = isCurrent
      ? 'inline-flex size-8 items-center justify-center rounded-md bg-primary text-xs font-medium text-white'
      : 'inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-xs text-foreground hover:bg-muted';
    if (buildHref && !isCurrent) {
      return (
        <Link key={p} href={buildHref(p, pageSize)} className={cls}>
          {p}
        </Link>
      );
    }
    return (
      <button
        key={p}
        type="button"
        disabled={isCurrent}
        onClick={() => navigate(p)}
        className={cls}
      >
        {p}
      </button>
    );
  };

  const renderArrow = (direction: 'prev' | 'next') => {
    const enabled = direction === 'prev' ? hasPrev : hasNext;
    const targetPage = direction === 'prev' ? page - 1 : page + 1;
    const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
    const label = direction === 'prev' ? t('admin.pagination.prev') : t('admin.pagination.next');
    const cls = enabled
      ? 'inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs text-foreground hover:bg-muted'
      : 'inline-flex h-8 items-center gap-1 rounded-md border border-border/50 bg-card px-2 text-xs text-muted-foreground/40 pointer-events-none';

    if (buildHref && enabled) {
      return (
        <Link href={buildHref(targetPage, pageSize)} className={cls}>
          <Icon className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </Link>
      );
    }
    return (
      <button
        type="button"
        disabled={!enabled}
        onClick={() => navigate(targetPage)}
        className={cls}
      >
        <Icon className="size-3.5" />
        <span className="hidden sm:inline">{label}</span>
      </button>
    );
  };

  if (total === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-y-2 border-t border-border/50 pt-3">
      {/* Left: range info + page size selector */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{rangeText}</span>
        <span className="hidden items-center gap-1 sm:inline-flex">
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="h-7 rounded-md border border-border bg-card px-1.5 text-xs text-foreground outline-none focus:border-ring"
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span>{t('admin.pagination.perPage')}</span>
        </span>
      </div>

      {/* Center: page numbers */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          {renderArrow('prev')}
          {pageNumbers.map((p, i) =>
            p === '...' ? (
              <span key={`e${i}`} className="inline-flex size-8 items-center justify-center text-xs text-muted-foreground">
                ...
              </span>
            ) : (
              renderPageButton(p, p === page)
            )
          )}
          {renderArrow('next')}
        </div>
      )}

      {/* Right: jump to page */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            onKeyDown={handleJumpKeyDown}
            placeholder={`1-${totalPages}`}
            className="h-7 w-16 rounded-md border border-border bg-card px-1.5 text-center text-xs text-foreground outline-none focus:border-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={handleJump}
            className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-white hover:bg-primary/90"
          >
            {t('admin.pagination.jumpTo')}
          </button>
        </div>
      )}
    </div>
  );
}
