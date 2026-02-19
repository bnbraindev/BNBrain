'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useChatStore } from '@/lib/stores/chat-store';
import { useI18n } from '@/lib/i18n/context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatModelOption {
  id: string;
  displayName: string;
  protocol: 'anthropic' | 'openai';
  isDefault: boolean;
}

function getModelDescription(displayName: string, locale: string): string | null {
  const lower = displayName.toLowerCase();
  if (lower.includes('opus')) return locale === 'zh' ? '最强能力' : 'Most capable';
  if (lower.includes('sonnet')) return locale === 'zh' ? '快速且智能' : 'Fast and intelligent';
  if (lower.includes('haiku')) return locale === 'zh' ? '最快响应' : 'Fastest responses';
  return null;
}

export function ModelSelector() {
  const { t, locale } = useI18n();
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const setSelectedModelId = useChatStore((s) => s.setSelectedModelId);
  const [availableModels, setAvailableModels] = useState<ChatModelOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadModels = async () => {
      try {
        const response = await fetch('/api/models', {
          method: 'GET',
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`Failed to load models (${response.status})`);
        }
        const payload = (await response.json()) as {
          models?: Array<{
            id?: string;
            displayName?: string;
            protocol?: 'anthropic' | 'openai';
            isDefault?: boolean;
          }>;
          defaultModelId?: string;
        };
        const parsedModels = Array.isArray(payload.models)
          ? payload.models
              .map((item) => {
                const id = typeof item.id === 'string' ? item.id.trim() : '';
                const displayName =
                  typeof item.displayName === 'string' ? item.displayName.trim() : '';
                const protocol =
                  item.protocol === 'openai' || item.protocol === 'anthropic'
                    ? item.protocol
                    : null;
                if (!id || !displayName || !protocol) return null;
                return {
                  id,
                  displayName,
                  protocol,
                  isDefault: Boolean(item.isDefault),
                } satisfies ChatModelOption;
              })
              .filter((item): item is ChatModelOption => Boolean(item))
          : [];
        if (cancelled) return;
        setAvailableModels(parsedModels);
        if (parsedModels.length === 0) return;

        const currentSelectedModelId = useChatStore.getState().selectedModelId;
        const hasCurrentSelection =
          Boolean(currentSelectedModelId) &&
          parsedModels.some((model) => model.id === currentSelectedModelId);
        if (hasCurrentSelection) return;

        const declaredDefault =
          typeof payload.defaultModelId === 'string'
            ? payload.defaultModelId.trim()
            : '';
        const nextDefaultId =
          parsedModels.find((model) => model.id === declaredDefault)?.id ??
          parsedModels.find((model) => model.isDefault)?.id ??
          parsedModels[0].id;
        setSelectedModelId(nextDefaultId);
      } catch {
        if (cancelled) return;
        setAvailableModels([]);
      }
    };
    void loadModels();
    return () => {
      cancelled = true;
    };
  }, [setSelectedModelId]);

  const effectiveModelId =
    selectedModelId && availableModels.some((m) => m.id === selectedModelId)
      ? selectedModelId
      : (availableModels.find((m) => m.isDefault)?.id ??
        availableModels[0]?.id ??
        null);

  if (availableModels.length === 0) return null;

  const currentModel = availableModels.find((m) => m.id === effectiveModelId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-8 cursor-pointer items-center gap-1 rounded-lg bg-card/80 px-2.5 text-[13px] font-semibold text-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-card disabled:cursor-default disabled:opacity-60 sm:text-[15px]"
          disabled={availableModels.length <= 1}
          aria-label={t('chat.model')}
        >
          <span>{currentModel?.displayName ?? t('chat.model')}</span>
          {availableModels.length > 1 && (
            <ChevronDown className="size-3.5 text-muted-foreground/60" aria-hidden="true" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {availableModels.map((model) => {
          const isSelected = model.id === effectiveModelId;
          const description = getModelDescription(model.displayName, locale);
          return (
            <DropdownMenuItem
              key={model.id}
              className="flex cursor-pointer items-start gap-3 px-3 py-2.5"
              onClick={() => setSelectedModelId(model.id)}
            >
              <div className="flex w-5 shrink-0 items-center justify-center pt-0.5">
                {isSelected && <Check className="size-4 text-primary" aria-hidden="true" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{model.displayName}</div>
                {description && (
                  <div className="text-xs text-muted-foreground">{description}</div>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
