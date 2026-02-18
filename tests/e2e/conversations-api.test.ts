/**
 * E2E: Conversations API tests.
 *
 * Verifies CRUD operations for conversations with guest identity.
 * Run: npm run test:conversations
 */

import {
  BASE_URL,
  test,
  fetchJson,
  assertStatus,
  assertJsonField,
  guestHeaders,
  getGuestId,
  suiteHeader,
  printSummary,
} from './helpers';

async function main() {
  suiteHeader('E2E: Conversations API');

  const convUrl = `${BASE_URL}/api/conversations`;
  const guestId = getGuestId();
  const conversationId = `e2e-conv-${Date.now()}`;

  // ── Validation ───────────────────────────────────────────
  console.log('\n🔍 Validation');

  await test('GET without params → 400', async () => {
    const { status } = await fetchJson(convUrl);
    assertStatus(status, 400);
    return 'correctly rejected missing params';
  });

  await test('GET wallet owner without session → 401', async () => {
    const { status } = await fetchJson(
      `${convUrl}?ownerType=wallet&ownerId=0x742d35cc6634c0532925a3b844bc9e7595f2bd28`
    );
    assertStatus(status, 401);
    return 'correctly rejected unauthenticated wallet request';
  });

  // ── Guest CRUD ───────────────────────────────────────────
  console.log('\n📝 Guest CRUD');

  await test('GET guest conversations → 200', async () => {
    const { status, body } = await fetchJson(
      `${convUrl}?ownerType=guest&ownerId=${guestId}`
    );
    assertStatus(status, 200);
    assertJsonField(body, 'conversations');
    return `${body.conversations.length} conversations`;
  });

  await test('POST create guest conversation → 200', async () => {
    const { status, body } = await fetchJson(convUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: { ownerType: 'guest', ownerId: guestId },
        conversation: {
          id: conversationId,
          title: 'E2E Test Conversation',
          scope: 'guest',
          contextInjectionStatus: 'not_injected',
          messages: [
            {
              id: `msg-${Date.now()}`,
              role: 'user',
              content: 'Hello from E2E test',
              parts: [{ type: 'text', text: 'Hello from E2E test' }],
              createdAt: Date.now(),
            },
          ],
          isStarred: false,
          isShared: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      }),
    });
    assertStatus(status, 200);
    return `ok: ${body.ok}`;
  });

  await test('GET verify created conversation → 200', async () => {
    const { status, body } = await fetchJson(
      `${convUrl}?ownerType=guest&ownerId=${guestId}`
    );
    assertStatus(status, 200);
    const found = body.conversations?.find((c: any) => c.id === conversationId);
    if (!found) throw new Error(`Conversation ${conversationId} not found in list`);
    return `found: "${found.title}"`;
  });

  await test('DELETE conversation → 200', async () => {
    const { status, body } = await fetchJson(convUrl, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: { ownerType: 'guest', ownerId: guestId },
        conversationId,
      }),
    });
    assertStatus(status, 200);
    return `ok: ${body.ok}`;
  });

  await test('GET verify conversation deleted', async () => {
    const { status, body } = await fetchJson(
      `${convUrl}?ownerType=guest&ownerId=${guestId}`
    );
    assertStatus(status, 200);
    const found = body.conversations?.find((c: any) => c.id === conversationId);
    if (found) throw new Error(`Conversation ${conversationId} still exists after delete`);
    return 'confirmed deleted';
  });

  printSummary();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
