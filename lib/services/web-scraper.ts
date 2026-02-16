/**
 * Website scraper — fetch + regex, zero external dependencies.
 *
 * Extracts: plain text, headings, links, meta/OG tags, JSON-LD structured data.
 * Supports internal-link crawling for sub-pages (tokenomics, about, etc.).
 */

import { validateUrlSafety } from '@/lib/server/url-safety';

const MAX_TEXT_LENGTH = 10_000;
const TIMEOUT_MS = 10_000;
const CRAWL_TIMEOUT_MS = 8_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface ScrapedPage {
  /** Cleaned plain text extracted from the page body. */
  text: string;
  /** Semantic headings (h1-h6) found on the page. */
  headings: Array<{ level: number; text: string }>;
  /** All links found on the page (both internal and external http(s)). */
  links: Array<{ url: string; text: string }>;
  /** Meta tag values (name/property → content), including OpenGraph. */
  meta: Record<string, string>;
  /** JSON-LD structured data blocks found in the page. */
  jsonLd: unknown[];
  /** Whether the page content looks like a JS-rendered SPA (very little text). */
  sparse: boolean;
}

/** Sub-page scrape result for internal link crawling. */
export interface CrawledSubPage {
  url: string;
  matchedKeyword: string;
  text: string;
  headings: Array<{ level: number; text: string }>;
  links: Array<{ url: string; text: string }>;
}

// ── Keywords for prioritizing internal links ──

const SUBPAGE_KEYWORDS: Array<{ keyword: string; weight: number }> = [
  { keyword: 'tokenomics', weight: 10 },
  { keyword: 'tokenomic', weight: 10 },
  { keyword: 'token', weight: 5 },
  { keyword: 'about', weight: 8 },
  { keyword: 'team', weight: 7 },
  { keyword: 'roadmap', weight: 6 },
  { keyword: 'docs', weight: 4 },
  { keyword: 'document', weight: 4 },
  { keyword: 'whitepaper', weight: 5 },
  { keyword: 'faq', weight: 3 },
  { keyword: 'how-it-works', weight: 4 },
  { keyword: 'features', weight: 3 },
  { keyword: 'ecosystem', weight: 4 },
];

// ── Extraction helpers ──

function extractJsonLd(html: string): unknown[] {
  const results: unknown[] = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      results.push(parsed);
    } catch { /* malformed JSON-LD, skip */ }
  }
  return results;
}

function extractMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  // Match both orderings: name/property before content, and content before name/property
  const regex1 = /<meta[^>]+(?:name|property)=["']([^"']+)["'][^>]+content=["']([^"']*?)["']/gi;
  const regex2 = /<meta[^>]+content=["']([^"']*?)["'][^>]+(?:name|property)=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = regex1.exec(html)) !== null) {
    meta[m[1]] = m[2];
  }
  while ((m = regex2.exec(html)) !== null) {
    if (!meta[m[2]]) meta[m[2]] = m[1];
  }
  return meta;
}

function extractHeadings(html: string): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];
  const regex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (text.length > 1) {
      headings.push({ level: parseInt(m[1], 10), text });
    }
  }
  return headings;
}

function extractLinks(html: string): Array<{ url: string; text: string }> {
  const links: Array<{ url: string; text: string }> = [];
  const seen = new Set<string>();
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const href = m[1].trim();
    const linkText = m[2].replace(/<[^>]+>/g, '').trim();
    if ((href.startsWith('http') || href.startsWith('/')) && !seen.has(href)) {
      seen.add(href);
      links.push({ url: href, text: linkText });
    }
  }
  return links;
}

/** True if a line looks like JavaScript code rather than human-readable text. */
function isCodeLine(line: string): boolean {
  // Only filter lines that are clearly JS/CSS code, not normal text with punctuation
  if (line.startsWith('var ') || line.startsWith('let ') || line.startsWith('const ')) return true;
  if (line.startsWith('window.') || line.startsWith('document.')) return true;
  if (line.startsWith('function ') || line.startsWith('function(')) return true;
  if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*/')) return true;
  if (line.startsWith('import ') && line.includes(' from ')) return true;
  if (line.startsWith('export ')) return true;
  // Lines that are MOSTLY code-like: high density of code characters
  const codeChars = (line.match(/[{}();=><|&!]/g) || []).length;
  if (codeChars > line.length * 0.3 && line.length > 20) return true;
  return false;
}

function extractPlainText(html: string): string {
  return html
    // Strip JSON-LD scripts (already extracted separately)
    .replace(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '')
    // Strip remaining script and style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    // Convert block elements to line breaks for better separation
    .replace(/<\/?(?:div|p|br|hr|section|article|header|footer|nav|main|aside|li|tr|td|th|dt|dd|blockquote|pre|h[1-6])[^>]*>/gi, '\n')
    // Strip remaining HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Clean up whitespace
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 2 && !isCodeLine(l))
    // Deduplicate consecutive identical lines (common in SPAs)
    .filter((l, i, arr) => i === 0 || l !== arr[i - 1])
    .join('\n')
    .slice(0, MAX_TEXT_LENGTH);
}

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return '';
  }
}

// ── Main scrape function ──

/**
 * Fetch and scrape a web page.
 * Returns structured text, headings, links, meta, JSON-LD, and SPA detection.
 */
export async function scrapeWebsite(url: string): Promise<ScrapedPage | null> {
  try {
    if (validateUrlSafety(url)) return null;
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const html = await res.text();

    return parsePage(html);
  } catch {
    return null;
  }
}

/** Parse raw HTML into a ScrapedPage (exported for reuse by crawlSubPages). */
export function parsePage(html: string): ScrapedPage {
  const meta = extractMeta(html);
  const jsonLd = extractJsonLd(html);
  const headings = extractHeadings(html);
  const links = extractLinks(html);
  const text = extractPlainText(html);

  // SPA detection: very little meaningful text despite having HTML
  const sparse = text.length < 500 && html.length > 2000;

  return { text, headings, links, meta, jsonLd, sparse };
}

// ── Internal link crawling ──

/**
 * Given a scraped homepage, find and crawl the most relevant internal sub-pages.
 * Returns up to `maxPages` sub-page results, prioritized by keyword relevance.
 */
export async function crawlSubPages(
  homepageUrl: string,
  homepageLinks: Array<{ url: string; text: string }>,
  options?: { maxPages?: number },
): Promise<CrawledSubPage[]> {
  const maxPages = options?.maxPages ?? 3;
  const origin = getOrigin(homepageUrl);
  if (!origin) return [];

  // Score and rank internal links by keyword relevance
  const scored: Array<{ url: string; text: string; keyword: string; score: number }> = [];
  const seen = new Set<string>();

  for (const link of homepageLinks) {
    const fullUrl = link.url.startsWith('http')
      ? link.url
      : resolveUrl(homepageUrl, link.url);
    if (!fullUrl || !fullUrl.startsWith(origin)) continue;
    // Skip homepage itself, anchors, and static assets
    if (fullUrl === homepageUrl || fullUrl === homepageUrl + '/') continue;
    const path = fullUrl.replace(origin, '').toLowerCase();
    if (!path || path === '/' || path.includes('#') && !path.split('#')[0]) continue;
    if (/\.(png|jpg|jpeg|gif|svg|css|js|pdf|zip|ico|woff)$/i.test(path)) continue;
    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);

    // Check keyword match in both URL path and anchor text
    const combined = `${path} ${link.text}`.toLowerCase();
    let bestScore = 0;
    let bestKeyword = '';
    for (const { keyword, weight } of SUBPAGE_KEYWORDS) {
      if (combined.includes(keyword) && weight > bestScore) {
        bestScore = weight;
        bestKeyword = keyword;
      }
    }
    if (bestScore > 0) {
      scored.push({ url: fullUrl, text: link.text, keyword: bestKeyword, score: bestScore });
    }
  }

  // Sort by score desc, take top N
  scored.sort((a, b) => b.score - a.score);
  const targets = scored.slice(0, maxPages);
  if (targets.length === 0) return [];

  // Parallel fetch
  const results = await Promise.allSettled(
    targets.map(async (target) => {
      if (validateUrlSafety(target.url)) return null;
      const res = await fetch(target.url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(CRAWL_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const html = await res.text();
      const page = parsePage(html);
      return {
        url: target.url,
        matchedKeyword: target.keyword,
        text: page.text.slice(0, 6000),
        headings: page.headings,
        links: page.links,
      } satisfies CrawledSubPage;
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<CrawledSubPage | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is CrawledSubPage => v !== null && v.text.length > 100);
}
