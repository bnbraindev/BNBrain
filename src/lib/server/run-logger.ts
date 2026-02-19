import { appendFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { UIMessageChunk } from 'ai';

// ── Types ──────────────────────────────────────────────────

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;
  level: LogLevel;
  event: string;
  runId: string;
  chatId: string;
  [key: string]: unknown;
}

interface TextBuffer {
  partId: string;
  text: string;
  deltaCount: number;
  startedAt: number;
}

interface ToolInputBuffer {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

// ── Constants ──────────────────────────────────────────────

const ENV = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
const BASE_DIR = join(process.cwd(), '.logs', ENV);
const RETENTION_DAYS = 14;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let lastCleanupAt = 0;

// ── RunLogger ──────────────────────────────────────────────

export class RunLogger {
  private readonly runId: string;
  private readonly chatId: string;
  private readonly dir: string;
  private dirCreated = false;
  private readonly startedAt: number;

  // Aggregation buffers
  private textBuffers = new Map<string, TextBuffer>();
  private toolInputBuffers = new Map<string, ToolInputBuffer>();
  private toolStartTimes = new Map<string, number>();
  private toolNameMap = new Map<string, string>(); // toolCallId → toolName

  // Stats
  private eventCount = 0;
  private toolCallCount = 0;
  private textPartCount = 0;

  constructor(params: { runId: string; chatId: string }) {
    this.runId = params.runId;
    this.chatId = params.chatId;
    this.dir = join(BASE_DIR, params.chatId);
    this.startedAt = Date.now();

    // Lazy cleanup
    const now = Date.now();
    if (now - lastCleanupAt > CLEANUP_INTERVAL_MS) {
      lastCleanupAt = now;
      cleanupOldLogs().catch(() => {});
    }
  }

  // ── Public API ──────────────────────────────────────────

  runStart(params: {
    owner: { ownerType: string; ownerId: string };
    trigger: string;
    userContext: unknown;
    messageCount: number;
    firstUserMessage: string;
  }): void {
    this.write('data', {
      level: 'info',
      event: 'run_start',
      owner: params.owner,
      trigger: params.trigger,
      userContext: params.userContext,
      messageCount: params.messageCount,
      firstUserMessage: params.firstUserMessage.slice(0, 200),
    });
  }

  modelResolved(params: {
    displayName: string;
    providerModelId: string;
    baseUrl: string;
    protocol: string;
  }): void {
    this.write('data', {
      level: 'info',
      event: 'model_resolved',
      ...params,
    });
  }

  handleChunk(chunk: UIMessageChunk): void {
    this.eventCount++;

    switch (chunk.type) {
      // ── Text aggregation ──
      case 'text-start':
        this.textBuffers.set(chunk.id, {
          partId: chunk.id,
          text: '',
          deltaCount: 0,
          startedAt: Date.now(),
        });
        break;

      case 'text-delta': {
        const buf = this.textBuffers.get(chunk.id);
        if (buf) {
          buf.text += chunk.delta;
          buf.deltaCount++;
        }
        break;
      }

      case 'text-end': {
        const buf = this.textBuffers.get(chunk.id);
        if (buf) {
          this.textPartCount++;
          this.write('data', {
            level: 'info',
            event: 'text_complete',
            partId: buf.partId,
            text: buf.text,
            charCount: buf.text.length,
            deltaCount: buf.deltaCount,
            durationMs: Date.now() - buf.startedAt,
          });
          this.textBuffers.delete(chunk.id);
        }
        break;
      }

      // ── Tool input aggregation ──
      case 'tool-input-start':
        this.toolInputBuffers.set(chunk.toolCallId, {
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          input: undefined,
        });
        this.toolNameMap.set(chunk.toolCallId, chunk.toolName);
        this.toolStartTimes.set(chunk.toolCallId, Date.now());
        break;

      case 'tool-input-available': {
        this.toolCallCount++;
        this.toolNameMap.set(chunk.toolCallId, chunk.toolName);
        const existing = this.toolInputBuffers.get(chunk.toolCallId);
        if (existing) {
          existing.input = chunk.input;
        }
        this.write('data', {
          level: 'info',
          event: 'tool_call',
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          input: chunk.input,
        });
        this.toolInputBuffers.delete(chunk.toolCallId);
        break;
      }

      // ── Tool output ──
      case 'tool-output-available': {
        const startTime = this.toolStartTimes.get(chunk.toolCallId);
        const toolName = this.toolInputBuffers.get(chunk.toolCallId)?.toolName
          ?? this.resolveToolName(chunk.toolCallId);
        this.write('data', {
          level: 'info',
          event: 'tool_result',
          toolCallId: chunk.toolCallId,
          toolName,
          output: chunk.output,
          durationMs: startTime ? Date.now() - startTime : undefined,
          isError: false,
        });
        this.toolStartTimes.delete(chunk.toolCallId);
        break;
      }

      case 'tool-output-error': {
        const startTime = this.toolStartTimes.get(chunk.toolCallId);
        const toolName = this.toolInputBuffers.get(chunk.toolCallId)?.toolName
          ?? this.resolveToolName(chunk.toolCallId);
        this.writeBoth({
          level: 'error',
          event: 'tool_result',
          toolCallId: chunk.toolCallId,
          toolName,
          output: chunk.errorText,
          durationMs: startTime ? Date.now() - startTime : undefined,
          isError: true,
        });
        this.toolStartTimes.delete(chunk.toolCallId);
        break;
      }

      // ── Step boundaries ──
      case 'start-step':
        this.write('data', { level: 'info', event: 'step_start' });
        break;

      case 'finish-step':
        this.write('data', { level: 'info', event: 'step_finish' });
        break;

      // ── Stream error ──
      case 'error':
        this.writeBoth({
          level: 'error',
          event: 'stream_error',
          errorText: chunk.errorText,
        });
        break;
    }
  }

  /** Log heartbeat events injected by the worker during long tool execution. */
  heartbeat(seq: number, heartbeatId: string): void {
    this.eventCount++;
    this.write('data', {
      level: 'info',
      event: 'heartbeat',
      seq,
      heartbeatId,
    });
  }

  /** Log when a tool error is hidden from the client (replaced with _hidden). */
  toolErrorHidden(params: {
    toolCallId: string;
    toolName: string;
    errorText: string;
  }): void {
    this.writeBoth({
      level: 'warn',
      event: 'tool_error_hidden',
      ...params,
    });
  }

  runEnd(params: {
    status: 'completed' | 'failed' | 'cancelled';
    errorText?: string;
  }): void {
    // Force-flush remaining buffers
    this.flushBuffers();

    const entry: Record<string, unknown> = {
      level: params.status === 'failed' ? 'error' : 'info',
      event: 'run_end',
      status: params.status,
      durationMs: Date.now() - this.startedAt,
      eventCount: this.eventCount,
      toolCallCount: this.toolCallCount,
      textPartCount: this.textPartCount,
    };
    if (params.errorText) entry.errorText = params.errorText;

    this.write('data', entry);
    if (params.status === 'failed') {
      this.write('error', entry);
    }
  }

  persistError(params: {
    phase: string;
    errorMessage: string;
    errorStack?: string;
  }): void {
    this.writeBoth({
      level: 'error',
      event: 'persist_error',
      ...params,
    });
  }

  deepAnalysisPhase(params: {
    phase: string;
    tokenAddress: string;
    stepKey: string;
    stepStatus: string;
    durationMs?: number;
  }): void {
    this.write('data', {
      level: 'info',
      event: 'deep_analysis_phase',
      ...params,
    });
  }

  deepAnalysisResult(params: {
    reportId: string;
    riskScore: number | null;
    summary: string;
    steps: unknown[];
    payloadSizeKB: number;
    llmOutputChars: number;
    htmlSizeKB: number;
  }): void {
    this.write('data', {
      level: 'info',
      event: 'deep_analysis_result',
      ...params,
    });
  }

  // ── Internal ────────────────────────────────────────────

  private resolveToolName(toolCallId: string): string | undefined {
    return this.toolNameMap.get(toolCallId);
  }

  private flushBuffers(): void {
    // Flush remaining text buffers
    for (const [id, buf] of this.textBuffers) {
      this.textPartCount++;
      this.write('data', {
        level: 'warn',
        event: 'text_complete',
        partId: buf.partId,
        text: buf.text,
        charCount: buf.text.length,
        deltaCount: buf.deltaCount,
        durationMs: Date.now() - buf.startedAt,
        unflushed: true,
      });
      this.textBuffers.delete(id);
    }
    // Flush remaining tool input buffers
    for (const [id, buf] of this.toolInputBuffers) {
      this.toolCallCount++;
      this.write('data', {
        level: 'warn',
        event: 'tool_call',
        toolCallId: buf.toolCallId,
        toolName: buf.toolName,
        input: buf.input,
        unflushed: true,
      });
      this.toolInputBuffers.delete(id);
    }
  }

  private write(file: 'data' | 'error', fields: Record<string, unknown>): void {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level: (fields.level as LogLevel) ?? 'info',
      event: (fields.event as string) ?? 'unknown',
      runId: this.runId,
      chatId: this.chatId,
      ...fields,
    };

    const line = JSON.stringify(entry) + '\n';
    const filePath = join(this.dir, `${file}.log`);

    // Fire-and-forget: ensure directory, then append
    const doWrite = async () => {
      if (!this.dirCreated) {
        await mkdir(this.dir, { recursive: true });
        this.dirCreated = true;
      }
      await appendFile(filePath, line, 'utf-8');
    };

    doWrite().catch(() => {});
  }

  /** Write to both data.log and error.log. */
  private writeBoth(fields: Record<string, unknown>): void {
    this.write('data', fields);
    this.write('error', fields);
  }
}

// ── Cleanup ────────────────────────────────────────────────

async function cleanupOldLogs(): Promise<void> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let entries: string[];
  try {
    entries = await readdir(BASE_DIR);
  } catch {
    return; // Directory doesn't exist yet
  }

  for (const name of entries) {
    const dirPath = join(BASE_DIR, name);
    try {
      const s = await stat(dirPath);
      if (s.isDirectory() && s.mtimeMs < cutoff) {
        await rm(dirPath, { recursive: true, force: true });
      }
    } catch {
      // Ignore individual errors
    }
  }
}
