import { encodeFunctionData, keccak256, toBytes } from 'viem';

// Compiled ABI for ReportRegistry — deploy with Remix or Hardhat
export const REPORT_REGISTRY_ABI = [
  {
    name: 'storeReport',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'reportHash', type: 'bytes32' },
      { name: 'reportType', type: 'string' },
    ],
    outputs: [{ name: 'reportId', type: 'uint256' }],
  },
  {
    name: 'verifyReport',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'reportHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'totalReports',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getReport',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'reportId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'reporter', type: 'address' },
          { name: 'target', type: 'address' },
          { name: 'reportHash', type: 'bytes32' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'reportType', type: 'string' },
        ],
      },
    ],
  },
] as const;

// Will be set after deployment — update this address
export const REPORT_REGISTRY_ADDRESS: Record<number, `0x${string}`> = {
  97: '0x0000000000000000000000000000000000000000', // BSC Testnet — update after deploy
  204: '0x0000000000000000000000000000000000000000', // opBNB — update after deploy
};

/**
 * Hash a report JSON object for on-chain storage.
 */
export function hashReport(reportData: unknown): `0x${string}` {
  const json = stableStringify(reportData);
  return keccak256(toBytes(json));
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForHash(value));
}

function normalizeForHash(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const normalized: Record<string, unknown> = {};
    for (const key of keys) {
      normalized[key] = normalizeForHash(obj[key]);
    }
    return normalized;
  }
  // Fallback for undefined/function/symbol
  return String(value);
}

/**
 * Build calldata for storeReport transaction.
 */
export function buildStoreReportCalldata(params: {
  target: `0x${string}`;
  reportHash: `0x${string}`;
  reportType: string;
}): `0x${string}` {
  return encodeFunctionData({
    abi: REPORT_REGISTRY_ABI,
    functionName: 'storeReport',
    args: [params.target, params.reportHash, params.reportType],
  });
}
