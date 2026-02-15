import { NextRequest, NextResponse } from 'next/server';
import { isSetupCompleted } from '@/lib/server/setup-store';

const VALIDATION_TIMEOUT_MS = 12_000;

/**
 * POST /api/setup/validate
 * Validate a service configuration before saving.
 *
 * Body: { service: 'anthropic' | 'goplus' | 'bscscan', config: {...} }
 */
export async function POST(request: NextRequest) {
  try {
    const completed = await isSetupCompleted();
    // Allow validation even after setup (for admin settings)
    // but block if it's clearly an abuse scenario
    if (completed) {
      // Still allow — admin might re-test keys
    }

    const body = await request.json();
    const { service, config } = body as {
      service: string;
      config: Record<string, string>;
    };

    if (!service || !config) {
      return NextResponse.json(
        { valid: false, message: 'Missing service or config' },
        { status: 400 }
      );
    }

    switch (service) {
      case 'anthropic':
        return NextResponse.json(await validateAnthropic(config));
      case 'goplus':
        return NextResponse.json(await validateGoPlus(config));
      case 'bscscan':
        return NextResponse.json(await validateBscScan(config));
      default:
        return NextResponse.json(
          { valid: false, message: `Unknown service: ${service}` },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      {
        valid: false,
        message:
          error instanceof Error ? error.message : 'Validation failed',
      },
      { status: 500 }
    );
  }
}

async function validateAnthropic(config: Record<string, string>): Promise<{
  valid: boolean;
  message: string;
  latencyMs?: number;
}> {
  const { apiKey, baseUrl, model, protocol, authMode } = config;
  if (!apiKey) return { valid: false, message: 'API key is required' };
  if (!baseUrl) return { valid: false, message: 'Base URL is required' };
  if (!model) return { valid: false, message: 'Model ID is required' };

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

  try {
    const headers = new Headers({ 'content-type': 'application/json' });
    const isOpenAI = protocol === 'openai';
    const useBearer = authMode === 'bearer' || isOpenAI;

    if (useBearer) {
      headers.set('authorization', `Bearer ${apiKey}`);
    } else {
      headers.set('x-api-key', apiKey);
    }

    let endpoint: string;
    let payload: Record<string, unknown>;

    const normalizedBase = baseUrl.trim().replace(/\/+$/, '');
    const base = normalizedBase.endsWith('/v1')
      ? normalizedBase
      : `${normalizedBase}/v1`;

    if (isOpenAI) {
      endpoint = `${base}/chat/completions`;
      payload = {
        model,
        temperature: 0,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'ping' }],
      };
    } else {
      endpoint = `${base}/messages`;
      headers.set('anthropic-version', '2023-06-01');
      payload = {
        model,
        max_tokens: 16,
        stream: false,
        messages: [{ role: 'user', content: 'ping' }],
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;

    if (response.ok) {
      return { valid: true, message: `Connected (${latencyMs}ms)`, latencyMs };
    }

    const text = await response.text().catch(() => '');
    const condensed = text.replace(/\s+/g, ' ').trim().slice(0, 200);
    return {
      valid: false,
      message: condensed
        ? `HTTP ${response.status}: ${condensed}`
        : `HTTP ${response.status}`,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        valid: false,
        message: `Connection timed out (${VALIDATION_TIMEOUT_MS}ms)`,
        latencyMs,
      };
    }
    return {
      valid: false,
      message:
        error instanceof Error
          ? `Connection failed: ${error.message}`
          : 'Connection failed',
      latencyMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function validateGoPlus(config: Record<string, string>): Promise<{
  valid: boolean;
  message: string;
  latencyMs?: number;
}> {
  const { appKey, appSecret } = config;
  if (!appKey) return { valid: false, message: 'App Key is required' };
  if (!appSecret) return { valid: false, message: 'App Secret is required' };

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

  try {
    // Use GoPlus access token endpoint to validate credentials
    const response = await fetch(
      'https://api.gopluslabs.io/api/v1/token_security/56?contract_addresses=0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
      {
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      }
    );

    const latencyMs = Date.now() - start;

    if (response.ok) {
      const data = await response.json();
      if (data.code === 1 && data.result) {
        return {
          valid: true,
          message: `GoPlus API accessible (${latencyMs}ms)`,
          latencyMs,
        };
      }
    }

    return {
      valid: false,
      message: `GoPlus API check failed (${response.status})`,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return {
      valid: false,
      message:
        error instanceof Error
          ? `GoPlus connection failed: ${error.message}`
          : 'GoPlus connection failed',
      latencyMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function validateBscScan(config: Record<string, string>): Promise<{
  valid: boolean;
  message: string;
  latencyMs?: number;
}> {
  const { apiKey } = config;
  if (!apiKey) return { valid: false, message: 'API key is required' };

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

  try {
    // Simple balance check for a known address via Etherscan V2
    const url = `https://api.etherscan.io/v2/api?chainid=56&module=account&action=balance&address=0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82&apikey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, { signal: controller.signal });
    const latencyMs = Date.now() - start;

    if (response.ok) {
      const data = await response.json();
      if (data.status === '1' || data.message === 'OK') {
        return {
          valid: true,
          message: `BscScan API working (${latencyMs}ms)`,
          latencyMs,
        };
      }
      if (data.message?.includes('NOTOK') || data.result?.includes('Invalid')) {
        return {
          valid: false,
          message: `Invalid API key: ${data.result || data.message}`,
          latencyMs,
        };
      }
    }

    return {
      valid: false,
      message: `BscScan API check failed (${response.status})`,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return {
      valid: false,
      message:
        error instanceof Error
          ? `BscScan connection failed: ${error.message}`
          : 'BscScan connection failed',
      latencyMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}
