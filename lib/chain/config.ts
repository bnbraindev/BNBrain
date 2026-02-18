import { bsc } from 'wagmi/chains';
import { opBNB } from 'viem/chains';
import { http } from 'wagmi';
import {
  getContracts as getPancakeContracts,
  getChainTokens,
} from '@/lib/services/pancakeswap-data';

export const supportedChains = [bsc, opBNB] as const;

// RPC URLs — overridable via env vars
export const RPC_URLS: Record<number, string> = {
  [bsc.id]: process.env.RPC_URL_56 ?? 'https://bsc-dataseed.binance.org',
  [opBNB.id]: process.env.RPC_URL_204 ?? 'https://opbnb-mainnet-rpc.bnbchain.org',
};

export const transports = {
  [bsc.id]: http(RPC_URLS[bsc.id]),
  [opBNB.id]: http(RPC_URLS[opBNB.id]),
};

// ── Chain-aware token addresses ─────────────────────────────

/** Get common token addresses for a given chain. Falls back to BSC mainnet. */
export function getTokensForChain(chainId: number) {
  return getChainTokens(chainId) ?? getChainTokens(56)!;
}

// BSC mainnet tokens (convenience re-export for backward compat)
export const BSC_TOKENS = {
  WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as `0x${string}`,
  USDT: '0x55d398326f99059fF775485246999027B3197955' as `0x${string}`,
  USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' as `0x${string}`,
  BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56' as `0x${string}`,
  CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82' as `0x${string}`,
} as const;

// ── Chain-aware PancakeSwap addresses ───────────────────────

/** Get PancakeSwap V2 Router address for a given chain. Falls back to BSC mainnet. */
export function getPancakeRouterAddress(chainId: number): `0x${string}` {
  return getPancakeContracts(chainId)?.router
    ?? getPancakeContracts(56)?.router
    ?? '0x10ED43C718714eb63d5aA57B78B54704E256024E';
}

export const PANCAKE_ROUTER_V2 = '0x10ED43C718714eb63d5aA57B78B54704E256024E' as `0x${string}`;
export const PANCAKE_FACTORY_V2 = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73' as `0x${string}`;
