import { Shield } from 'lucide-react';

/**
 * Pulsing dots indicator shown before the assistant message appears.
 * Includes the "BNBrain" header to match the assistant message layout.
 */
/** Subtle pulsing dots shown at the bottom of assistant message while AI is still generating. */
export function ContinuationIndicator() {
  return (
    <div className="pl-[26px] py-1" role="status" aria-label="Generating more content">
      <div className="flex items-center gap-1">
        <span className="size-[4px] rounded-full bg-ring/60 animate-pulse" />
        <span className="size-[4px] rounded-full bg-ring/60 animate-pulse [animation-delay:200ms]" />
        <span className="size-[4px] rounded-full bg-ring/60 animate-pulse [animation-delay:400ms]" />
      </div>
    </div>
  );
}

export function StreamingIndicator() {
  return (
    <div className="animate-message-in" role="status" aria-label="Generating response">
      {/* Role label — matches message.tsx assistant header */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <div className="flex size-5 items-center justify-center rounded-full bg-primary/10">
          <Shield className="size-3 text-primary" aria-hidden="true" />
        </div>
        <span className="text-xs font-semibold text-foreground">BNBrain</span>
      </div>
      {/* Pulsing dots */}
      <div className="pl-[26px]">
        <div className="flex items-center gap-1">
          <span className="size-[5px] rounded-full bg-ring animate-pulse" />
          <span className="size-[5px] rounded-full bg-ring animate-pulse [animation-delay:200ms]" />
          <span className="size-[5px] rounded-full bg-ring animate-pulse [animation-delay:400ms]" />
        </div>
      </div>
    </div>
  );
}
