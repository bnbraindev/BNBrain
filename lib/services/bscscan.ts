/**
 * BscScan / Etherscan V2 SDK — typed client for blockchain explorer APIs.
 *
 * Strategy:
 *   1. Try Etherscan V2 unified API (single API key for 60+ chains).
 *   2. Fall back to on-chain RPC queries via viem (always works, no key needed).
 *
 * Ref: https://docs.bscscan.com/etherscan-v2
 */

import { getPublicClient } from '@/lib/chain/server-client';
import { parseAbiItem, type Log } from 'viem';
import { serviceFetch } from './http-client';
import { withDataSource } from './data-source-manager';
export { ServiceError } from './http-client';

const SERVICE = 'bscscan';
const ETHERSCAN_V2_BASE = 'https://api.etherscan.io/v2/api';

// ── Configuration ───────────────────────────────────────────

/**
 * Resolve API key from DB config (60s cache) with env fallback.
 * Called on every request — setup-store handles caching internally.
 */
async function getApiKey(): Promise<string> {
  try {
    const { resolveBscScanApiKey } = await import('@/lib/server/setup-store');
    return await resolveBscScanApiKey();
  } catch {
    return process.env.BSCSCAN_API_KEY ?? process.env.ETHERSCAN_API_KEY ?? '';
  }
}

/** Chain IDs where Etherscan V2 is known to work (free or paid). */
const V2_SUPPORTED_CHAINS = new Set([1, 56, 97, 204, 42161, 137, 10, 8453]);

async function isV2Supported(chainId: number): Promise<boolean> {
  return V2_SUPPORTED_CHAINS.has(chainId) && Boolean(await getApiKey());
}

// ── Shared types ────────────────────────────────────────────

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  blockNumber: string;
  functionName: string;
  isError: string;
  gasUsed: string;
  gasPrice: string;
  input?: string;
  methodId?: string;
  confirmations?: string;
}

export interface TokenTransfer {
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
  timeStamp: string;
  blockNumber: string;
}

/** Normalized (camelCase) contract source data. */
export interface ContractSourceCode {
  sourceCode: string;
  abi: string;
  contractName: string;
  compilerVersion: string;
  optimizationUsed: string;
  runs: string;
  constructorArguments: string;
  evmVersion: string;
  library: string;
  licenseType: string;
  proxy: string;
  implementation: string;
}

/** Raw PascalCase fields as returned by BscScan / Etherscan V2 API. */
interface ContractSourceCodeRaw {
  SourceCode: string;
  ABI: string;
  ContractName: string;
  CompilerVersion: string;
  OptimizationUsed: string;
  Runs: string;
  ConstructorArguments: string;
  EVMVersion: string;
  Library: string;
  LicenseType: string;
  Proxy: string;
  Implementation: string;
}

function normalizeSourceCode(raw: ContractSourceCodeRaw): ContractSourceCode {
  return {
    sourceCode: raw.SourceCode ?? '',
    abi: raw.ABI ?? '',
    contractName: raw.ContractName ?? '',
    compilerVersion: raw.CompilerVersion ?? '',
    optimizationUsed: raw.OptimizationUsed ?? '',
    runs: raw.Runs ?? '',
    constructorArguments: raw.ConstructorArguments ?? '',
    evmVersion: raw.EVMVersion ?? '',
    library: raw.Library ?? '',
    licenseType: raw.LicenseType ?? '',
    proxy: raw.Proxy ?? '0',
    implementation: raw.Implementation ?? '',
  };
}

export interface ApprovalEvent {
  hash: string;
  tokenAddress: string;
  owner: string;
  spender: string;
  value: string;
  blockNumber: bigint;
  isUnlimited: boolean;
}

export interface TransactionHistoryOptions {
  page?: number;
  pageSize?: number;
  chainId?: number;
  sort?: 'asc' | 'desc';
  startBlock?: number;
  endBlock?: number;
}

// ── Etherscan V2 unified fetch ──────────────────────────────

interface EtherscanV2Response<T = unknown> {
  status: string;
  message: string;
  result: T;
}

async function etherscanV2<T>(
  chainId: number,
  params: Record<string, string>
): Promise<T | null> {
  if (!(await isV2Supported(chainId))) return null;

  const searchParams = new URLSearchParams({
    chainid: String(chainId),
    apikey: await getApiKey(),
    ...params,
  });

  try {
    const data = await withDataSource('etherscan-v2', () =>
      serviceFetch<EtherscanV2Response<T>>(
        `${ETHERSCAN_V2_BASE}?${searchParams}`,
        { service: SERVICE, timeoutMs: 15_000 }
      )
    );
    if (data.status === '1' && data.result !== undefined) {
      return data.result;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Transaction history ─────────────────────────────────────

/**
 * Get transaction history for an address.
 * Fallback chain: NodeReal → Etherscan V2 → RPC block scanning.
 */
export async function getTransactionHistory(
  address: string,
  options?: TransactionHistoryOptions
): Promise<Transaction[]> {
  const chainId = options?.chainId ?? 56;
  const page = options?.page ?? 1;
  const pageSize = Math.min(100, options?.pageSize ?? 20);
  const sort = options?.sort ?? 'desc';

  // 1. Try NodeReal Enhanced API (free, 100M CU/month)
  if (chainId === 56 && page === 1) {
    try {
      const { noderealGetTransactionHistory } = await import('./nodereal');
      const nrResult = await noderealGetTransactionHistory(address, { pageSize, chainId });
      if (nrResult && nrResult.length > 0) {
        console.log(`[bscscan] using nodereal for tx history (${nrResult.length} txs)`);
        return nrResult;
      }
    } catch (err) {
      console.warn('[bscscan] nodereal tx history failed, falling back:', err instanceof Error ? err.message : err);
    }
  }

  // 2. Try Etherscan V2
  const v2Result = await etherscanV2<Transaction[]>(chainId, {
    module: 'account',
    action: 'txlist',
    address,
    startblock: String(options?.startBlock ?? 0),
    endblock: String(options?.endBlock ?? 99999999),
    page: String(page),
    offset: String(pageSize),
    sort,
  });
  if (v2Result && Array.isArray(v2Result)) return v2Result;

  // 3. Fallback: RPC-based scanning
  return getRpcTransactionHistory(address, page, pageSize, chainId);
}

/**
 * Get ERC-20 token transfers for an address.
 * Fallback chain: NodeReal → Etherscan V2.
 */
export async function getTokenTransfers(
  address: string,
  options?: { contractAddress?: string; chainId?: number; page?: number; pageSize?: number }
): Promise<TokenTransfer[]> {
  const chainId = options?.chainId ?? 56;
  const page = options?.page ?? 1;
  const pageSize = Math.min(100, options?.pageSize ?? 20);

  // 1. Try NodeReal Enhanced API
  if (chainId === 56 && page === 1) {
    try {
      const { noderealGetTokenTransfers } = await import('./nodereal');
      const nrResult = await noderealGetTokenTransfers(address, {
        contractAddress: options?.contractAddress,
        chainId,
        pageSize,
      });
      if (nrResult && nrResult.length > 0) {
        console.log(`[bscscan] using nodereal for token transfers (${nrResult.length} transfers)`);
        return nrResult;
      }
    } catch (err) {
      console.warn('[bscscan] nodereal token transfers failed, falling back:', err instanceof Error ? err.message : err);
    }
  }

  // 2. Etherscan V2
  const params: Record<string, string> = {
    module: 'account',
    action: 'tokentx',
    address,
    page: String(page),
    offset: String(pageSize),
    sort: 'desc',
  };
  if (options?.contractAddress) params.contractaddress = options.contractAddress;

  const result = await etherscanV2<TokenTransfer[]>(chainId, params);
  return result ?? [];
}

/**
 * Get native token balance for an address.
 * Fallback chain: NodeReal → Etherscan V2 → RPC.
 */
export async function getBalance(
  address: string,
  chainId: number = 56
): Promise<string> {
  // 1. Try NodeReal (15 CU, very cheap)
  if (chainId === 56) {
    try {
      const { noderealGetBalance } = await import('./nodereal');
      const nrResult = await noderealGetBalance(address, chainId);
      if (nrResult) return nrResult;
    } catch {
      // silent fallback
    }
  }

  // 2. Etherscan V2
  const result = await etherscanV2<string>(chainId, {
    module: 'account',
    action: 'balance',
    address,
    tag: 'latest',
  });
  if (result) return result;

  // 3. RPC fallback
  try {
    const client = await getPublicClient(chainId);
    const balance = await client.getBalance({ address: address as `0x${string}` });
    return balance.toString();
  } catch {
    return '0';
  }
}

/**
 * Get ERC-20 token balance for an address.
 */
export async function getTokenBalance(
  address: string,
  contractAddress: string,
  chainId: number = 56
): Promise<string> {
  const result = await etherscanV2<string>(chainId, {
    module: 'account',
    action: 'tokenbalance',
    address,
    contractaddress: contractAddress,
    tag: 'latest',
  });
  if (result) return result;

  // RPC fallback using balanceOf
  try {
    const client = await getPublicClient(chainId);
    const balance = await client.readContract({
      address: contractAddress as `0x${string}`,
      abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });
    return String(balance);
  } catch {
    return '0';
  }
}

// ── Contract info ───────────────────────────────────────────

/**
 * Get verified contract source code and ABI.
 *
 * Fallback chain: Sourcify (free, no key) → Etherscan V2 (paid key).
 * The `source` field in the returned object indicates which provider succeeded.
 */
export async function getContractSourceCode(
  address: string,
  chainId: number = 56
): Promise<(ContractSourceCode & { source?: string }) | null> {
  // 1. Try Sourcify first (free, unlimited)
  try {
    const { sourcifyGetContractSource } = await import('./sourcify');
    const sourcifyResult = await sourcifyGetContractSource(address, chainId);
    if (sourcifyResult && sourcifyResult.sourceCode) {
      console.log(`[contract.source] sourcify hit for ${address} on chain ${chainId}`);
      return { ...sourcifyResult, source: 'sourcify' };
    }
  } catch (err) {
    console.warn(`[contract.source] sourcify failed for ${address}:`, err instanceof Error ? err.message : err);
  }

  // 2. Fallback to Etherscan V2
  const result = await etherscanV2<ContractSourceCodeRaw[]>(chainId, {
    module: 'contract',
    action: 'getsourcecode',
    address,
  });
  const raw = result?.[0];
  if (raw && raw.SourceCode) {
    console.log(`[contract.source] bscscan hit for ${address} on chain ${chainId}`);
    return { ...normalizeSourceCode(raw), source: 'bscscan' };
  }

  console.log(`[contract.source] no source found for ${address} on chain ${chainId}`);
  return null;
}

/**
 * Get contract ABI as JSON string.
 */
export async function getContractABI(
  address: string,
  chainId: number = 56
): Promise<string> {
  const result = await etherscanV2<string>(chainId, {
    module: 'contract',
    action: 'getabi',
    address,
  });
  return result ?? '';
}

// ── Gas tracker ─────────────────────────────────────────────

export interface GasOracle {
  lastBlock: string;
  safeGasPrice: string;
  proposeGasPrice: string;
  fastGasPrice: string;
  suggestBaseFee: string;
}

/**
 * Get current gas price oracle data.
 * Falls back to on-chain RPC gasPrice if Etherscan V2 is unavailable.
 */
export async function getGasOracle(chainId: number = 56): Promise<GasOracle | null> {
  const result = await etherscanV2<GasOracle>(chainId, {
    module: 'gastracker',
    action: 'gasoracle',
  });
  if (result) return result;

  // Fallback: derive from on-chain gasPrice
  try {
    const client = await getPublicClient(chainId);
    const gasPrice = await client.getGasPrice();
    const gwei = Number(gasPrice) / 1e9;
    const gweiStr = gwei.toFixed(2);
    return {
      lastBlock: '',
      safeGasPrice: gweiStr,
      proposeGasPrice: gweiStr,
      fastGasPrice: (gwei * 1.2).toFixed(2),
      suggestBaseFee: gweiStr,
    };
  } catch {
    return null;
  }
}

// ── Approval event scanning (RPC-based) ─────────────────────

const UNLIMITED_THRESHOLD = 2n ** 128n;

interface ApprovalLogArgs {
  owner?: string;
  spender?: string;
  value?: bigint;
}

/**
 * Scan ERC-20 Approval events for a wallet using RPC getLogs.
 */
export async function scanApprovalEvents(
  walletAddress: string,
  chainId: number = 56
): Promise<ApprovalEvent[]> {
  try {
    const client = await getPublicClient(chainId);
    const currentBlock = await client.getBlockNumber();
    const addr = walletAddress.toLowerCase() as `0x${string}`;
    const fromBlock = currentBlock - 200000n > 0n ? currentBlock - 200000n : 0n;

    const approvalEvent = parseAbiItem(
      'event Approval(address indexed owner, address indexed spender, uint256 value)'
    );

    const logs = await client.getLogs({
      event: approvalEvent,
      args: { owner: addr },
      fromBlock,
      toBlock: currentBlock,
    });

    const latestApprovals = new Map<string, ApprovalEvent>();

    for (const log of logs) {
      const args = (log as Log & { args?: ApprovalLogArgs }).args;
      const spender = args?.spender;
      const value = args?.value ?? 0n;
      if (!spender) continue;

      const key = `${log.address}:${spender}`;
      const existing = latestApprovals.get(key);

      if (!existing || (log.blockNumber ?? 0n) > existing.blockNumber) {
        latestApprovals.set(key, {
          hash: log.transactionHash ?? '',
          tokenAddress: log.address,
          owner: (args?.owner ?? walletAddress) as string,
          spender: spender as string,
          value: value.toString(),
          blockNumber: log.blockNumber ?? 0n,
          isUnlimited: value >= UNLIMITED_THRESHOLD,
        });
      }
    }

    return Array.from(latestApprovals.values())
      .filter((a) => a.value !== '0')
      .sort((a, b) => Number(b.blockNumber - a.blockNumber));
  } catch {
    return [];
  }
}

// ── Contract verification ───────────────────────────────────

export interface VerifyContractInput {
  address: string;
  sourceCode: string;
  contractName: string;
  compilerVersion: string;
  optimizationUsed: boolean;
  runs?: number;
  constructorArguments?: string;
  evmVersion?: string;
  licenseType?: number;
  chainId?: number;
}

/**
 * Submit contract source code for verification on BscScan/Etherscan.
 * Returns a GUID that can be used to poll verification status.
 * Uses POST (required by the verification API).
 */
export async function verifyContractSource(
  input: VerifyContractInput
): Promise<{ guid: string } | { error: string }> {
  const chainId = input.chainId ?? 56;
  if (!(await isV2Supported(chainId))) {
    return { error: 'Etherscan V2 not supported for this chain or missing API key' };
  }

  const formParams = new URLSearchParams({
    chainid: String(chainId),
    apikey: await getApiKey(),
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: input.address,
    sourceCode: input.sourceCode,
    codeformat: 'solidity-single-file',
    contractname: input.contractName,
    compilerversion: input.compilerVersion,
    optimizationUsed: input.optimizationUsed ? '1' : '0',
    runs: String(input.runs ?? 200),
    constructorArguements: input.constructorArguments ?? '',
    evmversion: input.evmVersion ?? '',
    licenseType: String(input.licenseType ?? 0),
  });

  try {
    const data = await withDataSource('etherscan-v2', () =>
      serviceFetch<EtherscanV2Response<string>>(
        ETHERSCAN_V2_BASE,
        {
          service: SERVICE,
          timeoutMs: 30_000,
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formParams.toString(),
        }
      )
    );
    if (data.status === '1' && data.result) {
      return { guid: data.result };
    }
    return { error: String(data.result || data.message || 'Unknown verification error') };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Verification request failed' };
  }
}

/**
 * Check the status of a previously submitted contract verification.
 * Returns 'Pass', 'Pending', 'Fail', or an error message.
 */
export async function checkVerificationStatus(
  guid: string,
  chainId: number = 56
): Promise<{ status: 'pass' | 'pending' | 'fail'; message: string }> {
  if (!(await isV2Supported(chainId))) {
    return { status: 'fail', message: 'Etherscan V2 not supported' };
  }

  try {
    const apiKey = await getApiKey();
    const data = await withDataSource('etherscan-v2', () =>
      serviceFetch<EtherscanV2Response<string>>(
        `${ETHERSCAN_V2_BASE}?${new URLSearchParams({
          chainid: String(chainId),
          apikey: apiKey,
          module: 'contract',
          action: 'checkverifystatus',
          guid,
        })}`,
        { service: SERVICE, timeoutMs: 15_000 }
      )
    );

    const result = (data.result ?? '').toLowerCase();
    if (result.includes('pass')) {
      return { status: 'pass', message: data.result ?? 'Verified' };
    }
    if (result.includes('pending') || result.includes('queue')) {
      return { status: 'pending', message: data.result ?? 'Pending in queue' };
    }
    return { status: 'fail', message: data.result ?? 'Verification failed' };
  } catch (err) {
    return { status: 'fail', message: err instanceof Error ? err.message : 'Status check failed' };
  }
}

// ── RPC fallback for transaction history ────────────────────

interface TransferLogArgs {
  from?: string;
  to?: string;
  value?: bigint;
}

async function getRpcTransactionHistory(
  address: string,
  page: number,
  pageSize: number,
  chainId: number
): Promise<Transaction[]> {
  try {
    const client = await getPublicClient(chainId);
    const currentBlock = await client.getBlockNumber();
    const addr = address.toLowerCase() as `0x${string}`;
    const fromBlock = currentBlock - 5000n > 0n ? currentBlock - 5000n : 0n;

    const transferEvent = parseAbiItem(
      'event Transfer(address indexed from, address indexed to, uint256 value)'
    );

    const [logsFrom, logsTo] = await Promise.all([
      client
        .getLogs({ event: transferEvent, args: { from: addr }, fromBlock, toBlock: currentBlock })
        .catch(() => [] as Log[]),
      client
        .getLogs({ event: transferEvent, args: { to: addr }, fromBlock, toBlock: currentBlock })
        .catch(() => [] as Log[]),
    ]);

    const allLogs = [...logsFrom, ...logsTo];
    const seen = new Set<string>();
    const uniqueLogs = allLogs.filter((log) => {
      const key = log.transactionHash + ':' + log.logIndex;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    uniqueLogs.sort(
      (a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n))
    );

    const start = (page - 1) * pageSize;
    const pagedLogs = uniqueLogs.slice(start, start + pageSize);

    // Fetch block timestamps
    const blockNumbers = Array.from(
      new Set(
        pagedLogs
          .map((log) => log.blockNumber)
          .filter((n): n is bigint => typeof n === 'bigint')
          .map((n) => n.toString())
      )
    );
    const blockTimestampMap = new Map<string, string>();
    await Promise.all(
      blockNumbers.map(async (blockNumberStr) => {
        try {
          const block = await client.getBlock({
            blockNumber: BigInt(blockNumberStr),
          });
          blockTimestampMap.set(blockNumberStr, block.timestamp.toString());
        } catch {
          // Leave empty
        }
      })
    );

    return pagedLogs.map((log) => {
      const args = (log as Log & { args?: TransferLogArgs }).args;
      const timeStamp = log.blockNumber
        ? (blockTimestampMap.get(log.blockNumber.toString()) ?? '')
        : '';
      return {
        hash: log.transactionHash ?? '',
        from: String(args?.from ?? ''),
        to: String(args?.to ?? ''),
        value: String(args?.value ?? 0n),
        timeStamp,
        blockNumber: String(log.blockNumber ?? ''),
        functionName: 'transfer',
        isError: '0',
        gasUsed: '0',
        gasPrice: '0',
        input: '0x',
      };
    });
  } catch {
    return [];
  }
}
