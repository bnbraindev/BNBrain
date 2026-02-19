/**
 * Binance public REST API client — ticker, klines, symbol mapping.
 *
 * No API key required. Rate limit: 1200 req/min (IP-based).
 * Ref: https://binance-docs.github.io/apidocs/spot/en/
 */

import { serviceFetch } from './http-client';

const SERVICE = 'binance';
const BASE = 'https://api.binance.com';

// ── Symbol mapping ──────────────────────────────────────────

const SYMBOL_MAP: Record<string, string> = {
  BNB: 'BNBUSDT',
  ETH: 'ETHUSDT',
  BTC: 'BTCUSDT',
  SOL: 'SOLUSDT',
  CAKE: 'CAKEUSDT',
  DOGE: 'DOGEUSDT',
  XRP: 'XRPUSDT',
  ADA: 'ADAUSDT',
  DOT: 'DOTUSDT',
  LINK: 'LINKUSDT',
  UNI: 'UNIUSDT',
  AVAX: 'AVAXUSDT',
  SHIB: 'SHIBUSDT',
  LTC: 'LTCUSDT',
  MATIC: 'MATICUSDT',
};

const VALID_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const;
export type KlineInterval = (typeof VALID_INTERVALS)[number];

// ── Public types ────────────────────────────────────────────

export interface BinanceTicker {
  symbol: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  weightedAvgPrice: number;
  volume: number;
  quoteVolume: number;
  bidPrice: number;
  askPrice: number;
  tradeCount: number;
  openTime: number;
  closeTime: number;
}

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  tradeCount: number;
}

// ── Raw API types ───────────────────────────────────────────

interface RawTicker24h {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  openPrice: string;
  weightedAvgPrice: string;
  volume: string;
  quoteVolume: string;
  bidPrice: string;
  askPrice: string;
  count: number;
  openTime: number;
  closeTime: number;
}

// Kline is returned as a tuple array from Binance
type RawKline = [
  number, // 0: openTime
  string, // 1: open
  string, // 2: high
  string, // 3: low
  string, // 4: close
  string, // 5: volume
  number, // 6: closeTime
  string, // 7: quoteVolume
  number, // 8: tradeCount
  string, // 9: taker buy base volume
  string, // 10: taker buy quote volume
  string, // 11: ignore
];

// ── Helpers ─────────────────────────────────────────────────

/** Resolve a human-friendly symbol to a Binance trading pair. */
export function resolveSymbol(input: string): string {
  const upper = input.trim().toUpperCase();
  // Already a pair like "BNBUSDT"
  if (upper.endsWith('USDT') || upper.endsWith('BUSD') || upper.endsWith('BTC')) {
    return upper;
  }
  return SYMBOL_MAP[upper] ?? `${upper}USDT`;
}

/** Check if a string is a valid kline interval. */
export function isValidInterval(v: string): v is KlineInterval {
  return (VALID_INTERVALS as readonly string[]).includes(v);
}

// ── API methods ─────────────────────────────────────────────

/**
 * Get 24h ticker statistics for a symbol.
 */
export async function getTicker24h(symbol: string): Promise<BinanceTicker | null> {
  const resolved = resolveSymbol(symbol);
  try {
    const raw = await serviceFetch<RawTicker24h>(
      `${BASE}/api/v3/ticker/24hr?symbol=${encodeURIComponent(resolved)}`,
      { service: SERVICE },
    );
    return {
      symbol: raw.symbol,
      lastPrice: Number(raw.lastPrice),
      priceChange: Number(raw.priceChange),
      priceChangePercent: Number(raw.priceChangePercent),
      highPrice: Number(raw.highPrice),
      lowPrice: Number(raw.lowPrice),
      openPrice: Number(raw.openPrice),
      weightedAvgPrice: Number(raw.weightedAvgPrice),
      volume: Number(raw.volume),
      quoteVolume: Number(raw.quoteVolume),
      bidPrice: Number(raw.bidPrice),
      askPrice: Number(raw.askPrice),
      tradeCount: raw.count,
      openTime: raw.openTime,
      closeTime: raw.closeTime,
    };
  } catch {
    return null;
  }
}

/**
 * Get historical kline/candlestick data.
 */
export async function getKlines(
  symbol: string,
  interval: KlineInterval = '1h',
  limit = 100,
): Promise<Kline[]> {
  const resolved = resolveSymbol(symbol);
  const clampedLimit = Math.min(500, Math.max(1, limit));
  try {
    const raw = await serviceFetch<RawKline[]>(
      `${BASE}/api/v3/klines?symbol=${encodeURIComponent(resolved)}&interval=${interval}&limit=${clampedLimit}`,
      { service: SERVICE },
    );
    return raw.map((k) => ({
      openTime: k[0],
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
      closeTime: k[6],
      quoteVolume: Number(k[7]),
      tradeCount: k[8],
    }));
  } catch {
    return [];
  }
}
