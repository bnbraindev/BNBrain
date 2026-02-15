import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

import { warmCachedUIMessages } from '@/lib/chat/ui-message-cache';
import {
  deleteConversationFromRemote,
  fetchRemoteConversations,
  syncConversationToRemote,
  type OwnerIdentity,
} from '@/lib/services/conversation-sync';
import { useChatStore, type Conversation } from '@/lib/stores/chat-store';

import type { ChatPerfStats } from '../types';
import { SYNC_BATCH_WINDOW_MS, SYNC_QUEUE_MAX_RETRIES } from '../constants';
import { getSyncQueueRetryDelayMs } from '../utils';

interface UseConversationSyncParams {
  ownerKey: string;
  ownerIdentity: OwnerIdentity;
  hydratedOwnerKey: string | null;
  ownerScopedConversationIds: string[];
  activeConversationId: string | null;
  activeConversation: Conversation | undefined;
  isStreaming: boolean;
  hydrateFromRemote: (ownerKey: string, remoteConversations: Conversation[]) => void;
  perfStatsRef: MutableRefObject<ChatPerfStats>;
}

export function useConversationSync({
  ownerKey,
  ownerIdentity,
  hydratedOwnerKey,
  ownerScopedConversationIds,
  activeConversationId,
  activeConversation,
  isStreaming,
  hydrateFromRemote,
  perfStatsRef,
}: UseConversationSyncParams) {
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncBatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncedConversationIdsRef = useRef<Set<string>>(new Set());
  const isSyncingRef = useRef(false);
  const syncQueueRef = useRef<Map<string, Conversation>>(new Map());
  const syncRetryCountsRef = useRef<Map<string, number>>(new Map());
  const syncRetryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const syncOwnerKeyRef = useRef<string>('');
  const hydratingOwnerRef = useRef<string | null>(null);
  const hydrateRetryCountRef = useRef(0);
  const hydrateRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncedUpdatedAtRef = useRef<Map<string, number>>(new Map());
  const prevActiveIdRef = useRef<string | null>(null);

  const clearSyncRetryTimer = useCallback((conversationId: string) => {
    const timer = syncRetryTimersRef.current.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      syncRetryTimersRef.current.delete(conversationId);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (hydratingOwnerRef.current === ownerKey) return;
    hydratingOwnerRef.current = ownerKey;
    hydrateRetryCountRef.current = 0;
    if (hydrateRetryTimerRef.current) {
      clearTimeout(hydrateRetryTimerRef.current);
      hydrateRetryTimerRef.current = null;
    }
    const loadRemoteConversations = async () => {
      try {
        const remoteConversations = await fetchRemoteConversations(ownerIdentity);
        if (cancelled) return;
        hydrateFromRemote(ownerKey, remoteConversations);
        for (const conv of remoteConversations) {
          syncedConversationIdsRef.current.add(conv.id);
        }
        hydrateRetryCountRef.current = 0;
      } catch {
        if (cancelled) return;
        const attempt = hydrateRetryCountRef.current;
        if (attempt < 2) {
          const delayMs = attempt === 0 ? 2000 : 5000;
          hydrateRetryCountRef.current = attempt + 1;
          hydrateRetryTimerRef.current = setTimeout(() => {
            hydrateRetryTimerRef.current = null;
            if (!cancelled && hydratingOwnerRef.current === null) {
              // Allow re-entry
              void loadRemoteConversations();
            }
          }, delayMs);
        }
      } finally {
        if (hydratingOwnerRef.current === ownerKey) {
          hydratingOwnerRef.current = null;
        }
      }
    };
    void loadRemoteConversations();
    return () => {
      cancelled = true;
      if (hydrateRetryTimerRef.current) {
        clearTimeout(hydrateRetryTimerRef.current);
        hydrateRetryTimerRef.current = null;
      }
    };
  }, [ownerKey, ownerIdentity, hydrateFromRemote]);

  useEffect(() => {
    // Discard queued items on owner switch — they belong to the previous owner
    // and flushing with the new ownerIdentity would cause scope mismatch.
    syncedConversationIdsRef.current = new Set();
    syncedUpdatedAtRef.current = new Map();
    syncQueueRef.current.clear();
    syncRetryCountsRef.current.clear();
    for (const timer of syncRetryTimersRef.current.values()) {
      clearTimeout(timer);
    }
    syncRetryTimersRef.current.clear();
    syncOwnerKeyRef.current = ownerKey;
    perfStatsRef.current.syncQueueSize = 0;
    perfStatsRef.current.lastSyncRetryDelayMs = null;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    if (syncBatchTimerRef.current) {
      clearTimeout(syncBatchTimerRef.current);
      syncBatchTimerRef.current = null;
    }
  }, [ownerKey, ownerIdentity, perfStatsRef]);

  useEffect(() => {
    if (ownerScopedConversationIds.length === 0) return;

    const warmup = () => {
      const state = useChatStore.getState();
      const byId = new Map(
        state.conversations.map((conversation) => [conversation.id, conversation])
      );
      for (const id of ownerScopedConversationIds.slice(0, 8)) {
        const conversation = byId.get(id);
        if (conversation?.messages.length) {
          warmCachedUIMessages(conversation.messages);
        }
      }
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(warmup, { timeout: 250 });
      return () => window.cancelIdleCallback(handle);
    }

    const timer = setTimeout(warmup, 80);
    return () => clearTimeout(timer);
  }, [ownerScopedConversationIds]);

  useEffect(
    () => () => {
      for (const timer of syncRetryTimersRef.current.values()) {
        clearTimeout(timer);
      }
      syncRetryTimersRef.current.clear();
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      if (syncBatchTimerRef.current) {
        clearTimeout(syncBatchTimerRef.current);
        syncBatchTimerRef.current = null;
      }
    },
    []
  );

  const drainSyncQueue = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    const queueOwnerKey = ownerKey;
    try {
      while (syncQueueRef.current.size > 0) {
        if (syncOwnerKeyRef.current !== queueOwnerKey) break;
        const nextEntry = syncQueueRef.current.entries().next().value as
          | [string, Conversation]
          | undefined;
        if (!nextEntry) break;
        const [conversationId, conversation] = nextEntry;
        syncQueueRef.current.delete(conversationId);
        perfStatsRef.current.syncQueueSize = syncQueueRef.current.size;
        const lastSynced = syncedUpdatedAtRef.current.get(conversationId);
        if (lastSynced !== undefined && lastSynced >= conversation.updatedAt) {
          continue;
        }
        try {
          await syncConversationToRemote(ownerIdentity, conversation);
          syncRetryCountsRef.current.delete(conversationId);
          clearSyncRetryTimer(conversationId);
          syncedUpdatedAtRef.current.set(conversationId, conversation.updatedAt);
          syncedConversationIdsRef.current.add(conversationId);
        } catch {
          const attempt = syncRetryCountsRef.current.get(conversationId) ?? 0;
          if (attempt >= SYNC_QUEUE_MAX_RETRIES) {
            syncRetryCountsRef.current.delete(conversationId);
            clearSyncRetryTimer(conversationId);
            continue;
          }
          const nextAttempt = attempt + 1;
          syncRetryCountsRef.current.set(conversationId, nextAttempt);
          const retryDelayMs = getSyncQueueRetryDelayMs(nextAttempt);
          perfStatsRef.current.syncRetryCount += 1;
          perfStatsRef.current.lastSyncRetryDelayMs = retryDelayMs;
          clearSyncRetryTimer(conversationId);
          const timer = setTimeout(() => {
            syncRetryTimersRef.current.delete(conversationId);
            if (syncOwnerKeyRef.current !== queueOwnerKey) return;
            const queuedConversation = syncQueueRef.current.get(conversationId);
            if (!queuedConversation || queuedConversation.updatedAt < conversation.updatedAt) {
              syncQueueRef.current.set(conversationId, conversation);
              perfStatsRef.current.syncQueueSize = syncQueueRef.current.size;
            }
            void drainSyncQueue();
          }, retryDelayMs);
          syncRetryTimersRef.current.set(conversationId, timer);
          break;
        }
      }
    } finally {
      isSyncingRef.current = false;
    }
  }, [clearSyncRetryTimer, ownerIdentity, ownerKey, perfStatsRef]);

  const scheduleSyncDrain = useCallback(
    (immediate = false) => {
      if (syncBatchTimerRef.current) {
        clearTimeout(syncBatchTimerRef.current);
        syncBatchTimerRef.current = null;
      }
      if (immediate) {
        void drainSyncQueue();
        return;
      }
      syncBatchTimerRef.current = setTimeout(() => {
        syncBatchTimerRef.current = null;
        void drainSyncQueue();
      }, SYNC_BATCH_WINDOW_MS);
    },
    [drainSyncQueue]
  );

  const enqueueConversationSync = useCallback(
    (conversation: Conversation, options?: { immediate?: boolean }) => {
      const lastSynced = syncedUpdatedAtRef.current.get(conversation.id);
      if (lastSynced !== undefined && lastSynced >= conversation.updatedAt) return;
      syncRetryCountsRef.current.delete(conversation.id);
      clearSyncRetryTimer(conversation.id);
      const queuedConversation = syncQueueRef.current.get(conversation.id);
      if (!queuedConversation || queuedConversation.updatedAt < conversation.updatedAt) {
        syncQueueRef.current.set(conversation.id, conversation);
        perfStatsRef.current.syncQueueSize = syncQueueRef.current.size;
      }
      scheduleSyncDrain(Boolean(options?.immediate));
    },
    [clearSyncRetryTimer, scheduleSyncDrain, perfStatsRef]
  );

  useEffect(() => {
    if (hydratedOwnerKey !== ownerKey) return;
    if (isStreaming) return;
    if (!activeConversation || activeConversation.messages.length === 0) return;

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      enqueueConversationSync(activeConversation, { immediate: false });
    }, 3000);

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [isStreaming, activeConversation, hydratedOwnerKey, ownerKey, enqueueConversationSync]);

  useEffect(() => {
    if (hydratedOwnerKey !== ownerKey) return;
    const prevId = prevActiveIdRef.current;
    prevActiveIdRef.current = activeConversationId;
    if (!prevId || prevId === activeConversationId) return;
    const prevConv = useChatStore
      .getState()
      .conversations.find((conversation) => conversation.id === prevId);
    if (prevConv && prevConv.messages.length > 0) {
      enqueueConversationSync(prevConv, { immediate: true });
    }
  }, [activeConversationId, hydratedOwnerKey, ownerKey, enqueueConversationSync]);

  useEffect(() => {
    if (hydratedOwnerKey !== ownerKey) return;
    const currentIds = new Set(ownerScopedConversationIds);
    const prevIds = syncedConversationIdsRef.current;
    const deletedIds = Array.from(prevIds).filter((id) => !currentIds.has(id));
    if (deletedIds.length === 0) return;
    for (const id of deletedIds) {
      prevIds.delete(id);
      syncedUpdatedAtRef.current.delete(id);
      syncQueueRef.current.delete(id);
      syncRetryCountsRef.current.delete(id);
      clearSyncRetryTimer(id);
      perfStatsRef.current.syncQueueSize = syncQueueRef.current.size;
      void deleteConversationFromRemote(ownerIdentity, id).catch(() => undefined);
    }
  }, [
    clearSyncRetryTimer,
    ownerScopedConversationIds,
    ownerIdentity,
    hydratedOwnerKey,
    ownerKey,
    perfStatsRef,
  ]);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (!activeConversation || activeConversation.messages.length === 0) return;
      const lastSynced = syncedUpdatedAtRef.current.get(activeConversation.id);
      if (lastSynced !== undefined && lastSynced >= activeConversation.updatedAt) return;
      const blob = new Blob(
        [JSON.stringify({ owner: ownerIdentity, conversation: activeConversation })],
        { type: 'application/json' }
      );
      navigator.sendBeacon?.('/api/conversations', blob);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [activeConversation, ownerIdentity]);
}
