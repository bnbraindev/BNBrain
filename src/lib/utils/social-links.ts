/**
 * Social link extraction and multi-source merging for deep analysis.
 */

export interface SocialLinks {
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  github?: string;
}

const SOCIAL_PATTERNS: Array<{ key: keyof SocialLinks; pattern: RegExp }> = [
  { key: 'twitter', pattern: /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[A-Za-z0-9_]+/i },
  { key: 'telegram', pattern: /^https?:\/\/(?:www\.)?t\.me\/[A-Za-z0-9_]+/i },
  { key: 'discord', pattern: /^https?:\/\/(?:www\.)?discord\.(?:gg|com)\/[A-Za-z0-9_/]+/i },
  { key: 'github', pattern: /^https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_-]+/i },
];

/** Domains that are aggregators / not official project websites. */
const AGGREGATOR_DOMAINS = new Set([
  'bscscan.com', 'etherscan.io', 'dexscreener.com', 'dextools.io',
  'twitter.com', 'x.com', 't.me', 'discord.com', 'discord.gg', 'github.com',
  'coinmarketcap.com', 'coingecko.com', 'coincodex.com', 'cryptocompare.com',
  'reddit.com', 'medium.com', 'youtube.com', 'facebook.com', 'instagram.com',
  'google.com', 'bing.com', 'yahoo.com',
  'dappradar.com', 'defilama.com', 'defillama.com', 'tokenterminal.com',
  'certik.com', 'immunefi.com', 'hacken.io',
  'binance.com', 'okx.com', 'bybit.com', 'gate.io', 'kucoin.com',
  'crypto.com', 'htx.com', 'mexc.com', 'bitget.com',
]);

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Extract categorized social links from a list of URLs.
 * Returns the first match found for each platform.
 * When `includeWebsite` is true, also detects non-aggregator URLs as website candidates.
 * Default false — only the official website scraper / DexScreener should provide website URLs.
 */
export function extractSocialLinksFromUrls(
  urls: string[],
  options?: { includeWebsite?: boolean },
): SocialLinks {
  const result: SocialLinks = {};
  for (const url of urls) {
    const trimmed = url.trim();
    if (!trimmed.startsWith('http')) continue;

    for (const { key, pattern } of SOCIAL_PATTERNS) {
      if (!result[key] && pattern.test(trimmed)) {
        result[key] = trimmed.match(pattern)![0];
        break;
      }
    }

    // Detect website: non-aggregator, non-social domain (only when explicitly requested)
    if (options?.includeWebsite && !result.website) {
      const domain = getDomain(trimmed);
      if (domain && !AGGREGATOR_DOMAINS.has(domain)) {
        result.website = trimmed;
      }
    }
  }
  return result;
}

/**
 * Extract social links from DexScreener pair info.
 */
export function extractSocialLinksFromDexScreener(
  websites?: Array<{ label?: string; url?: string }>,
  socials?: Array<{ type?: string; url?: string }>,
): SocialLinks {
  const result: SocialLinks = {};

  if (websites?.length) {
    const first = websites.find(w => w.url);
    if (first?.url) result.website = first.url;
  }

  if (socials?.length) {
    for (const s of socials) {
      if (!s.url || !s.type) continue;
      const t = s.type.toLowerCase();
      if (t === 'twitter' && !result.twitter) result.twitter = s.url;
      else if (t === 'telegram' && !result.telegram) result.telegram = s.url;
      else if (t === 'discord' && !result.discord) result.discord = s.url;
      else if (t === 'github' && !result.github) result.github = s.url;
    }
  }

  return result;
}

/**
 * Merge multiple SocialLinks sources. Earlier sources have higher priority.
 * e.g. mergeSocialLinks(fromWebsite, fromDexScreener, fromSearch)
 *      → website links win over DexScreener, which wins over search.
 */
export function mergeSocialLinks(...sources: SocialLinks[]): SocialLinks {
  const result: SocialLinks = {};
  const keys: (keyof SocialLinks)[] = ['website', 'twitter', 'telegram', 'discord', 'github'];
  for (const key of keys) {
    for (const src of sources) {
      if (src[key]) {
        result[key] = src[key];
        break;
      }
    }
  }
  return result;
}
