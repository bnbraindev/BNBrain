import { Shield } from 'lucide-react';

/**
 * Unified streaming indicator.
 * - `withHeader`: shows BNBrain label (before assistant message appears)
 * - without header: just bouncing dots (while assistant is still generating)
 *
 * Always uses the same dot size and container height to prevent layout shift.
 */
interface StreamingIndicatorProps {
  withHeader?: boolean;
  locale?: 'en' | 'zh';
}

export function StreamingIndicator({ withHeader = true, locale = 'en' }: StreamingIndicatorProps) {
  const statusLabel = locale === 'zh' ? '正在生成回复' : 'Generating response';
  return (
    <div role="status" aria-label={statusLabel}>
      {withHeader && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <div className="flex size-5 items-center justify-center rounded-full bg-primary/10">
            <Shield className="size-3 text-primary" aria-hidden="true" />
          </div>
          <span className="text-xs font-semibold text-foreground">BNBrain</span>
        </div>
      )}
      <div className="pl-[26px]">
        <div className="flex items-end gap-1 h-4">
          <span className="size-[5px] rounded-full bg-ring dot-bounce" />
          <span className="size-[5px] rounded-full bg-ring dot-bounce" style={{ animationDelay: '0.16s' }} />
          <span className="size-[5px] rounded-full bg-ring dot-bounce" style={{ animationDelay: '0.32s' }} />
        </div>
      </div>
    </div>
  );
}

/** @deprecated Use `<StreamingIndicator withHeader={false} />` instead. */
export function ContinuationIndicator({ locale = 'en' }: { locale?: 'en' | 'zh' }) {
  return <StreamingIndicator withHeader={false} locale={locale} />;
}
