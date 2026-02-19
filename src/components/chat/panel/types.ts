export type StreamPhase =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'stalled'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface StreamLifecycleState {
  phase: StreamPhase;
  conversationId: string | null;
  startedAt: number | null;
  firstChunkAt: number | null;
  lastChunkAt: number | null;
}

export interface QuickAction {
  label: string;
  prompt: string;
}

export interface ChatPerfStats {
  lastConversationSwitchMs: number | null;
  lastConversationMessagesReadyMs: number | null;
  lastConversationScrollMs: number | null;
  lastStoreSyncMs: number | null;
  storeSyncCount: number;
  lastStoreSyncMessageCount: number;
  syncQueueSize: number;
  syncRetryCount: number;
  lastSyncRetryDelayMs: number | null;
}
