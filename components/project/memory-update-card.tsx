'use client';

import { Check, CheckCircle, BookOpen } from 'lucide-react';
import type { MemoryUpdate } from './types';

/**
 * Inline card showing AI's suggestion to update project memory.
 * Rendered inside assistant messages after key operations (deploy, verify, etc.)
 *
 * Spec ref: §5.4 — AI calls updateProjectFile to update memory.md
 * Spec ref: §7.2 — After deploy, AI updates memory with contract info
 */
export function MemoryUpdateCard({
  update,
  onApply,
  onSkip,
  locale = 'en',
}: {
  update: MemoryUpdate;
  onApply: () => void;
  onSkip: () => void;
  locale?: string;
}) {
  const zh = locale === 'zh';
  return (
    <div className="mt-3 animate-message-in rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <BookOpen className="size-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">{zh ? '记忆更新建议' : 'Memory Update Suggestion'}</span>
      </div>

      {/* Diff-style preview */}
      <div className="mb-3 rounded-lg border border-border/50 bg-background/60 p-3">
        {update.additions.map((line, i) => (
          <div key={i} className="flex items-start gap-1.5 font-mono text-[11px]">
            <span className="mt-0.5 select-none text-emerald-400">+</span>
            <span className="text-emerald-300/80">{line}</span>
          </div>
        ))}
      </div>

      {update.applied ? (
        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle className="size-3.5" />
          <span>{zh ? '已应用到项目记忆' : 'Applied to project memory'}</span>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onApply}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:brightness-105 active:scale-[0.98]"
          >
            <Check className="size-3" /> {zh ? '应用到记忆' : 'Apply to Memory'}
          </button>
          <button
            onClick={onSkip}
            className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
          >
            {zh ? '跳过' : 'Skip'}
          </button>
        </div>
      )}
    </div>
  );
}
