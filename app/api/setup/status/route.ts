import { NextRequest, NextResponse } from 'next/server';
import { isSetupCompleted, getSetupConfig } from '@/lib/server/setup-store';
import { isAuthorizedAdmin, readBearerToken } from '@/lib/server/admin-auth';
import { getWalletAuthSessionFromRequest } from '@/lib/server/siwe-auth';

export async function GET(request: NextRequest) {
  try {
    const completed = await isSetupCompleted();
    const config = await getSetupConfig();

    // Check if models exist (env or DB)
    let hasModels = false;
    if (process.env.ANTHROPIC_API_KEY?.trim()) {
      hasModels = true;
    } else {
      try {
        const { listPublicChatModels } = await import(
          '@/lib/server/chat-model-store'
        );
        const catalog = await listPublicChatModels();
        hasModels = catalog.models.length > 0;
      } catch {
        // no models
      }
    }

    // After setup is completed, detailed service info requires admin auth.
    // Unauthenticated callers (setup wizard redirect check) only get basics.
    if (completed) {
      const token = readBearerToken(request.headers.get('authorization'));
      const session = await getWalletAuthSessionFromRequest(request);
      const authorized = await isAuthorizedAdmin(token, session?.address ?? null);
      if (!authorized) {
        return NextResponse.json({ completed, hasModels });
      }
    }

    return NextResponse.json({
      completed,
      hasModels,
      services: {
        anthropic: {
          configured: hasModels,
          fromEnv: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
        },
        goplus: {
          configured: Boolean(
            config.services.goplus?.appKey ||
              process.env.GOPLUS_APP_KEY?.trim()
          ),
          fromEnv: Boolean(process.env.GOPLUS_APP_KEY?.trim()),
        },
        bscscan: {
          configured: Boolean(
            config.services.bscscan?.apiKey ||
              process.env.BSCSCAN_API_KEY?.trim() ||
              process.env.ETHERSCAN_API_KEY?.trim()
          ),
          fromEnv: Boolean(
            process.env.BSCSCAN_API_KEY?.trim() ||
              process.env.ETHERSCAN_API_KEY?.trim()
          ),
        },
        serper: {
          configured: Boolean(
            config.services.serper?.apiKey ||
              process.env.SERPER_API_KEY?.trim()
          ),
          fromEnv: Boolean(process.env.SERPER_API_KEY?.trim()),
        },
        steel: {
          configured: Boolean(
            config.services.steel?.apiKey ||
              process.env.STEEL_API_KEY?.trim()
          ),
          fromEnv: Boolean(process.env.STEEL_API_KEY?.trim()),
        },
      },
      envPreloaded: {
        anthropicBaseUrl:
          process.env.ANTHROPIC_BASE_URL?.trim() ||
          'https://api.anthropic.com',
        anthropicModel:
          process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-5-20250929',
        hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
        hasGoplusKey: Boolean(process.env.GOPLUS_APP_KEY?.trim()),
        hasBscscanKey: Boolean(
          process.env.BSCSCAN_API_KEY?.trim() ||
            process.env.ETHERSCAN_API_KEY?.trim()
        ),
        hasSerperKey: Boolean(process.env.SERPER_API_KEY?.trim()),
        hasSteelKey: Boolean(process.env.STEEL_API_KEY?.trim()),
        hasSiweDomain: Boolean(process.env.SIWE_DOMAIN?.trim()),
        hasSiweChainIds: Boolean(process.env.SIWE_ALLOWED_CHAIN_IDS?.trim()),
        hasRpcUrls: Boolean(
          process.env.RPC_URL_56?.trim() ||
            process.env.RPC_URL_97?.trim() ||
            process.env.RPC_URL_204?.trim()
        ),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to check setup status',
      },
      { status: 500 }
    );
  }
}
