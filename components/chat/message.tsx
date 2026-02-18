'use client';

import type { UIMessage } from 'ai';
import { getToolName, isTextUIPart, isToolUIPart } from 'ai';
import { Shield, User, Copy, Check, ThumbsUp, ThumbsDown, CheckCircle, AlertTriangle, Loader2, Wallet } from 'lucide-react';
import { ToolInvocation } from './tool-invocation';
import { getToolLabel, getToolSummary, isHighRisk, TX_TOOLS } from './tool-invocation';
import { useTxStatusStore } from '@/lib/stores/tx-status-store';
import { Markdown } from './markdown';
import type { ReactNode } from 'react';
import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { useToast } from '@/components/ui/toast';
import { usePanelContext } from './panel/panel-context';

/** Extended message type that may carry a creation timestamp at runtime. */
type MessageWithTimestamp = UIMessage & {
  createdAt?: Date | string | number;
};

export interface MessageProps {
  message: MessageWithTimestamp;
  conversationId?: string;
  readOnly?: boolean;
}

type ToolPart = Extract<
  UIMessage['parts'][number],
  { type: `tool-${string}` | 'dynamic-tool' }
>;

function hasToolErrorOutput(part: ToolPart): boolean {
  if (part.state === 'output-error') return true;
  if (part.state !== 'output-available') return false;
  const output = part.output as Record<string, unknown> | undefined;
  return Boolean(output && typeof output === 'object' && 'error' in output && output.error);
}

function formatRelativeTime(date: Date | string | number): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}


// ── Inline tool badge with tx-status awareness ──────────────

interface ToolBadgeProps {
  toolCallId: string;
  toolName: string;
  isDone: boolean;
  isErr: boolean;
  output: Record<string, unknown> | undefined;
  conversationId?: string;
  locale: string;
  onClick: () => void;
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
  idle: 'Awaiting signature',
  confirming: 'Signing…',
  pending: 'Confirming…',
  success: 'Done',
  cancelled: 'Cancelled',
  error: 'Failed',
};

function ToolBadge({ toolCallId, toolName, isDone, isErr, output, conversationId, locale, onClick }: ToolBadgeProps) {
  const isTx = TX_TOOLS.has(toolName);
  const txKey = isTx && conversationId ? `${conversationId}:${toolCallId}` : '';
  const txStatus = useTxStatusStore((s) => (txKey ? s.statuses[txKey] : undefined));
  const highRisk = output ? isHighRisk(output) : false;

  // Derive summary text
  let summary: string | null = null;
  if (isDone && output) {
    if (isTx && txStatus) {
      const labels = locale === 'zh' ? TX_SUMMARY_ZH : TX_SUMMARY_EN;
      summary = labels[txStatus] ?? null;
    } else {
      summary = getToolSummary(toolName, output, locale);
    }
  }

  // Derive icon and styling
  const txDone = txStatus === 'success';
  const txActive = txStatus === 'confirming' || txStatus === 'pending';
  const txFailed = txStatus === 'error' || txStatus === 'cancelled';

  const borderClass = isErr
    ? 'border-red-500/30 bg-red-500/10 text-red-400'
    : highRisk
      ? 'border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/10'
      : isTx && txDone
        ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-foreground'
        : isTx && txActive
          ? 'border-ring/30 bg-primary/10 text-muted-foreground animate-pulse-glow'
          : isTx && txFailed
            ? 'border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/10'
            : isDone && isTx
              ? 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-foreground'
              : isDone
                ? 'border-border bg-card hover:bg-accent text-foreground'
                : 'border-ring/30 bg-primary/10 text-muted-foreground animate-pulse-glow';

  let icon: ReactNode;
  if (!isDone && !isErr) {
    icon = <Loader2 className="size-3 animate-spin icon-spin text-primary" />;
  } else if (isErr || highRisk || txFailed) {
    icon = <AlertTriangle className="size-3" />;
  } else if (isTx && txDone) {
    icon = <CheckCircle className="size-3 text-emerald-500" />;
  } else if (isTx && txActive) {
    icon = <Loader2 className="size-3 animate-spin icon-spin text-primary" />;
  } else if (isTx) {
    icon = <Wallet className="size-3 text-amber-500" />;
  } else {
    icon = <CheckCircle className="size-3 text-emerald-500" />;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors cursor-pointer ${borderClass}`}
    >
      {icon}
      <span className="font-medium">{getToolLabel(toolName, locale)}</span>
      {summary && <span className="max-w-[120px] truncate text-muted-foreground">{summary}</span>}
    </button>
  );
}

export const Message = memo(function Message({ message, conversationId, readOnly }: MessageProps) {
  const isUser = message.role === 'user';
  const { locale, t } = useI18n();
  const { pushToast } = useToast();
  const { hasPanel, onBadgeClick } = usePanelContext();
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feedback state for assistant messages
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [showThanks, setShowThanks] = useState(false);
  const thanksTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore feedback from localStorage on mount
  useEffect(() => {
    if (isUser || !message.id) return;
    try {
      const stored = localStorage.getItem(`msg-feedback:${message.id}`);
      if (stored === 'up' || stored === 'down') {
        setFeedback(stored);
      }
    } catch {
      // Ignore localStorage access errors (e.g. private browsing)
    }
  }, [isUser, message.id]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (thanksTimerRef.current) clearTimeout(thanksTimerRef.current);
    };
  }, []);

  const { textContent, toolParts } = useMemo(() => {
    const textParts = message.parts.filter(isTextUIPart);
    const rawToolParts = message.parts.filter(isToolUIPart);
    // Hide errored tool calls if a later invocation of the same tool exists
    // (whether it succeeded, is still loading, or also errored).
    // This prevents intermediate retry errors from flashing during streaming.
    const toolInvocationParts = rawToolParts.filter((part, index) => {
      if (!hasToolErrorOutput(part)) return true;
      const currentToolName = getToolName(part);
      for (let i = index + 1; i < rawToolParts.length; i += 1) {
        if (getToolName(rawToolParts[i]) === currentToolName) {
          return false;
        }
      }
      return true;
    });
    return {
      textContent: textParts.map((p) => p.text).join(''),
      toolParts: toolInvocationParts,
    };
  }, [message.parts]);

  const handleCopy = useCallback(() => {
    if (!textContent) return;
    navigator.clipboard.writeText(textContent).then(() => {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
      pushToast({
        title: locale === 'zh' ? '已复制' : 'Copied',
        variant: 'success',
        durationMs: 1500,
      });
    }).catch(() => {
      // Clipboard API may fail in non-secure contexts or unfocused documents
    });
  }, [textContent, pushToast, locale]);

  const handleFeedback = useCallback((value: 'up' | 'down') => {
    const next = feedback === value ? null : value;
    setFeedback(next);
    if (message.id) {
      try {
        if (next) {
          localStorage.setItem(`msg-feedback:${message.id}`, next);
        } else {
          localStorage.removeItem(`msg-feedback:${message.id}`);
        }
      } catch {
        // Ignore localStorage access errors
      }
    }
    if (next) {
      setShowThanks(true);
      if (thanksTimerRef.current) clearTimeout(thanksTimerRef.current);
      thanksTimerRef.current = setTimeout(() => setShowThanks(false), 1500);
    } else {
      setShowThanks(false);
    }
  }, [feedback, message.id]);

  const relativeTime = useMemo(() => {
    if (!message.createdAt) return '';
    return formatRelativeTime(message.createdAt);
  }, [message.createdAt]);

  if (isUser) {
    return (
      <div className="group animate-message-in [content-visibility:auto] [contain-intrinsic-size:auto_60px]">
        {/* User bubble — contained, card background */}
        <div className="rounded-2xl border border-border bg-card/80 px-4 py-3 backdrop-blur-sm">
          <div className="mb-1.5 flex items-center gap-1.5">
            <div className="flex size-5 items-center justify-center rounded-full bg-primary/15">
              <User className="size-3 text-primary" aria-hidden="true" />
            </div>
            <span className="text-xs font-semibold text-foreground/90">You</span>
            {relativeTime && (
              <span className="text-xs text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
                {relativeTime}
              </span>
            )}
          </div>
          <div className="pl-[26px]">
            <p className="text-[15px] leading-[1.7] whitespace-pre-wrap break-words text-foreground [overflow-wrap:anywhere]">
              {textContent}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group animate-message-in [content-visibility:auto] [contain-intrinsic-size:auto_220px]">
      {/* AI response — open layout with left accent */}
      <div className="border-l-2 border-primary/20 pl-4">
        {/* Role label + actions */}
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex size-5 items-center justify-center rounded-full bg-primary/10">
            <Shield className="size-3 text-primary" aria-hidden="true" />
          </div>
          <span className="text-xs font-semibold text-foreground/90">BNBrain</span>
          {relativeTime && (
            <span className="text-xs text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
              {relativeTime}
            </span>
          )}
          {textContent && (
            <button
              type="button"
              onClick={handleCopy}
              className="ml-auto rounded-md p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
              title="Copy message"
              aria-label={copied ? 'Message copied' : 'Copy message'}
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-500" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
            </button>
          )}
          {!textContent && <div className="ml-auto" />}
          <button
            type="button"
            onClick={() => handleFeedback('up')}
            className={`rounded-md p-1 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              feedback === 'up'
                ? 'text-emerald-500 opacity-50'
                : 'text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-accent-foreground group-hover:opacity-100 focus-visible:opacity-100'
            }`}
            title={t('message.helpful')}
            aria-label={t('message.helpful')}
          >
            <ThumbsUp className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => handleFeedback('down')}
            className={`rounded-md p-1 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              feedback === 'down'
                ? 'text-rose-500 opacity-50'
                : 'text-muted-foreground/50 opacity-0 hover:bg-accent hover:text-accent-foreground group-hover:opacity-100 focus-visible:opacity-100'
            }`}
            title={t('message.notHelpful')}
            aria-label={t('message.notHelpful')}
          >
            <ThumbsDown className="size-3.5" aria-hidden="true" />
          </button>
          {showThanks && (
            <span className="animate-in fade-in text-xs text-muted-foreground/70">
              {t('message.feedbackThanks')}
            </span>
          )}
        </div>
        {/* Assistant content */}
        <div className="flex min-w-0 flex-col gap-3">
          {textContent ? <Markdown content={textContent} /> : null}
          {toolParts.map((part, idx) => {
            // When panel is active, render tool calls as compact inline badges
            if (hasPanel) {
              const tName = getToolName(part);
              const isDone = part.state === 'output-available';
              const isErr = part.state === 'output-error';
              const output = isDone ? (part.output as Record<string, unknown> | undefined) : undefined;
              const hidden = output?._hidden;
              if (hidden) return null;

              return (
                <ToolBadge
                  key={part.toolCallId}
                  toolCallId={part.toolCallId}
                  toolName={tName}
                  isDone={isDone}
                  isErr={isErr}
                  output={output}
                  conversationId={conversationId}
                  locale={locale}
                  onClick={() => onBadgeClick?.(part.toolCallId)}
                />
              );
            }

            return (
              <ToolInvocation
                key={part.toolCallId}
                toolInvocation={part}
                conversationId={conversationId}
                locale={locale}
                readOnly={readOnly}
                stepLabel={toolParts.length > 1 ? `${idx + 1}/${toolParts.length}` : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  return prev.message === next.message && prev.conversationId === next.conversationId && prev.readOnly === next.readOnly;
});
