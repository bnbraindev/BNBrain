/**
 * NodeReal Enhanced API client — BSC transaction history & token transfers.
 *
 * Strategy: Use NodeReal's enhanced JSON-RPC methods as a free alternative
 * to BscScan for transaction/transfer queries. Falls back silently on failure.
 *
 * Key methods:
 *   - nr_getAssetTransfers (250 CU) — unified transfer query with cursor pagination
 *   - eth_getBalance (15 CU) — native balance
 *
 * Free tier: 100M CU/month, 300 CU/sec.
 *
 * Ref: https://docs.nodereal.io/reference/nr_getassettransfers
 */

import type { Transaction, TokenTransfer } from './bscscan';
import { withDataSource } from './data-source-manager';

const SERVICE = 'nodereal';
const BSC_ENDPOINT_BASE = 'https://bsc-mainnet.nodereal.io/v1';
const REQUEST_TIMEOUT_MS = 10_000;

// ── Configuration ───────────────────────────────────────────

async function getApiKey(): Promise<string> {
  try {
    const { resolveNoderealApiKey } = await import('@/lib/server/setup-store');
    return await resolveNoderealApiKey();
  } catch {
    return process.env.NODEREAL_API_KEY ?? '';
  }
}

function getEndpoint(apiKey: string): string {
  return `${BSC_ENDPOINT_BASE}/${apiKey}`;
}

// ── JSON-RPC helpers ────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: unknown[];
  id: number;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

let rpcIdCounter = 1;

async function rpcCall<T>(
  apiKey: string,
  method: string,
  params: unknown[],
): Promise<T | null> {
  const endpoint = getEndpoint(apiKey);
  const body: JsonRpcRequest = {
    jsonrpc: '2.0',
    method,
    params,
    id: rpcIdCounter++,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const start = Date.now();

  try {
    const result = await withDataSource(SERVICE, async () => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${method}`);
      }

      const data = (await response.json()) as JsonRpcResponse<T>;

      if (data.error) {
        throw new Error(`RPC error for ${method}: ${data.error.message}`);
      }

      return data.result ?? null;
    });
    return result;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`[${SERVICE}] timeout for ${method}`);
    } else {
      console.warn(`[${SERVICE}] ${err instanceof Error ? err.message : err}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── nr_getAssetTransfers types ──────────────────────────────

interface AssetTransfer {
  blockNum: string;  // hex
  hash: string;
  from: string;
  to: string;
  value: string;     // hex wei
  asset: string;     // "BNB" or token symbol
  category: string;  // "external" | "internal" | "20" | "721" | "1155"
  rawContract?: {
    address: string;
    value: string;   // hex
    decimal: string;  // hex
  };
  blockTimestamp?: string; // ISO 8601
}

interface AssetTransfersResult {
  transfers: AssetTransfer[];
  pageKey?: string;
}

// ── Public API ──────────────────────────────────────────────

/**
 * Get transaction history for an address via NodeReal nr_getAssetTransfers.
 * Returns data in the same Transaction format as bscscan.ts.
 *
 * Note: nr_getAssetTransfers has a 1000-block range limit per call.
 * We work around this by querying recent blocks in batches.
 */
export async function noderealGetTransactionHistory(
  address: string,
  options?: { pageSize?: number; chainId?: number },
): Promise<Transaction[] | null> {
  // Only BSC mainnet (56) is supported
  if ((options?.chainId ?? 56) !== 56) return null;

  const apiKey = await getApiKey();
  if (!apiKey) {
    console.log(`[${SERVICE}] no API key, skipping`);
    return null;
  }

  const pageSize = Math.min(100, options?.pageSize ?? 20);
  const addr = address.toLowerCase();

  try {
    // Get latest block number first
    const latestBlockHex = await rpcCall<string>(apiKey, 'eth_blockNumber', []);
    if (!latestBlockHex) return null;

    const latestBlock = parseInt(latestBlockHex, 16);
    // Query last ~1000 blocks (~50 min on BSC)
    const fromBlock = Math.max(0, latestBlock - 999);

    const allTransfers: AssetTransfer[] = [];
    let pageKey: string | undefined;

    // Paginate until we have enough or no more pages (max 3 pages to limit CU)
    for (let page = 0; page < 3; page++) {
      const params: Record<string, unknown> = {
        fromBlock: '0x' + fromBlock.toString(16),
        toBlock: 'latest',
        fromAddress: addr,
        category: ['external', 'internal'],
        maxCount: '0x' + pageSize.toString(16),
      };
      if (pageKey) params.pageKey = pageKey;

      const result = await rpcCall<AssetTransfersResult>(
        apiKey, 'nr_getAssetTransfers', [params],
      );
      if (!result?.transfers?.length) break;

      allTransfers.push(...result.transfers);
      if (!result.pageKey || allTransfers.length >= pageSize) break;
      pageKey = result.pageKey;
    }

    // Also query incoming transfers (toAddress)
    const incomingResult = await rpcCall<AssetTransfersResult>(
      apiKey, 'nr_getAssetTransfers',
      [{
        fromBlock: '0x' + fromBlock.toString(16),
        toBlock: 'latest',
        toAddress: addr,
        category: ['external'],
        maxCount: '0x' + pageSize.toString(16),
      }],
    );
    if (incomingResult?.transfers?.length) {
      allTransfers.push(...incomingResult.transfers);
    }

    // Deduplicate by hash and convert to Transaction format
    const seen = new Set<string>();
    const unique: AssetTransfer[] = [];
    for (const t of allTransfers) {
      if (!seen.has(t.hash)) {
        seen.add(t.hash);
        unique.push(t);
      }
    }

    // Sort by block number descending
    unique.sort((a, b) => parseInt(b.blockNum, 16) - parseInt(a.blockNum, 16));

    const transactions: Transaction[] = unique.slice(0, pageSize).map((t) => ({
      hash: t.hash,
      from: t.from || '',
      to: t.to || '',
      value: t.value ? BigInt(t.value).toString() : '0',
      timeStamp: t.blockTimestamp
        ? String(Math.floor(new Date(t.blockTimestamp).getTime() / 1000))
        : '',
      blockNumber: String(parseInt(t.blockNum, 16)),
      functionName: '',
      isError: '0',
      gasUsed: '0',
      gasPrice: '0',
      input: '0x',
    }));

    console.log(`[${SERVICE}] got ${transactions.length} txs for ${addr.slice(0, 10)}...`);
    return transactions;
  } catch (err) {
    console.warn(`[${SERVICE}] getTransactionHistory failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Get ERC-20 token transfers for an address via NodeReal nr_getAssetTransfers.
 * Returns data in the same TokenTransfer format as bscscan.ts.
 */
export async function noderealGetTokenTransfers(
  address: string,
  options?: { contractAddress?: string; chainId?: number; pageSize?: number },
): Promise<TokenTransfer[] | null> {
  if ((options?.chainId ?? 56) !== 56) return null;

  const apiKey = await getApiKey();
  if (!apiKey) return null;

  const pageSize = Math.min(100, options?.pageSize ?? 20);
  const addr = address.toLowerCase();

  try {
    const latestBlockHex = await rpcCall<string>(apiKey, 'eth_blockNumber', []);
    if (!latestBlockHex) return null;

    const latestBlock = parseInt(latestBlockHex, 16);
    const fromBlock = Math.max(0, latestBlock - 999);

    const params: Record<string, unknown> = {
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: 'latest',
      fromAddress: addr,
      category: ['20'],
      maxCount: '0x' + pageSize.toString(16),
    };
    if (options?.contractAddress) {
      params.contractAddresses = [options.contractAddress.toLowerCase()];
    }

    const outgoing = await rpcCall<AssetTransfersResult>(
      apiKey, 'nr_getAssetTransfers', [params],
    );

    // Also query incoming
    const inParams = { ...params, fromAddress: undefined, toAddress: addr };
    delete inParams.fromAddress;
    const incoming = await rpcCall<AssetTransfersResult>(
      apiKey, 'nr_getAssetTransfers', [inParams],
    );

    const allTransfers: AssetTransfer[] = [
      ...(outgoing?.transfers ?? []),
      ...(incoming?.transfers ?? []),
    ];

    // Deduplicate
    const seen = new Set<string>();
    const unique: AssetTransfer[] = [];
    for (const t of allTransfers) {
      const key = t.hash + ':' + (t.rawContract?.address ?? '');
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(t);
      }
    }

    unique.sort((a, b) => parseInt(b.blockNum, 16) - parseInt(a.blockNum, 16));

    const transfers: TokenTransfer[] = unique.slice(0, pageSize).map((t) => {
      const decimals = t.rawContract?.decimal
        ? parseInt(t.rawContract.decimal, 16)
        : 18;

      return {
        hash: t.hash,
        from: t.from || '',
        to: t.to || '',
        value: t.rawContract?.value
          ? BigInt(t.rawContract.value).toString()
          : '0',
        tokenName: t.asset || '',
        tokenSymbol: t.asset || '',
        tokenDecimal: String(decimals),
        contractAddress: t.rawContract?.address || '',
        timeStamp: t.blockTimestamp
          ? String(Math.floor(new Date(t.blockTimestamp).getTime() / 1000))
          : '',
        blockNumber: String(parseInt(t.blockNum, 16)),
      };
    });

    console.log(`[${SERVICE}] got ${transfers.length} token transfers for ${addr.slice(0, 10)}...`);
    return transfers;
  } catch (err) {
    console.warn(`[${SERVICE}] getTokenTransfers failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Get native BNB balance via NodeReal eth_getBalance.
 * Returns balance as wei string, or null on failure.
 */
export async function noderealGetBalance(
  address: string,
  chainId: number = 56,
): Promise<string | null> {
  if (chainId !== 56) return null;

  const apiKey = await getApiKey();
  if (!apiKey) return null;

  try {
    const result = await rpcCall<string>(apiKey, 'eth_getBalance', [address.toLowerCase(), 'latest']);
    if (!result) return null;

    const balance = BigInt(result).toString();
    console.log(`[${SERVICE}] balance for ${address.slice(0, 10)}...: ${balance}`);
    return balance;
  } catch {
    return null;
  }
}
