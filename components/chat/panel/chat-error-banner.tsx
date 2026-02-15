import { Button } from '@/components/ui/button';

interface ChatError {
  message: string;
  retryable: boolean;
  details?: string;
}

interface ChatErrorBannerProps {
  error: ChatError;
  locale: 'en' | 'zh';
  t: (key: string) => string;
  onRetry: () => void;
}

export function ChatErrorBanner({
  error,
  locale,
  t,
  onRetry,
}: ChatErrorBannerProps) {
  return (
    <div
      className="mx-3 mb-2 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-4"
      role="alert"
    >
      <div className="min-w-0 flex-1">
        <span className="block truncate">{error.message || t('chat.error')}</span>
        {error.details ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-muted-foreground/80">
              {locale === 'zh' ? '技术细节' : 'Technical details'}
            </summary>
            <p className="mt-1 text-xs text-muted-foreground break-all whitespace-pre-wrap">
              {error.details}
            </p>
          </details>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 text-xs text-destructive hover:bg-destructive/20 hover:text-destructive"
        onClick={onRetry}
      >
        {t('chat.retry')}
      </Button>
    </div>
  );
}
