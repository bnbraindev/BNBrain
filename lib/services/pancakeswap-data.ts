/**
 * PancakeSwap V2 static data — contract addresses, token addresses, ABIs.
 *
 * This module contains only pure data and sync functions.
 * Safe for client-side bundle (no server deps).
 *
 * For async RPC operations (quotes, pair reserves), see pancakeswap.ts.
 */

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

// ── Shared types ────────────────────────────────────────────

export interface SwapQuote {
  amountIn: bigint;
  amountOut: bigint;
  path: `0x${string}`[];
  priceImpactBps: number | null;
  routerAddress: `0x${string}`;
  chainId: number;
}

export interface PairReserves {
  pairAddress: `0x${string}`;
  token0: `0x${string}`;
  token1: `0x${string}`;
  reserve0: bigint;
  reserve1: bigint;
}

// ── ABIs ────────────────────────────────────────────────────

export const ROUTER_ABI = [
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

export const FACTORY_ABI = [
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

export const PAIR_ABI = [
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
