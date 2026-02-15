import { NextRequest, NextResponse } from 'next/server';
import {
  isSetupCompleted,
  getSetupConfig,
  saveSetupConfig,
  invalidateSetupCache,
} from '@/lib/server/setup-store';
import { createChatModel } from '@/lib/server/chat-model-store';
import type { ChatModelProtocol, ChatModelAuthMode } from '@/lib/server/chat-model-store';

/**
 * POST /api/setup/save
 *
 * Saves the setup configuration (model + optional services).
 * Only creates a model if no models exist yet.
 * Marks setup as completed.
 *
 * Body: {
 *   model?: { displayName, protocol, baseUrl, providerModelId, apiKey, authMode },
 *   services?: { goplus?: { appKey, appSecret }, bscscan?: { apiKey } },
 *   skipModel?: boolean
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const completed = await isSetupCompleted();

    const body = await request.json();
    const { model, services, skipModel } = body as {
      model?: {
        displayName: string;
        protocol: string;
        baseUrl: string;
        providerModelId: string;
        apiKey: string;
        authMode?: string;
      };
      services?: {
        goplus?: { appKey: string; appSecret: string };
        bscscan?: { apiKey: string };
      };
      skipModel?: boolean;
    };

    // Create model if provided and setup not yet completed
    if (model && !skipModel && !completed) {
      try {
        await createChatModel({
          displayName: model.displayName || `${model.providerModelId}`,
          protocol: model.protocol as ChatModelProtocol,
          baseUrl: model.baseUrl,
          providerModelId: model.providerModelId,
          apiKey: model.apiKey,
          authMode: model.authMode as ChatModelAuthMode | undefined,
          active: true,
          makeDefault: true,
        });
      } catch (error) {
        return NextResponse.json(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to create model',
          },
          { status: 400 }
        );
      }
    }

    // Save service configs + mark completed
    const existingConfig = await getSetupConfig();
    const nextServices = { ...existingConfig.services };

    if (services?.goplus?.appKey && services?.goplus?.appSecret) {
      nextServices.goplus = {
        appKey: services.goplus.appKey.trim(),
        appSecret: services.goplus.appSecret.trim(),
      };
    }
    if (services?.bscscan?.apiKey) {
      nextServices.bscscan = {
        apiKey: services.bscscan.apiKey.trim(),
      };
    }

    await saveSetupConfig({
      completed: true,
      completedAt: Date.now(),
      services: nextServices,
    });

    invalidateSetupCache();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Failed to save setup',
      },
      { status: 500 }
    );
  }
}
