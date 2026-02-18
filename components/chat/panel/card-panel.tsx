'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { BarChart3, X, ChevronDown, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getToolLabel,
  isHighRisk,
  renderFullCard,
  INTERACTIVE_TOOLS,
} from '../tool-invocation';
import { ToolInvocation } from '../tool-invocation';
import { CompactCardView } from './compact-card-view';
import type { PanelCard } from './panel-context';

interface CardPanelProps {
  cards: PanelCard[];
  locale: string;
  conversationId?: string | null;
  readOnly?: boolean;
  onClose: () => void;
  onCardClick?: (cardId: string) => void;
}

export function CardPanel({
  cards,
  locale,
  conversationId,
  readOnly,
  onClose,
  onCardClick,
}: CardPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const userToggledRef = useRef<Set<string>>(new Set());
  const panelEndRef = useRef<HTMLDivElement>(null);
  const prevCardCountRef = useRef(0);

  // Auto-collapse logic: when cards change, compute which should be expanded
  useEffect(() => {
    if (cards.length === 0) return;

    setExpandedIds(() => {
      const next = new Set<string>();

      // Loading cards always expanded
      for (const card of cards) {
        if (card.state === 'loading') next.add(card.id);
      }

      // Interactive tools always expanded
      for (const card of cards) {
        if (INTERACTIVE_TOOLS.has(card.toolName)) next.add(card.id);
      }

      // High-risk results always expanded
      for (const card of cards) {
        if (card.state === 'completed' && card.output && isHighRisk(card.output)) {
          next.add(card.id);
        }
      }

      // Latest completed card expanded
      for (let i = cards.length - 1; i >= 0; i--) {
        if (cards[i].state === 'completed' || cards[i].state === 'error') {
          next.add(cards[i].id);
          break;
        }
      }

      // Preserve user manual toggles
      for (const id of userToggledRef.current) {
        if (!cards.some((c) => c.id === id)) {
          userToggledRef.current.delete(id);
        }
      }

      return next;
    });
  }, [cards]);

  // Auto-scroll when new cards arrive
  useEffect(() => {
    if (cards.length > prevCardCountRef.current) {
      setTimeout(() => {
        panelEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 80);
    }
    prevCardCountRef.current = cards.length;
  }, [cards.length]);

  const handleToggle = useCallback((cardId: string) => {
    userToggledRef.current.add(cardId);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const completedCards = cards.filter(
    (c) => c.state === 'completed' || c.state === 'error'
  );
  const anyExpanded = completedCards.some((c) => expandedIds.has(c.id));

  const toggleAll = useCallback(() => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (anyExpanded) {
        for (const c of completedCards) {
          // Don't collapse interactive or high-risk
          if (INTERACTIVE_TOOLS.has(c.toolName)) continue;
          if (c.output && isHighRisk(c.output)) continue;
          next.delete(c.id);
        }
      } else {
        for (const c of completedCards) {
          next.add(c.id);
        }
      }
      return next;
    });
  }, [anyExpanded, completedCards]);

  const txStateKey = (card: PanelCard) =>
    !readOnly ? `${conversationId ?? 'local'}:${card.id}` : undefined;

  return (
    <div className="flex h-full flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 shrink-0">
        <BarChart3 className="size-4 text-primary" />
        <span className="text-sm font-medium">
          {locale === 'zh' ? '分析结果' : 'Results'}
        </span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {cards.length}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {completedCards.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              className="rounded-md px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {anyExpanded
                ? locale === 'zh'
                  ? '全部折叠'
                  : 'Collapse All'
                : locale === 'zh'
                  ? '全部展开'
                  : 'Expand All'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-3">
        {cards.map((card) => {
          const isExpanded = expandedIds.has(card.id);

          // Loading state
          if (card.state === 'loading') {
            return (
              <div key={card.id} data-card-id={card.id} className="animate-message-in">
                <ToolInvocation
                  toolInvocation={card.toolPart}
                  locale={locale}
                  conversationId={conversationId ?? undefined}
                />
              </div>
            );
          }

          // Error state
          if (card.state === 'error') {
            return (
              <div key={card.id} data-card-id={card.id} className="animate-message-in">
                <ToolInvocation
                  toolInvocation={card.toolPart}
                  locale={locale}
                  conversationId={conversationId ?? undefined}
                />
              </div>
            );
          }

          // Completed — collapsed
          if (!isExpanded) {
            return (
              <div key={card.id} data-card-id={card.id}>
                <CompactCardView
                  card={card}
                  locale={locale}
                  onExpand={() => handleToggle(card.id)}
                />
              </div>
            );
          }

          // Completed — expanded
          const highRisk = card.output ? isHighRisk(card.output) : false;
          return (
            <div key={card.id} data-card-id={card.id} className="animate-expand-in space-y-1">
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {getToolLabel(card.toolName, locale)}
                </span>
                {highRisk && (
                  <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400">
                    {locale === 'zh' ? '高风险' : 'High Risk'}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-0.5">
                  {onCardClick && (
                    <button
                      type="button"
                      onClick={() => onCardClick(card.id)}
                      title="Locate in chat"
                      className="rounded p-1 text-muted-foreground/50 hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <MessageSquare className="size-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleToggle(card.id)}
                    title="Collapse"
                    className="rounded p-1 text-muted-foreground/50 hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <ChevronDown className="size-3" />
                  </button>
                </div>
              </div>
              <div
                className={cn(
                  'rounded-lg border p-0.5 transition-shadow hover:shadow-md',
                  highRisk
                    ? 'border-red-500/30 bg-red-500/5'
                    : 'border-border'
                )}
              >
                {card.output
                  ? renderFullCard(
                      card.toolName,
                      card.output,
                      txStateKey(card),
                      conversationId ?? undefined,
                      readOnly
                    )
                  : null}
              </div>
            </div>
          );
        })}
        <div ref={panelEndRef} />
      </div>
    </div>
  );
}
