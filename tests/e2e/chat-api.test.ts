/**
 * E2E: Chat API tests.
 *
 * Verifies input validation, error codes, and basic guest SSE streaming.
 * Run: npm run test:chat
 */

import {
  BASE_URL,
  test,
  fetchJson,
  assertStatus,
  assertJsonFieldEquals,
  guestHeaders,
  getGuestId,
  suiteHeader,
  printSummary,
} from './helpers';

async function main() {
  suiteHeader('E2E: Chat API');

  const chatUrl = `${BASE_URL}/api/chat`;

  // ── Input validation ─────────────────────────────────────
  console.log('\n🔍 Input Validation');

  await test('POST empty body → 400 INVALID_JSON', async () => {
    const { status, body } = await fetchJson(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...guestHeaders() },
      body: '',
    });
    assertStatus(status, 400);
    assertJsonFieldEquals(body, 'error.code', 'INVALID_JSON');
    return `code: ${body.error?.code}`;
  });

  await test('POST {} → 400 INVALID_REQUEST_BODY', async () => {
    // Empty object fails ChatRequestSchema parse (missing required fields)
    const { status, body } = await fetchJson(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...guestHeaders() },
      body: JSON.stringify({}),
    });
    assertStatus(status, 400);
    // Could be INVALID_REQUEST_BODY or EMPTY_MESSAGES depending on schema
    const code = body.error?.code;
    if (code !== 'INVALID_REQUEST_BODY' && code !== 'EMPTY_MESSAGES') {
      throw new Error(`Expected INVALID_REQUEST_BODY or EMPTY_MESSAGES, got ${code}`);
    }
    return `code: ${code}`;
  });

  await test('POST with messages but no text → 400 EMPTY_MESSAGES', async () => {
    const { status, body } = await fetchJson(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...guestHeaders() },
      body: JSON.stringify({
        messages: [{ role: 'system', content: '' }],
      }),
    });
    assertStatus(status, 400);
    assertJsonFieldEquals(body, 'error.code', 'EMPTY_MESSAGES');
    return `code: ${body.error?.code}`;
  });

  await test('POST invalid owner format → 400', async () => {
    // Owner with bad format fails schema validation
    const { status, body } = await fetchJson(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'test' }],
        owner: { ownerType: 'wallet', ownerId: 'not-a-valid-wallet-address' },
      }),
    });
    assertStatus(status, 400);
    const code = body.error?.code;
    if (code !== 'INVALID_REQUEST_BODY' && code !== 'INVALID_OWNER_CONTEXT') {
      throw new Error(`Expected INVALID_REQUEST_BODY or INVALID_OWNER_CONTEXT, got ${code}`);
    }
    return `code: ${code}`;
  });

  await test('POST wallet owner without session → 401 UNAUTHORIZED', async () => {
    // Owner must be in body for wallet auth to be checked
    const { status, body } = await fetchJson(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'test' }],
        owner: {
          ownerType: 'wallet',
          ownerId: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
        },
      }),
    });
    assertStatus(status, 401);
    assertJsonFieldEquals(body, 'error.code', 'UNAUTHORIZED');
    return `code: ${body.error?.code}`;
  });

  // ── SSE streaming (guest) ────────────────────────────────
  console.log('\n📡 SSE Streaming');

  await test('POST guest chat → 200 SSE stream (read first chunks)', async () => {
    const controller = new AbortController();
    const resp = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...guestHeaders(),
      },
      body: JSON.stringify({
        id: `e2e-chat-${Date.now()}`,
        messages: [
          { id: `msg-${Date.now()}`, role: 'user', content: 'Say "hello" and nothing else.' },
        ],
        owner: { ownerType: 'guest', ownerId: getGuestId() },
      }),
      signal: controller.signal,
    });

    assertStatus(resp.status, 200);
    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream') && !contentType.includes('text/plain')) {
      throw new Error(`Unexpected content-type: ${contentType}`);
    }

    // Read a few chunks to confirm the stream is alive
    const reader = resp.body?.getReader();
    if (!reader) throw new Error('No response body reader');

    const decoder = new TextDecoder();
    let received = '';
    let chunks = 0;
    const maxChunks = 10;

    try {
      while (chunks < maxChunks) {
        const { done, value } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
        chunks++;
        if (received.length > 200) break;
      }
    } finally {
      controller.abort();
      reader.releaseLock();
    }

    return `${chunks} chunks, ${received.length} bytes received`;
  });

  printSummary();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
