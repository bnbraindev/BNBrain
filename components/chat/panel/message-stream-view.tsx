import type { RefObject } from 'react';

import type { UIMessage } from 'ai';
import { VList, type VListHandle } from 'virtua';

import { Message } from '../message';
import { InterruptedHint } from './interrupted-hint';
import { ContinuationIndicator, StreamingIndicator } from './streaming-indicator';

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

  // Show pulsing dots when streaming and the assistant message hasn't appeared yet
  const lastIsAssistant =
    safeRenderedMessages.length > 0 &&
    safeRenderedMessages[safeRenderedMessages.length - 1].role === 'assistant';
  const showStreamingIndicator = isStreaming && !lastIsAssistant;
  const showContinuationIndicator = isStreaming && lastIsAssistant;

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

        {/* Streaming: pulsing dots until the assistant message appears */}
        {showStreamingIndicator && (
          <div key="__streaming" className="mx-auto w-full max-w-3xl px-2 pb-5 sm:px-3 sm:pb-7">
            <StreamingIndicator />
          </div>
        )}

        {/* Continuation: small dots after assistant message while still streaming */}
        {showContinuationIndicator && (
          <div key="__continuing" className="mx-auto w-full max-w-3xl px-2 pb-3 sm:px-3">
            <ContinuationIndicator />
          </div>
        )}

        {/* Stalled hint removed — tool execution pauses (e.g. deepTokenAnalysis ~60s)
           triggered this too aggressively, causing unnecessary user anxiety. */}

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
    </div>
  );
}
