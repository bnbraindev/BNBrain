const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

export async function retryingFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const maxAttempts = 3;
  const baseDelayMs = 300;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.ok) return response;

      if (!shouldRetryStatus(response.status) || attempt === maxAttempts) {
        return response;
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error;
      if (attempt === maxAttempts) {
        throw error;
      }
    }

    const jitter = Math.floor(Math.random() * 120);
    const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
    await sleep(delay);
  }

  if (lastError) throw lastError;
  throw new Error('Request failed after retries');
}

