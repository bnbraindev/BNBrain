/**
 * Serper.dev Google Search API client.
 *
 * Provides Google Search and Google News results for token research,
 * social media presence, and security reputation analysis.
 *
 * Ref: https://serper.dev/docs
 */

import { serviceFetch } from './http-client';
import { resolveSerperApiKey } from '@/lib/server/setup-store';

const SERVICE = 'serper';
const BASE = 'https://google.serper.dev';

// ── Types ───────────────────────────────────────────────────

export interface SerperResult {
  title: string;
  link: string;
  snippet: string;
}

export interface SerperSearchOptions {
  /** Max number of results. Default: 10. */
  limit?: number;
  /** Search type: regular web search or news. Default: 'search'. */
  type?: 'search' | 'news';
  /** Restrict results to a specific site (prepends site: to query). */
  site?: string;
}

// ── Raw response types ──────────────────────────────────────

interface SerperOrganicItem {
  title?: string;
  link?: string;
  snippet?: string;
}

interface SerperSearchResponse {
  organic?: SerperOrganicItem[];
}

interface SerperNewsItem {
  title?: string;
  link?: string;
  snippet?: string;
}

interface SerperNewsResponse {
  news?: SerperNewsItem[];
}

// ── Core search function ────────────────────────────────────

/**
 * Perform a Google search via Serper.dev API.
 *
 * Returns an empty array if:
 * - No SERPER_API_KEY is configured
 * - The API request fails for any reason
 */
export async function serperSearch(
  query: string,
  options?: SerperSearchOptions
): Promise<SerperResult[]> {
  const apiKey = await resolveSerperApiKey();
  if (!apiKey) return [];

  const limit = options?.limit ?? 10;
  const type = options?.type ?? 'search';
  const site = options?.site;

  const effectiveQuery = site ? `site:${site} ${query}` : query;
  const url = type === 'news' ? `${BASE}/news` : `${BASE}/search`;

  try {
    if (type === 'news') {
      const data = await serviceFetch<SerperNewsResponse>(url, {
        service: SERVICE,
        method: 'POST',
        headers: { 'X-API-KEY': apiKey },
        body: { q: effectiveQuery, num: limit },
      });
      return (data.news ?? []).map((item) => ({
        title: item.title ?? '',
        link: item.link ?? '',
        snippet: item.snippet ?? '',
      }));
    }

    const data = await serviceFetch<SerperSearchResponse>(url, {
      service: SERVICE,
      method: 'POST',
      headers: { 'X-API-KEY': apiKey },
      body: { q: effectiveQuery, num: limit },
    });
    return (data.organic ?? []).map((item) => ({
      title: item.title ?? '',
      link: item.link ?? '',
      snippet: item.snippet ?? '',
    }));
  } catch {
    return [];
  }
}

// ── Parallel search for token research ──────────────────────

export interface SerperParallelResults {
  twitter: SerperResult[];
  general: SerperResult[];
  news: SerperResult[];
  security: SerperResult[];
  /** Second-round supplementary results (community, exchanges, tokenomics). */
  community: SerperResult[];
  tokenomics: SerperResult[];
}

/**
 * Run parallel Google searches to gather comprehensive token intelligence.
 *
 * Round 1 (4 queries):
 * - Twitter: social media presence and community sentiment
 * - General: reviews, discussions, and analysis
 * - News: recent cryptocurrency news coverage
 * - Security: scam reports, audits, rug pull warnings
 *
 * Round 2 (2 queries):
 * - Community: Telegram, Discord, Reddit discussions
 * - Tokenomics: token economics, supply, distribution, vesting
 *
 * Each search is independently wrapped so a single failure does not
 * affect the others.
 */
export async function serperSearchParallel(
  tokenName: string,
  tokenSymbol: string,
  address: string
): Promise<SerperParallelResults> {
  const nameOrSymbol = `"${tokenSymbol}" OR "${tokenName}"`;

  // Run all 6 searches in parallel
  const [twitter, general, news, security, community, tokenomics] = await Promise.all([
    // Round 1
    serperSearch(nameOrSymbol, {
      limit: 15,
      site: 'twitter.com',
    }).catch(() => [] as SerperResult[]),

    serperSearch(`"${tokenSymbol}" "${address}" BSC token review`, {
      limit: 15,
    }).catch(() => [] as SerperResult[]),

    serperSearch(`${nameOrSymbol} cryptocurrency`, {
      type: 'news',
      limit: 15,
    }).catch(() => [] as SerperResult[]),

    serperSearch(`"${tokenSymbol}" ${tokenName} BSC scam OR rug OR audit OR hack`, {
      limit: 15,
    }).catch(() => [] as SerperResult[]),

    // Round 2 — supplementary
    serperSearch(`${nameOrSymbol} telegram OR discord OR reddit community`, {
      limit: 10,
    }).catch(() => [] as SerperResult[]),

    serperSearch(`${nameOrSymbol} tokenomics OR "token economics" OR supply OR vesting`, {
      limit: 10,
    }).catch(() => [] as SerperResult[]),
  ]);

  return { twitter, general, news, security, community, tokenomics };
}
