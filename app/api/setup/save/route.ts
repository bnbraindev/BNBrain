import { NextRequest, NextResponse } from 'next/server';
import {
  isSetupCompleted,
  getSetupConfig,
  saveSetupConfig,
} from '@/lib/server/setup-store';
import { invalidateRpcClients } from '@/lib/chain/server-client';
import { createChatModel } from '@/lib/server/chat-model-store';
import type { ChatModelProtocol, ChatModelAuthMode } from '@/lib/server/chat-model-store';
import { isAuthorizedAdmin, readBearerToken } from '@/lib/server/admin-auth';
import { getWalletAuthSessionFromRequest } from '@/lib/server/siwe-auth';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';

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

    // Rate-limit during initial setup to mitigate race-condition abuse
    if (!completed) {
      const ip = getRequestIpAddress(request);
      const rl = await checkRateLimit({ key: `setup-save:ip:${ip}`, limit: 5, windowMs: 60_000 });
      if (!rl.allowed) {
        return NextResponse.json(
          { ok: false, error: 'Too many setup attempts. Please retry shortly.' },
          { status: 429 }
        );
      }
    }

    // After initial setup, require admin authorization
    if (completed) {
      const token = readBearerToken(request.headers.get('authorization'));
      const session = await getWalletAuthSessionFromRequest(request);
      const authorized = await isAuthorizedAdmin(token, session?.address ?? null, session?.purpose ?? null);
      if (!authorized) {
        return NextResponse.json(
          { ok: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

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
        goplus?: { appKey: string; appSecret: string } | null;
        bscscan?: { apiKey: string } | null;
        nodereal?: { apiKey: string } | null;
        serper?: { apiKey: string } | null;
        steel?: { apiKey: string; apiUrl?: string } | null;
        siwe?: { domain?: string; allowedChainIds?: string } | null;
        rpc?: { url56?: string; url204?: string } | null;
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

    if (services && 'goplus' in services) {
      if (services.goplus?.appKey && services.goplus?.appSecret) {
        nextServices.goplus = {
          appKey: services.goplus.appKey.trim(),
          appSecret: services.goplus.appSecret.trim(),
        };
      } else {
        delete nextServices.goplus;
      }
    }
    if (services && 'bscscan' in services) {
      if (services.bscscan?.apiKey) {
        nextServices.bscscan = { apiKey: services.bscscan.apiKey.trim() };
      } else {
        delete nextServices.bscscan;
      }
    }
    if (services && 'nodereal' in services) {
      if (services.nodereal?.apiKey) {
        nextServices.nodereal = { apiKey: services.nodereal.apiKey.trim() };
      } else {
        delete nextServices.nodereal;
      }
    }
    if (services && 'serper' in services) {
      if (services.serper?.apiKey) {
        nextServices.serper = { apiKey: services.serper.apiKey.trim() };
      } else {
        delete nextServices.serper;
      }
    }
    if (services && 'steel' in services) {
      if (services.steel?.apiKey) {
        nextServices.steel = {
          apiKey: services.steel.apiKey.trim(),
          apiUrl: services.steel.apiUrl?.trim() || undefined,
        };
      } else {
        delete nextServices.steel;
      }
    }
    if (services && 'siwe' in services) {
      if (services.siwe?.domain || services.siwe?.allowedChainIds) {
        nextServices.siwe = {
          domain: services.siwe.domain?.trim() || undefined,
          allowedChainIds: services.siwe.allowedChainIds?.trim() || undefined,
        };
      } else {
        delete nextServices.siwe;
      }
    }
    let rpcChanged = false;
    if (services && 'rpc' in services) {
      if (services.rpc?.url56 || services.rpc?.url204) {
        nextServices.rpc = {
          url56: services.rpc.url56?.trim() || undefined,
          url204: services.rpc.url204?.trim() || undefined,
        };
        rpcChanged = true;
      } else {
        delete nextServices.rpc;
        rpcChanged = true;
      }
    }

    await saveSetupConfig({
      completed: true,
      completedAt: Date.now(),
      services: nextServices,
    });

    // saveSetupConfig() already updates the in-memory cache.
    // Only invalidate RPC clients when RPC URLs change.
    if (rpcChanged) invalidateRpcClients();

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
