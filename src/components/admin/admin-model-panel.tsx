'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Power,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';

interface AdminModelPanelProps {
  authToken?: string;
}

type ChatModelProtocol = 'anthropic' | 'openai';
type ChatModelAuthMode = 'x-api-key' | 'bearer';

interface AdminModelView {
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
}

interface NoticeState {
  tone: 'neutral' | 'success' | 'error';
  message: string;
}

interface ModelFormState {
  displayName: string;
  protocol: ChatModelProtocol;
  baseUrl: string;
  providerModelId: string;
  apiKey: string;
  authMode: ChatModelAuthMode;
  active: boolean;
  makeDefault: boolean;
}

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const defaultFormState: ModelFormState = {
  displayName: '',
  protocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  providerModelId: '',
  apiKey: '',
  authMode: 'x-api-key',
  active: true,
  makeDefault: false,
};

function normalizeProtocolBaseUrl(protocol: ChatModelProtocol): string {
  if (protocol === 'openai') return 'https://api.openai.com/v1';
  return 'https://api.anthropic.com/v1';
}

function normalizeProtocolAuthMode(protocol: ChatModelProtocol): ChatModelAuthMode {
  return protocol === 'openai' ? 'bearer' : 'x-api-key';
}

function formatTime(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return '-';
  return dateTimeFormatter.format(new Date(ts));
}

export function AdminModelPanel({ authToken }: AdminModelPanelProps) {
  const { t } = useI18n();
  const [models, setModels] = useState<AdminModelView[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [form, setForm] = useState<ModelFormState>(defaultFormState);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const apiPath = useMemo(() => {
    const token = authToken?.trim();
    return token ? `/api/admin/models?token=${encodeURIComponent(token)}` : '/api/admin/models';
  }, [authToken]);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(apiPath, {
        method: 'GET',
        credentials: 'include',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        models?: AdminModelView[];
        defaultModelId?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          typeof payload.error === 'string'
            ? payload.error
            : `${t('admin.models.loadFailed')} (${response.status})`
        );
      }
      setModels(Array.isArray(payload.models) ? payload.models : []);
      setDefaultModelId(
        typeof payload.defaultModelId === 'string' ? payload.defaultModelId : null
      );
      setNotice(null);
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : t('admin.models.loadFailed'),
      });
    } finally {
      setLoading(false);
    }
  }, [apiPath, t]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const isEditing = Boolean(editingModelId);
  const isBusy = activeAction !== null;

  const resetForm = useCallback(() => {
    setEditingModelId(null);
    setForm(defaultFormState);
  }, []);

  const beginEdit = (model: AdminModelView) => {
    setEditingModelId(model.id);
    setForm({
      displayName: model.displayName,
      protocol: model.protocol,
      baseUrl: model.baseUrl,
      providerModelId: model.providerModelId,
      apiKey: '',
      authMode: model.authMode,
      active: model.active,
      makeDefault: model.id === defaultModelId,
    });
    setNotice(null);
  };

  const handleProtocolChanged = (protocol: ChatModelProtocol) => {
    setForm((current) => ({
      ...current,
      protocol,
      authMode: normalizeProtocolAuthMode(protocol),
      baseUrl: normalizeProtocolBaseUrl(protocol),
    }));
  };

  const handleSubmit = async () => {
    const displayName = form.displayName.trim();
    const providerModelId = form.providerModelId.trim();
    const baseUrl = form.baseUrl.trim();
    const apiKey = form.apiKey.trim();
    if (!displayName || !providerModelId || !baseUrl) {
      setNotice({ tone: 'error', message: t('admin.models.requiredFields') });
      return;
    }
    if (!isEditing && !apiKey) {
      setNotice({ tone: 'error', message: t('admin.models.apiKeyRequired') });
      return;
    }

    setActiveAction(isEditing ? 'update' : 'create');
    setNotice(null);
    try {
      const method = isEditing ? 'PUT' : 'POST';
      const body = isEditing
        ? {
            id: editingModelId!,
            displayName,
            protocol: form.protocol,
            baseUrl,
            providerModelId,
            authMode: form.authMode,
            active: form.active,
            makeDefault: form.makeDefault,
            ...(apiKey ? { apiKey } : {}),
          }
        : {
            displayName,
            protocol: form.protocol,
            baseUrl,
            providerModelId,
            authMode: form.authMode,
            active: form.active,
            makeDefault: form.makeDefault,
            apiKey,
          };
      const response = await fetch(apiPath, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        validation?: { latencyMs?: number; message?: string; ok?: boolean };
      };
      if (!response.ok) {
        throw new Error(
          typeof payload.error === 'string'
            ? payload.error
            : `${isEditing ? t('admin.models.updateFailed') : t('admin.models.createFailed')} (${response.status})`
        );
      }
      const latency =
        typeof payload.validation?.latencyMs === 'number' &&
        Number.isFinite(payload.validation.latencyMs)
          ? ` (${Math.round(payload.validation.latencyMs)}ms)`
          : '';
      setNotice({
        tone: 'success',
        message: isEditing
          ? `${t('admin.models.updatedAndValidated')}${latency}`
          : `${t('admin.models.createdAndValidated')}${latency}`,
      });
      resetForm();
      await loadModels();
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : t('admin.models.saveFailed'),
      });
    } finally {
      setActiveAction(null);
    }
  };

  const updateModelState = async (body: Record<string, unknown>, actionKey: string) => {
    setActiveAction(actionKey);
    setNotice(null);
    try {
      const response = await fetch(apiPath, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(
          typeof payload.error === 'string'
            ? payload.error
            : `${t('admin.models.updateFailed')} (${response.status})`
        );
      }
      await loadModels();
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : t('admin.models.updateFailed'),
      });
    } finally {
      setActiveAction(null);
    }
  };

  const handleSetActive = (model: AdminModelView, active: boolean) => {
    void updateModelState(
      {
        action: 'set-active',
        id: model.id,
        active,
      },
      `active:${model.id}`
    );
  };

  const handleSetDefault = (model: AdminModelView) => {
    void updateModelState(
      {
        action: 'set-default',
        id: model.id,
      },
      `default:${model.id}`
    );
  };

  const handleDelete = async (model: AdminModelView) => {
    const confirmed = window.confirm(`${t('admin.models.confirmDelete')} "${model.displayName}" ?`);
    if (!confirmed) return;
    setActiveAction(`delete:${model.id}`);
    setNotice(null);
    try {
      const response = await fetch(apiPath, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: model.id,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(
          typeof payload.error === 'string'
            ? payload.error
            : `${t('admin.models.deleteFailed')} (${response.status})`
        );
      }
      if (editingModelId === model.id) {
        resetForm();
      }
      await loadModels();
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : t('admin.models.deleteFailed'),
      });
    } finally {
      setActiveAction(null);
    }
  };

  const noticeClassName =
    notice?.tone === 'success'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
      : notice?.tone === 'error'
        ? 'border-red-500/40 bg-red-500/10 text-red-400'
        : 'border-border bg-muted text-foreground';

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_16px_34px_-26px_rgba(0,0,0,0.44)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Bot className="size-4 text-primary" aria-hidden="true" />
            {t('admin.models.title')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('admin.models.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadModels();
          }}
          disabled={loading || isBusy}
          className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs text-foreground hover:bg-accent disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            t('admin.common.refresh')
          )}
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={form.displayName}
          onChange={(event) =>
            setForm((current) => ({ ...current, displayName: event.target.value }))
          }
          placeholder={t('admin.models.displayName')}
          className="h-9 rounded-md border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-ring"
        />
        <select
          value={form.protocol}
          onChange={(event) => handleProtocolChanged(event.target.value as ChatModelProtocol)}
          className="h-9 rounded-md border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-ring"
        >
          <option value="anthropic">{t('admin.models.protocolAnthropic')}</option>
          <option value="openai">{t('admin.models.protocolOpenai')}</option>
        </select>
        <select
          value={form.authMode}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              authMode: event.target.value as ChatModelAuthMode,
            }))
          }
          className="h-9 rounded-md border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-ring"
        >
          <option value="bearer">Authorization: Bearer</option>
          <option value="x-api-key">x-api-key</option>
        </select>
        <input
          value={form.providerModelId}
          onChange={(event) =>
            setForm((current) => ({ ...current, providerModelId: event.target.value }))
          }
          placeholder={t('admin.models.providerModelId')}
          className="h-9 rounded-md border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-ring"
        />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={form.baseUrl}
          onChange={(event) =>
            setForm((current) => ({ ...current, baseUrl: event.target.value }))
          }
          placeholder={t('admin.models.baseUrl')}
          className="h-9 rounded-md border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-ring"
        />
        <input
          value={form.apiKey}
          onChange={(event) =>
            setForm((current) => ({ ...current, apiKey: event.target.value }))
          }
          placeholder={
            isEditing ? t('admin.models.apiKeyRotateHint') : t('admin.models.apiKey')
          }
          className="h-9 rounded-md border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-ring"
        />
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-foreground">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) =>
                setForm((current) => ({ ...current, active: event.target.checked }))
              }
            />
            {t('admin.models.active')}
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-foreground">
            <input
              type="checkbox"
              checked={form.makeDefault}
              onChange={(event) =>
                setForm((current) => ({ ...current, makeDefault: event.target.checked }))
              }
            />
            {t('admin.models.default')}
          </label>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t('admin.models.keyHint')}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            void handleSubmit();
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#F0B90B] px-3 text-xs font-medium text-black disabled:opacity-60"
        >
          {activeAction === 'create' || activeAction === 'update' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : isEditing ? (
            <Pencil className="size-3.5" aria-hidden="true" />
          ) : (
            <Plus className="size-3.5" aria-hidden="true" />
          )}
          {isEditing ? t('admin.models.saveAndValidate') : t('admin.models.createAndValidate')}
        </button>
        {isEditing ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={resetForm}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-foreground hover:bg-accent disabled:opacity-60"
          >
            <X className="size-3.5" aria-hidden="true" />
            {t('admin.models.cancelEdit')}
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            {t('admin.models.loading')}
          </p>
        ) : models.length === 0 ? (
          <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            {t('admin.models.empty')}
          </p>
        ) : (
          models.map((model) => (
            <div
              key={model.id}
              className="rounded-xl border border-border bg-muted/80 px-3 py-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">
                    {model.displayName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {model.protocol} · {model.providerModelId}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{model.baseUrl}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
                      model.active
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                        : 'border-border bg-card text-muted-foreground'
                    }`}
                  >
                    {model.active ? t('admin.models.active') : t('admin.models.inactive')}
                  </span>
                  {model.id === defaultModelId ? (
                    <span className="inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                      {t('admin.models.default')}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-1 text-xs text-muted-foreground">
                {t('admin.models.auth')}: {model.authMode} · {t('admin.models.key')}:{' '}
                {model.apiKeyMasked || t('admin.models.hidden')} · {t('admin.models.lastCheck')}:{' '}
                {formatTime(model.lastValidatedAt)}
                {model.lastValidationError
                  ? ` · ${t('admin.models.lastError')}: ${model.lastValidationError}`
                  : ''}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => beginEdit(model)}
                  className="inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2 text-xs text-foreground hover:bg-accent disabled:opacity-50"
                >
                  <Pencil className="size-3" aria-hidden="true" />
                  {t('admin.models.edit')}
                </button>
                <button
                  type="button"
                  disabled={isBusy || !model.active || model.id === defaultModelId}
                  onClick={() => handleSetDefault(model)}
                  className="inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2 text-xs text-foreground hover:bg-accent disabled:opacity-50"
                >
                  {activeAction === `default:${model.id}` ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <Star className="size-3" aria-hidden="true" />
                  )}
                  {t('admin.models.setDefault')}
                </button>
                <button
                  type="button"
                  disabled={isBusy || model.id === defaultModelId}
                  onClick={() => handleSetActive(model, !model.active)}
                  className="inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2 text-xs text-foreground hover:bg-accent disabled:opacity-50"
                >
                  {activeAction === `active:${model.id}` ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <Power className="size-3" aria-hidden="true" />
                  )}
                  {model.active ? t('admin.models.deactivate') : t('admin.models.activate')}
                </button>
                <button
                  type="button"
                  disabled={isBusy || model.id === defaultModelId}
                  onClick={() => {
                    void handleDelete(model);
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded border border-red-500/50 bg-red-500/10 px-2 text-xs text-red-400 disabled:opacity-50"
                >
                  {activeAction === `delete:${model.id}` ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="size-3" aria-hidden="true" />
                  )}
                  {t('admin.models.delete')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {notice ? (
        <p className={`mt-3 rounded-lg border px-3 py-2 text-xs ${noticeClassName}`}>
          <span className="inline-flex items-center gap-1.5">
            {notice.tone === 'success' ? (
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
            ) : null}
            {notice.message}
          </span>
        </p>
      ) : null}
    </section>
  );
}
