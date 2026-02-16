/**
 * Sourcify V2 API client — free contract source code & ABI retrieval.
 *
 * Public API (no key required, no rate limit documented).
 * Used as primary source in the Sourcify → BscScan fallback chain
 * for contract source code/ABI retrieval.
 *
 * Ref: https://docs.sourcify.dev/docs/api/server/v2/
 */

import { serviceFetch } from './http-client';
import type { ContractSourceCode } from './bscscan';

const SERVICE = 'sourcify';
const BASE = 'https://sourcify.dev/server/v2';

// ── Raw API response types ──────────────────────────────────

interface SourcifyV2Response {
  match: string | null; // "match" | null
  creationMatch: string | null;
  runtimeMatch: string | null;
  chainId: string;
  address: string;
  matchId?: string;
  verifiedAt?: string;
  // Fields requested via ?fields= parameter:
  abi?: Array<Record<string, unknown>>;
  sources?: Record<string, { content: string }>;
  stdJsonInput?: {
    language?: string;
    sources?: Record<string, { content: string }>;
    settings?: {
      optimizer?: { enabled: boolean; runs: number };
      evmVersion?: string;
      libraries?: Record<string, unknown>;
    };
  };
}

// ── Public API ──────────────────────────────────────────────

/**
 * Fetch contract source code and ABI from Sourcify V2.
 *
 * Returns data in the same ContractSourceCode format as BscScan
 * for transparent integration into the fallback chain.
 *
 * @param address Contract address
 * @param chainId EVM chain ID (default: 56 for BSC)
 * @returns ContractSourceCode or null if not verified on Sourcify
 */
export async function sourcifyGetContractSource(
  address: string,
  chainId: number = 56,
): Promise<ContractSourceCode | null> {
  const addr = address.toLowerCase();
  const url = `${BASE}/contract/${chainId}/${addr}?fields=abi,sources,stdJsonInput`;

  let raw: SourcifyV2Response;
  try {
    raw = await serviceFetch<SourcifyV2Response>(url, {
      service: SERVICE,
      timeoutMs: 5_000,
      maxAttempts: 1, // No retries — fallback to BscScan on failure
    });
  } catch {
    return null;
  }

  // Not verified on Sourcify
  if (!raw.match || !raw.sources) {
    return null;
  }

  // Convert sources map to BscScan-compatible sourceCode format
  const sourceCode = buildSourceCode(raw.sources);
  const abi = raw.abi ? JSON.stringify(raw.abi) : '';
  const settings = raw.stdJsonInput?.settings;

  // Extract contract name from the first (or only) source file
  const contractName = extractContractName(raw.sources);

  return {
    sourceCode,
    abi,
    contractName,
    compilerVersion: '', // Not directly available in V2 basic fields
    optimizationUsed: settings?.optimizer?.enabled ? '1' : '0',
    runs: String(settings?.optimizer?.runs ?? ''),
    constructorArguments: '',
    evmVersion: settings?.evmVersion ?? '',
    library: '',
    licenseType: '',
    proxy: '0',
    implementation: '',
  };
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Convert Sourcify sources map to BscScan-compatible sourceCode string.
 *
 * Single file: return raw content directly.
 * Multi-file: wrap in BscScan's double-brace Standard JSON Input format
 * so that contract-source-cache.ts parseSourceCode() can handle it.
 */
function buildSourceCode(sources: Record<string, { content: string }>): string {
  const entries = Object.entries(sources);

  if (entries.length === 1) {
    return entries[0][1].content;
  }

  // Multi-file: build Standard JSON Input format wrapped in double braces
  const sourcesObj: Record<string, { content: string }> = {};
  for (const [filePath, file] of entries) {
    sourcesObj[filePath] = { content: file.content };
  }
  return '{{' + JSON.stringify({ sources: sourcesObj }) + '}}';
}

/**
 * Extract the main contract name from source files.
 * Looks for the last `contract X` declaration in the first source file,
 * or uses the filename without extension.
 */
function extractContractName(sources: Record<string, { content: string }>): string {
  const entries = Object.entries(sources);
  if (entries.length === 0) return 'Unknown';

  const [fileName, file] = entries[0];

  // Try to find contract declaration in source
  const matches = file.content.match(/contract\s+(\w+)/g);
  if (matches && matches.length > 0) {
    const last = matches[matches.length - 1];
    const name = last.replace('contract ', '');
    return name;
  }

  // Fall back to filename
  return fileName.replace(/\.sol$/, '').split('/').pop() ?? 'Unknown';
}
