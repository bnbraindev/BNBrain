/**
 * E2E: Wallet authentication error path tests.
 *
 * Verifies SIWE challenge/verify error boundaries without real signatures.
 * Run: npm run test:wallet-errors
 */

import {
  BASE_URL,
  test,
  fetchJson,
  assertStatus,
  assertJsonField,
  suiteHeader,
  printSummary,
} from './helpers';

async function main() {
  suiteHeader('E2E: Wallet Auth Errors');

  const challengeUrl = `${BASE_URL}/api/auth/siwe/challenge`;
  const verifyUrl = `${BASE_URL}/api/auth/siwe/verify`;
  const sessionUrl = `${BASE_URL}/api/auth/session`;
  const convUrl = `${BASE_URL}/api/conversations`;

  // ── Challenge endpoint ───────────────────────────────────
  console.log('\n🔑 SIWE Challenge');

  await test('POST /api/auth/siwe/challenge no body → 400', async () => {
    const { status } = await fetchJson(challengeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    });
    assertStatus(status, 400);
    return 'correctly rejected empty body';
  });

  await test('POST /api/auth/siwe/challenge invalid address → 400', async () => {
    const { status } = await fetchJson(challengeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: 'not-an-address' }),
    });
    assertStatus(status, 400);
    return 'correctly rejected invalid address';
  });

  await test('POST /api/auth/siwe/challenge valid address → 200', async () => {
    const { status, body } = await fetchJson(challengeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
      }),
    });
    assertStatus(status, 200);
    assertJsonField(body, 'nonce');
    assertJsonField(body, 'message');
    return `nonce: ${body.nonce?.slice(0, 8)}..., message length: ${body.message?.length}`;
  });

  // ── Verify endpoint ──────────────────────────────────────
  console.log('\n✍️  SIWE Verify');

  await test('POST /api/auth/siwe/verify no body → 400', async () => {
    const { status } = await fetchJson(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    });
    assertStatus(status, 400);
    return 'correctly rejected empty body';
  });

  await test('POST /api/auth/siwe/verify bad signature → 401', async () => {
    const { status } = await fetchJson(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
        nonce: 'a'.repeat(32),
        signature: '0x' + 'ab'.repeat(65),
        chainId: 56,
      }),
    });
    assertStatus(status, 401);
    return 'correctly rejected invalid signature';
  });

  // ── Session endpoint ─────────────────────────────────────
  console.log('\n🔒 Session');

  await test('GET /api/auth/session no cookie → 401', async () => {
    const { status, body } = await fetchJson(sessionUrl);
    assertStatus(status, 401);
    return `authenticated: ${body.authenticated}`;
  });

  // ── Conversations with wallet but no session ─────────────
  console.log('\n📋 Wallet Conversations (no session)');

  await test('GET /api/conversations?ownerType=wallet&ownerId=0xabc → 401', async () => {
    const { status } = await fetchJson(
      `${convUrl}?ownerType=wallet&ownerId=0x742d35cc6634c0532925a3b844bc9e7595f2bd28`
    );
    assertStatus(status, 401);
    return 'correctly rejected unauthenticated wallet request';
  });

  printSummary();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
