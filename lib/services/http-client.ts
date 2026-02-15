// Shared HTTP client with timeout, retry, and error normalization.

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 350;

export class ServiceError extends Error {
  readonly service: string;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    service: string,
    message: string,
    options?: { status?: number | null; retryable?: boolean; cause?: unknown }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'ServiceError';
    this.service = service;
    this.status = options?.status ?? null;
    this.retryable = options?.retryable ?? false;
  }
}

export interface FetchOptions {
  /** Request timeout in milliseconds. Default: 12 000. */
  timeoutMs?: number;
  /** Max retry attempts (including first). Default: 3. */
  maxAttempts?: number;
  /** Base delay before first retry. Default: 350ms. */
  baseDelayMs?: number;
  /** Additional headers. */
  headers?: Record<string, string>;
  /** HTTP method. Default: GET. */
  method?: 'GET' | 'POST';
  /** Request body (auto-serialized to JSON for objects). */
  body?: string | Record<string, unknown>;
  /** Service name for error messages. */
  service?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

/**
 * Perform an HTTP request with timeout and exponential backoff retry.
 * Returns the parsed JSON body on success, throws ServiceError on failure.
 */
export async function serviceFetch<T = unknown>(
  url: string,
  options?: FetchOptions
): Promise<T> {
  const service = options?.service ?? 'http';
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options?.headers,
  };
  let bodyStr: string | undefined;
  if (options?.body) {
    if (typeof options.body === 'string') {
      bodyStr = options.body;
    } else {
      bodyStr = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
    }
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: options?.method ?? 'GET',
        headers,
        body: bodyStr,
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timer);

      if (response.ok) {
        return (await response.json()) as T;
      }

      // Non-retryable status or last attempt — throw immediately
      if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts) {
        const text = await response.text().catch(() => '');
        throw new ServiceError(service, text || `HTTP ${response.status}`, {
          status: response.status,
          retryable: RETRYABLE_STATUS.has(response.status),
        });
      }

      lastError = new ServiceError(
        service,
        `HTTP ${response.status} (attempt ${attempt}/${maxAttempts})`,
        { status: response.status, retryable: true }
      );
    } catch (error) {
      clearTimeout(timer);
      if (isAbortError(error)) {
        lastError = new ServiceError(service, 'Request timed out', {
          retryable: true,
          cause: error,
        });
        if (attempt === maxAttempts) throw lastError;
      } else if (error instanceof ServiceError) {
        throw error;
      } else {
        lastError = error;
        if (attempt === maxAttempts) {
          throw new ServiceError(
            service,
            error instanceof Error ? error.message : 'Network error',
            { retryable: true, cause: error }
          );
        }
      }
    }

    // Exponential backoff with jitter
    const jitter = Math.floor(Math.random() * 150);
    await sleep(baseDelayMs * 2 ** (attempt - 1) + jitter);
  }

  throw lastError instanceof ServiceError
    ? lastError
    : new ServiceError(service, 'Request failed after retries', {
        retryable: true,
        cause: lastError,
      });
}
