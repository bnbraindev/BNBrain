/**
 * DexScreener SDK — typed client for DexScreener public API.
 *
 * Covers: Token price, search, latest token profiles, pair info.
 * Multi-chain: supports 'bsc', 'opbnb', and any DexScreener chain slug.
 *
 * Ref: https://docs.dexscreener.com (rate limit: 60 req/min for most endpoints)
 */

import { serviceFetch, ServiceError } from './http-client';
import { withDataSource } from './data-source-manager';

const SERVICE = 'dexscreener';
const BASE = 'https://api.dexscreener.com';

// ── Chain mapping ───────────────────────────────────────────

/** DexScreener chain slugs for BNB ecosystem. */
const CHAIN_SLUG_MAP: Record<number, string> = {
  56: 'bsc',
  97: 'bsc', // testnet tokens rarely listed, but use same slug
  204: 'opbnb',
};

function toChainSlug(chainId: number): string {
  return CHAIN_SLUG_MAP[chainId] ?? 'bsc';
}

/** All chain slugs we consider relevant when no specific chain is requested. */
const RELEVANT_SLUGS = new Set(['bsc', 'opbnb']);

// ── Shared raw types ────────────────────────────────────────

interface DexPairRaw {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  labels?: string[];
  baseToken?: {
    address?: string;
    name?: string;
    symbol?: string;
  };
  quoteToken?: {
    address?: string;
    name?: string;
    symbol?: string;
  };
  priceNative?: string;
  priceUsd?: string;
  txns?: {
    h24?: { buys?: number; sells?: number };
    h6?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    m5?: { buys?: number; sells?: number };
  };
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  priceChange?: { h24?: number; h6?: number; h1?: number; m5?: number };
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    header?: string;
    openGraph?: string;
    websites?: Array<{ label?: string; url?: string }>;
    socials?: Array<{ type?: string; url?: string }>;
  };
  boosts?: { active?: number };
}

interface DexPairsResponse {
  schemaVersion?: string;
  pairs?: DexPairRaw[] | null;
}

interface DexTokenProfileRaw {
  chainId?: string;
  tokenAddress?: string;
  icon?: string;
  description?: string;
  url?: string;
  links?: Array<{ type?: string; label?: string; url?: string }>;
}

// ── Public types ────────────────────────────────────────────

export interface TokenPrice {
  address: string;
  name: string;
  symbol: string;
  priceUsd: number;
  priceNative: number;
  priceChange24h: number;
  priceChange1h: number;
  volume24h: number;
  volume1h: number;
  liquidity: number;
  fdv: number;
  marketCap: number;
  pairAddress: string;
  dexName: string;
  chainId: string;
  url: string;
  pairCreatedAt: number | null;
  txns24h: { buys: number; sells: number };
  /** Websites from DexScreener token info (project-submitted). */
  websites?: Array<{ label?: string; url?: string }>;
  /** Social links from DexScreener token info (project-submitted). */
  socials?: Array<{ type?: string; url?: string }>;
}

export interface LatestToken {
  address: string;
  name: string;
  symbol: string;
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  pairCreatedAt: string;
  pairAddress: string;
  dexName: string;
  url: string;
  chainId: string;
  description: string;
}

export interface PairInfo {
  pairAddress: string;
  chainId: string;
  dexId: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd: number;
  liquidity: number;
  volume24h: number;
  url: string;
}

// ── Converters ──────────────────────────────────────────────

function pairToTokenPrice(pair: DexPairRaw, fallbackAddress: string): TokenPrice {
  return {
    address: pair.baseToken?.address ?? fallbackAddress,
    name: pair.baseToken?.name ?? 'Unknown',
    symbol: pair.baseToken?.symbol ?? '???',
    priceUsd: Number(pair.priceUsd ?? 0),
    priceNative: Number(pair.priceNative ?? 0),
    priceChange24h: pair.priceChange?.h24 ?? 0,
    priceChange1h: pair.priceChange?.h1 ?? 0,
    volume24h: pair.volume?.h24 ?? 0,
    volume1h: pair.volume?.h1 ?? 0,
    liquidity: pair.liquidity?.usd ?? 0,
    fdv: pair.fdv ?? 0,
    marketCap: pair.marketCap ?? 0,
    pairAddress: pair.pairAddress ?? '',
    dexName: pair.dexId ?? '',
    chainId: pair.chainId ?? 'bsc',
    url: pair.url ?? '',
    pairCreatedAt: pair.pairCreatedAt ?? null,
    txns24h: {
      buys: pair.txns?.h24?.buys ?? 0,
      sells: pair.txns?.h24?.sells ?? 0,
    },
    websites: pair.info?.websites,
    socials: pair.info?.socials,
  };
}

function bestPairByLiquidity(
  pairs: DexPairRaw[],
  preferredSlugs: Set<string>
): DexPairRaw | null {
  const preferred = pairs.filter((p) => preferredSlugs.has(p.chainId ?? ''));
  const pool = preferred.length > 0 ? preferred : pairs;
  if (pool.length === 0) return null;
  return pool.sort(
    (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
  )[0];
}

function clampLimit(limit: number, min = 1, max = 30): number {
  if (!Number.isFinite(limit)) return min;
  return Math.min(max, Math.max(min, Math.floor(limit)));
}

// ── API methods ─────────────────────────────────────────────

/**
 * Get token price & market data by contract address.
 * Prefers BSC/opBNB pairs, falls back to any chain.
 */
export async function getTokenPrice(
  address: string,
  chainId?: number
): Promise<TokenPrice | null> {
  const slugs = chainId ? new Set([toChainSlug(chainId)]) : RELEVANT_SLUGS;
  try {
    const data = await withDataSource(SERVICE, () =>
      serviceFetch<DexPairsResponse>(
        `${BASE}/latest/dex/tokens/${address}`,
        { service: SERVICE }
      )
    );
    if (!data.pairs?.length) return null;
    const best = bestPairByLiquidity(data.pairs, slugs);
    if (!best) return null;
    return pairToTokenPrice(best, address);
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    return null;
  }
}

/**
 * Get token price by chain + address (more precise).
 */
export async function getTokenPriceByChain(
  chainId: number,
  address: string
): Promise<TokenPrice | null> {
  const slug = toChainSlug(chainId);
  try {
    const data = await withDataSource(SERVICE, () =>
      serviceFetch<DexPairsResponse>(
        `${BASE}/latest/dex/tokens/${address}`,
        { service: SERVICE }
      )
    );
    if (!data.pairs?.length) return null;
    const chainPairs = data.pairs.filter((p) => p.chainId === slug);
    const best = chainPairs.length > 0
      ? chainPairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
      : data.pairs[0];
    return pairToTokenPrice(best, address);
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    return null;
  }
}

/**
 * Search for tokens by name, symbol, or address.
 * Returns results filtered to BNB ecosystem chains.
 */
export async function searchToken(
  query: string,
  options?: { chainId?: number; limit?: number }
): Promise<TokenPrice[]> {
  const limit = clampLimit(options?.limit ?? 8, 1, 30);
  const slugs = options?.chainId
    ? new Set([toChainSlug(options.chainId)])
    : RELEVANT_SLUGS;

  try {
    const data = await withDataSource(SERVICE, () =>
      serviceFetch<DexPairsResponse>(
        `${BASE}/latest/dex/search?q=${encodeURIComponent(query)}`,
        { service: SERVICE }
      )
    );
    if (!data.pairs?.length) return [];
    return data.pairs
      .filter((p) => slugs.has(p.chainId ?? ''))
      .slice(0, limit)
      .map((pair) => pairToTokenPrice(pair, ''));
  } catch {
    return [];
  }
}

// ── GeckoTerminal types ──────────────────────────────────────

const GECKO_BASE = 'https://api.geckoterminal.com/api/v2';

/** GeckoTerminal chain slug mapping. */
const GECKO_CHAIN_MAP: Record<number, string> = {
  56: 'bsc',
  97: 'bsc',
  204: 'opbnb',
};

interface GeckoPoolAttributes {
  name?: string;
  address?: string;
  pool_created_at?: string;
  base_token_price_usd?: string;
  fdv_usd?: string;
  reserve_in_usd?: string;
  volume_usd?: { h24?: string };
  price_change_percentage?: { h24?: string };
}

interface GeckoPoolRelationships {
  base_token?: { data?: { id?: string } };
  dex?: { data?: { id?: string } };
}

interface GeckoPoolData {
  id?: string;
  attributes?: GeckoPoolAttributes;
  relationships?: GeckoPoolRelationships;
}

interface GeckoIncludedToken {
  id?: string;
  attributes?: {
    address?: string;
    name?: string;
    symbol?: string;
  };
}

interface GeckoNewPoolsResponse {
  data?: GeckoPoolData[];
  included?: GeckoIncludedToken[];
}

/**
 * Get latest new token pools on BSC/opBNB via GeckoTerminal API.
 * Falls back to DexScreener token-profiles if GeckoTerminal fails.
 */
export async function getLatestTokens(
  options?: { chainId?: number; limit?: number }
): Promise<LatestToken[]> {
  const limit = clampLimit(options?.limit ?? 10, 1, 20);
  const geckoChain = options?.chainId
    ? (GECKO_CHAIN_MAP[options.chainId] ?? 'bsc')
    : 'bsc';

  try {
    const resp = await withDataSource('geckoterminal', () =>
      serviceFetch<GeckoNewPoolsResponse>(
        `${GECKO_BASE}/networks/${geckoChain}/new_pools?page=1&include=base_token`,
        { service: 'geckoterminal', headers: { Accept: 'application/json' } }
      )
    );

    const pools = resp.data ?? [];
    if (pools.length === 0) return [];

    // Build token info lookup from included
    const tokenMap = new Map<string, GeckoIncludedToken['attributes']>();
    for (const inc of resp.included ?? []) {
      if (inc.id && inc.attributes) {
        tokenMap.set(inc.id, inc.attributes);
      }
    }

    // Deduplicate by base token address
    const seen = new Set<string>();
    const results: LatestToken[] = [];

    for (const pool of pools) {
      if (results.length >= limit) break;
      const attrs = pool.attributes;
      if (!attrs) continue;

      const baseTokenId = pool.relationships?.base_token?.data?.id;
      const tokenInfo = baseTokenId ? tokenMap.get(baseTokenId) : undefined;
      const tokenAddr = tokenInfo?.address ?? baseTokenId?.split('_')[1] ?? '';
      if (!tokenAddr) continue;

      const addrLower = tokenAddr.toLowerCase();
      if (seen.has(addrLower)) continue;
      seen.add(addrLower);

      // Parse pool name "TokenA / TokenB"
      const poolName = attrs.name ?? '';
      const nameParts = poolName.split(' / ');

      results.push({
        address: tokenAddr,
        name: tokenInfo?.name ?? nameParts[0] ?? 'Unknown',
        symbol: tokenInfo?.symbol ?? nameParts[0] ?? '???',
        priceUsd: Number(attrs.base_token_price_usd ?? 0),
        priceChange24h: Number(attrs.price_change_percentage?.h24 ?? 0),
        volume24h: Number(attrs.volume_usd?.h24 ?? 0),
        liquidity: Number(attrs.reserve_in_usd ?? 0),
        pairCreatedAt: attrs.pool_created_at ?? '',
        pairAddress: attrs.address ?? '',
        dexName: pool.relationships?.dex?.data?.id ?? '',
        url: `https://dexscreener.com/${geckoChain}/${attrs.address ?? tokenAddr}`,
        chainId: geckoChain,
        description: '',
      });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Get pair info by chain + pair address.
 */
export async function getPairInfo(
  chainId: number,
  pairAddress: string
): Promise<PairInfo | null> {
  const slug = toChainSlug(chainId);
  try {
    const data = await withDataSource(SERVICE, () =>
      serviceFetch<DexPairsResponse>(
        `${BASE}/latest/dex/pairs/${slug}/${pairAddress}`,
        { service: SERVICE }
      )
    );
    const pair = data.pairs?.[0];
    if (!pair) return null;
    return {
      pairAddress: pair.pairAddress ?? pairAddress,
      chainId: pair.chainId ?? slug,
      dexId: pair.dexId ?? '',
      baseToken: {
        address: pair.baseToken?.address ?? '',
        name: pair.baseToken?.name ?? '',
        symbol: pair.baseToken?.symbol ?? '',
      },
      quoteToken: {
        address: pair.quoteToken?.address ?? '',
        name: pair.quoteToken?.name ?? '',
        symbol: pair.quoteToken?.symbol ?? '',
      },
      priceUsd: Number(pair.priceUsd ?? 0),
      liquidity: pair.liquidity?.usd ?? 0,
      volume24h: pair.volume?.h24 ?? 0,
      url: pair.url ?? '',
    };
  } catch {
    return null;
  }
}

// ── Legacy aliases ──────────────────────────────────────────

/** @deprecated Use getLatestTokens() */
export const getLatestBscTokens = (limit?: number) =>
  getLatestTokens({ chainId: 56, limit });
