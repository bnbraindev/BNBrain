import { randomUUID } from 'crypto';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { ensureDatabaseSchema, getDbPool } from '@/lib/server/db';
import { isPrivateHost } from '@/lib/server/url-safety';

const CHAT_MODELS_SETTING_KEY = 'chat_models_config_v1';
const CHAT_MODELS_SETTING_VERSION = 1;
const FALLBACK_MODEL_ID = 'builtin-anthropic-env';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4.5';
const VALIDATION_TIMEOUT_MS = 10_000;

export type ChatModelProtocol = 'anthropic' | 'openai';
export type ChatModelAuthMode = 'x-api-key' | 'bearer';

export interface ChatModelRecord {
  id: string;
  displayName: string;
  protocol: ChatModelProtocol;
  baseUrl: string;
  providerModelId: string;
  apiKey: string;
  authMode: ChatModelAuthMode;
  active: boolean;
  lastValidatedAt?: number;
  lastValidationError?: string;
  createdAt: number;
  updatedAt: number;
}

interface ChatModelsSettings {
  version: number;
  defaultModelId: string | null;
  models: ChatModelRecord[];
  updatedAt: number;
}

export interface PublicChatModelOption {
  id: string;
  displayName: string;
  protocol: ChatModelProtocol;
  isDefault: boolean;
}

export interface PublicChatModelCatalog {
  models: PublicChatModelOption[];
  defaultModelId: string;
}

export interface AdminChatModelView {
  id: string;
  displayName: string;
  protocol: ChatModelProtocol;
  baseUrl: string;
  providerModelId: string;
  authMode: ChatModelAuthMode;
  active: boolean;
  isDefault: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string;
  lastValidatedAt?: number;
  lastValidationError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatModelConnectivityCheckResult {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  message: string;
}

export interface CreateChatModelInput {
  displayName: string;
  protocol: ChatModelProtocol;
  baseUrl: string;
  providerModelId: string;
  apiKey: string;
  authMode?: ChatModelAuthMode;
  active?: boolean;
  makeDefault?: boolean;
}

export interface UpdateChatModelInput {
  id: string;
  displayName?: string;
  protocol?: ChatModelProtocol;
  baseUrl?: string;
  providerModelId?: string;
  apiKey?: string;
  authMode?: ChatModelAuthMode;
  active?: boolean;
  makeDefault?: boolean;
}

export interface ResolvedRuntimeChatModel {
  id: string;
  displayName: string;
  protocol: ChatModelProtocol;
  baseUrl: string;
  providerModelId: string;
  apiKey: string;
  authMode: ChatModelAuthMode;
}

function normalizeProtocol(value: string): ChatModelProtocol {
  if (value === 'anthropic' || value === 'openai') return value;
  throw new Error('Unsupported protocol');
}

function normalizeAuthMode(
  value: string | undefined,
  protocol: ChatModelProtocol
): ChatModelAuthMode {
  if (value === 'x-api-key' || value === 'bearer') return value;
  return protocol === 'openai' ? 'bearer' : 'x-api-key';
}

/** @deprecated Use isPrivateHost from url-safety.ts instead. Kept as alias. */
const isPrivateHostname = isPrivateHost;

function normalizeBaseUrl(raw: string, protocol: ChatModelProtocol): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('Base URL is required');
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('Base URL must start with http:// or https://');
  }
  try {
    const parsed = new URL(trimmed);
    if (isPrivateHostname(parsed.hostname)) {
      throw new Error('Base URL must not point to a private or internal address');
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('private')) throw e;
    throw new Error('Invalid Base URL');
  }
  if (trimmed.endsWith('/v1')) return trimmed;
  if (protocol === 'anthropic' || protocol === 'openai') {
    return `${trimmed}/v1`;
  }
  return trimmed;
}

function normalizeDisplayName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error('Display name is required');
  if (name.length > 80) throw new Error('Display name is too long');
  return name;
}

function normalizeProviderModelId(value: string): string {
  const model = value.trim();
  if (!model) throw new Error('Provider model ID is required');
  if (model.length > 120) throw new Error('Provider model ID is too long');
  return model;
}

function normalizeApiKey(value: string): string {
  const key = value.trim();
  if (!key) throw new Error('API key is required');
  if (key.length > 400) throw new Error('API key is too long');
  return key;
}

function normalizeModelRecord(raw: unknown): ChatModelRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  try {
    const protocol = normalizeProtocol(String(item.protocol ?? ''));
    const authMode = normalizeAuthMode(
      typeof item.authMode === 'string' ? item.authMode : undefined,
      protocol
    );
    const id = String(item.id ?? '').trim();
    if (!id) return null;
    const displayName = normalizeDisplayName(String(item.displayName ?? ''));
    const baseUrl = normalizeBaseUrl(String(item.baseUrl ?? ''), protocol);
    const providerModelId = normalizeProviderModelId(
      String(item.providerModelId ?? '')
    );
    const apiKey = normalizeApiKey(String(item.apiKey ?? ''));
    const createdAt =
      typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
        ? item.createdAt
        : Date.now();
    const updatedAt =
      typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
        ? item.updatedAt
        : createdAt;
    const lastValidatedAt =
      typeof item.lastValidatedAt === 'number' && Number.isFinite(item.lastValidatedAt)
        ? item.lastValidatedAt
        : undefined;
    const lastValidationError =
      typeof item.lastValidationError === 'string' && item.lastValidationError.trim()
        ? item.lastValidationError.trim()
        : undefined;
    return {
      id,
      displayName,
      protocol,
      baseUrl,
      providerModelId,
      apiKey,
      authMode,
      active: Boolean(item.active),
      lastValidatedAt,
      lastValidationError,
      createdAt,
      updatedAt,
    };
  } catch {
    return null;
  }
}

function parseSettingsValue(raw: unknown): ChatModelsSettings {
  if (typeof raw !== 'string' || !raw.trim()) {
    return {
      version: CHAT_MODELS_SETTING_VERSION,
      defaultModelId: null,
      models: [],
      updatedAt: Date.now(),
    };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ChatModelsSettings>;
    const rawModels = Array.isArray(parsed.models) ? parsed.models : [];
    const models = rawModels
      .map((item) => normalizeModelRecord(item))
      .filter((item): item is ChatModelRecord => Boolean(item));
    const defaultModelId =
      typeof parsed.defaultModelId === 'string' && parsed.defaultModelId.trim()
        ? parsed.defaultModelId
        : null;
    const updatedAt =
      typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
        ? parsed.updatedAt
        : Date.now();
    return {
      version: CHAT_MODELS_SETTING_VERSION,
      defaultModelId,
      models,
      updatedAt,
    };
  } catch {
    return {
      version: CHAT_MODELS_SETTING_VERSION,
      defaultModelId: null,
      models: [],
      updatedAt: Date.now(),
    };
  }
}

async function readSettings(): Promise<ChatModelsSettings> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    `
      SELECT value
      FROM system_settings
      WHERE key = $1
      LIMIT 1
    `,
    [CHAT_MODELS_SETTING_KEY]
  );
  if (!rows.length) {
    return {
      version: CHAT_MODELS_SETTING_VERSION,
      defaultModelId: null,
      models: [],
      updatedAt: Date.now(),
    };
  }
  return parseSettingsValue(rows[0]?.value);
}

async function writeSettings(settings: ChatModelsSettings): Promise<void> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const now = Date.now();
  const payload: ChatModelsSettings = {
    version: CHAT_MODELS_SETTING_VERSION,
    defaultModelId: settings.defaultModelId,
    models: settings.models,
    updatedAt: now,
  };
  await pool.query(
    `
      INSERT INTO system_settings (key, value, created_at, updated_at)
      VALUES ($1, $2, $3, $3)
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `,
    [CHAT_MODELS_SETTING_KEY, JSON.stringify(payload), now]
  );
}

function maskApiKey(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '*'.repeat(Math.max(4, value.length));
  return `${value.slice(0, 4)}${'*'.repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

function getEnvFallbackModel(): ChatModelRecord | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const baseRaw = process.env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com';
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
  return {
    id: FALLBACK_MODEL_ID,
    displayName: `Builtin: ${model}`,
    protocol: 'anthropic',
    baseUrl: normalizeBaseUrl(baseRaw, 'anthropic'),
    providerModelId: model,
    apiKey,
    authMode: 'x-api-key',
    active: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

function resolveCatalog(settings: ChatModelsSettings): {
  models: ChatModelRecord[];
  defaultModelId: string | null;
} {
  if (settings.models.length > 0) {
    const models = settings.models.slice();
    const defaultExists = settings.defaultModelId
      ? models.some((model) => model.id === settings.defaultModelId)
      : false;
    const activeModels = models.filter((model) => model.active);
    const defaultModelId =
      defaultExists && settings.defaultModelId
        ? settings.defaultModelId
        : activeModels[0]?.id ?? models[0]?.id ?? null;
    return {
      models,
      defaultModelId,
    };
  }
  const fallback = getEnvFallbackModel();
  if (!fallback) {
    return {
      models: [],
      defaultModelId: null,
    };
  }
  return {
    models: [fallback],
    defaultModelId: fallback.id,
  };
}

function assertConfiguredModelExists(
  settings: ChatModelsSettings,
  id: string
): ChatModelRecord {
  const model = settings.models.find((item) => item.id === id);
  if (!model) {
    throw new Error('Model not found');
  }
  return model;
}

function assertAtLeastOneActive(models: ChatModelRecord[]): void {
  if (!models.some((model) => model.active)) {
    throw new Error('At least one active model is required');
  }
}

function createAuthFetch(
  authMode: ChatModelAuthMode,
  apiKey: string
): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const headers = new Headers(request.headers);
    if (authMode === 'bearer') {
      headers.set('authorization', `Bearer ${apiKey}`);
      headers.delete('x-api-key');
    } else {
      headers.set('x-api-key', apiKey);
      headers.delete('authorization');
    }
    return fetch(new Request(request, { headers }));
  };
}

function toAdminView(
  model: ChatModelRecord,
  defaultModelId: string | null
): AdminChatModelView {
  return {
    id: model.id,
    displayName: model.displayName,
    protocol: model.protocol,
    baseUrl: model.baseUrl,
    providerModelId: model.providerModelId,
    authMode: model.authMode,
    active: model.active,
    isDefault: model.id === defaultModelId,
    hasApiKey: Boolean(model.apiKey),
    apiKeyMasked: maskApiKey(model.apiKey),
    lastValidatedAt: model.lastValidatedAt,
    lastValidationError: model.lastValidationError,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

async function runConnectivityCheck(
  model: Omit<ChatModelRecord, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ChatModelConnectivityCheckResult> {
  const now = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
  try {
    const headers = new Headers({
      'content-type': 'application/json',
    });
    if (model.authMode === 'bearer') {
      headers.set('authorization', `Bearer ${model.apiKey}`);
    } else {
      headers.set('x-api-key', model.apiKey);
    }

    let endpoint = '';
    let payload: Record<string, unknown>;
    if (model.protocol === 'anthropic') {
      endpoint = `${model.baseUrl}/messages`;
      headers.set('anthropic-version', '2023-06-01');
      payload = {
        model: model.providerModelId,
        max_tokens: 16,
        stream: false,
        messages: [
          {
            role: 'user',
            content: 'ping',
          },
        ],
      };
    } else {
      endpoint = `${model.baseUrl}/chat/completions`;
      payload = {
        model: model.providerModelId,
        temperature: 0,
        max_tokens: 8,
        messages: [
          {
            role: 'user',
            content: 'ping',
          },
        ],
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const elapsed = Date.now() - now;
    const responseText = await response.text().catch(() => '');
    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        latencyMs: elapsed,
        message: 'Connectivity check passed',
      };
    }
    const condensed = responseText.replace(/\s+/g, ' ').trim();
    return {
      ok: false,
      status: response.status,
      latencyMs: elapsed,
      message: condensed
        ? `Validation failed (${response.status}): ${condensed.slice(0, 240)}`
        : `Validation failed (${response.status})`,
    };
  } catch (error) {
    const elapsed = Date.now() - now;
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        status: null,
        latencyMs: elapsed,
        message: `Validation timed out after ${VALIDATION_TIMEOUT_MS}ms`,
      };
    }
    return {
      ok: false,
      status: null,
      latencyMs: elapsed,
      message:
        error instanceof Error
          ? `Validation request failed: ${error.message}`
          : 'Validation request failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeForUpsert(input: {
  displayName: string;
  protocol: string;
  baseUrl: string;
  providerModelId: string;
  apiKey: string;
  authMode?: string;
  active?: boolean;
}): Omit<ChatModelRecord, 'id' | 'createdAt' | 'updatedAt'> {
  const protocol = normalizeProtocol(input.protocol);
  const authMode = normalizeAuthMode(input.authMode, protocol);
  return {
    displayName: normalizeDisplayName(input.displayName),
    protocol,
    baseUrl: normalizeBaseUrl(input.baseUrl, protocol),
    providerModelId: normalizeProviderModelId(input.providerModelId),
    apiKey: normalizeApiKey(input.apiKey),
    authMode,
    active: input.active !== false,
    lastValidatedAt: undefined,
    lastValidationError: undefined,
  };
}

export async function listAdminChatModels(): Promise<{
  models: AdminChatModelView[];
  defaultModelId: string | null;
}> {
  const settings = await readSettings();
  const rows = settings.models.map((model) =>
    toAdminView(model, settings.defaultModelId)
  );
  return {
    models: rows,
    defaultModelId: settings.defaultModelId,
  };
}

export async function listPublicChatModels(): Promise<PublicChatModelCatalog> {
  const settings = await readSettings();
  const catalog = resolveCatalog(settings);
  const active = catalog.models.filter((model) => model.active);
  if (active.length === 0) {
    throw new Error('No active chat models configured');
  }
  const defaultModelId =
    active.find((model) => model.id === catalog.defaultModelId)?.id ?? active[0].id;
  return {
    defaultModelId,
    models: active.map((model) => ({
      id: model.id,
      displayName: model.displayName,
      protocol: model.protocol,
      isDefault: model.id === defaultModelId,
    })),
  };
}

export async function createChatModel(
  input: CreateChatModelInput
): Promise<{
  model: AdminChatModelView;
  defaultModelId: string;
  validation: ChatModelConnectivityCheckResult;
}> {
  const settings = await readSettings();
  const normalized = normalizeForUpsert({
    displayName: input.displayName,
    protocol: input.protocol,
    baseUrl: input.baseUrl,
    providerModelId: input.providerModelId,
    apiKey: input.apiKey,
    authMode: input.authMode,
    active: input.active,
  });
  const validation = await runConnectivityCheck(normalized);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const now = Date.now();
  const id = randomUUID();
  const record: ChatModelRecord = {
    ...normalized,
    id,
    lastValidatedAt: now,
    lastValidationError: undefined,
    createdAt: now,
    updatedAt: now,
  };
  const nextModels = [...settings.models, record];
  assertAtLeastOneActive(nextModels);

  const desiredDefaultId =
    input.makeDefault || !settings.defaultModelId
      ? id
      : nextModels.some((model) => model.id === settings.defaultModelId)
        ? settings.defaultModelId
        : nextModels.find((model) => model.active)?.id ?? id;

  const nextSettings: ChatModelsSettings = {
    ...settings,
    models: nextModels,
    defaultModelId: desiredDefaultId,
    updatedAt: now,
  };
  await writeSettings(nextSettings);
  return {
    model: toAdminView(record, desiredDefaultId),
    defaultModelId: desiredDefaultId,
    validation,
  };
}

export async function updateChatModel(
  input: UpdateChatModelInput
): Promise<{
  model: AdminChatModelView;
  defaultModelId: string;
  validation: ChatModelConnectivityCheckResult;
}> {
  const settings = await readSettings();
  const current = assertConfiguredModelExists(settings, input.id);
  const protocol = input.protocol
    ? normalizeProtocol(input.protocol)
    : current.protocol;
  const authMode = normalizeAuthMode(input.authMode, protocol);
  const candidate = normalizeForUpsert({
    displayName: input.displayName ?? current.displayName,
    protocol,
    baseUrl: input.baseUrl ?? current.baseUrl,
    providerModelId: input.providerModelId ?? current.providerModelId,
    apiKey: input.apiKey ?? current.apiKey,
    authMode,
    active: typeof input.active === 'boolean' ? input.active : current.active,
  });
  const validation = await runConnectivityCheck(candidate);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const now = Date.now();
  const updated: ChatModelRecord = {
    ...current,
    ...candidate,
    lastValidatedAt: now,
    lastValidationError: undefined,
    updatedAt: now,
  };
  const nextModels = settings.models.map((model) =>
    model.id === current.id ? updated : model
  );
  assertAtLeastOneActive(nextModels);
  const active = nextModels.filter((model) => model.active);
  const defaultModelId =
    input.makeDefault
      ? updated.id
      : active.find((model) => model.id === settings.defaultModelId)?.id ?? active[0].id;
  const nextSettings: ChatModelsSettings = {
    ...settings,
    models: nextModels,
    defaultModelId,
    updatedAt: now,
  };
  await writeSettings(nextSettings);
  return {
    model: toAdminView(updated, defaultModelId),
    defaultModelId,
    validation,
  };
}

export async function setChatModelActive(
  modelId: string,
  active: boolean
): Promise<{ model: AdminChatModelView; defaultModelId: string }> {
  const settings = await readSettings();
  assertConfiguredModelExists(settings, modelId);
  const now = Date.now();
  const nextModels = settings.models.map((model) =>
    model.id === modelId ? { ...model, active, updatedAt: now } : model
  );
  assertAtLeastOneActive(nextModels);
  const activeModels = nextModels.filter((model) => model.active);
  const defaultModelId =
    activeModels.find((model) => model.id === settings.defaultModelId)?.id ??
    activeModels[0].id;
  await writeSettings({
    ...settings,
    models: nextModels,
    defaultModelId,
    updatedAt: now,
  });
  const updatedModel = nextModels.find((model) => model.id === modelId)!;
  return {
    model: toAdminView(updatedModel, defaultModelId),
    defaultModelId,
  };
}

export async function setDefaultChatModel(
  modelId: string
): Promise<{ model: AdminChatModelView; defaultModelId: string }> {
  const settings = await readSettings();
  const model = assertConfiguredModelExists(settings, modelId);
  if (!model.active) {
    throw new Error('Default model must be active');
  }
  const now = Date.now();
  const nextModels = settings.models.map((item) =>
    item.id === modelId ? { ...item, updatedAt: now } : item
  );
  const defaultModelId = modelId;
  await writeSettings({
    ...settings,
    models: nextModels,
    defaultModelId,
    updatedAt: now,
  });
  const updated = nextModels.find((item) => item.id === modelId)!;
  return {
    model: toAdminView(updated, defaultModelId),
    defaultModelId,
  };
}

export async function deleteChatModel(
  modelId: string
): Promise<{ deletedModelId: string; defaultModelId: string | null }> {
  const settings = await readSettings();
  assertConfiguredModelExists(settings, modelId);
  const now = Date.now();
  const nextModels = settings.models.filter((model) => model.id !== modelId);
  if (nextModels.length > 0) {
    assertAtLeastOneActive(nextModels);
  }
  const activeModels = nextModels.filter((model) => model.active);
  const defaultModelId =
    activeModels.find((model) => model.id === settings.defaultModelId)?.id ??
    activeModels[0]?.id ??
    null;
  await writeSettings({
    ...settings,
    models: nextModels,
    defaultModelId,
    updatedAt: now,
  });
  return {
    deletedModelId: modelId,
    defaultModelId,
  };
}

export async function resolveRuntimeChatModel(
  requestedModelId?: string | null
): Promise<ResolvedRuntimeChatModel> {
  const settings = await readSettings();
  const catalog = resolveCatalog(settings);
  const active = catalog.models.filter((model) => model.active);
  if (active.length === 0) {
    throw new Error('No active chat models configured');
  }
  const requestedId = requestedModelId?.trim() || null;
  const selected =
    (requestedId ? active.find((model) => model.id === requestedId) : undefined) ??
    active.find((model) => model.id === catalog.defaultModelId) ??
    active[0];

  return {
    id: selected.id,
    displayName: selected.displayName,
    protocol: selected.protocol,
    baseUrl: selected.baseUrl,
    providerModelId: selected.providerModelId,
    apiKey: selected.apiKey,
    authMode: selected.authMode,
  };
}

export function createRuntimeLanguageModel(resolved: ResolvedRuntimeChatModel) {
  const authFetch = createAuthFetch(resolved.authMode, resolved.apiKey);
  if (resolved.protocol === 'anthropic') {
    const provider = createAnthropic({
      baseURL: resolved.baseUrl,
      apiKey: resolved.apiKey,
      fetch: authFetch,
    });
    return provider(resolved.providerModelId);
  }
  const provider = createOpenAI({
    baseURL: resolved.baseUrl,
    apiKey: resolved.apiKey,
    fetch: authFetch,
  });
  return provider.chat(resolved.providerModelId);
}
