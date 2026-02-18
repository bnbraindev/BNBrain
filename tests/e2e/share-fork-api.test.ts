/**
 * E2E: Share & Fork API tests.
 *
 * Verifies share link creation, retrieval, forking, and revocation.
 * Run: npm run test:share-fork
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
  suiteHeader('E2E: Share & Fork API');

  const convUrl = `${BASE_URL}/api/conversations`;
  const shareUrl = `${BASE_URL}/api/share`;
  const guestId = getGuestId();
  const conversationId = `e2e-share-${Date.now()}`;
  let shareToken = '';

  // ── Setup: create a conversation to share ────────────────
  console.log('\n📝 Setup');

  await test('Create conversation for sharing', async () => {
    const { status, body } = await fetchJson(convUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: { ownerType: 'guest', ownerId: guestId },
        conversation: {
          id: conversationId,
          title: 'E2E Share Test',
          scope: 'guest',
          contextInjectionStatus: 'not_injected',
          messages: [
            {
              id: `msg-${Date.now()}`,
              role: 'user',
              content: 'This conversation will be shared',
              parts: [{ type: 'text', text: 'This conversation will be shared' }],
              createdAt: Date.now(),
            },
            {
              id: `msg-${Date.now() + 1}`,
              role: 'assistant',
              content: 'Understood, testing share functionality.',
              parts: [{ type: 'text', text: 'Understood, testing share functionality.' }],
              createdAt: Date.now() + 1,
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
    return `created: ${conversationId}`;
  });

  // ── Share ────────────────────────────────────────────────
  console.log('\n🔗 Share');

  await test('POST /api/share → 200 create share link', async () => {
    const { status, body } = await fetchJson(shareUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: { ownerType: 'guest', ownerId: guestId },
        conversationId,
      }),
    });
    assertStatus(status, 200);
    assertJsonField(body, 'shareToken');
    shareToken = body.shareToken;
    return `token: ${shareToken}`;
  });

  await test('GET /api/share/{token} → 200 get shared conversation', async () => {
    if (!shareToken) throw new Error('No share token from previous test');
    const { status, body } = await fetchJson(`${shareUrl}/${shareToken}`);
    assertStatus(status, 200);
    assertJsonField(body, 'conversation');
    assertJsonField(body, 'conversation.title');
    return `title: "${body.conversation.title}", messages: ${body.conversation.messages?.length || 0}`;
  });

  // ── Fork ─────────────────────────────────────────────────
  console.log('\n🍴 Fork');

  await test('POST /api/share/{token}/fork → 200 fork conversation', async () => {
    if (!shareToken) throw new Error('No share token from previous test');
    const forkGuestId = `e2e-fork-${Date.now()}`;
    const { status, body } = await fetchJson(`${shareUrl}/${shareToken}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: { ownerType: 'guest', ownerId: forkGuestId },
      }),
    });
    assertStatus(status, 200);
    assertJsonField(body, 'conversationId');
    return `forked to: ${body.conversationId}`;
  });

  // ── Revoke ───────────────────────────────────────────────
  console.log('\n🚫 Revoke');

  await test('DELETE /api/share → 200 revoke share', async () => {
    const { status, body } = await fetchJson(shareUrl, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: { ownerType: 'guest', ownerId: guestId },
        conversationId,
      }),
    });
    assertStatus(status, 200);
    return `isShared: ${body.isShared}`;
  });

  await test('GET /api/share/{token} after revoke → 404', async () => {
    if (!shareToken) throw new Error('No share token from previous test');
    const { status } = await fetchJson(`${shareUrl}/${shareToken}`);
    assertStatus(status, 404);
    return 'correctly returned 404 after revocation';
  });

  // ── Cleanup ──────────────────────────────────────────────
  console.log('\n🧹 Cleanup');

  await test('DELETE test conversation', async () => {
    const { status } = await fetchJson(convUrl, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: { ownerType: 'guest', ownerId: guestId },
        conversationId,
      }),
    });
    assertStatus(status, 200);
    return 'cleaned up';
  });

  printSummary();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
