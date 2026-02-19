/**
 * SIWE (Sign-In with Ethereum) configuration — shared by challenge & verify routes.
 *
 * Resolves domain pinning and allowed chain IDs from DB (setup config)
 * with fallback to environment variables.
 */

import { resolveSiweDomain, resolveSiweAllowedChainIds } from '@/lib/server/setup-store';

export async function resolveRequestOrigin(
  req: Request
): Promise<{ domain: string; uri: string } | null> {
  // Prefer server-pinned domain (prevents Origin header spoofing)
  const pinnedDomain = await resolveSiweDomain();
  if (pinnedDomain) {
    const proto = pinnedDomain.includes('localhost') ? 'http' : 'https';
    return { domain: pinnedDomain, uri: `${proto}://${pinnedDomain}` };
  }
  const url = new URL(req.url);
  const originHeader = req.headers.get('origin');
  // Behind reverse proxy (Cloudflare Tunnel, Nginx), trust the Origin header
  // as the authoritative source of the public-facing domain.
  if (originHeader) {
    try {
      const parsedOrigin = new URL(originHeader);
      return { domain: parsedOrigin.host, uri: parsedOrigin.origin };
    } catch {
      return null;
    }
  }
  // Fallback to Host header for non-browser clients
  const hostHeader = req.headers.get('host') ?? req.headers.get('x-forwarded-host');
  if (hostHeader) {
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    return { domain: hostHeader, uri: `${proto}://${hostHeader}` };
  }
  return { domain: url.host, uri: url.origin };
}

async function resolveConfiguredSiweChainIds(): Promise<Set<number> | null> {
  const raw = await resolveSiweAllowedChainIds();
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized === 'all' || normalized === '*') return null;
  const parsed = raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
  if (parsed.length === 0) return null;
  return new Set(parsed);
}

export async function isAllowedSiweChainId(chainId: number): Promise<boolean> {
  if (!Number.isInteger(chainId) || chainId <= 0) return false;
  const configured = await resolveConfiguredSiweChainIds();
  if (!configured) return true;
  return configured.has(chainId);
}
