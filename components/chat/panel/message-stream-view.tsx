import { useEffect, useRef, useState, type RefObject } from 'react';

import type { UIMessage } from 'ai';
import { VList, type VListHandle } from 'virtua';

import { Message } from '../message';
import { InterruptedHint } from './interrupted-hint';
import { StreamingIndicator } from './streaming-indicator';

/** Keep the indicator visible for a grace period after isStreaming goes false,
 *  so it doesn't flicker during multi-tool responses (streaming→ready→submitted→streaming). */
const HIDE_DELAY_MS = 600;

interface MessageStreamViewProps {
  locale: 'en' | 'zh';
  t: (key: string) => string;
  viewportConversationKey: string;
  renderedMessages: UIMessage[];
  activeConversationId: string | null;
  isLoadingOlderMessages: boolean;
  isStreaming: boolean;
  readOnly?: boolean;
  onMessageListScroll: (offset: number) => void;
  messageListRef: RefObject<VListHandle | null>;
  showStreamSlowHint: boolean;
  showInterruptedHint: boolean;
  interruptedHintText: string;
  onContinueGeneration: () => void;
  onDismissInterrupted: () => void;
  hasPanel?: boolean;
}

export function MessageStreamView({
  locale,
  t,
  viewportConversationKey,
  renderedMessages,
  activeConversationId,
  isLoadingOlderMessages,
  isStreaming,
  readOnly,
  onMessageListScroll,
  messageListRef,
  showStreamSlowHint,
  showInterruptedHint,
  interruptedHintText,
  onContinueGeneration,
  onDismissInterrupted,
  hasPanel,
}: MessageStreamViewProps) {
  const safeRenderedMessages = renderedMessages.filter(
    (message): message is UIMessage =>
      Boolean(message?.id && typeof message.id === 'string')
  );
  const shouldShift = isLoadingOlderMessages && safeRenderedMessages.length > 0;

  const lastIsAssistant =
    safeRenderedMessages.length > 0 &&
    safeRenderedMessages[safeRenderedMessages.length - 1].role === 'assistant';

  // Debounced visibility: stays true for HIDE_DELAY_MS after isStreaming goes false
  const [showIndicator, setShowIndicator] = useState(isStreaming);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isStreaming) {
      // Immediately show when streaming starts
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setShowIndicator(true);
    } else {
      // Delay hiding to absorb tool-call flickers
      hideTimerRef.current = setTimeout(() => {
        setShowIndicator(false);
        hideTimerRef.current = null;
      }, HIDE_DELAY_MS);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isStreaming]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" aria-busy={isLoadingOlderMessages}>
      <VList
        key={viewportConversationKey}
        ref={messageListRef}
        itemSize={hasPanel ? 100 : 220}
        bufferSize={1200}
        shift={shouldShift}
        onScroll={onMessageListScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {safeRenderedMessages.map((message) => (
          <div key={message.id} className="mx-auto w-full max-w-3xl px-2 pb-5 sm:px-3 sm:pb-7">
            <Message
              message={message}
              conversationId={readOnly ? undefined : activeConversationId ?? undefined}
              readOnly={readOnly}
            />
          </div>
        ))}

        {/* Interrupted: resume / dismiss controls */}
        {showInterruptedHint && (
          <div key="__interrupted" className="mx-auto w-full max-w-3xl px-2 pb-5 sm:px-3 sm:pb-7">
            <InterruptedHint
              text={interruptedHintText}
              t={t}
              onContinue={onContinueGeneration}
              onDismiss={onDismissInterrupted}
            />
          </div>
        )}
      </VList>

      {/* Streaming indicator — rendered OUTSIDE VList to avoid layout shift.
          Uses fixed height + opacity transition instead of conditional mount/unmount. */}
      <div
        className={`mx-auto w-full max-w-3xl px-2 sm:px-3 transition-opacity duration-200 ${
          showIndicator ? 'h-auto opacity-100' : 'h-0 overflow-hidden opacity-0'
        }`}
        aria-hidden={!showIndicator}
      >
        <div className="pb-3">
          <StreamingIndicator withHeader={!lastIsAssistant} />
        </div>
      </div>
    </div>
  );
}
