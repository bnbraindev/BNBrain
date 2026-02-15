/**
 * Shorten an EVM address for display.
 * @param address - Full address string
 * @param chars - Number of chars to show on each side (default 4)
 */
export function shortenAddress(address: string, chars: number = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format token balance from raw units to human-readable string.
 */
export function formatBalance(
  balance: bigint,
  decimals: number,
  displayDecimals?: number
): string {
  const divisor = BigInt(10 ** decimals);
  const whole = balance / divisor;
  const fraction = balance % divisor;
  const fracDigits = displayDecimals ?? Math.min(4, decimals);
  const fractionStr = fraction
    .toString()
    .padStart(decimals, '0')
    .slice(0, fracDigits)
    .replace(/0+$/, '');
  if (!fractionStr) return whole.toString();
  return `${whole}.${fractionStr}`;
}

/**
 * Format number as USD currency.
 */
export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format number as percentage.
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

/**
 * Validate EVM address format.
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Convert wei (bigint) to ether string.
 */
/**
 * Sanitize a URL to only allow http: and https: protocols.
 * Returns '#' for any other protocol (e.g. javascript:).
 */
export function sanitizeUrl(url: string | undefined | null): string {
  if (!url) return '#';
  const trimmed = url.trim();
  if (!trimmed) return '#';
  try {
    const parsed = new URL(trimmed, 'https://placeholder.invalid');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed;
    }
    return '#';
  } catch {
    return '#';
  }
}

export function weiToEther(wei: bigint): string {
  const divisor = BigInt(1e18);
  const whole = wei / divisor;
  const fraction = wei % divisor;
  const fractionStr = fraction
    .toString()
    .padStart(18, '0')
    .replace(/0+$/, '');
  return fractionStr ? `${whole}.${fractionStr}` : whole.toString();
}
