import type { PersistedPendingRun } from '@/lib/chat/pending-run-store';

const RESTORED_RUN_STALE_MS = 10 * 60 * 1000;

export function shouldResumePendingRun(
  conversationId: string | null | undefined,
  pendingRun: PersistedPendingRun | null,
  resumedConversationIds: Set<string>
): boolean {
  if (!conversationId || !pendingRun) return false;
  if (resumedConversationIds.has(conversationId)) return false;
  if (Date.now() - pendingRun.updatedAt > RESTORED_RUN_STALE_MS) return false;
  resumedConversationIds.add(conversationId);
  return true;
}
