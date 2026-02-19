/**
 * Shared SSRF protection utilities.
 *
 * Validates URLs to prevent Server-Side Request Forgery by blocking
 * private/internal IP addresses and cloud metadata endpoints.
 */

const BLOCKED_HOSTS = new Set([
  '169.254.169.254',      // AWS / GCP instance metadata
  'metadata.google.internal', // GCP metadata
  '100.100.100.200',      // Alibaba Cloud metadata
]);

/** Check whether a hostname resolves to a private / internal address. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTS.has(h)) return true;

  // Loopback
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;

  // mDNS / internal suffixes
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;

  // RFC 1918 private ranges
  if (/^10\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;

  // Link-local
  if (/^169\.254\./.test(h)) return true;

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 → ::ffff:7f00:1)
  if (h.startsWith('::ffff:')) return true;

  // IPv6 link-local & unique-local
  if (h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('fc')) return true;

  return false;
}

/**
 * Validate a URL is safe for server-side fetching.
 * Returns an error message string if blocked, or null if safe.
 */
export function validateUrlSafety(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return 'Invalid URL';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Only http and https URLs are allowed';
  }
  if (isPrivateHost(parsed.hostname)) {
    return 'URL points to a private or internal address';
  }
  return null;
}
