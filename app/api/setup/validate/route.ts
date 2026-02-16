import { NextRequest, NextResponse } from 'next/server';
import { isSetupCompleted } from '@/lib/server/setup-store';
import { isAuthorizedAdmin, readBearerToken } from '@/lib/server/admin-auth';
import { getWalletAuthSessionFromRequest } from '@/lib/server/siwe-auth';
import { validateUrlSafety } from '@/lib/server/url-safety';

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

    // After initial setup, require admin authorization
    if (completed) {
      const token = readBearerToken(request.headers.get('authorization'));
      const session = await getWalletAuthSessionFromRequest(request);
      const authorized = await isAuthorizedAdmin(token, session?.address ?? null);
      if (!authorized) {
        return NextResponse.json(
          { valid: false, message: 'Unauthorized' },
          { status: 401 }
        );
      }
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
      case 'serper':
        return NextResponse.json(await validateSerper(config));
      case 'steel':
        return NextResponse.json(await validateSteel(config));
      case 'siwe':
        return NextResponse.json(validateSiwe(config));
      case 'rpc':
        return NextResponse.json(await validateRpc(config));
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

  const urlError = validateUrlSafety(baseUrl);
  if (urlError) return { valid: false, message: `Base URL: ${urlError}` };

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

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const goPlusSdk = require('@goplus/sdk-node').GoPlus;
    goPlusSdk.config(appKey, appSecret, 12);
    const result = await goPlusSdk.getAccessToken();
    const latencyMs = Date.now() - start;

    if (result.code === 1 && result.result?.access_token) {
      return {
        valid: true,
        message: `GoPlus credentials valid (${latencyMs}ms)`,
        latencyMs,
      };
    }
    return {
      valid: false,
      message: `Invalid credentials: ${result.message || 'authentication failed'}`,
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
    // Testing mutates the global SDK singleton — force goplus.ts to
    // re-configure from DB credentials on the next real API call.
    const { invalidateGoPlusAuth } = await import('@/lib/services/goplus');
    invalidateGoPlusAuth();
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

async function validateSerper(config: Record<string, string>): Promise<{
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
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({ q: 'test', num: 1 }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;

    if (response.ok) {
      return {
        valid: true,
        message: `Serper API working (${latencyMs}ms)`,
        latencyMs,
      };
    }

    const text = await response.text().catch(() => '');
    return {
      valid: false,
      message: text
        ? `HTTP ${response.status}: ${text.slice(0, 150)}`
        : `HTTP ${response.status}`,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return {
      valid: false,
      message:
        error instanceof Error
          ? `Serper connection failed: ${error.message}`
          : 'Serper connection failed',
      latencyMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function validateSteel(config: Record<string, string>): Promise<{
  valid: boolean;
  message: string;
  latencyMs?: number;
}> {
  const { apiKey, apiUrl } = config;
  if (!apiKey) return { valid: false, message: 'API key is required' };

  const base = apiUrl?.trim() || 'https://api.steel.dev';
  if (apiUrl?.trim()) {
    const urlError = validateUrlSafety(base);
    if (urlError) return { valid: false, message: `Steel API URL: ${urlError}` };
  }
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(`${base}/v1/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Steel-Api-Key': apiKey,
      },
      body: JSON.stringify({ url: 'https://example.com', format: ['markdown'] }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;

    if (response.ok) {
      return {
        valid: true,
        message: `Steel API working (${latencyMs}ms)`,
        latencyMs,
      };
    }

    const text = await response.text().catch(() => '');
    return {
      valid: false,
      message: text
        ? `HTTP ${response.status}: ${text.slice(0, 150)}`
        : `HTTP ${response.status}`,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return {
      valid: false,
      message:
        error instanceof Error
          ? `Steel connection failed: ${error.message}`
          : 'Steel connection failed',
      latencyMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function validateSiwe(config: Record<string, string>): {
  valid: boolean;
  message: string;
} {
  const { domain, allowedChainIds } = config;

  if (domain) {
    if (/\s/.test(domain) || domain.includes('/')) {
      return { valid: false, message: 'Domain must not contain spaces or slashes' };
    }
  }

  if (allowedChainIds) {
    const normalized = allowedChainIds.trim().toLowerCase();
    if (normalized !== 'all' && normalized !== '*') {
      const parts = allowedChainIds.split(',').map((s) => s.trim());
      for (const part of parts) {
        const n = Number(part);
        if (!Number.isInteger(n) || n <= 0) {
          return { valid: false, message: `Invalid chain ID: "${part}"` };
        }
      }
    }
  }

  return { valid: true, message: 'SIWE configuration is valid' };
}

async function validateRpc(config: Record<string, string>): Promise<{
  valid: boolean;
  message: string;
  latencyMs?: number;
}> {
  const entries = Object.entries(config).filter(([, v]) => v?.trim());
  if (entries.length === 0) {
    return { valid: false, message: 'At least one RPC URL is required' };
  }

  const start = Date.now();
  const results: string[] = [];

  for (const [key, url] of entries) {
    const urlError = validateUrlSafety(url);
    if (urlError) {
      results.push(`${key}: ${urlError}`);
      continue;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
        signal: controller.signal,
      });
      if (!response.ok) {
        results.push(`${key}: HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      if (!data.result) {
        results.push(`${key}: no result`);
        continue;
      }
    } catch (error) {
      results.push(
        `${key}: ${error instanceof Error ? error.message : 'failed'}`
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  const latencyMs = Date.now() - start;

  if (results.length > 0) {
    return {
      valid: false,
      message: `RPC check failed: ${results.join('; ')}`,
      latencyMs,
    };
  }

  return {
    valid: true,
    message: `All RPC endpoints working (${latencyMs}ms)`,
    latencyMs,
  };
}
