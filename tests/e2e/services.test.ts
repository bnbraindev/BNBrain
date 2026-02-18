/**
 * E2E: Service connectivity tests.
 *
 * Verifies basic API endpoint availability and response formats.
 * Run: npm run test:services
 */

import {
  BASE_URL,
  test,
  fetchJson,
  assertStatus,
  assertStatusIn,
  assertJsonField,
  suiteHeader,
  printSummary,
} from './helpers';

async function main() {
  suiteHeader('E2E: Service Connectivity');

  // ── Models endpoint ──────────────────────────────────────
  console.log('\n📋 Models');
  await test('GET /api/models → 200 with models array', async () => {
    const { status, body } = await fetchJson(`${BASE_URL}/api/models`);
    assertStatus(status, 200);
    assertJsonField(body, 'models');
    if (!Array.isArray(body.models)) throw new Error('models is not an array');
    return `${body.models.length} models available`;
  });

  // ── Setup status ─────────────────────────────────────────
  console.log('\n⚙️  Setup Status');
  await test('GET /api/setup/status → 200 with completed field', async () => {
    const { status, body } = await fetchJson(`${BASE_URL}/api/setup/status`);
    assertStatus(status, 200);
    if (typeof body.completed !== 'boolean') throw new Error('completed is not boolean');
    return `completed: ${body.completed}, hasModels: ${body.hasModels}`;
  });

  // ── Report endpoint ──────────────────────────────────────
  console.log('\n📊 Report');
  await test('GET /api/report/short-id → 400 (ID too short)', async () => {
    const { status } = await fetchJson(`${BASE_URL}/api/report/short`);
    assertStatus(status, 400);
    return 'correctly rejected short ID';
  });

  await test('GET /api/report/nonexistent-report-id-12345 → 404', async () => {
    const { status } = await fetchJson(`${BASE_URL}/api/report/nonexistent-report-id-12345`);
    assertStatus(status, 404);
    return 'correctly returned 404 for nonexistent report';
  });

  // ── Source endpoint ──────────────────────────────────────
  console.log('\n📦 Contract Source');
  await test('GET /api/source/56/CAKE?meta=1 → 200 or 404', async () => {
    const cakeAddr = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';
    const { status, body } = await fetchJson(
      `${BASE_URL}/api/source/56/${cakeAddr}?meta=1`
    );
    assertStatusIn(status, [200, 404]);
    if (status === 200) {
      return `found: ${body.contractName || 'unknown'}`;
    }
    return 'not cached (404)';
  });

  // ── Share endpoint (nonexistent) ─────────────────────────
  console.log('\n🔗 Share');
  await test('GET /api/share/nonexistent-token-abc → 404', async () => {
    const { status } = await fetchJson(`${BASE_URL}/api/share/nonexistent-token-abc`);
    assertStatus(status, 404);
    return 'correctly returned 404 for nonexistent share token';
  });

  // ── Admin endpoint (no auth) ─────────────────────────────
  console.log('\n🔒 Admin (no auth)');
  await test('GET /api/admin/data-sources (no auth) → 401', async () => {
    const { status } = await fetchJson(`${BASE_URL}/api/admin/data-sources`);
    assertStatus(status, 401);
    return 'correctly rejected unauthenticated request';
  });

  printSummary();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
