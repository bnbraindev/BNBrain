'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { ChatInput } from './chat-input';
import { useChatStore } from '@/lib/stores/chat-store';
import { useI18n } from '@/lib/i18n/context';
import { mapChatErrorToUserMessage } from '@/lib/utils/chat-error';
import { retryingFetch } from '@/lib/utils/retry-fetch';
import { useToast } from '@/components/ui/toast';
import { useAccount } from 'wagmi';
import { RPC_URLS } from '@/lib/chain/config';
import { useDebugMode } from '@/lib/debug/context';
import { toCachedUIMessages } from '@/lib/chat/ui-message-cache';
import {
  clearPendingRun,
  getPendingRun,
  type PersistedPendingRun,
} from '@/lib/chat/pending-run-store';
import {
  fetchSharedConversation,
  forkSharedConversation,
  generateConversationTitle,
  type OwnerIdentity,
  type TitleGenerationMessage,
} from '@/lib/services/conversation-sync';
import { useShallow } from 'zustand/react/shallow';
import { type VListHandle } from 'virtua';
import { ChatErrorBanner } from './panel/chat-error-banner';
import {
  QUICK_ACTIONS_EN,
  QUICK_ACTIONS_ZH,
  RESTORED_RUN_STALE_MS,
} from './panel/constants';
import { DebugPanel } from './panel/debug-panel';
import { useConversationSync } from './panel/hooks/use-conversation-sync';
import { EmptyState } from './panel/empty-state';
import { useInterruptedHint } from './panel/hooks/use-interrupted-hint';
import { useMessageViewport } from './panel/hooks/use-message-viewport';
import { useStreamLifecycle } from './panel/hooks/use-stream-lifecycle';
import { MessageStreamView } from './panel/message-stream-view';
import type { ChatPerfStats } from './panel/types';
import {
  chainNameById,
  dedupeUIMessagesById,
  getAssistantOutputMeta,
  hasUnansweredUserTurn,
  nowMs,
  parseEvmChainId,
  toStoredMessages,
} from './panel/utils';

const SHARE_FORK_PENDING_MESSAGE_KEY = 'bnbrain-share-fork-pending-message';
const SHARE_FORK_PENDING_MESSAGE_TTL_MS = 2 * 60 * 1000;
const TITLE_CONTEXT_LIMIT = 8;

interface ShareForkPendingMessage {
  conversationId: string;
  text: string;
  createdAt: number;
}

function normalizeTitleCheck(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[!！。,.?？\s]/g, '');
}

function isWeakConversationTitle(value: string | undefined): boolean {
  if (!value) return true;
  if (value === 'New conversation') return true;
  const normalized = normalizeTitleCheck(value);
  if (!normalized) return true;
  return (
    normalized === 'hi' ||
    normalized === 'hello' ||
    normalized === 'hey' ||
    normalized === 'yo' ||
    normalized === 'gm' ||
    normalized === 'gn' ||
    normalized === '你好' ||
    normalized === '您好' ||
    normalized === '嗨' ||
    normalized === '哈喽'
  );
}

function toLocalTitleSnippet(text: string): string {
  const compact = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return 'New conversation';
  return compact.length > 56 ? `${compact.slice(0, 56).trim()}…` : compact;
}

function writePendingShareForkMessage(message: ShareForkPendingMessage): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      SHARE_FORK_PENDING_MESSAGE_KEY,
      JSON.stringify(message)
    );
  } catch {
    // Ignore storage write failures.
  }
}

function readPendingShareForkMessage():
  | ShareForkPendingMessage
  | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SHARE_FORK_PENDING_MESSAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ShareForkPendingMessage>;
    if (
      typeof parsed?.conversationId !== 'string' ||
      typeof parsed?.text !== 'string' ||
      typeof parsed?.createdAt !== 'number'
    ) {
      return null;
    }
    return {
      conversationId: parsed.conversationId,
      text: parsed.text,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

function clearPendingShareForkMessage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SHARE_FORK_PENDING_MESSAGE_KEY);
  } catch {
    // Ignore storage delete failures.
  }
}

export interface ChatPanelProps {
  shareToken?: string | null;
}

export function ChatPanel({ shareToken = null }: ChatPanelProps) {
  const { t, locale } = useI18n();
  const { enabled: debugMode } = useDebugMode();
  const { pushToast } = useToast();
  const lastToastErrorRef = useRef<string | null>(null);
  const switchMeasureStartRef = useRef<number | null>(null);
  const pendingSwitchConversationIdRef = useRef<string | null>(null);
  const switchMessagesMeasuredRef = useRef(false);
  const perfStatsRef = useRef<ChatPerfStats>({
    lastConversationSwitchMs: null,
    lastConversationMessagesReadyMs: null,
    lastConversationScrollMs: null,
    lastStoreSyncMs: null,
    storeSyncCount: 0,
    lastStoreSyncMessageCount: 0,
    syncQueueSize: 0,
    syncRetryCount: 0,
    lastSyncRetryDelayMs: null,
  });
  const { address: connectedAddress, chain } = useAccount();
  const [injectedChainId, setInjectedChainId] = useState<number | undefined>(undefined);
  const [sharedConversation, setSharedConversation] = useState<{
    title: string;
    messages: Array<{
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      parts?: Array<{ type: string; [key: string]: unknown }>;
      createdAt?: number;
    }>;
  } | null>(null);
  const [sharedConversationLoading, setSharedConversationLoading] = useState(false);
  const [sharedConversationError, setSharedConversationError] = useState<string | null>(null);
  const [forkingFromShare, setForkingFromShare] = useState(false);
  const messageListRef = useRef<VListHandle | null>(null);
  const titleGenerationInFlightRef = useRef<Set<string>>(new Set());
  const lastCancelRequestAtRef = useRef<Map<string, number>>(new Map());
  const QUICK_ACTIONS = locale === 'zh' ? QUICK_ACTIONS_ZH : QUICK_ACTIONS_EN;

  const {
    activeConversationId,
    draftConversation,
    guestId,
    hydratedOwnerKey,
    updateConversationMessages,
    updateConversationTitle,
    updateConversationContextStatus,
    hydrateFromRemote,
    createConversation,
    setActiveConversation,
    setConversationForkSource,
    setSharedViewConversation,
    ensureWalletConversation,
    authenticatedAddress,
    selectedModelId,
  } = useChatStore(
    useShallow((state) => ({
      activeConversationId: state.activeConversationId,
      draftConversation: state.draftConversation,
      guestId: state.guestId,
      hydratedOwnerKey: state.hydratedOwnerKey,
      updateConversationMessages: state.updateConversationMessages,
      updateConversationTitle: state.updateConversationTitle,
      updateConversationContextStatus: state.updateConversationContextStatus,
      hydrateFromRemote: state.hydrateFromRemote,
      createConversation: state.createConversation,
      setActiveConversation: state.setActiveConversation,
      setConversationForkSource: state.setConversationForkSource,
      setSharedViewConversation: state.setSharedViewConversation,
      ensureWalletConversation: state.ensureWalletConversation,
      authenticatedAddress: state.authenticatedAddress,
      selectedModelId: state.selectedModelId,
    }))
  );

  const activeConv = useChatStore((state) => {
    if (!state.activeConversationId) return undefined;
    return state.conversations.find(
      (conversation) => conversation.id === state.activeConversationId
    );
  });
  const ownerScopedConversationIds = useChatStore(
    useShallow((state) => {
      const ownerType = state.authenticatedAddress ? 'wallet' : 'guest';
      const ownerId = state.authenticatedAddress?.toLowerCase() ?? state.guestId;
      const ids: string[] = [];
      for (const conversation of state.conversations) {
        const isOwnerConversation =
          ownerType === 'wallet'
            ? conversation.scope === 'wallet' &&
              conversation.walletAddress?.toLowerCase() === ownerId
            : conversation.scope === 'guest';
        if (isOwnerConversation) {
          ids.push(conversation.id);
        }
      }
      return ids;
    })
  );
  const activeScope = activeConv?.scope ?? (activeConv?.walletAddress ? 'wallet' : 'guest');
  const isReadingSharedConversation = Boolean(shareToken);
  const chainId = chain?.id ?? injectedChainId ?? 56;
  const chainSource: 'wagmi' | 'injected' | 'fallback' = chain?.id
    ? 'wagmi'
    : injectedChainId
      ? 'injected'
      : 'fallback';
  const rpcUrl = RPC_URLS[chainId] ?? RPC_URLS[56];
  const currentAddress = authenticatedAddress ?? connectedAddress ?? null;
  const isAuthenticated = Boolean(authenticatedAddress && currentAddress);
  const isDraftConversation = Boolean(
    draftConversation && !activeConversationId && !isReadingSharedConversation
  );
  const chatSessionId = isReadingSharedConversation
    ? `share-preview-${shareToken ?? 'unknown'}`
    : activeConversationId ?? draftConversation?.draftId ?? undefined;
  const ownerIdentity = useMemo<OwnerIdentity>(
    () =>
      authenticatedAddress
        ? {
            ownerType: 'wallet',
            ownerId: authenticatedAddress.toLowerCase(),
          }
        : {
            ownerType: 'guest',
            ownerId: guestId,
          },
    [authenticatedAddress, guestId]
  );
  const ownerKey = `${ownerIdentity.ownerType}:${ownerIdentity.ownerId}`;

  useEffect(() => {
    if (!shareToken) {
      setSharedConversation(null);
      setSharedConversationLoading(false);
      setSharedConversationError(null);
      setSharedViewConversation(null);
      return;
    }

    let cancelled = false;
    setSharedConversationLoading(true);
    setSharedConversationError(null);
    setSharedConversation(null);

    const loadSharedConversation = async () => {
      try {
        const conversation = await fetchSharedConversation(shareToken);
        if (cancelled) return;
        setSharedConversation({
          title: conversation.title,
          messages: conversation.messages,
        });
        setSharedViewConversation({
          token: shareToken,
          title: conversation.title || (locale === 'zh' ? '共享会话' : 'Shared conversation'),
        });
      } catch (error) {
        if (cancelled) return;
        setSharedConversationError(
          error instanceof Error && error.message
            ? error.message
            : locale === 'zh'
              ? '共享会话加载失败'
              : 'Failed to load shared conversation'
        );
        setSharedViewConversation({
          token: shareToken,
          title: locale === 'zh' ? '共享会话' : 'Shared conversation',
        });
      } finally {
        if (!cancelled) {
          setSharedConversationLoading(false);
        }
      }
    };

    void loadSharedConversation();
    return () => {
      cancelled = true;
    };
  }, [shareToken, locale, setSharedViewConversation]);
  const cancelRunOnServer = useCallback(
    async (conversationId: string | null | undefined) => {
      if (!conversationId) return;
      const now = Date.now();
      const lastRequestedAt =
        lastCancelRequestAtRef.current.get(conversationId) ?? 0;
      if (now - lastRequestedAt < 1200) return;
      lastCancelRequestAtRef.current.set(conversationId, now);
      try {
        await fetch(`/api/chat/${encodeURIComponent(conversationId)}/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-bnb-owner-type': ownerIdentity.ownerType,
            'x-bnb-owner-id': ownerIdentity.ownerId,
          },
          body: JSON.stringify({
            owner: ownerIdentity,
          }),
          keepalive: true,
        });
      } catch {
        // Best effort cancellation; local stream stop still applies.
      }
    },
    [ownerIdentity]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const provider = (
      window as typeof window & {
        ethereum?: {
          chainId?: string | number;
          on?: (event: string, cb: (value: unknown) => void) => void;
          removeListener?: (event: string, cb: (value: unknown) => void) => void;
        };
      }
    ).ethereum;
    if (!provider) return;

    const update = (raw?: unknown) => {
      const parsed = parseEvmChainId(raw ?? provider.chainId);
      setInjectedChainId(parsed);
    };
    update();

    if (!provider.on) return;
    const onChainChanged = (value: unknown) => update(value);
    provider.on('chainChanged', onChainChanged);
    return () => {
      provider.removeListener?.('chainChanged', onChainChanged);
    };
  }, []);

  const userContext = useMemo(() => ({
    authState: isAuthenticated ? 'authenticated' : 'guest',
    address: isAuthenticated ? currentAddress : null,
    guestId,
    chainId,
    chainName: chain?.name ?? chainNameById(chainId),
    rpcUrl,
    connector: 'wallet',
    conversationScope: activeScope,
    conversationContextStatus: activeConv?.contextInjectionStatus ?? 'not_injected',
    modelId: selectedModelId ?? undefined,
  }), [
    isAuthenticated,
    currentAddress,
    guestId,
    chainId,
    chain?.name,
    rpcUrl,
    activeScope,
    activeConv?.contextInjectionStatus,
    selectedModelId,
  ]);

  const contextFingerprint = useMemo(
    () =>
      `${userContext.authState}|${userContext.address ?? ''}|${userContext.chainId}|${userContext.rpcUrl}`,
    [userContext.authState, userContext.address, userContext.chainId, userContext.rpcUrl]
  );

  const userContextRef = useRef(userContext);
  const ownerRef = useRef(ownerIdentity);
  useEffect(() => {
    userContextRef.current = userContext;
  }, [userContext]);
  useEffect(() => {
    ownerRef.current = ownerIdentity;
  }, [ownerIdentity]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        fetch: retryingFetch,
        prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => {
          const currentContext = userContextRef.current;
          const currentOwner = ownerRef.current;
          const requestBody = {
            ...(body ?? {}),
            id,
            messages,
            trigger,
            messageId,
            userContext: currentContext,
            owner: currentOwner,
          };
          return {
            body: requestBody,
            headers: {
              'x-bnb-owner-type': currentOwner.ownerType,
              'x-bnb-owner-id': currentOwner.ownerId,
            },
          };
        },
        prepareReconnectToStreamRequest: ({ id, headers }) => {
          const currentOwner = ownerRef.current;
          return {
            api: `/api/chat/${encodeURIComponent(id)}/stream`,
            headers: {
              ...(headers as Record<string, string>),
              'x-bnb-owner-type': currentOwner.ownerType,
              'x-bnb-owner-id': currentOwner.ownerId,
            },
          };
        },
      }),
    []
  );
  const restoredMessages = useMemo(
    () => {
      if (isReadingSharedConversation) {
        if (sharedConversation?.messages?.length) {
          return toCachedUIMessages(sharedConversation.messages);
        }
        // Keep share preview isolated from any local active conversation while loading.
        return [];
      }
      if (activeConv?.messages?.length) {
        return toCachedUIMessages(activeConv.messages);
      }
      return undefined;
    },
    [activeConv?.messages, isReadingSharedConversation, sharedConversation?.messages]
  );

  const { messages, setMessages, sendMessage, status, error, stop, regenerate, resumeStream } = useChat({
    id: chatSessionId,
    transport,
    messages: restoredMessages,
    // We trigger resume manually to avoid duplicate resume calls in StrictMode.
    resume: false,
  });
  useEffect(() => {
    if (!isReadingSharedConversation) return;
    if (status === 'streaming' || status === 'submitted') return;
    if (sharedConversation?.messages?.length) {
      setMessages(toCachedUIMessages(sharedConversation.messages));
      return;
    }
    setMessages([]);
  }, [
    isReadingSharedConversation,
    sharedConversation?.messages,
    setMessages,
    status,
  ]);
  const restoredPendingRun: PersistedPendingRun | null = (() => {
    if (!activeConversationId) return null;
    const restored = getPendingRun(activeConversationId);
    if (!restored) return null;
    const activityAt = restored.lastChunkAt ?? restored.firstChunkAt ?? restored.startedAt;
    const age = Date.now() - activityAt;
    if (age > RESTORED_RUN_STALE_MS) return null;
    return restored;
  })();

  const activeAssistantOutput = useMemo(
    () => getAssistantOutputMeta(messages),
    [messages]
  );
  const apiChatError = useMemo(
    () => (error ? mapChatErrorToUserMessage(error, locale) : null),
    [error, locale]
  );
  const {
    streamLifecycle,
    localChatError,
    isStreaming,
    startStreamRun,
    markStreamCancelled,
    handleStop,
    canStartRun,
    clearLocalChatError,
  } = useStreamLifecycle({
    activeConversationId,
    chatSessionId,
    status,
    activeAssistantOutput,
    restoredPendingRun,
    apiHasError: Boolean(apiChatError),
    locale,
    t,
    stop,
    resumeStream,
    cancelRunOnServer,
  });
  const previousConversationRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousConversationRef.current;
    const switchedConversation =
      Boolean(previous) && previous !== activeConversationId;
    if (switchedConversation) {
      clearLocalChatError();
      if (isStreaming) {
        void cancelRunOnServer(previous);
        stop();
        markStreamCancelled();
      }
    }
    if (switchedConversation || (!previous && activeConversationId)) {
      switchMeasureStartRef.current = nowMs();
      pendingSwitchConversationIdRef.current = activeConversationId;
      switchMessagesMeasuredRef.current = false;
    } else if (!activeConversationId) {
      switchMeasureStartRef.current = null;
      pendingSwitchConversationIdRef.current = null;
      switchMessagesMeasuredRef.current = false;
    }
    previousConversationRef.current = activeConversationId;
  }, [
    activeConversationId,
    isStreaming,
    cancelRunOnServer,
    stop,
    markStreamCancelled,
    clearLocalChatError,
  ]);

  const chatError = localChatError ?? apiChatError;

  useEffect(() => {
    if (!activeConversationId) return;
    const restored = getPendingRun(activeConversationId);
    if (!restored) return;
    const activityAt = restored.lastChunkAt ?? restored.firstChunkAt ?? restored.startedAt;
    const age = Date.now() - activityAt;
    if (age > RESTORED_RUN_STALE_MS) {
      clearPendingRun(activeConversationId);
    }
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId || !activeConv) return;
    if (activeScope !== 'wallet') return;
    if (activeConv.contextInjectionStatus !== 'injected') return;
    if (!activeConv.contextFingerprint) return;
    if (activeConv.contextFingerprint === contextFingerprint) return;
    updateConversationContextStatus(activeConversationId, 'stale');
  }, [
    activeConversationId,
    activeConv,
    activeScope,
    contextFingerprint,
    updateConversationContextStatus,
  ]);

  useConversationSync({
    ownerKey,
    ownerIdentity,
    hydratedOwnerKey,
    ownerScopedConversationIds,
    activeConversationId,
    activeConversation: activeConv,
    isStreaming,
    hydrateFromRemote,
    perfStatsRef,
  });

  // Sync messages back to store on changes
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (!activeConversationId || messages.length === 0) return;
    if (messages.length === prevLenRef.current && isStreaming) return;
    prevLenRef.current = messages.length;
    const syncStartMs = nowMs();
    const previousById = new Map(
      (activeConv?.messages ?? []).map((item) => [item.id, item])
    );
    const nextStoredMessages = toStoredMessages(messages, previousById);
    updateConversationMessages(activeConversationId, nextStoredMessages);
    const syncElapsedMs = nowMs() - syncStartMs;
    perfStatsRef.current.lastStoreSyncMs = Number(syncElapsedMs.toFixed(1));
    perfStatsRef.current.lastStoreSyncMessageCount = nextStoredMessages.length;
    perfStatsRef.current.storeSyncCount += 1;
  }, [
    messages,
    activeConversationId,
    updateConversationMessages,
    isStreaming,
    activeConv?.messages,
  ]);

  const visibleMessages = useMemo(() => {
    const liveMessages = dedupeUIMessagesById(messages).filter((m) => m.role !== 'system');
    if (liveMessages.length > 0) return liveMessages;
    if (isReadingSharedConversation && sharedConversation?.messages?.length) {
      return toCachedUIMessages(sharedConversation.messages).filter(
        (message) => message.role !== 'system'
      );
    }
    return liveMessages;
  }, [messages, isReadingSharedConversation, sharedConversation?.messages]);
  const viewportConversationKey = useMemo(() => {
    if (isReadingSharedConversation && shareToken) {
      return `share:${shareToken}`;
    }
    if (activeConversationId) {
      return `chat:${activeConversationId}`;
    }
    if (draftConversation?.draftId) {
      return `draft:${draftConversation.draftId}`;
    }
    return 'chat:root';
  }, [
    isReadingSharedConversation,
    shareToken,
    activeConversationId,
    draftConversation?.draftId,
  ]);
  const hasInterruptedTurn = useMemo(
    () => hasUnansweredUserTurn(visibleMessages),
    [visibleMessages]
  );
  const {
    interruptedHintText,
    showInterruptedHint,
    showPendingAssistantCard,
    showStreamSlowHint,
    pendingAssistantText,
    dismissInterruptedHint,
    resetInterruptedHint,
  } = useInterruptedHint({
    activeConversationId,
    restoredPendingRun,
    isStreaming,
    hasInterruptedTurn,
    visibleMessageCount: visibleMessages.length,
    chatError,
    streamLifecycle,
    t,
  });

  const {
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
  } = useMessageViewport({
    activeConversationId,
    viewportConversationKey,
    visibleMessages,
    isStreaming,
    messageListRef,
    pendingSwitchConversationIdRef,
    switchMessagesMeasuredRef,
    switchMeasureStartRef,
    onConversationMessagesReady: (elapsedMs) => {
      perfStatsRef.current.lastConversationMessagesReadyMs = elapsedMs;
    },
    onConversationScrolled: (elapsedMs) => {
      perfStatsRef.current.lastConversationScrollMs = elapsedMs;
      perfStatsRef.current.lastConversationSwitchMs = elapsedMs;
    },
  });
  const showSharedLoadingPlaceholder =
    isReadingSharedConversation &&
    sharedConversationLoading &&
    renderedMessages.length === 0;
  const showSharedErrorPlaceholder =
    isReadingSharedConversation &&
    Boolean(sharedConversationError) &&
    renderedMessages.length === 0;
  const viewportConversationRef = useRef<string>(viewportConversationKey);

  useEffect(() => {
    if (viewportConversationRef.current === viewportConversationKey) return;
    viewportConversationRef.current = viewportConversationKey;
    resetViewport();
    resetInterruptedHint();
  }, [viewportConversationKey, resetViewport, resetInterruptedHint]);

  useEffect(() => {
    if (!chatError) return;
    const fingerprint = `${chatError.message}::${chatError.details ?? ''}`;
    if (lastToastErrorRef.current === fingerprint) return;
    lastToastErrorRef.current = fingerprint;
    pushToast({
      title: locale === 'zh' ? '请求失败' : 'Request failed',
      message: chatError.message,
      variant: chatError.retryable ? 'warning' : 'error',
    });
  }, [chatError, locale, pushToast]);

  // If no active conversation, create one on first message
  const ensureConversation = useCallback(() => {
    if (!activeConversationId) {
      if (draftConversation) {
        return createConversation(
          draftConversation.walletAddress,
          draftConversation.draftId
        );
      }
      if (authenticatedAddress) {
        return ensureWalletConversation(authenticatedAddress);
      }
      return createConversation();
    }
    return activeConversationId;
  }, [
    activeConversationId,
    draftConversation,
    createConversation,
    authenticatedAddress,
    ensureWalletConversation,
  ]);

  const sendTextWithConversationId = useCallback(
    (conversationId: string, text: string): boolean => {
      if (isStreaming) return false;
      if (!canStartRun()) return false;
      lastToastErrorRef.current = null;
      startStreamRun(conversationId);
      resetInterruptedHint();
      if (isAuthenticated && conversationId) {
        updateConversationContextStatus(conversationId, 'injected', contextFingerprint);
      }
      sendMessage({ text });
      return true;
    },
    [
      isStreaming,
      canStartRun,
      startStreamRun,
      resetInterruptedHint,
      isAuthenticated,
      updateConversationContextStatus,
      contextFingerprint,
      sendMessage,
    ]
  );

  const scheduleTitleGeneration = useCallback(
    (conversationId: string, text: string) => {
      const trimmedText = text.trim();
      if (!trimmedText) return;
      if (titleGenerationInFlightRef.current.has(conversationId)) return;

      const conversation = useChatStore
        .getState()
        .conversations.find((item) => item.id === conversationId);
      if (!conversation) return;

      const fallbackSnippet = toLocalTitleSnippet(trimmedText);
      const shouldGenerate =
        conversation.messages.length === 0 ||
        isWeakConversationTitle(conversation.title) ||
        conversation.title === fallbackSnippet;
      if (!shouldGenerate) return;

      const historyMessages: TitleGenerationMessage[] = conversation.messages
        .slice(-(TITLE_CONTEXT_LIMIT - 1))
        .map((message): TitleGenerationMessage => ({
          role:
            message.role === 'assistant' || message.role === 'system'
              ? message.role
              : 'user',
          content: message.content,
        }))
        .filter((message) => message.content.trim().length > 0);
      const requestMessages = [
        ...historyMessages,
        { role: 'user' as const, content: trimmedText },
      ].slice(-TITLE_CONTEXT_LIMIT) as TitleGenerationMessage[];

      titleGenerationInFlightRef.current.add(conversationId);
      void (async () => {
        try {
          const currentOwner = ownerRef.current;
          const generatedTitle = (
            await generateConversationTitle(requestMessages, selectedModelId, currentOwner)
          ).trim();
          if (!generatedTitle || generatedTitle === 'New conversation') return;
          const latestConversation = useChatStore
            .getState()
            .conversations.find((item) => item.id === conversationId);
          if (!latestConversation) return;
          const latestTitle = latestConversation.title;
          if (
            !isWeakConversationTitle(latestTitle) &&
            latestTitle !== fallbackSnippet
          ) {
            return;
          }
          updateConversationTitle(conversationId, generatedTitle);
        } catch {
          // Ignore title generation failures and keep local fallback.
        } finally {
          titleGenerationInFlightRef.current.delete(conversationId);
        }
      })();
    },
    [selectedModelId, updateConversationTitle]
  );

  const handleSend = useCallback((text: string) => {
    if (isReadingSharedConversation && shareToken) {
      if (forkingFromShare) return false;
      if (sharedConversationLoading) {
        pushToast({
          title: locale === 'zh' ? '请稍候' : 'Please wait',
          message:
            locale === 'zh'
              ? '共享会话仍在加载中'
              : 'Shared conversation is still loading',
          variant: 'info',
        });
        return false;
      }
      if (!sharedConversation || sharedConversationError) {
        pushToast({
          title: locale === 'zh' ? '无法继续' : 'Unable to continue',
          message:
            sharedConversationError ??
            (locale === 'zh'
              ? '共享会话不可用，请稍后重试'
              : 'Shared conversation is unavailable'),
          variant: 'warning',
        });
        return false;
      }

      setForkingFromShare(true);
      void (async () => {
        try {
          const owner: OwnerIdentity = authenticatedAddress
            ? { ownerType: 'wallet', ownerId: authenticatedAddress }
            : { ownerType: 'guest', ownerId: guestId };
          const forked = await forkSharedConversation(shareToken, owner);
          const walletAddress = owner.ownerType === 'wallet' ? owner.ownerId : undefined;
          const localConversationId = createConversation(
            walletAddress,
            forked.conversationId,
            forked.conversation.title
          );
          updateConversationMessages(localConversationId, forked.conversation.messages);
          setConversationForkSource(localConversationId, shareToken);
          setActiveConversation(localConversationId);
          setSharedViewConversation(null);
          writePendingShareForkMessage({
            conversationId: localConversationId,
            text,
            createdAt: Date.now(),
          });
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', `/chat/${encodeURIComponent(localConversationId)}`);
          }
        } catch (error) {
          pushToast({
            title: locale === 'zh' ? 'Fork 失败' : 'Fork failed',
            message:
              error instanceof Error && error.message
                ? error.message
                : locale === 'zh'
                  ? '共享会话 Fork 失败，请稍后重试'
                  : 'Failed to fork shared conversation. Please try again.',
            variant: 'warning',
          });
        } finally {
          setForkingFromShare(false);
        }
      })();
      return false;
    }

    const id = ensureConversation();
    const sent = sendTextWithConversationId(id, text);
    if (!sent) return false;
    scheduleTitleGeneration(id, text);
    return true;
  }, [
    isReadingSharedConversation,
    shareToken,
    forkingFromShare,
    sharedConversationLoading,
    sharedConversation,
    sharedConversationError,
    locale,
    pushToast,
    authenticatedAddress,
    guestId,
    createConversation,
    updateConversationMessages,
    setConversationForkSource,
    setActiveConversation,
    setSharedViewConversation,
    ensureConversation,
    scheduleTitleGeneration,
    sendTextWithConversationId,
  ]);

  useEffect(() => {
    if (!activeConversationId) return;
    if (isReadingSharedConversation) return;
    if (isStreaming) return;
    const pending = readPendingShareForkMessage();
    if (!pending) return;
    if (Date.now() - pending.createdAt > SHARE_FORK_PENDING_MESSAGE_TTL_MS) {
      clearPendingShareForkMessage();
      return;
    }
    if (pending.conversationId !== activeConversationId) {
      return;
    }
    const sent = sendTextWithConversationId(activeConversationId, pending.text);
    if (sent) {
      clearPendingShareForkMessage();
    }
  }, [
    activeConversationId,
    isReadingSharedConversation,
    isStreaming,
    sendTextWithConversationId,
  ]);

  const handleQuickAction = (prompt: string) => {
    if (isReadingSharedConversation) return;
    if (isStreaming) return;
    if (!canStartRun()) return;
    lastToastErrorRef.current = null;
    const id = ensureConversation();
    scheduleTitleGeneration(id, prompt);
    startStreamRun(id);
    resetInterruptedHint();
    if (isAuthenticated && id) {
      updateConversationContextStatus(id, 'injected', contextFingerprint);
    }
    sendMessage({ text: prompt });
  };
  const handleRegenerate = useCallback(() => {
    if (isReadingSharedConversation) return;
    if (isStreaming) return;
    if (!canStartRun()) return;
    lastToastErrorRef.current = null;
    startStreamRun(activeConversationId ?? chatSessionId ?? null);
    resetInterruptedHint();
    regenerate();
  }, [
    isReadingSharedConversation,
    activeConversationId,
    chatSessionId,
    regenerate,
    startStreamRun,
    isStreaming,
    canStartRun,
    resetInterruptedHint,
  ]);
  const runtimeDebugContext = useMemo(
    () => ({
      wallet: {
        connectedAddress: connectedAddress ?? null,
        authenticatedAddress: authenticatedAddress ?? null,
        currentAddress,
        isAuthenticated,
      },
      chain: {
        wagmiChainId: chain?.id ?? null,
        wagmiChainName: chain?.name ?? null,
        injectedChainId: injectedChainId ?? null,
        resolvedChainId: chainId,
        resolvedChainName: chainNameById(chainId),
        chainSource,
        rpcUrl,
      },
      conversation: {
        activeConversationId: activeConversationId ?? null,
        scope: activeScope,
        contextStatus: activeConv?.contextInjectionStatus ?? null,
        contextFingerprint,
        isDraftConversation,
        draftId: draftConversation?.draftId ?? null,
        restoredPendingRun,
        hasInterruptedTurn,
      },
      performance: {
        lastConversationSwitchMs: perfStatsRef.current.lastConversationSwitchMs,
        lastConversationMessagesReadyMs: perfStatsRef.current.lastConversationMessagesReadyMs,
        lastConversationScrollMs: perfStatsRef.current.lastConversationScrollMs,
        lastStoreSyncMs: perfStatsRef.current.lastStoreSyncMs,
        storeSyncCount: perfStatsRef.current.storeSyncCount,
        lastStoreSyncMessageCount: perfStatsRef.current.lastStoreSyncMessageCount,
        syncQueueSize: perfStatsRef.current.syncQueueSize,
        syncRetryCount: perfStatsRef.current.syncRetryCount,
        lastSyncRetryDelayMs: perfStatsRef.current.lastSyncRetryDelayMs,
        visibleMessageCount,
        hiddenMessageCount,
        isLoadingOlderMessages,
        streamPhase: streamLifecycle.phase,
        streamStartedAt: streamLifecycle.startedAt,
        streamFirstChunkAt: streamLifecycle.firstChunkAt,
        streamLastChunkAt: streamLifecycle.lastChunkAt,
      },
      userContext,
    }),
    [
      connectedAddress,
      authenticatedAddress,
      currentAddress,
      isAuthenticated,
      chain?.id,
      chain?.name,
      injectedChainId,
      chainId,
      chainSource,
      rpcUrl,
      activeConversationId,
      activeScope,
      activeConv?.contextInjectionStatus,
      contextFingerprint,
      isDraftConversation,
      draftConversation?.draftId,
      restoredPendingRun,
      hasInterruptedTurn,
      visibleMessageCount,
      hiddenMessageCount,
      isLoadingOlderMessages,
      streamLifecycle.phase,
      streamLifecycle.startedAt,
      streamLifecycle.firstChunkAt,
      streamLifecycle.lastChunkAt,
      userContext,
    ]
  );

  const handleCopyDebugJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(runtimeDebugContext, null, 2)
      );
      pushToast({
        title: locale === 'zh' ? '调试信息已复制' : 'Debug context copied',
        message: locale === 'zh' ? '已复制到剪贴板' : 'Copied to clipboard',
        variant: 'info',
      });
    } catch {
      pushToast({
        title: locale === 'zh' ? '复制失败' : 'Copy failed',
        message: locale === 'zh' ? '请手动复制调试信息' : 'Please copy debug info manually',
        variant: 'warning',
      });
    }
  }, [runtimeDebugContext, pushToast, locale]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden px-2.5 pt-11 sm:px-4 sm:pt-12">
        <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4 py-4 sm:gap-6 sm:py-8">
          {debugMode && (
            <DebugPanel
              t={t}
              runtimeDebugContext={runtimeDebugContext}
              onCopy={handleCopyDebugJson}
            />
          )}

          {isReadingSharedConversation ? (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-400">
              {sharedConversationLoading
                ? locale === 'zh'
                  ? '正在加载共享会话…'
                  : 'Loading shared conversation...'
                : forkingFromShare
                  ? locale === 'zh'
                    ? '正在无感 Fork 并切换到你的会话…'
                    : 'Forking silently and switching to your conversation...'
                  : locale === 'zh'
                    ? '你正在查看共享会话，发送消息后会自动 Fork 到你的会话。'
                    : 'You are reading a shared conversation. Sending a message auto-forks it to your own chat.'}
            </div>
          ) : null}

          {isReadingSharedConversation && sharedConversationError ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              {sharedConversationError}
            </div>
          ) : null}

          {showSharedLoadingPlaceholder ? (
            <div className="flex min-h-[12rem] items-center justify-center rounded-xl border border-border bg-card/85">
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <div className="size-3.5 animate-spin rounded-full border-2 border-ring/35 border-t-primary" />
                {locale === 'zh' ? '正在加载共享会话内容…' : 'Loading shared conversation...'}
              </div>
            </div>
          ) : showSharedErrorPlaceholder ? (
            <div className="flex min-h-[16rem] flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card/85 px-6 py-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="space-y-1.5">
                <p className="text-base font-medium text-foreground">
                  {locale === 'zh' ? '链接无效或已过期' : 'Link invalid or expired'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {sharedConversationError}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { window.location.href = '/'; }}
                className="mt-1 rounded-lg bg-primary/90 px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary"
              >
                {locale === 'zh' ? '返回首页' : 'Back to home'}
              </button>
            </div>
          ) : isEmpty ? (
            <EmptyState
              t={t}
              isStreaming={isStreaming}
              quickActions={QUICK_ACTIONS}
              onQuickAction={handleQuickAction}
            />
          ) : (
            <MessageStreamView
              locale={locale}
              t={t}
              viewportConversationKey={viewportConversationKey}
              renderedMessages={renderedMessages}
              activeConversationId={isReadingSharedConversation ? null : activeConversationId}
              isLoadingOlderMessages={isLoadingOlderMessages}
              isStreaming={isStreaming}
              readOnly={isReadingSharedConversation}
              onMessageListScroll={handleMessageListScroll}
              messageListRef={messageListRef}
              showStreamSlowHint={showStreamSlowHint}
              showInterruptedHint={showInterruptedHint}
              interruptedHintText={interruptedHintText}
              onContinueGeneration={handleRegenerate}
              onDismissInterrupted={dismissInterruptedHint}
            />
          )}
        </div>
      </div>

      {chatError && (
        <ChatErrorBanner
          error={chatError}
          locale={locale}
          t={t}
          onRetry={handleRegenerate}
        />
      )}

      {!isAtBottom && !isEmpty && (
        <div className="flex justify-center pb-2">
          <button
            type="button"
            onClick={scrollToBottom}
            className="flex size-8 items-center justify-center rounded-full border border-border bg-background shadow-md transition-all hover:bg-accent"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="size-4 text-muted-foreground" />
          </button>
        </div>
      )}

      <ChatInput
        key={activeConversationId ?? draftConversation?.draftId ?? 'draft-default'}
        onSend={handleSend}
        onStop={handleStop}
        isStreaming={isStreaming}
        isProcessing={forkingFromShare}
        isDraftConversation={isDraftConversation}
      />
    </div>
  );
}
