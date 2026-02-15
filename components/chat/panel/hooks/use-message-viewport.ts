import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react';

import type { UIMessage } from 'ai';
import type { VListHandle } from 'virtua';

import {
  AUTO_LOAD_COOLDOWN_MS,
  AUTO_LOAD_TOP_THRESHOLD,
  AUTO_SCROLL_SETTLE_GAP_PX,
  AUTO_SCROLL_SETTLE_INTERVAL_MS,
  AUTO_SCROLL_SETTLE_MAX_ATTEMPTS,
  INITIAL_MESSAGE_PAGE_SIZE,
  MESSAGE_PAGE_SIZE,
} from '../constants';
import { nowMs } from '../utils';

interface UseMessageViewportParams {
  activeConversationId: string | null;
  viewportConversationKey: string;
  visibleMessages: UIMessage[];
  isStreaming: boolean;
  messageListRef: RefObject<VListHandle | null>;
  pendingSwitchConversationIdRef: MutableRefObject<string | null>;
  switchMessagesMeasuredRef: MutableRefObject<boolean>;
  switchMeasureStartRef: MutableRefObject<number | null>;
  onConversationMessagesReady: (elapsedMs: number) => void;
  onConversationScrolled: (elapsedMs: number) => void;
}

export function useMessageViewport({
  activeConversationId,
  viewportConversationKey,
  visibleMessages,
  isStreaming,
  messageListRef,
  pendingSwitchConversationIdRef,
  switchMessagesMeasuredRef,
  switchMeasureStartRef,
  onConversationMessagesReady,
  onConversationScrolled,
}: UseMessageViewportParams) {
  const [visibleMessageCount, setVisibleMessageCount] = useState(INITIAL_MESSAGE_PAGE_SIZE);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);

  const [isAtBottom, setIsAtBottom] = useState(true);

  const loadingOlderMessagesRef = useRef(false);
  const prevMessageScrollOffsetRef = useRef<number | null>(null);
  const lastAutoLoadOlderAtRef = useRef(0);
  const lastScrolledConversationRef = useRef<string | null>(null);
  const userScrolledUpRef = useRef(false);

  const resetViewport = useCallback(() => {
    setVisibleMessageCount(INITIAL_MESSAGE_PAGE_SIZE);
    setIsLoadingOlderMessages(false);
    prevMessageScrollOffsetRef.current = null;
    lastAutoLoadOlderAtRef.current = 0;
    userScrolledUpRef.current = false;
  }, []);

  const renderedMessages = useMemo(() => {
    if (visibleMessages.length <= visibleMessageCount) return visibleMessages;
    return visibleMessages.slice(-visibleMessageCount);
  }, [visibleMessages, visibleMessageCount]);

  const hiddenMessageCount = Math.max(0, visibleMessages.length - renderedMessages.length);
  const isEmpty = renderedMessages.length === 0;
  const lastRenderedMessageId =
    renderedMessages.length > 0
      ? String(renderedMessages[renderedMessages.length - 1]?.id ?? '')
      : null;

  const loadOlderMessages = useCallback(() => {
    if (hiddenMessageCount === 0 || isLoadingOlderMessages) return;
    loadingOlderMessagesRef.current = true;
    prevMessageScrollOffsetRef.current = null;
    setIsLoadingOlderMessages(true);
    setVisibleMessageCount((prev) =>
      Math.min(visibleMessages.length, prev + MESSAGE_PAGE_SIZE)
    );
  }, [hiddenMessageCount, isLoadingOlderMessages, visibleMessages.length]);

  const handleMessageListScroll = useCallback(
    (offset: number) => {
      if (!Number.isFinite(offset)) return;
      const previousOffset = prevMessageScrollOffsetRef.current;
      prevMessageScrollOffsetRef.current = offset;

      // Track whether user has scrolled away from bottom.
      const list = messageListRef.current;
      if (list) {
        const scrollSize = list.scrollSize;
        const viewportSize = list.viewportSize;
        if (Number.isFinite(scrollSize) && Number.isFinite(viewportSize)) {
          const distanceFromBottom = scrollSize - (offset + viewportSize);
          const wasAtBottom = !userScrolledUpRef.current;
          // Consider "at bottom" when within a generous threshold.
          userScrolledUpRef.current = distanceFromBottom > 60;
          const nowAtBottom = !userScrolledUpRef.current;
          if (nowAtBottom !== wasAtBottom) {
            setIsAtBottom(nowAtBottom);
          }
        }
      }

      if (previousOffset === null) return;
      const isScrollingUp = offset < previousOffset;
      if (!isScrollingUp) return;
      if (offset > AUTO_LOAD_TOP_THRESHOLD) return;
      if (hiddenMessageCount === 0 || isLoadingOlderMessages) return;
      const now = Date.now();
      if (now - lastAutoLoadOlderAtRef.current < AUTO_LOAD_COOLDOWN_MS) return;
      lastAutoLoadOlderAtRef.current = now;
      loadOlderMessages();
    },
    [hiddenMessageCount, isLoadingOlderMessages, loadOlderMessages, messageListRef]
  );

  useEffect(() => {
    if (!isLoadingOlderMessages) return;
    const frame = requestAnimationFrame(() => {
      setIsLoadingOlderMessages(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [isLoadingOlderMessages, renderedMessages.length]);

  useEffect(() => {
    if (!activeConversationId) return;
    if (pendingSwitchConversationIdRef.current !== activeConversationId) return;
    if (switchMessagesMeasuredRef.current) return;
    const startedAt = switchMeasureStartRef.current;
    if (startedAt === null) return;
    onConversationMessagesReady(Number((nowMs() - startedAt).toFixed(1)));
    switchMessagesMeasuredRef.current = true;
  }, [
    activeConversationId,
    renderedMessages.length,
    pendingSwitchConversationIdRef,
    switchMessagesMeasuredRef,
    switchMeasureStartRef,
    onConversationMessagesReady,
  ]);

  const scrollToBottom = useCallback(() => {
    const target = renderedMessages.length - 1;
    if (target < 0) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const list = messageListRef.current;
        if (!list) return;
        // Align to end so the latest message tail is visible.
        list.scrollToIndex(target, { align: 'end' });
        // Fallback for delayed dynamic-height measurement (markdown/tool cards).
        const scrollSize = list.scrollSize;
        const scrollOffset = list.scrollOffset;
        const viewportSize = list.viewportSize;
        if (
          !Number.isFinite(scrollSize) ||
          !Number.isFinite(scrollOffset) ||
          !Number.isFinite(viewportSize)
        ) {
          return;
        }
        const remain = scrollSize - (scrollOffset + viewportSize);
        if (Number.isFinite(remain) && remain > AUTO_SCROLL_SETTLE_GAP_PX) {
          list.scrollTo(scrollSize);
        }
      });
    });
  }, [renderedMessages.length, messageListRef]);

  const startSettledAutoScroll = useCallback(() => {
    let settled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = () => {
      if (settled) return;
      attempts += 1;
      scrollToBottom();
      const list = messageListRef.current;
      if (!list) return;
      const scrollSize = list.scrollSize;
      const scrollOffset = list.scrollOffset;
      const viewportSize = list.viewportSize;
      if (
        !Number.isFinite(scrollSize) ||
        !Number.isFinite(scrollOffset) ||
        !Number.isFinite(viewportSize)
      ) {
        return;
      }
      const remain = scrollSize - (scrollOffset + viewportSize);
      if (!Number.isFinite(remain) || remain <= AUTO_SCROLL_SETTLE_GAP_PX) return;
      if (attempts >= AUTO_SCROLL_SETTLE_MAX_ATTEMPTS) return;
      timer = setTimeout(run, AUTO_SCROLL_SETTLE_INTERVAL_MS);
    };

    timer = setTimeout(run, AUTO_SCROLL_SETTLE_INTERVAL_MS);
    return () => {
      settled = true;
      if (timer) clearTimeout(timer);
    };
  }, [messageListRef, scrollToBottom]);

  useEffect(() => {
    if (loadingOlderMessagesRef.current) {
      loadingOlderMessagesRef.current = false;
      return;
    }
    if (!renderedMessages.length) return;
    const switchedConversation =
      lastScrolledConversationRef.current !== viewportConversationKey;
    lastScrolledConversationRef.current = viewportConversationKey;
    if (switchedConversation) {
      userScrolledUpRef.current = false;
      scrollToBottom();
    } else if (isStreaming && !userScrolledUpRef.current) {
      scrollToBottom();
    }
    let settleTimerA: ReturnType<typeof setTimeout> | null = null;
    let settleTimerB: ReturnType<typeof setTimeout> | null = null;
    let stopSettledAutoScroll: (() => void) | null = null;
    if (switchedConversation) {
      settleTimerA = setTimeout(scrollToBottom, 120);
      settleTimerB = setTimeout(scrollToBottom, 320);
      stopSettledAutoScroll = startSettledAutoScroll();
      const startedAt = switchMeasureStartRef.current;
      if (startedAt !== null) {
        const elapsedMs = Number((nowMs() - startedAt).toFixed(1));
        onConversationScrolled(elapsedMs);
        switchMeasureStartRef.current = null;
      }
      pendingSwitchConversationIdRef.current = null;
      switchMessagesMeasuredRef.current = false;
    }
    return () => {
      if (settleTimerA) clearTimeout(settleTimerA);
      if (settleTimerB) clearTimeout(settleTimerB);
      stopSettledAutoScroll?.();
    };
  }, [
    renderedMessages.length,
    lastRenderedMessageId,
    viewportConversationKey,
    isStreaming,
    scrollToBottom,
    startSettledAutoScroll,
    pendingSwitchConversationIdRef,
    switchMessagesMeasuredRef,
    switchMeasureStartRef,
    onConversationScrolled,
  ]);

  return {
    visibleMessageCount,
    isLoadingOlderMessages,
    renderedMessages,
    hiddenMessageCount,
    isEmpty,
    isAtBottom,
    loadOlderMessages,
    handleMessageListScroll,
    scrollToBottom,
    resetViewport,
  };
}
