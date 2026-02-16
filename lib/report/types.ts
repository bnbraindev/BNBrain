/** Bilingual text pair */
export interface BiText {
  zh: string;
  en: string;
}

/** Social/external link in the header */
export interface SocialLink {
  type: 'website' | 'twitter' | 'telegram' | 'bscscan' | 'dexscreener' | 'discord' | 'github' | 'custom';
  url: string;
  /** Only needed when type is 'custom' */
  label?: string;
}

/** Stats strip item (6 across top) */
export interface StatItem {
  label: BiText;
  value: string;
  /** Sub-text below value */
  sub?: BiText | string;
  /** e.g. "-14.82%" or "+5.2%" — determines red/green color */
  change?: string;
  /** Optional link URL for the value */
  link?: string;
}

/** Security check item */
export interface SecurityItem {
  name: BiText;
  detail: BiText | string;
  status: 'pass' | 'warn' | 'fail';
  /** Optional link for detail text */
  detailLink?: string;
}

/** Holder distribution bar segment */
export interface HolderSegment {
  label: BiText;
  percent: number;
  color: 'gold' | 'blue' | 'dim';
}

/** Holder distribution data */
export interface HolderDistribution {
  total: number;
  totalLink?: string;
  segments: HolderSegment[];
}

/** Contract info row */
export interface ContractInfo {
  name?: string;
  nameLink?: string;
  compiler?: string;
  creator?: string;
  creatorFull?: string;
  creatorLink?: string;
  license?: string;
  licenseColor?: 'green' | 'red' | 'yellow';
}

/** Buy/sell data */
export interface BuySellData {
  buys: number;
  sells: number;
}

/** Project feature card */
export interface Feature {
  icon: string;
  name: BiText;
  detail: BiText | string;
}

/** Exchange listing */
export interface ExchangeListing {
  name: string;
  url: string;
}

/** Sentiment bar values (must sum to ~100) */
export interface SentimentData {
  positive: number;
  neutral: number;
  negative: number;
}

/** Web intelligence item */
export interface IntelItem {
  type: 'exchanges' | 'media' | 'sentiment' | 'audit' | 'custom';
  label: BiText;
  content: BiText;
  exchanges?: ExchangeListing[];
  sentiment?: SentimentData;
}

/** Custom HTML section (escape hatch for AI) */
export interface CustomSection {
  title: BiText;
  position: 'after-security' | 'after-overview' | 'after-intel' | 'before-risk';
  /** Must follow the style guide — no <style> tags, use provided CSS classes only */
  html: string;
}

/**
 * The main report JSON structure.
 * AI generates this, then the code renderer converts it to HTML.
 */
export interface ReportJSON {
  // ── Header ──
  token: {
    name: string;
    symbol: string;
    address: string;
    chain: string;
    /** Single uppercase letter for the logo */
    logoLetter?: string;
  };
  date: string;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';

  // ── Verdict ──
  verdict: BiText;

  // ── Stats Strip ──
  stats: StatItem[];

  // ── Social Links (header) ──
  links: SocialLink[];

  // ── Security ──
  security: SecurityItem[];
  holders?: HolderDistribution;
  contract?: ContractInfo;
  buySell?: BuySellData;

  // ── Project Overview ──
  overview?: {
    description: BiText;
    features: Feature[];
  };

  // ── Web Intelligence ──
  intel: IntelItem[];

  // ── Risk Summary ──
  risks: BiText[];
  positives: BiText[];
  recommendation: BiText;

  // ── Data Source Coverage ──
  dataSourceCoverage?: DataSourceCoverageItem[];
  confidenceScore?: number; // 0-100, computed from source coverage

  // ── Custom Sections ──
  customSections?: CustomSection[];
}

/** Data source coverage item for transparency */
export interface DataSourceCoverageItem {
  name: string;
  status: 'success' | 'failed' | 'unavailable';
  detail?: string;
}
