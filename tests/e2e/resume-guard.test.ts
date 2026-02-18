/**
 * E2E: Resume guard tests.
 *
 * Verifies chat stream reconnect and cancel behavior for nonexistent runs.
 * Run: npm run test:resume-guard
 */

import {
  BASE_URL,
  test,
  fetchJson,
  fetchRaw,
  assertStatus,
  assertStatusIn,
  guestHeaders,
  suiteHeader,
  printSummary,
} from './helpers';

async function main() {
  suiteHeader('E2E: Resume Guard');

  const fakeId = 'nonexistent-chat-id-e2e-test';

  // ── Stream reconnect ─────────────────────────────────────
  console.log('\n📡 Stream Reconnect');

  await test('GET /api/chat/{fakeId}/stream → 204 (no active run)', async () => {
    const resp = await fetchRaw(`${BASE_URL}/api/chat/${fakeId}/stream`, {
      headers: { ...guestHeaders() },
    });
    // Should be 204 (no active run) or 400 (invalid owner)
    assertStatusIn(resp.status, [204, 400]);
    return `status: ${resp.status}`;
  });

  // ── Cancel ───────────────────────────────────────────────
  console.log('\n🚫 Cancel');

  await test('POST /api/chat/{fakeId}/cancel → 200 (no active run)', async () => {
    const { status, body } = await fetchJson(`${BASE_URL}/api/chat/${fakeId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...guestHeaders(),
      },
      body: JSON.stringify({
        owner: { ownerType: 'guest', ownerId: guestHeaders()['x-bnb-owner-id'] },
      }),
    });
    // Should be 200 (with cancelled=false) or 400
    assertStatusIn(status, [200, 400]);
    if (status === 200) {
      return `cancelled: ${body.cancelled}, reason: ${body.reason || 'none'}`;
    }
    return `status: ${status}, error: ${body.code || body.error}`;
  });

  // ── Deep analysis progress ───────────────────────────────
  console.log('\n📈 Deep Analysis Progress');

  await test('GET /api/deep-analysis/progress without chatId → 400', async () => {
    const { status } = await fetchJson(
      `${BASE_URL}/api/deep-analysis/progress`,
      { headers: { ...guestHeaders() } }
    );
    assertStatus(status, 400);
    return 'correctly rejected missing chatId';
  });

  await test('GET /api/deep-analysis/progress with fake chatId → 200 (inactive)', async () => {
    const { status, body } = await fetchJson(
      `${BASE_URL}/api/deep-analysis/progress?chatId=${fakeId}`,
      { headers: { ...guestHeaders() } }
    );
    assertStatus(status, 200);
    return `active: ${body.active}`;
  });

  printSummary();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
