'use client';

import { CheckCircle, AlertTriangle, ChevronRight, ExternalLink, Copy, Check } from 'lucide-react';
import { useState, useRef, useCallback } from 'react';
import { getToolLabel, getToolSummary, isHighRisk } from '../tool-invocation';
import type { PanelCard } from './panel-context';

interface CompactCardViewProps {
  card: PanelCard;
  locale: string;
  onExpand: () => void;
}

function extractContractAddress(card: PanelCard): string | null {
  if (!card.output) return null;
  const candidates = [
    card.output.contractAddress,
    (card.output.plan as Record<string, unknown> | undefined)?.to,
    card.output.address,
    card.output.to,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('0x') && c.length === 42) return c;
  }
  return null;
}

function extractTxHash(card: PanelCard): string | null {
  if (!card.output) return null;
  const hash = card.output.txHash ?? card.output.transactionHash;
  return typeof hash === 'string' && hash.startsWith('0x') ? hash : null;
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded p-0.5 text-muted-foreground/50 hover:text-primary transition-colors"
      title="Copy"
    >
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
    </button>
  );
}

export function CompactCardView({ card, locale, onExpand }: CompactCardViewProps) {
  const summary = getToolSummary(card.toolName, card.output ?? {}, locale);
  const contractAddr = extractContractAddress(card);
  const txHash = extractTxHash(card);
  const highRisk = card.output ? isHighRisk(card.output) : false;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onExpand();
        }
      }}
      className="group flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-xs cursor-pointer transition-colors hover:border-border hover:bg-card/60"
    >
      {highRisk ? (
        <AlertTriangle className="size-3.5 shrink-0 text-red-400" />
      ) : (
        <CheckCircle className="size-3.5 shrink-0 text-emerald-500" />
      )}

      <span className="font-medium text-foreground shrink-0">
        {getToolLabel(card.toolName, locale)}
      </span>

      <span className="min-w-0 truncate text-muted-foreground">{summary}</span>

      <div
        className="ml-auto flex items-center gap-1 shrink-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {contractAddr && (
          <>
            <CopyBtn value={contractAddr} />
            <a
              href={`https://bscscan.com/address/${contractAddr}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-0.5 text-muted-foreground/50 hover:text-primary transition-colors"
            >
              <ExternalLink className="size-3" />
            </a>
          </>
        )}
        {txHash && !contractAddr && (
          <>
            <CopyBtn value={txHash} />
            <a
              href={`https://bscscan.com/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-0.5 text-muted-foreground/50 hover:text-primary transition-colors"
            >
              <ExternalLink className="size-3" />
            </a>
          </>
        )}
      </div>

      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
    </div>
  );
}
