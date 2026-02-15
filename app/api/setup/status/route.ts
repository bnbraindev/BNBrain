import { NextResponse } from 'next/server';
import { isSetupCompleted, getSetupConfig } from '@/lib/server/setup-store';

export async function GET() {
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
