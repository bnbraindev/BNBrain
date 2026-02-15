import type { UIMessageChunk } from 'ai';
import {
  getChatRunById,
  isTerminalChatRunStatus,
  listChatRunEvents,
} from '@/lib/server/chat-run-store';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createChatRunUIMessageStream(
  runId: string,
  options?: {
    afterSeq?: number;
    pollIntervalMs?: number;
  }
): ReadableStream<UIMessageChunk> {
  const afterSeq = Math.max(0, options?.afterSeq ?? 0);
  const pollIntervalMs = Math.max(100, options?.pollIntervalMs ?? 300);

  let cancelled = false;

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      let currentSeq = afterSeq;
      try {
        while (!cancelled) {
          const [events, run] = await Promise.all([
            listChatRunEvents(runId, currentSeq),
            getChatRunById(runId),
          ]);

          if (!run) {
            controller.enqueue({
              type: 'error',
              errorText: 'Chat run not found',
            });
            break;
          }

          for (const event of events) {
            controller.enqueue(event.chunk);
            currentSeq = event.seq;
          }

          if (isTerminalChatRunStatus(run.status) && currentSeq >= run.lastEventSeq) {
            if (run.status === 'failed' && run.lastEventSeq === 0) {
              controller.enqueue({
                type: 'error',
                errorText: run.errorText || 'Chat run failed',
              });
            }
            break;
          }

          await sleep(pollIntervalMs);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to stream chat run';
        controller.enqueue({
          type: 'error',
          errorText: message,
        });
      } finally {
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });
}
