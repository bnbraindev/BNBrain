/**
 * PancakeSwap V2 SDK — typed client for swap quotes and routing.
 *
 * Chain-aware: BSC mainnet, BSC testnet, opBNB.
 * Uses on-chain Router & Factory contracts via viem public clients.
 *
 * Static data (contracts, tokens, ABIs) lives in pancakeswap-data.ts
 * to keep the client bundle free of server-only dependencies.
 *
 * Ref: https://developer.pancakeswap.finance/contracts/v2/addresses
 */

import { getPublicClient } from '@/lib/chain/server-client';
import { ServiceError } from './http-client';

// Re-export everything from data module for backwards compatibility
export {
  type PancakeSwapContracts,
  type ChainTokens,
  type SwapQuote,
  getContracts,
  isSupported,
  getChainTokens,
  ROUTER_ABI,
  FACTORY_ABI,
  PAIR_ABI,
  SWAP_ROUTER_ABI,
  applySlippage,
  getDeadline,
} from './pancakeswap-data';

import { getContracts, ROUTER_ABI, FACTORY_ABI, PAIR_ABI } from './pancakeswap-data';
import type { SwapQuote, PairReserves } from './pancakeswap-data';

const SERVICE = 'pancakeswap';

// ── Quote ───────────────────────────────────────────────────

/**
 * Get a swap quote using PancakeSwap V2 Router.
 * Supports direct pairs and 1-hop routing via WBNB.
 */
export async function getQuote(params: {
  chainId: number;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
}): Promise<SwapQuote> {
  const contracts = getContracts(params.chainId);
  if (!contracts) {
    throw new ServiceError(SERVICE, `PancakeSwap V2 not supported on chain ${params.chainId}`);
  }

  const client = await getPublicClient(params.chainId);

  // Normalize native BNB to WBNB
  const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`;
  const tokenIn = params.tokenIn === ZERO ? contracts.wbnb : params.tokenIn;
  const tokenOut = params.tokenOut === ZERO ? contracts.wbnb : params.tokenOut;

  // Try direct path first
  const directPath: `0x${string}`[] = [tokenIn, tokenOut];
  try {
    const amounts = await client.readContract({
      address: contracts.router,
      abi: ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [params.amountIn, directPath],
    });
    if (amounts.length >= 2 && amounts[amounts.length - 1] > 0n) {
      return {
        amountIn: params.amountIn,
        amountOut: amounts[amounts.length - 1],
        path: directPath,
        priceImpactBps: null,
        routerAddress: contracts.router,
        chainId: params.chainId,
      };
    }
  } catch {
    // Direct pair might not exist, try via WBNB
  }

  // Try path via WBNB
  if (tokenIn !== contracts.wbnb && tokenOut !== contracts.wbnb) {
    const hopPath: `0x${string}`[] = [tokenIn, contracts.wbnb, tokenOut];
    try {
      const amounts = await client.readContract({
        address: contracts.router,
        abi: ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [params.amountIn, hopPath],
      });
      if (amounts.length >= 3 && amounts[amounts.length - 1] > 0n) {
        return {
          amountIn: params.amountIn,
          amountOut: amounts[amounts.length - 1],
          path: hopPath,
          priceImpactBps: null,
          routerAddress: contracts.router,
          chainId: params.chainId,
        };
      }
    } catch {
      // No route available
    }
  }

  throw new ServiceError(SERVICE, 'No valid swap route found', { retryable: false });
}

/**
 * Get the reverse quote: how much input is needed for a desired output.
 */
export async function getQuoteExactOut(params: {
  chainId: number;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountOut: bigint;
}): Promise<SwapQuote> {
  const contracts = getContracts(params.chainId);
  if (!contracts) {
    throw new ServiceError(SERVICE, `PancakeSwap V2 not supported on chain ${params.chainId}`);
  }

  const client = await getPublicClient(params.chainId);
  const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`;
  const tokenIn = params.tokenIn === ZERO ? contracts.wbnb : params.tokenIn;
  const tokenOut = params.tokenOut === ZERO ? contracts.wbnb : params.tokenOut;

  const directPath: `0x${string}`[] = [tokenIn, tokenOut];
  try {
    const amounts = await client.readContract({
      address: contracts.router,
      abi: ROUTER_ABI,
      functionName: 'getAmountsIn',
      args: [params.amountOut, directPath],
    });
    if (amounts.length >= 2 && amounts[0] > 0n) {
      return {
        amountIn: amounts[0],
        amountOut: params.amountOut,
        path: directPath,
        priceImpactBps: null,
        routerAddress: contracts.router,
        chainId: params.chainId,
      };
    }
  } catch {
    // Try via WBNB
  }

  if (tokenIn !== contracts.wbnb && tokenOut !== contracts.wbnb) {
    const hopPath: `0x${string}`[] = [tokenIn, contracts.wbnb, tokenOut];
    try {
      const amounts = await client.readContract({
        address: contracts.router,
        abi: ROUTER_ABI,
        functionName: 'getAmountsIn',
        args: [params.amountOut, hopPath],
      });
      if (amounts.length >= 3 && amounts[0] > 0n) {
        return {
          amountIn: amounts[0],
          amountOut: params.amountOut,
          path: hopPath,
          priceImpactBps: null,
          routerAddress: contracts.router,
          chainId: params.chainId,
        };
      }
    } catch {
      // No route
    }
  }

  throw new ServiceError(SERVICE, 'No valid reverse route found', { retryable: false });
}

// ── Pair info ───────────────────────────────────────────────

export type { PairReserves } from './pancakeswap-data';

/**
 * Get pair address and reserves for two tokens.
 */
export async function getPairReserves(
  chainId: number,
  tokenA: `0x${string}`,
  tokenB: `0x${string}`
): Promise<PairReserves | null> {
  const contracts = getContracts(chainId);
  if (!contracts) return null;

  const client = await getPublicClient(chainId);

  try {
    const pairAddress = await client.readContract({
      address: contracts.factory,
      abi: FACTORY_ABI,
      functionName: 'getPair',
      args: [tokenA, tokenB],
    });

    const ZERO = '0x0000000000000000000000000000000000000000';
    if (!pairAddress || pairAddress === ZERO) return null;

    const [token0, token1, reserves] = await Promise.all([
      client.readContract({ address: pairAddress, abi: PAIR_ABI, functionName: 'token0' }),
      client.readContract({ address: pairAddress, abi: PAIR_ABI, functionName: 'token1' }),
      client.readContract({ address: pairAddress, abi: PAIR_ABI, functionName: 'getReserves' }),
    ]);

    return {
      pairAddress,
      token0,
      token1,
      reserve0: reserves[0],
      reserve1: reserves[1],
    };
  } catch {
    return null;
  }
}
