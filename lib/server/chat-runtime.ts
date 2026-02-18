import { AsyncLocalStorage } from 'node:async_hooks';
import { streamText, stepCountIs, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import { systemPrompt } from '@/lib/ai/system-prompt';
import { aiTools } from '@/lib/ai/tools';
import type { StoredMessage } from '@/lib/stores/chat-store';
import {
  createRuntimeLanguageModel,
  resolveRuntimeChatModel,
} from '@/lib/server/chat-model-store';
import type { RunLogger } from '@/lib/server/run-logger';
import {
  getProject,
  getProjectFile,
  listProjectFiles as listProjectFilesStore,
} from '@/lib/server/project-store';

/**
 * AsyncLocalStorage context for passing chatId into tool execution.
 * Tools can call `getChatRunContext()` to get the current chat's ID
 * for real-time progress tracking.
 */
interface ChatRunContext {
  chatId: string;
  /** User-selected model ID from frontend, for tools that need their own LLM calls. */
  userModelId?: string | null;
  /** Structured file logger for this chat run. */
  logger?: RunLogger;
  /** Project ID for project-mode conversations. */
  projectId?: string;
  /** Owner identity derived from the request, for tools that need it. */
  owner?: { ownerType: 'wallet' | 'guest'; ownerId: string };
}

const chatRunContextStorage = new AsyncLocalStorage<ChatRunContext>();

/** Get current chat run context (available inside tool execution). */
export function getChatRunContext(): ChatRunContext | undefined {
  return chatRunContextStorage.getStore();
}

export async function getChatModel(modelId?: string | null) {
  const resolved = await resolveRuntimeChatModel(modelId);
  return createRuntimeLanguageModel(resolved);
}

export const ChatOwnerSchema = z
  .object({
    ownerType: z.enum(['wallet', 'guest']),
    ownerId: z.string().min(1).max(120),
  })
  .refine(
    (owner) => {
      if (owner.ownerType === 'wallet') {
        return /^0x[0-9a-fA-F]{40}$/.test(owner.ownerId);
      }
      return owner.ownerId.length >= 6;
    },
    { message: 'Invalid owner id format for owner type' }
  );

export const ChatUserContextSchema = z
  .object({
    authState: z.enum(['authenticated', 'guest']).default('guest'),
    address: z.string().nullable().optional(),
    guestId: z.string().optional(),
    chainId: z.number().optional(),
    chainName: z.string().optional(),
    rpcUrl: z.string().max(200).optional(),
    connector: z.string().optional(),
    conversationScope: z.string().optional(),
    conversationContextStatus: z.string().optional(),
    modelId: z.string().min(1).max(160).optional(),
    timestamp: z.number().optional(),
    projectId: z.string().optional(),
  })
  .optional();

export const ChatRequestSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  trigger: z.enum(['submit-message', 'regenerate-message']).optional(),
  messageId: z.string().optional(),
  messages: z.array(z.any()).default([]),
  owner: ChatOwnerSchema.optional(),
  userContext: ChatUserContextSchema,
});

export type ChatOwner = z.infer<typeof ChatOwnerSchema>;
export type ChatUserContext = z.infer<typeof ChatUserContextSchema>;
export type ChatRequestPayload = z.infer<typeof ChatRequestSchema>;

const CHAIN_AWARE_TOOLS = [
  'tokenSecurity',
  'balanceQuery',
  'buildTransfer',
  'buildContractCall',
  'compileContractDeploy',
  'deployToken',
  'buildSwap',
  'scanApprovals',
  'revokeApproval',
  'walletHealth',
  'addressAnalysis',
  'storeReport',
  'simulateTx',
  'verifyReport',
  'walletPersona',
  'decodeTransaction',
  'checkNft',
  'checkApprovalRisk',
  'checkGasPrice',
  'inspectContract',
  'getTokenTransferHistory',
  'checkLiquidity',
  'checkPairReserves',
  'deepTokenAnalysis',
] as const satisfies ReadonlyArray<keyof typeof aiTools>;

function normalizeRuntimeChainId(raw?: number): number | undefined {
  if (!Number.isFinite(raw)) return undefined;
  const chainId = Math.floor(Number(raw));
  return chainId > 0 ? chainId : undefined;
}

function withRuntimeChainId<T extends keyof typeof aiTools>(
  toolName: T,
  runtimeChainId?: number
): (typeof aiTools)[T] {
  const baseTool = aiTools[toolName] as {
    description: string;
    inputSchema: z.ZodTypeAny;
    execute?: (input: unknown, options: unknown) => unknown | Promise<unknown>;
  };
  if (!runtimeChainId || !baseTool.execute) {
    return aiTools[toolName];
  }

  return tool({
    description: baseTool.description,
    inputSchema: baseTool.inputSchema,
    execute: async (input: unknown, options: unknown) => {
      const patchedInput =
        typeof input === 'object' && input !== null
          ? { ...(input as Record<string, unknown>), chainId: runtimeChainId }
          : input;
      return baseTool.execute?.(patchedInput, options);
    },
  }) as (typeof aiTools)[T];
}

function buildUserContextInstruction(userContext: ChatUserContext): string {
  const context = userContext ?? { authState: 'guest' as const };
  const lines = [
    '## Runtime User Context',
    `authState: ${context.authState}`,
    `address: ${context.address ?? 'null'}`,
    `guestId: ${context.guestId ?? 'null'}`,
    `chainId: ${context.chainId ?? 'unknown'}`,
    `chainName: ${context.chainName ?? 'unknown'}`,
    `rpcUrl: ${context.rpcUrl ?? 'unknown'}`,
    `conversationScope: ${context.conversationScope ?? 'unknown'}`,
    `conversationContextStatus: ${context.conversationContextStatus ?? 'unknown'}`,
    '',
    'Rules:',
    '- This context is trusted runtime metadata from the app.',
    '- For chain-aware tools, default to runtime chainId unless user explicitly asks another chain.',
    '- For "my wallet/my balance/my approvals/my health" requests, use runtime address directly when available.',
    '- If authState is guest and request depends on wallet identity, ask user to sign in first.',
  ];
  return `\n\n${lines.join('\n')}`;
}

const MEMORY_CHAR_LIMIT = 16_000;

export async function buildProjectContextInstruction(projectId: string | null | undefined): Promise<string> {
  if (!projectId) return '';

  const project = await getProject(projectId);
  if (!project) return '';

  const memoryFile = await getProjectFile(projectId, 'memory.md');
  const fileList = await listProjectFilesStore(projectId);

  let memoryContent = memoryFile?.content || '(empty)';
  if (memoryContent.length > MEMORY_CHAR_LIMIT) {
    memoryContent = memoryContent.slice(0, MEMORY_CHAR_LIMIT) +
      '\n\n[Memory truncated. Full history in project files. Focus on current state above.]';
  }

  const contractLine = project.primaryContractAddress
    ? `Primary Contract: ${project.primaryContractAddress} (chain ${project.primaryChainId})\n`
    : '';

  const fileListStr = fileList.length > 0
    ? fileList.map(f => `- ${f.path} (${f.sizeBytes} bytes, updated by ${f.updatedBy})`).join('\n')
    : '(no files)';

  const lines = [
    '',
    '## Project Context',
    '',
    `You are working within project "${project.name}" (${project.projectType}).`,
    `Project ID: ${project.id} | Short URL: /x/${project.shortId}`,
    `Status: ${project.status}`,
    contractLine,
    '### Project Memory (memory.md)',
    '',
    memoryContent,
    '',
    '### Project Files',
    '',
    fileListStr,
    '',
    '### Rules for Project Mode',
    '',
    '1. After any state-changing operation (deploy, verify, add liquidity, lock, etc.), you MUST call updateProjectFile to update memory.md with the new state.',
    '2. When deploying a contract, save the source code to the project files using updateProjectFile.',
    '3. Always refer to project memory for existing context before asking the user to repeat information.',
    '4. When the user asks about "this contract" or "my token", refer to the project\'s primary contract.',
    '5. Keep memory.md concise and structured. Use the format defined in the project memory specification.',
    '',
    'When updating memory.md:',
    '- Preserve the existing section structure (## Contract, ## History, etc.)',
    '- Only modify relevant sections; do not rewrite the entire file',
    '- Always update the "Last updated" timestamp in the header',
    '- Append to ## History (newest at bottom)',
    '- Update ## TODO by checking off completed items and adding new ones',
    '- Keep total length under 4000 tokens; compress History if needed',
  ];
  return `\n\n${lines.join('\n')}`;
}

function extractTextFromRawMessageParts(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((part): part is { type?: string; text?: string } => {
      return !!part && typeof part === 'object';
    })
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('');
}

export function toModelMessages(rawMessages: unknown[]): ModelMessage[] {
  return rawMessages
    .map((message) => {
      const item = (message ?? {}) as {
        role?: string;
        content?: string;
        parts?: unknown;
      };
      const role =
        item.role === 'assistant' || item.role === 'system' ? item.role : 'user';
      const content =
        typeof item.content === 'string'
          ? item.content
          : extractTextFromRawMessageParts(item.parts);
      return { role, content } as ModelMessage;
    })
    .filter(
      (message) =>
        typeof message.content === 'string' && message.content.trim().length > 0
    );
}

export function toStoredMessages(rawMessages: unknown[]): StoredMessage[] {
  const now = Date.now();
  const messages: StoredMessage[] = [];
  for (let index = 0; index < rawMessages.length; index += 1) {
    const message = rawMessages[index];
    const item = (message ?? {}) as {
      id?: string;
      role?: string;
      content?: string;
      parts?: unknown;
    };
    const role: StoredMessage['role'] =
      item.role === 'assistant' || item.role === 'system' || item.role === 'user'
        ? item.role
        : 'user';
    const parts = Array.isArray(item.parts)
      ? (item.parts as Array<{ type: string; [key: string]: unknown }>)
      : undefined;
    const content =
      typeof item.content === 'string'
        ? item.content
        : extractTextFromRawMessageParts(item.parts);
    if (!content.trim()) continue;
    messages.push({
      id: item.id?.trim() || `run-msg-${index + 1}`,
      role,
      content,
      parts,
      createdAt: now,
    });
  }
  return messages;
}

export function normalizeOwnerFromRequest(
  owner: ChatOwner | undefined,
  userContext: ChatUserContext
): ChatOwner | null {
  if (owner) {
    return {
      ownerType: owner.ownerType,
      ownerId:
        owner.ownerType === 'wallet' ? owner.ownerId.toLowerCase() : owner.ownerId,
    };
  }
  const authState = userContext?.authState ?? 'guest';
  const address =
    typeof userContext?.address === 'string' ? userContext.address.toLowerCase() : null;
  if (authState === 'authenticated' && address && /^0x[0-9a-f]{40}$/.test(address)) {
    return {
      ownerType: 'wallet',
      ownerId: address,
    };
  }
  const guestId = typeof userContext?.guestId === 'string' ? userContext.guestId : null;
  if (guestId && guestId.length >= 6) {
    return {
      ownerType: 'guest',
      ownerId: guestId,
    };
  }
  return null;
}

export async function createChatStreamResult(params: {
  modelMessages: ModelMessage[];
  userContext: ChatUserContext;
  abortSignal?: AbortSignal;
  chatId?: string;
  logger?: RunLogger;
}) {
  const runtimeChainId = normalizeRuntimeChainId(params.userContext?.chainId);
  const userContextInstruction = buildUserContextInstruction(params.userContext);
  const projectId = params.userContext?.projectId ?? null;
  const projectContextInstruction = await buildProjectContextInstruction(projectId);
  const languageModel = await getChatModel(params.userContext?.modelId ?? null);
  const requestTools = {
    ...aiTools,
    ...Object.fromEntries(
      CHAIN_AWARE_TOOLS.map((toolName) => [
        toolName,
        withRuntimeChainId(toolName, runtimeChainId),
      ])
    ),
    getUserContext: tool({
      description:
        'Get current runtime user context (auth state, wallet address, chain, rpc) injected by frontend for this request.',
      inputSchema: z.object({}),
      execute: async () => ({
        ...(params.userContext ?? { authState: 'guest' }),
      }),
    }),
  };

  const doStream = () => streamText({
    model: languageModel,
    system: systemPrompt + userContextInstruction + projectContextInstruction,
    messages: params.modelMessages,
    tools: requestTools,
    maxOutputTokens: 16384,
    stopWhen: stepCountIs(6),
    abortSignal: params.abortSignal,
  });

  // Wrap in AsyncLocalStorage so tools can access chatId, userModelId, logger, projectId, and owner
  const owner = normalizeOwnerFromRequest(undefined, params.userContext) ?? undefined;
  if (params.chatId) {
    return chatRunContextStorage.run(
      {
        chatId: params.chatId,
        userModelId: params.userContext?.modelId,
        logger: params.logger,
        projectId: projectId ?? undefined,
        owner: owner ?? undefined,
      },
      doStream
    );
  }
  return doStream();
}
