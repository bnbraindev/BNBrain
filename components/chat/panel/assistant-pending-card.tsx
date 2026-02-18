import { Loader2, Shield } from 'lucide-react';

export function AssistantPendingCard({ text }: { text: string }) {
  return (
    <div role="status" aria-live="polite">
      {/* Role label */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <div className="flex size-5 items-center justify-center rounded-full bg-primary/10">
          <Shield className="size-3 text-primary" aria-hidden="true" />
        </div>
        <span className="text-xs font-semibold text-foreground">BNBrain</span>
      </div>
      {/* Loading indicator */}
      <div className="pl-[26px]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin icon-spin" aria-hidden="true" />
          <span>{text}</span>
        </div>
      </div>
    </div>
  );
}
