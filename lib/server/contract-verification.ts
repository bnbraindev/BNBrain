/**
 * Contract verification state machine.
 *
 * Orchestrates the BscScan/Etherscan source verification flow:
 *   submit → poll (every 5s, max 2min) → complete/fail
 *
 * Stores the verification report in the reports table with report_type = 'contract_verification'.
 */

import {
  verifyContractSource,
  checkVerificationStatus,
  type VerifyContractInput,
} from '@/lib/services/bscscan';
import { createReport, type ReportStep } from '@/lib/server/report-store';

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_DURATION_MS = 2 * 60 * 1_000; // 2 minutes

export interface VerificationResult {
  status: 'verified' | 'failed' | 'timeout';
  message: string;
  guid?: string;
  reportId?: string;
  reportUrl?: string;
  durationMs: number;
  steps: ReportStep[];
}

export interface VerificationCallbacks {
  onProgress?: (step: string, status: string) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run the full contract verification flow:
 * 1. Submit source to BscScan
 * 2. Poll for status every 5s up to 2 minutes
 * 3. Create a verification report in the DB
 */
export async function runContractVerification(
  input: VerifyContractInput,
  opts?: {
    conversationId?: string;
    tokenName?: string;
    callbacks?: VerificationCallbacks;
  }
): Promise<VerificationResult> {
  const startTime = Date.now();
  const steps: ReportStep[] = [];
  const { callbacks, conversationId, tokenName } = opts ?? {};

  // Step 1: Submit
  callbacks?.onProgress?.('submit', 'running');
  const submitStart = Date.now();
  const submitResult = await verifyContractSource(input);

  if ('error' in submitResult) {
    steps.push({
      key: 'submit',
      label: 'Submit Verification',
      status: 'failed',
      summary: submitResult.error,
      durationMs: Date.now() - submitStart,
    });
    callbacks?.onProgress?.('submit', 'failed');

    return {
      status: 'failed',
      message: submitResult.error,
      durationMs: Date.now() - startTime,
      steps,
    };
  }

  const guid = submitResult.guid;
  steps.push({
    key: 'submit',
    label: 'Submit Verification',
    status: 'completed',
    summary: `GUID: ${guid}`,
    durationMs: Date.now() - submitStart,
  });
  callbacks?.onProgress?.('submit', 'completed');

  // Step 2: Poll
  callbacks?.onProgress?.('poll', 'running');
  const pollStart = Date.now();
  let lastMessage = 'Pending';
  let verified = false;

  while (Date.now() - pollStart < MAX_POLL_DURATION_MS) {
    await sleep(POLL_INTERVAL_MS);

    const statusResult = await checkVerificationStatus(guid, input.chainId ?? 56);
    lastMessage = statusResult.message;

    if (statusResult.status === 'pass') {
      verified = true;
      break;
    }
    if (statusResult.status === 'fail') {
      break;
    }
    // status === 'pending' → continue polling
    callbacks?.onProgress?.('poll', `pending: ${statusResult.message}`);
  }

  const pollDuration = Date.now() - pollStart;

  if (verified) {
    steps.push({
      key: 'poll',
      label: 'Verification Check',
      status: 'completed',
      summary: lastMessage,
      durationMs: pollDuration,
    });
    callbacks?.onProgress?.('poll', 'completed');
  } else if (Date.now() - pollStart >= MAX_POLL_DURATION_MS) {
    steps.push({
      key: 'poll',
      label: 'Verification Check',
      status: 'failed',
      summary: `Timed out after ${Math.round(MAX_POLL_DURATION_MS / 1000)}s. Last status: ${lastMessage}`,
      durationMs: pollDuration,
    });
    callbacks?.onProgress?.('poll', 'timeout');
  } else {
    steps.push({
      key: 'poll',
      label: 'Verification Check',
      status: 'failed',
      summary: lastMessage,
      durationMs: pollDuration,
    });
    callbacks?.onProgress?.('poll', 'failed');
  }

  // Step 3: Create report
  const finalStatus = verified ? 'verified' as const
    : (Date.now() - pollStart >= MAX_POLL_DURATION_MS) ? 'timeout' as const
    : 'failed' as const;

  const summary = verified
    ? `Contract ${input.contractName} at ${input.address} verified successfully on BscScan.`
    : finalStatus === 'timeout'
      ? `Verification timed out after 2 minutes. GUID: ${guid}. You can check manually later.`
      : `Verification failed: ${lastMessage}`;

  let reportId: string | undefined;
  let reportUrl: string | undefined;
  try {
    const report = await createReport({
      conversationId: conversationId ?? null,
      tokenAddress: input.address,
      tokenName: tokenName ?? input.contractName,
      chainId: input.chainId ?? 56,
      html: buildVerificationReportHtml(input, finalStatus, lastMessage, steps),
      summary,
      steps,
      reportType: 'contract_verification',
    });
    reportId = report.id;
    reportUrl = `/api/report/${report.id}`;
    steps.push({
      key: 'report',
      label: 'Save Report',
      status: 'completed',
      summary: `Report ID: ${report.id}`,
      durationMs: 0,
    });
  } catch (err) {
    steps.push({
      key: 'report',
      label: 'Save Report',
      status: 'failed',
      summary: err instanceof Error ? err.message : 'Failed to save report',
      durationMs: 0,
    });
  }

  return {
    status: finalStatus,
    message: summary,
    guid,
    reportId,
    reportUrl,
    durationMs: Date.now() - startTime,
    steps,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildVerificationReportHtml(
  input: VerifyContractInput,
  status: 'verified' | 'failed' | 'timeout',
  message: string,
  steps: ReportStep[]
): string {
  const statusEmoji = status === 'verified' ? '✅' : status === 'timeout' ? '⏱️' : '❌';
  const statusText = status === 'verified' ? 'Verified' : status === 'timeout' ? 'Timed Out' : 'Failed';

  const stepsHtml = steps
    .map(
      (s) =>
        `<tr><td>${esc(s.label)}</td><td>${s.status === 'completed' ? '✅' : '❌'}</td><td>${esc(s.summary ?? '')}</td><td>${s.durationMs}ms</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Contract Verification Report</title>
<style>
body{font-family:system-ui,sans-serif;max-width:700px;margin:2rem auto;padding:0 1rem;color:#e1e1e1;background:#0a0a0a}
h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:1.5rem}
table{width:100%;border-collapse:collapse;margin:0.5rem 0}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #333}
th{color:#888}
.status{font-size:1.2rem;font-weight:600}
.info{display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin:1rem 0}
.info-item{background:#1a1a1a;border-radius:8px;padding:0.75rem}
.info-label{color:#888;font-size:0.85rem}
.info-value{font-family:monospace;font-size:0.9rem;word-break:break-all}
</style></head><body>
<h1>${statusEmoji} Contract Verification Report</h1>
<p class="status">Status: ${esc(statusText)}</p>
<div class="info">
<div class="info-item"><div class="info-label">Contract</div><div class="info-value">${esc(input.contractName)}</div></div>
<div class="info-item"><div class="info-label">Address</div><div class="info-value">${esc(input.address)}</div></div>
<div class="info-item"><div class="info-label">Compiler</div><div class="info-value">${esc(input.compilerVersion)}</div></div>
<div class="info-item"><div class="info-label">Chain ID</div><div class="info-value">${input.chainId ?? 56}</div></div>
</div>
${message ? `<p>${esc(message)}</p>` : ''}
<h2>Steps</h2>
<table><thead><tr><th>Step</th><th>Status</th><th>Detail</th><th>Duration</th></tr></thead>
<tbody>${stepsHtml}</tbody></table>
</body></html>`;
}
