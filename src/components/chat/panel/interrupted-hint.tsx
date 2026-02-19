import { Button } from '@/components/ui/button';

interface InterruptedHintProps {
  text: string;
  t: (key: string) => string;
  onContinue: () => void;
  onDismiss: () => void;
}

export function InterruptedHint({
  text,
  t,
  onContinue,
  onDismiss,
}: InterruptedHintProps) {
  return (
    <div className="pl-[26px]">
      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
        <p className="text-xs text-muted-foreground">{text}</p>
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 cursor-pointer border-border bg-card text-xs text-foreground hover:bg-accent"
            onClick={onContinue}
          >
            {t('chat.continueGeneration')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 cursor-pointer text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={onDismiss}
          >
            {t('chat.dismiss')}
          </Button>
        </div>
      </div>
    </div>
  );
}
