import { serviceFetch } from '@/lib/services/http-client';
import { resolveSteelConfig } from '@/lib/server/setup-store';

export interface ScrapeResult {
  markdown: string;
  title: string | null;
  links: { url: string; text: string }[];
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchOptions {
  limit?: number;
  timeoutMs?: number;
  site?: string;
}

export async function scrapePage(url: string, delayMs?: number): Promise<ScrapeResult> {
  const steelConfig = await resolveSteelConfig();
  if (!steelConfig) {
    return { markdown: '', title: null, links: [] };
  }
  const { apiKey, apiUrl } = steelConfig;

  const response = await serviceFetch<{
    content?: { markdown?: string };
    metadata?: { title?: string };
    links?: Array<{ url: string; text: string }>;
  }>(`${apiUrl}/v1/scrape`, {
    service: 'steel',
    method: 'POST',
    timeoutMs: 20_000,
    maxAttempts: 2,
    headers: {
      'Steel-Api-Key': apiKey,
    },
    body: {
      url,
      format: ['markdown'],
      ...(delayMs ? { delay: delayMs } : {}),
    },
  });

  return {
    markdown: response.content?.markdown ?? '',
    title: response.metadata?.title ?? null,
    links: Array.isArray(response.links) ? response.links : [],
  };
}

function parseGoogleSearchResults(markdown: string, limit: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  // Google search markdown typically has links formatted as [title](url) with surrounding text
  const lines = markdown.split('\n');

  let currentTitle = '';
  let currentUrl = '';
  let currentSnippet = '';

  for (const line of lines) {
    // Match markdown links: [text](url)
    const linkMatch = line.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    if (linkMatch) {
      const [, title, url] = linkMatch;
      // Skip Google internal links
      if (url.includes('google.com') || url.includes('gstatic.com') || url.includes('googleapis.com')) continue;
      // Save previous result
      if (currentUrl) {
        results.push({ title: currentTitle, url: currentUrl, snippet: currentSnippet.trim() });
        if (results.length >= limit) break;
      }
      currentTitle = title;
      currentUrl = url;
      currentSnippet = '';
    } else if (currentUrl && line.trim()) {
      // Accumulate snippet text
      const clean = line.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
      if (clean && clean.length > 10 && !clean.startsWith('http')) {
        currentSnippet += (currentSnippet ? ' ' : '') + clean;
      }
    }
  }

  // Push last result
  if (currentUrl && results.length < limit) {
    results.push({ title: currentTitle, url: currentUrl, snippet: currentSnippet.trim() });
  }

  return results;
}

export async function webSearch(
  query: string,
  options?: WebSearchOptions
): Promise<WebSearchResult[]> {
  const steelConfig = await resolveSteelConfig();
  if (!steelConfig) {
    return [];
  }

  const limit = options?.limit ?? 10;
  const sitePrefix = options?.site ? `site:${options.site} ` : '';
  const searchQuery = `${sitePrefix}${query}`;
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=${limit}`;

  try {
    const result = await scrapePage(googleUrl, 2000);
    if (!result.markdown) return [];
    return parseGoogleSearchResults(result.markdown, limit);
  } catch {
    return [];
  }
}
