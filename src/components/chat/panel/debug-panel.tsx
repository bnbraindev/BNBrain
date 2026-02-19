import { Button } from '@/components/ui/button';

interface DebugPanelProps {
  t: (key: string) => string;
  runtimeDebugContext: Record<string, unknown>;
  onCopy: () => void;
}

export function DebugPanel({
  t,
  runtimeDebugContext,
  onCopy,
}: DebugPanelProps) {
  return (
    <div className="max-h-[42vh] shrink-0 touch-pan-y overflow-y-auto rounded-xl border border-ring/35 bg-primary/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-primary">
          {t('debug.panelTitle')}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onCopy}
        >
          {t('debug.copy')}
        </Button>
      </div>

      <details open className="rounded-lg border border-border bg-card px-2 py-1.5">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          {t('debug.chainStatus')}
        </summary>
        <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap break-all text-xs leading-relaxed text-muted-foreground">
          {JSON.stringify(runtimeDebugContext, null, 2)}
        </pre>
      </details>
    </div>
  );
}
