/**
 * PancakeSwap V2 SDK — typed client for swap quotes and routing.
 *
 * Chain-aware: BSC mainnet, BSC testnet, opBNB.
 * Uses on-chain Router & Factory contracts via viem public clients.
 *
 * Ref: https://developer.pancakeswap.finance/contracts/v2/addresses
 */

import { getPublicClient } from '@/lib/chain/client';
import { ServiceError } from './http-client';

const SERVICE = 'pancakeswap';

// ── Contract addresses per chain ────────────────────────────

export interface PancakeSwapContracts {
  router: `0x${string}`;
  factory: `0x${string}`;
  wbnb: `0x${string}`;
}

const CONTRACTS: Record<number, PancakeSwapContracts> = {
  // BSC Mainnet
  56: {
    router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    wbnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  },
  // BSC Testnet
  97: {
    router: '0xD99D1c33F9fC3444f8101754aBC46c52416550D1',
    factory: '0x6725F303b657a9451d8BA641348b6761A6CC7a17',
    wbnb: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd', // WBNB on testnet
  },
  // opBNB Mainnet
  204: {
    router: '0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb',
    factory: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E',
    wbnb: '0x4200000000000000000000000000000000000006', // WBNB on opBNB
  },
};

/**
 * Get PancakeSwap V2 contract addresses for a chain.
 * Returns null if the chain is not supported.
 */
export function getContracts(chainId: number): PancakeSwapContracts | null {
  return CONTRACTS[chainId] ?? null;
}

/**
 * Check if PancakeSwap V2 is available on a chain.
 */
export function isSupported(chainId: number): boolean {
  return chainId in CONTRACTS;
}

// ── Common token addresses per chain ────────────────────────

export interface ChainTokens {
  WBNB: `0x${string}`;
  USDT: `0x${string}`;
  USDC: `0x${string}`;
  BUSD: `0x${string}` | null;
  CAKE: `0x${string}` | null;
}

const TOKENS: Record<number, ChainTokens> = {
  56: {
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  },
  97: {
    WBNB: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
    USDT: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', // Testnet USDT
    USDC: '0x64544969ed7EBf5f083679233325356EbE738930', // Testnet USDC
    BUSD: '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee', // Testnet BUSD
    CAKE: '0xFa60D973F7642B748046464e165A65B7323b0DEE', // Testnet CAKE
  },
  204: {
    WBNB: '0x4200000000000000000000000000000000000006',
    USDT: '0x9e5AAC1Ba1a2e6aEd6b32689DFcF62A509Ca96f3', // opBNB USDT
    USDC: '0x9e5AAC1Ba1a2e6aEd6b32689DFcF62A509Ca96f3', // opBNB — same bridge
    BUSD: null,
    CAKE: null,
  },
};

/**
 * Get common token addresses for a chain.
 */
export function getChainTokens(chainId: number): ChainTokens | null {
  return TOKENS[chainId] ?? null;
}

// ── ABIs ────────────────────────────────────────────────────

const ROUTER_ABI = [
  {
    name: 'getAmountsOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'getAmountsIn',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'WETH',
    type: 'function',
    stateMutability: 'pure',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'factory',
    type: 'function',
    stateMutability: 'pure',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

const FACTORY_ABI = [
  {
    name: 'getPair',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
    ],
    outputs: [{ name: 'pair', type: 'address' }],
  },
  {
    name: 'allPairsLength',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const PAIR_ABI = [
  {
    name: 'getReserves',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' },
    ],
  },
  {
    name: 'token0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'token1',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

// ── Quote ───────────────────────────────────────────────────

export interface SwapQuote {
  amountIn: bigint;
  amountOut: bigint;
  path: `0x${string}`[];
  priceImpactBps: number | null;
  routerAddress: `0x${string}`;
  chainId: number;
}

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

  const client = getPublicClient(params.chainId);

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

  const client = getPublicClient(params.chainId);
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

export interface PairReserves {
  pairAddress: `0x${string}`;
  token0: `0x${string}`;
  token1: `0x${string}`;
  reserve0: bigint;
  reserve1: bigint;
}

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

  const client = getPublicClient(chainId);

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

// ── Swap transaction building helpers ───────────────────────

export const SWAP_ROUTER_ABI = [
  ...ROUTER_ABI,
  {
    name: 'swapExactTokensForTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactETHForTokens',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactTokensForETH',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const;

/**
 * Compute minimum output with slippage tolerance.
 * @param amountOut Expected output amount
 * @param slippageBps Slippage tolerance in basis points (default: 50 = 0.5%)
 */
export function applySlippage(amountOut: bigint, slippageBps: number = 50): bigint {
  return (amountOut * BigInt(10000 - slippageBps)) / 10000n;
}

/**
 * Get swap deadline timestamp (default: 20 minutes from now).
 */
export function getDeadline(minutes: number = 20): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + minutes * 60);
}
