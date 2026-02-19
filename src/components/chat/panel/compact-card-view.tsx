'use client';

import { CheckCircle, AlertTriangle, ChevronRight, ExternalLink, Copy, Check, Wallet, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState, useRef, useCallback } from 'react';
import { getToolLabel, getToolSummary, isHighRisk, TX_TOOLS } from '../tool-invocation';
import { EXPLORER_URLS } from '@/lib/utils/constants';
import { useTxStatusStore } from '@/lib/stores/tx-status-store';
import type { PanelCard } from './panel-context';

interface CompactCardViewProps {
  card: PanelCard;
  locale: string;
  conversationId?: string;
  onExpand: () => void;
}

const TX_SUMMARY_ZH: Record<string, string> = {
  idle: '待签名',
  confirming: '签名中…',
  pending: '确认中…',
  success: '已完成',
  cancelled: '已取消',
  error: '失败',
};
const TX_SUMMARY_EN: Record<string, string> = {
  idle: '待签名',
  confirming: 'Signing…',
  pending: 'Confirming…',
  success: 'Done',
  cancelled: 'Cancelled',
  error: 'Failed',
};

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

function getExplorerBase(card: PanelCard): string {
  if (!card.output) return EXPLORER_URLS[56];
  const chainId = card.output.chainId as number | undefined
    ?? (card.output.plan as Record<string, unknown> | undefined)?.chainId as number | undefined;
  return EXPLORER_URLS[chainId ?? 56] ?? EXPLORER_URLS[56];
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

export function CompactCardView({ card, locale, conversationId, onExpand }: CompactCardViewProps) {
  const isTx = TX_TOOLS.has(card.toolName);
  const txKey = isTx && conversationId ? `${conversationId}:${card.id}` : '';
  const txStatus = useTxStatusStore((s) => (txKey ? s.statuses[txKey] : undefined));

  const txDone = txStatus === 'success';
  const txActive = txStatus === 'confirming' || txStatus === 'pending';
  const txFailed = txStatus === 'error' || txStatus === 'cancelled';

  // Derive summary with tx-state awareness
  let summary: string;
  if (isTx && txStatus) {
    const labels = locale === 'zh' ? TX_SUMMARY_ZH : TX_SUMMARY_EN;
    summary = labels[txStatus] ?? getToolSummary(card.toolName, card.output ?? {}, locale);
  } else {
    summary = getToolSummary(card.toolName, card.output ?? {}, locale);
  }

  const contractAddr = extractContractAddress(card);
  const txHash = extractTxHash(card);
  const highRisk = card.output ? isHighRisk(card.output) : false;
  const explorerBase = getExplorerBase(card);

  // Derive icon
  let icon: ReactNode;
  if (highRisk || txFailed) {
    icon = <AlertTriangle className="size-3.5 shrink-0 text-red-400" />;
  } else if (isTx && txDone) {
    icon = <CheckCircle className="size-3.5 shrink-0 text-emerald-500" />;
  } else if (isTx && txActive) {
    icon = <Loader2 className="size-3.5 shrink-0 animate-spin icon-spin text-primary" />;
  } else if (isTx) {
    icon = <Wallet className="size-3.5 shrink-0 text-amber-500" />;
  } else {
    icon = <CheckCircle className="size-3.5 shrink-0 text-emerald-500" />;
  }

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
      className={`group flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-xs cursor-pointer transition-colors hover:border-border hover:bg-card/60 ${txActive ? 'animate-pulse-glow' : ''}`}
    >
      {icon}

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
              href={`${explorerBase}/address/${contractAddr}`}
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
              href={`${explorerBase}/tx/${txHash}`}
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
