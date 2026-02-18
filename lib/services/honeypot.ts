/**
 * Honeypot.is API client — honeypot detection via transaction simulation.
 *
 * Public API (no key required currently). Used as cross-validation source
 * alongside GoPlus for honeypot detection.
 *
 * Ref: https://docs.honeypot.is/ishoneypot
 */

import { serviceFetch, ServiceError } from './http-client';
import { withDataSource } from './data-source-manager';

const SERVICE = 'honeypot';
const BASE = 'https://api.honeypot.is/v2';

// ── Raw API response types ──────────────────────────────────

interface HoneypotRawToken {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  totalHolders: number;
}

interface HoneypotRawFlag {
  flag: string;
  description: string;
  severity: string;
  severityIndex: number;
}

interface HoneypotRawResponse {
  token: HoneypotRawToken;
  withToken?: HoneypotRawToken;
  summary: {
    risk: string; // unknown | very_low | low | medium | high | very_high | honeypot
    riskLevel?: number; // 0-100
    flags: HoneypotRawFlag[];
  };
  simulationSuccess: boolean;
  simulationError?: string;
  honeypotResult?: {
    isHoneypot: boolean;
    honeypotReason?: string;
  };
  simulationResult?: {
    buyTax: number;
    sellTax: number;
    transferTax: number;
    buyGas: string;
    sellGas: string;
  };
  holderAnalysis?: {
    holders: string;
    successful: string;
    failed: string;
    siphoned: string;
    averageTax: number;
    highestTax: number;
    averageGas: number;
    highTaxWallets: string;
  };
  contractCode?: {
    openSource: boolean;
    rootOpenSource: boolean;
    isProxy: boolean;
    hasProxyCalls: boolean;
  };
  chain: {
    id: string;
    name: string;
    shortName: string;
    currency: string;
  };
  pair?: {
    pair: { name: string; address: string; token0: string; token1: string; type: string };
    chainId: string;
    reserves0: string;
    reserves1: string;
    liquidity: number;
    router: string;
    createdAtTimestamp: string;
    creationTxHash: string;
  };
}

// ── Public result type ──────────────────────────────────────

export interface HoneypotCheckResult {
  isHoneypot: boolean;
  honeypotReason: string | null;
  simulationSuccess: boolean;
  simulationError: string | null;
  buyTax: number;
  sellTax: number;
  transferTax: number;
  buyGas: number;
  sellGas: number;
  riskLevel: string; // unknown | very_low | low | medium | high | very_high | honeypot
  riskScore: number | null; // 0-100 from API, null if unknown
  flags: Array<{ flag: string; description: string; severity: string }>;
  holderAnalysis: {
    holders: number;
    averageTax: number;
    highestTax: number;
  } | null;
  contractCode: {
    openSource: boolean;
    isProxy: boolean;
    hasProxyCalls: boolean;
  } | null;
  tokenName: string;
  tokenSymbol: string;
}

// ── Chain ID mapping (EVM chainId → Honeypot.is chainID param) ──
// Honeypot.is uses the same numeric chain IDs as EVM networks.
// BSC = 56, Ethereum = 1, etc.

/**
 * Check if a token is a honeypot using Honeypot.is API.
 *
 * Uses transaction simulation to detect honeypots — more reliable than
 * static flag analysis for detecting dynamic honeypots.
 *
 * @param address Token contract address
 * @param chainId EVM chain ID (default: 56 for BSC)
 * @returns Honeypot check result with tax rates and simulation data
 */
export async function honeypotCheck(
  address: string,
  chainId: number = 56,
): Promise<HoneypotCheckResult> {
  const addr = address.toLowerCase();
  const url = `${BASE}/IsHoneypot?address=${encodeURIComponent(addr)}&chainID=${chainId}`;

  const raw = await withDataSource(SERVICE, () =>
    serviceFetch<HoneypotRawResponse>(url, {
      service: SERVICE,
      timeoutMs: 5_000,   // 5s — simulation can be slow under chain load
      maxAttempts: 1,      // No retries — graceful degradation on failure
    })
  );

  return {
    isHoneypot: raw.honeypotResult?.isHoneypot ?? false,
    honeypotReason: raw.honeypotResult?.honeypotReason ?? null,
    simulationSuccess: raw.simulationSuccess,
    simulationError: raw.simulationError ?? null,
    buyTax: raw.simulationResult?.buyTax ?? 0,
    sellTax: raw.simulationResult?.sellTax ?? 0,
    transferTax: raw.simulationResult?.transferTax ?? 0,
    buyGas: Number(raw.simulationResult?.buyGas ?? 0),
    sellGas: Number(raw.simulationResult?.sellGas ?? 0),
    riskLevel: raw.summary.risk,
    riskScore: raw.summary.riskLevel ?? null,
    flags: (raw.summary.flags ?? []).map((f) => ({
      flag: f.flag,
      description: f.description,
      severity: f.severity,
    })),
    holderAnalysis: raw.holderAnalysis
      ? {
          holders: Number(raw.holderAnalysis.holders ?? 0),
          averageTax: raw.holderAnalysis.averageTax ?? 0,
          highestTax: raw.holderAnalysis.highestTax ?? 0,
        }
      : null,
    contractCode: raw.contractCode
      ? {
          openSource: raw.contractCode.openSource,
          isProxy: raw.contractCode.isProxy,
          hasProxyCalls: raw.contractCode.hasProxyCalls,
        }
      : null,
    tokenName: raw.token?.name ?? '',
    tokenSymbol: raw.token?.symbol ?? '',
  };
}
