/**
 * E2E: AI tools / data source tests.
 *
 * Verifies tool-adjacent HTTP endpoints without invoking LLM.
 * Run: npm run test:tools
 */

import {
  BASE_URL,
  test,
  fetchJson,
  assertStatus,
  assertStatusIn,
  assertJsonField,
  guestHeaders,
  getGuestId,
  suiteHeader,
  printSummary,
} from './helpers';

async function main() {
  suiteHeader('E2E: AI Tools / Data Sources');

  const CAKE = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';

  // ── Contract source ──────────────────────────────────────
  console.log('\n📦 Contract Source');

  await test('GET /api/source/56/{CAKE}?meta=1 → contract metadata', async () => {
    const { status, body } = await fetchJson(
      `${BASE_URL}/api/source/56/${CAKE}?meta=1`
    );
    assertStatusIn(status, [200, 404]);
    if (status === 200) {
      return `contractName: ${body.contractName || 'found'}`;
    }
    return 'not cached (404 — OK for test env)';
  });

  await test('GET /api/source/56/invalid-addr?meta=1 → 400', async () => {
    const { status } = await fetchJson(
      `${BASE_URL}/api/source/56/not-an-address?meta=1`
    );
    assertStatus(status, 400);
    return 'correctly rejected invalid address';
  });

  await test('GET /api/source/999/0x0000?meta=1 → 400 (invalid chain)', async () => {
    const { status } = await fetchJson(
      `${BASE_URL}/api/source/999/${CAKE}?meta=1`
    );
    assertStatusIn(status, [400, 404]);
    return `status: ${status}`;
  });

  // ── Tx state ─────────────────────────────────────────────
  console.log('\n💳 Transaction State');

  await test('POST /api/tx-state without body → 400', async () => {
    const { status } = await fetchJson(`${BASE_URL}/api/tx-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...guestHeaders() },
      body: '',
    });
    assertStatus(status, 400);
    return 'correctly rejected empty body';
  });

  await test('POST /api/tx-state invalid schema → 400', async () => {
    const { status } = await fetchJson(`${BASE_URL}/api/tx-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...guestHeaders() },
      body: JSON.stringify({ foo: 'bar' }),
    });
    assertStatus(status, 400);
    return 'correctly rejected invalid schema';
  });

  await test('GET /api/tx-state without conversationId → 400', async () => {
    const { status } = await fetchJson(`${BASE_URL}/api/tx-state`, {
      headers: { ...guestHeaders() },
    });
    assertStatus(status, 400);
    return 'correctly rejected missing conversationId';
  });

  await test('GET /api/tx-state with non-owned conversationId → 403', async () => {
    const { status } = await fetchJson(
      `${BASE_URL}/api/tx-state?conversationId=nonexistent-conv-id`,
      { headers: { ...guestHeaders() } }
    );
    assertStatusIn(status, [403, 400]);
    return `status: ${status} — correctly rejected`;
  });

  // ── Admin data sources (needs auth) ──────────────────────
  console.log('\n🔒 Admin Data Sources');

  await test('GET /api/admin/data-sources (no token) → 401', async () => {
    const { status } = await fetchJson(`${BASE_URL}/api/admin/data-sources`);
    assertStatus(status, 401);
    return 'correctly rejected without auth';
  });

  await test('GET /api/admin/data-sources (bad token) → 401', async () => {
    const { status } = await fetchJson(`${BASE_URL}/api/admin/data-sources`, {
      headers: { 'Authorization': 'Bearer invalid-token-xyz' },
    });
    assertStatus(status, 401);
    return 'correctly rejected invalid bearer token';
  });

  printSummary();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
