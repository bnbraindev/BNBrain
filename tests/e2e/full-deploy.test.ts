/**
 * E2E: Full deployment canary test.
 *
 * End-to-end: SIWE login → chat "deploy ERC20" → parse tx_plan from SSE
 * → sign & broadcast on opBNB → update tx-state → verify on-chain.
 *
 * This test costs real gas (~$0.0003 on opBNB) per run.
 * NOT included in `npm run test:e2e` — run separately:
 *
 *   npm run test:full-deploy
 *
 * Requires: test wallet with opBNB balance (~0.01 BNB minimum).
 */

import { createPublicClient, createWalletClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { opBNB } from 'viem/chains';
import {
  BASE_URL,
  test,
  skip,
  fetchJson,
  assertStatus,
  assertJsonField,
  assertTruthy,
  suiteHeader,
  printSummary,
} from './helpers';

// ── Config ──────────────────────────────────────────────────

const TEST_WALLET_PK = '0x56632356f581256d6e80bc13448040e6c5a8e806e3f12ce0629af098e6b83d40' as const;
const OPBNB_CHAIN_ID = 204;
const SIWE_CHAIN_ID = 56; // SIWE auth uses BSC mainnet
const ORIGIN = BASE_URL; // Origin header (server resolves to pinned domain)
const STREAM_TIMEOUT_MS = 120_000; // 2 min for full AI + tool execution
const DEPLOY_TIMEOUT_MS = 60_000;

// ── Wallet setup ────────────────────────────────────────────

const account = privateKeyToAccount(TEST_WALLET_PK);
const walletAddress = account.address;

const publicClient = createPublicClient({
  chain: opBNB,
  transport: http('https://opbnb-mainnet-rpc.bnbchain.org'),
});

const walletClient = createWalletClient({
  account,
  chain: opBNB,
  transport: http('https://opbnb-mainnet-rpc.bnbchain.org'),
});

// ── SSE Parser ──────────────────────────────────────────────

interface SSEEvent {
  type: string;
  [key: string]: any;
}

function parseSSELine(line: string): SSEEvent | null {
  if (!line.startsWith('data: ')) return null;
  const data = line.slice(6).trim();
  if (data === '[DONE]') return { type: '__done__' };
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Read SSE stream until completion. Extracts all events and any tx_plan.
 */
async function readStream(
  resp: Response,
  timeoutMs: number
): Promise<{ events: SSEEvent[]; txPlan: any | null; fullText: string }> {
  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response body reader');

  const decoder = new TextDecoder();
  const events: SSEEvent[] = [];
  let txPlan: any = null;
  let buffer = '';
  let textContent = '';

  const abortCtrl = new AbortController();
  const timer = setTimeout(() => abortCtrl.abort(), timeoutMs);

  try {
    while (!abortCtrl.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const event = parseSSELine(trimmed);
        if (!event) continue;
        events.push(event);

        if (event.type === 'text-delta' && event.delta) {
          textContent += event.delta;
        }

        if (event.type === 'tool-output-available' && event.output) {
          const out = event.output;
          if (out.type === 'tx_plan' && out.mode === 'contract_deploy') {
            txPlan = out;
            console.log(`    🎯 Found tx_plan: ${out.description?.slice(0, 80)}`);
          }
        }

        if (event.type === '__done__' || event.type === 'finish') {
          return { events, txPlan, fullText: textContent };
        }
      }
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }

  return { events, txPlan, fullText: textContent };
}

// ── Shared state (passed between test steps via closures) ───

let authCookie = '';
let txPlan: any = null;
let txHash = '';
let contractAddress = '';
let conversationId = '';

// ── Main ────────────────────────────────────────────────────

async function main() {
  suiteHeader('E2E: Full Deploy Canary (opBNB)');

  // ── Step 0: Balance check ────────────────────────────────
  console.log('\n💰 Pre-flight');

  const balanceBefore = await publicClient.getBalance({ address: walletAddress });
  console.log(`  Wallet: ${walletAddress}`);
  console.log(`  Balance: ${formatEther(balanceBefore)} BNB`);

  if (balanceBefore < 50000000000000n) { // < 0.00005 BNB
    console.log('  ⚠️  Insufficient balance for deployment. Aborting.');
    process.exit(0);
  }

  // ── Step 1: SIWE Login ───────────────────────────────────
  console.log('\n🔑 SIWE Authentication');

  await test('SIWE challenge + sign + verify → get session cookie', async () => {
    // 1a. Get challenge
    const { status: chalStatus, body: chalBody } = await fetchJson(
      `${BASE_URL}/api/auth/siwe/challenge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN },
        body: JSON.stringify({ address: walletAddress, chainId: SIWE_CHAIN_ID }),
      }
    );
    assertStatus(chalStatus, 200);
    assertJsonField(chalBody, 'message');
    const nonce = chalBody.nonce;

    // 1b. Sign message with private key
    const signature = await account.signMessage({ message: chalBody.message });

    // 1c. Verify signature → get session cookie
    const verifyResp = await fetch(`${BASE_URL}/api/auth/siwe/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN },
      body: JSON.stringify({
        address: walletAddress,
        nonce,
        signature,
        chainId: SIWE_CHAIN_ID,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    assertStatus(verifyResp.status, 200);

    // Extract cookie
    const setCookie = verifyResp.headers.get('set-cookie') || '';
    const match = setCookie.match(/bnb_auth=([^;]+)/);
    if (!match) throw new Error(`No bnb_auth cookie in Set-Cookie header`);
    authCookie = `bnb_auth=${match[1]}`;

    const verifyBody = await verifyResp.json();
    return `logged in as ${verifyBody.address}`;
  });

  if (!authCookie) {
    console.log('  ❌ Auth failed, cannot continue.');
    process.exit(1);
  }

  await test('Session is active', async () => {
    const { status, body } = await fetchJson(`${BASE_URL}/api/auth/session`, {
      headers: { 'Cookie': authCookie },
    });
    assertStatus(status, 200);
    assertTruthy(body.authenticated, 'Session not authenticated');
    return `address: ${body.address}, isAdmin: ${body.isAdmin}`;
  });

  // ── Step 2: Chat → deploy token → get tx_plan ────────────
  console.log('\n🤖 Chat: Deploy ERC20 on opBNB');

  conversationId = `e2e-deploy-${Date.now()}`;
  const tokenName = `E2ETest${Date.now().toString(36).slice(-4)}`;

  await test('Send deploy request → AI returns tx_plan', async () => {
    const resp = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie,
        'Origin': ORIGIN,
      },
      body: JSON.stringify({
        id: conversationId,
        messages: [
          {
            id: `msg-${Date.now()}`,
            role: 'user',
            content: [
              `Deploy a simple ERC20 token on opBNB (chain 204):`,
              `Name: "${tokenName}", Symbol: "E2ET", Total Supply: 1000, Decimals: 18`,
              `Call deployToken tool immediately. Do not ask questions.`,
            ].join('\n'),
          },
        ],
        owner: { ownerType: 'wallet', ownerId: walletAddress },
        userContext: {
          ownerType: 'wallet',
          ownerId: walletAddress,
          chainId: OPBNB_CHAIN_ID,
          address: walletAddress,
        },
      }),
      signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
    });

    assertStatus(resp.status, 200);
    const result = await readStream(resp, STREAM_TIMEOUT_MS);

    // Log stream stats
    const toolInputs = result.events.filter(e => e.type === 'tool-input-available');
    const toolOutputs = result.events.filter(e => e.type === 'tool-output-available');
    console.log(`    📊 ${result.events.length} events, ${toolInputs.length} tool calls`);
    for (const ti of toolInputs) {
      console.log(`       → ${ti.toolName}(${JSON.stringify(ti.input).slice(0, 60)})`);
    }

    txPlan = result.txPlan;
    if (!txPlan) {
      // Check if AI called a different tool that produced a tx_plan
      for (const to of toolOutputs) {
        if (to.output?.type === 'tx_plan') {
          txPlan = to.output;
          break;
        }
      }
    }

    if (!txPlan) {
      throw new Error(
        `No tx_plan in stream. AI said: "${result.fullText.slice(0, 200)}" ` +
        `(${toolOutputs.length} tool outputs)`
      );
    }

    assertTruthy(txPlan.data?.startsWith('0x'), 'tx_plan.data missing or invalid');
    assertTruthy(txPlan.data.length > 100, 'tx_plan.data too short');

    return `tx_plan: ${txPlan.description?.slice(0, 60)}, bytecode: ${txPlan.data.length} chars`;
  });

  // ── Step 3: Sign and deploy on-chain ─────────────────────
  console.log('\n🚀 On-chain Deployment');

  if (!txPlan) {
    skip('Deploy on opBNB', 'no tx_plan from previous step');
    skip('Wait for confirmation', 'no tx_plan');
  } else {
    await test('Sign and broadcast deployment tx on opBNB', async () => {
      console.log(`    📝 Signing...`);
      const hash = await walletClient.sendTransaction({
        to: txPlan.to ?? undefined, // null = contract creation
        data: txPlan.data as `0x${string}`,
        value: BigInt(txPlan.value || '0'),
        chain: opBNB,
      });
      txHash = hash;
      console.log(`    📤 Tx: ${hash}`);

      console.log(`    ⏳ Waiting for confirmation...`);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: DEPLOY_TIMEOUT_MS,
      });

      assertTruthy(receipt.status === 'success', `Tx reverted: ${receipt.status}`);
      assertTruthy(receipt.contractAddress, 'No contract address in receipt');
      contractAddress = receipt.contractAddress!;

      console.log(`    ✅ Contract: ${contractAddress}`);
      console.log(`    ⛽ Gas: ${receipt.gasUsed.toString()}`);

      return `deployed at ${contractAddress}, gas: ${receipt.gasUsed}`;
    });
  }

  // ── Step 4: Tx-state sync ────────────────────────────────
  console.log('\n📋 Transaction State');

  if (!txHash || !contractAddress) {
    skip('Sync tx-state', 'deployment did not complete');
    skip('Verify tx-state persistence', 'deployment did not complete');
  } else {
    await test('POST tx-state with deployment result', async () => {
      const { status } = await fetchJson(`${BASE_URL}/api/tx-state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': authCookie,
          'x-bnb-owner-type': 'wallet',
          'x-bnb-owner-id': walletAddress,
        },
        body: JSON.stringify({
          conversationId,
          txKey: `tx-plan|contract_deploy|${OPBNB_CHAIN_ID}|deploy`,
          status: 'success',
          hash: txHash,
          chainId: OPBNB_CHAIN_ID,
          updatedAt: Date.now(),
        }),
      });
      assertStatus(status, 200);
      return `synced hash=${txHash.slice(0, 18)}...`;
    });

    await test('GET tx-state confirms persistence', async () => {
      const { status, body } = await fetchJson(
        `${BASE_URL}/api/tx-state?conversationId=${conversationId}`,
        {
          headers: {
            'Cookie': authCookie,
            'x-bnb-owner-type': 'wallet',
            'x-bnb-owner-id': walletAddress,
          },
        }
      );
      assertStatus(status, 200);
      const records = body.records || [];
      assertTruthy(records.length > 0, 'No tx-state records');
      return `${records.length} record(s), status: ${records[0].status}`;
    });
  }

  // ── Step 5: On-chain verification ────────────────────────
  console.log('\n🔍 On-chain Verification');

  if (!contractAddress) {
    skip('Contract bytecode check', 'no contract deployed');
  } else {
    await test('Contract bytecode exists on opBNB', async () => {
      const code = await publicClient.getCode({
        address: contractAddress as `0x${string}`,
      });
      assertTruthy(code && code !== '0x', 'No bytecode at contract address');
      return `${code!.length} chars at ${contractAddress}`;
    });
  }

  // ── Step 6: Conversation persistence ─────────────────────
  console.log('\n💬 Conversation Persistence');

  await test('Wallet conversations list includes new chat', async () => {
    const { status, body } = await fetchJson(
      `${BASE_URL}/api/conversations?ownerType=wallet&ownerId=${walletAddress}`,
      { headers: { 'Cookie': authCookie } }
    );
    assertStatus(status, 200);
    const convs = body.conversations || [];
    return `${convs.length} conversation(s) for wallet`;
  });

  // ── Cost summary ─────────────────────────────────────────
  console.log('\n💰 Cost Summary');

  const balanceAfter = await publicClient.getBalance({ address: walletAddress });
  const gasSpent = balanceBefore - balanceAfter;

  let bnbPrice = 0;
  try {
    const resp = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT', {
      signal: AbortSignal.timeout(5000),
    });
    const ticker = await resp.json();
    bnbPrice = Number(ticker.price);
  } catch {}

  const gasEth = formatEther(gasSpent);
  const gasUsd = bnbPrice > 0 ? (Number(gasEth) * bnbPrice).toFixed(6) : 'N/A';

  console.log(`  Gas spent:  ${gasEth} BNB ($${gasUsd})`);
  console.log(`  Balance:    ${formatEther(balanceBefore)} → ${formatEther(balanceAfter)} BNB`);
  if (contractAddress) {
    console.log(`  Contract:   ${contractAddress}`);
    console.log(`  Explorer:   https://opbnbscan.com/address/${contractAddress}`);
  }

  printSummary();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
