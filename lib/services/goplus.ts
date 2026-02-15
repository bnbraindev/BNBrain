/**
 * GoPlus Security SDK — typed client for all GoPlus APIs.
 *
 * Uses the official @goplus/sdk-node SDK for HTTP and authentication.
 * All response types are preserved for downstream consumers.
 *
 * Ref: https://docs.gopluslabs.io/reference/api-overview
 */

import { isAddress } from 'viem';
import { ServiceError } from './http-client';
export { ServiceError } from './http-client';

const SERVICE = 'goplus';

// ── SDK import & typed interface ───────────────────────────

interface SdkResponse<T = unknown> {
  code: number;
  message: string;
  result: T;
}

interface ApprovalRawItem {
  token_address: string;
  token_name: string;
  token_symbol: string;
  balance: string;
  chain_id: string;
  decimals: number;
  malicious_address: number;
  malicious_behavior: string[];
  is_open_source: number;
  approved_list: Array<{
    approved_contract: string;
    approved_amount: string;
    approved_time: number;
    hash: string;
    initial_approval_hash: string;
    initial_approval_time: number;
    address_info: {
      contract_name: string;
      is_contract: number;
      is_open_source: number;
      doubt_list: number;
      trust_list: number;
      tag: string;
      malicious_behavior: string[];
      deployed_time: number;
      creator_address: string;
    };
  }>;
}

interface DAppRaw {
  project_name: string;
  is_audit: number;
  trust_list: number;
  url: string;
  audit_info: Array<{ audit_firm: string; audit_link: string; audit_time: string }> | null;
  contracts_security: Array<{
    chain_id: string;
    contracts: Array<{
      contract_address: string;
      is_open_source: number;
      malicious_contract: number;
      creator_address: string;
    }>;
  }> | null;
}

interface InputDecodeRaw {
  method: string;
  contract_name: string;
  malicious_contract: number;
  risky_signature: number;
  risk: string;
  signature_detail: string;
  params: Array<{
    name: string;
    type: string;
    input: unknown;
    address_info?: {
      malicious_address: number;
      is_contract: number;
      name: string;
      symbol: string;
    };
  }>;
}

interface NftRaw {
  nft_name: string;
  nft_symbol: string;
  nft_erc: string;
  nft_open_source: number;
  nft_proxy: number;
  malicious_nft_contract: number;
  trust_list: number;
  nft_owner_number: number;
  nft_items: number;
  restricted_approval: number;
  transfer_without_approval: { value: number };
  privileged_minting: { value: number };
  privileged_burn: { value: number };
  oversupply_minting: number;
  self_destruct: { value: number };
}

interface GoPlusSdk {
  config(appKey: string, appSecret: string, timeout?: number): void;
  getAccessToken(): Promise<SdkResponse<{ access_token: string; expires_in: number }>>;
  tokenSecurity(chainId: string, tokens: string[], timeout?: number): Promise<SdkResponse<Record<string, GoPlusTokenSecurityRaw>>>;
  addressSecurity(chainId: string, address: string, timeout?: number): Promise<SdkResponse<GoPlusAddressSecurityRaw>>;
  erc20ApprovalSecurity(chainId: string, address: string, timeout?: number): Promise<SdkResponse<ApprovalRawItem[]>>;
  phishingSite(url: string, timeout?: number): Promise<SdkResponse<{ phishing_site: number }>>;
  dappSecurity(url: string, timeout?: number): Promise<SdkResponse<DAppRaw>>;
  inputDecodeWithOpts(chainId: string, contractAddress: string, data: string, opts?: { timeout?: number; signer?: string }): Promise<SdkResponse<InputDecodeRaw>>;
  nftSecurity(chainId: string, contractAddress: string, tokenId?: string, timeout?: number): Promise<SdkResponse<NftRaw>>;
  rugpullDetection(chainId: string, addresses: string[], timeout?: number): Promise<SdkResponse<Record<string, unknown>>>;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sdk: GoPlusSdk = require('@goplus/sdk-node').GoPlus;

// ── Authentication ──────────────────────────────────────────

let sdkConfigured = false;
let tokenExpiresAt = 0;

/**
 * Get an access token for authenticated GoPlus API calls.
 * Returns null if no credentials are configured (free tier still works).
 * Resolves credentials from DB setup config first, then env vars.
 */
export async function getAccessToken(): Promise<string | null> {
  let appKey: string | undefined;
  let appSecret: string | undefined;
  try {
    const { resolveGoPlusCredentials } = await import('@/lib/server/setup-store');
    const creds = await resolveGoPlusCredentials();
    if (creds) {
      appKey = creds.appKey;
      appSecret = creds.appSecret;
    }
  } catch {
    // Fallback to env vars if setup-store fails (e.g. no DB)
    appKey = process.env.GOPLUS_APP_KEY;
    appSecret = process.env.GOPLUS_APP_SECRET;
  }
  if (!appKey || !appSecret) return null;

  if (!sdkConfigured) {
    sdk.config(appKey, appSecret, 30);
    sdkConfigured = true;
  }

  if (tokenExpiresAt > 0 && Date.now() < tokenExpiresAt - 60_000) {
    return '(cached)';
  }

  try {
    const result = await sdk.getAccessToken();
    if (result.code === 1 && result.result?.access_token) {
      tokenExpiresAt = Date.now() + (result.result.expires_in ?? 3600) * 1000;
      return result.result.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

async function ensureAuth(): Promise<void> {
  await getAccessToken();
}

// ── Shared types ────────────────────────────────────────────

/** Chain IDs supported by GoPlus Token Security API. */
export type GoPlusChainId =
  | '1' | '56' | '42161' | '137' | '204' | '324' | '59144' | '8453'
  | '5000' | '534352' | '10' | '43114' | '250' | '25' | '128' | '100'
  | 'tron' | '321' | '201022' | '42766' | '1514' | '146' | '2741'
  | '177' | '80094' | '10143' | '480' | '2818' | '1625' | '48899'
  | '196' | '810180' | '200901' | '4200' | '169' | '81457';

function assertAddress(address: string): void {
  if (!isAddress(address)) {
    throw new ServiceError(SERVICE, `Invalid address: ${address}`);
  }
}

// ── Token Security ──────────────────────────────────────────

export interface GoPlusTokenSecurityRaw {
  token_name?: string;
  token_symbol?: string;
  total_supply?: string;
  holder_count?: string;
  lp_holder_count?: string;
  lp_total_supply?: string;
  is_honeypot?: string;
  is_mintable?: string;
  is_proxy?: string;
  is_blacklisted?: string;
  is_whitelisted?: string;
  is_open_source?: string;
  is_in_dex?: string;
  is_anti_whale?: string;
  is_true_token?: string;
  is_airdrop_scam?: string;
  can_take_back_ownership?: string;
  cannot_buy?: string;
  cannot_sell_all?: string;
  owner_change_balance?: string;
  selfdestruct?: string;
  external_call?: string;
  hidden_owner?: string;
  personal_slippage_modifiable?: string;
  slippage_modifiable?: string;
  trading_cooldown?: string;
  transfer_pausable?: string;
  anti_whale_modifiable?: string;
  buy_tax?: string;
  sell_tax?: string;
  creator_address?: string;
  creator_balance?: string;
  creator_percent?: string;
  owner_address?: string;
  owner_balance?: string;
  owner_percent?: string;
  honeypot_with_same_creator?: string;
  trust_list?: string;
  other_potential_risks?: string;
  note?: string;
  fake_token?: { value: number; true_token_address?: string };
  holders?: Array<{
    address: string;
    balance: string;
    percent: string;
    is_contract: number;
    is_locked: number;
    tag?: string;
    locked_detail?: Array<{ amount: string; end_time: string; opt_time: string }>;
  }>;
  lp_holders?: Array<{
    address: string;
    balance: string;
    percent: string;
    is_contract: number;
    is_locked: number;
    tag?: string;
    locked_detail?: Array<{ amount: string; end_time: string; opt_time: string }>;
    NFT_list?: Array<{
      NFT_id: string;
      NFT_percentage: string;
      amount: string;
      in_effect: string;
      value: string;
    }>;
  }>;
  dex?: Array<{ name: string; liquidity: string; pair: string }>;
}

export interface TokenSecurityResult {
  raw: GoPlusTokenSecurityRaw;
  tokenName: string;
  tokenSymbol: string;
  isHoneypot: boolean;
  isMintable: boolean;
  isProxy: boolean;
  isBlacklisted: boolean;
  isOpenSource: boolean;
  isAntiWhale: boolean;
  isTrustList: boolean;
  cannotBuy: boolean;
  cannotSellAll: boolean;
  transferPausable: boolean;
  hiddenOwner: boolean;
  selfDestruct: boolean;
  buyTax: string;
  sellTax: string;
  holderCount: number;
  lpHolderCount: number;
  totalSupply: string;
  creatorAddress: string;
  ownerAddress: string;
  holders: Array<{ address: string; percent: string; isContract: boolean; tag?: string }>;
  dex: Array<{ name: string; liquidity: string; pair: string }>;
  riskLevel: 'safe' | 'warning' | 'danger';
  riskScore: number;
  risks: string[];
}

function flag(v: string | undefined): boolean {
  return v === '1';
}

function computeRiskAssessment(t: GoPlusTokenSecurityRaw): {
  riskLevel: 'safe' | 'warning' | 'danger';
  riskScore: number;
  risks: string[];
} {
  const risks: string[] = [];
  let score = 0;

  if (flag(t.is_honeypot)) { risks.push('HONEYPOT: Cannot sell this token'); score += 40; }
  if (flag(t.is_mintable)) { risks.push('Mintable: Owner can create new tokens'); score += 15; }
  if (flag(t.is_proxy)) { risks.push('Proxy contract: Logic can be changed'); score += 10; }
  if (flag(t.is_blacklisted)) { risks.push('Blacklist function: Owner can block addresses'); score += 10; }
  if (!flag(t.is_open_source)) { risks.push('Contract is not open source'); score += 5; }
  if (flag(t.hidden_owner)) { risks.push('Hidden owner detected'); score += 10; }
  if (flag(t.selfdestruct)) { risks.push('Self-destruct function present'); score += 15; }
  if (flag(t.transfer_pausable)) { risks.push('Transfer can be paused by owner'); score += 8; }
  if (flag(t.cannot_buy)) { risks.push('Token cannot be bought'); score += 5; }
  if (flag(t.cannot_sell_all)) { risks.push('Cannot sell all tokens at once'); score += 5; }
  if (flag(t.owner_change_balance)) { risks.push('Owner can change any balance'); score += 20; }
  if (flag(t.slippage_modifiable)) { risks.push('Tax rate is modifiable'); score += 8; }
  if (flag(t.personal_slippage_modifiable)) { risks.push('Per-address tax can be set'); score += 8; }
  if (flag(t.is_airdrop_scam)) { risks.push('Airdrop scam token'); score += 30; }
  if (t.fake_token?.value === 1) { risks.push('Fake/counterfeit token'); score += 30; }

  const buyTax = Number(t.buy_tax ?? 0);
  const sellTax = Number(t.sell_tax ?? 0);
  if (buyTax > 0.1) { risks.push(`High buy tax: ${(buyTax * 100).toFixed(1)}%`); score += 5; }
  if (sellTax > 0.1) { risks.push(`High sell tax: ${(sellTax * 100).toFixed(1)}%`); score += 5; }

  const holderCount = Number(t.holder_count ?? 0);
  if (holderCount > 0 && holderCount < 50) { risks.push(`Very few holders: ${holderCount}`); score += 5; }

  const topHolderPercent = (t.holders ?? []).slice(0, 10).reduce((sum, h) => {
    const pct = Number(h.percent ?? 0);
    return sum + (pct <= 1 ? pct * 100 : pct);
  }, 0);
  if (topHolderPercent > 80) {
    risks.push(`Top 10 holders own ${topHolderPercent.toFixed(1)}% of supply`);
    score += 10;
  }

  score = Math.min(100, score);
  const riskLevel = score >= 60 ? 'danger' : score >= 30 ? 'warning' : 'safe';
  return { riskLevel, riskScore: score, risks };
}

/**
 * Get token security information from GoPlus.
 * Supports all chains listed in GoPlusChainId.
 */
export async function tokenSecurity(
  address: string,
  chainId: number = 56
): Promise<TokenSecurityResult> {
  assertAddress(address);
  await ensureAuth();
  const addr = address.toLowerCase();

  let data: SdkResponse<Record<string, GoPlusTokenSecurityRaw>>;
  try {
    data = await sdk.tokenSecurity(String(chainId), [addr]);
  } catch (err) {
    throw new ServiceError(SERVICE, err instanceof Error ? err.message : 'Token security lookup failed');
  }

  if (data.code !== 1 || !data.result) {
    throw new ServiceError(SERVICE, data.message || 'Token security lookup failed');
  }
  const raw = data.result[addr];
  if (!raw) {
    throw new ServiceError(SERVICE, 'Token not found in GoPlus database');
  }

  const assessment = computeRiskAssessment(raw);
  const holders = (raw.holders ?? []).slice(0, 10).map((h) => {
    const pct = Number(h.percent ?? 0);
    return {
      address: h.address,
      percent: `${(pct <= 1 ? pct * 100 : pct).toFixed(2)}%`,
      isContract: h.is_contract === 1,
      tag: h.tag,
    };
  });

  return {
    raw,
    tokenName: raw.token_name ?? '',
    tokenSymbol: raw.token_symbol ?? '',
    isHoneypot: flag(raw.is_honeypot),
    isMintable: flag(raw.is_mintable),
    isProxy: flag(raw.is_proxy),
    isBlacklisted: flag(raw.is_blacklisted),
    isOpenSource: flag(raw.is_open_source),
    isAntiWhale: flag(raw.is_anti_whale),
    isTrustList: flag(raw.trust_list),
    cannotBuy: flag(raw.cannot_buy),
    cannotSellAll: flag(raw.cannot_sell_all),
    transferPausable: flag(raw.transfer_pausable),
    hiddenOwner: flag(raw.hidden_owner),
    selfDestruct: flag(raw.selfdestruct),
    buyTax: `${(Number(raw.buy_tax ?? 0) * 100).toFixed(2)}%`,
    sellTax: `${(Number(raw.sell_tax ?? 0) * 100).toFixed(2)}%`,
    holderCount: Number(raw.holder_count ?? 0),
    lpHolderCount: Number(raw.lp_holder_count ?? 0),
    totalSupply: raw.total_supply ?? '0',
    creatorAddress: raw.creator_address ?? '',
    ownerAddress: raw.owner_address ?? '',
    holders,
    dex: raw.dex ?? [],
    ...assessment,
  };
}

// ── Address Security ────────────────────────────────────────

export interface GoPlusAddressSecurityRaw {
  blacklist_doubt?: string;
  blackmail_activities?: string;
  cybercrime?: string;
  darkweb_transactions?: string;
  fake_kyc?: string;
  fake_standard_interface?: string;
  fake_token?: string;
  financial_crime?: string;
  gas_abuse?: string;
  honeypot_related_address?: string;
  malicious_mining_activities?: string;
  mixer?: string;
  money_laundering?: string;
  number_of_malicious_contracts_created?: string;
  phishing_activities?: string;
  reinit?: string;
  sanctioned?: string;
  stealing_attack?: string;
  contract_address?: string;
  data_source?: string;
}

export interface AddressSecurityResult {
  raw: GoPlusAddressSecurityRaw;
  isMalicious: boolean;
  isBlacklisted: boolean;
  isPhishing: boolean;
  isSanctioned: boolean;
  isMixer: boolean;
  isHoneypotCreator: boolean;
  maliciousContractCount: number;
  dataSource: string;
  riskType: string;
  flags: string[];
}

/**
 * Check if an address is malicious or risky.
 */
export async function addressSecurity(
  address: string,
  chainId?: number
): Promise<AddressSecurityResult> {
  assertAddress(address);
  await ensureAuth();

  let data: SdkResponse<GoPlusAddressSecurityRaw>;
  try {
    data = await sdk.addressSecurity(chainId ? String(chainId) : '', address);
  } catch (err) {
    throw new ServiceError(SERVICE, err instanceof Error ? err.message : 'Address security lookup failed');
  }

  if (data.code !== 1) {
    throw new ServiceError(SERVICE, data.message || 'Address security lookup failed');
  }
  const r = data.result ?? ({} as GoPlusAddressSecurityRaw);
  const flags: string[] = [];
  if (flag(r.phishing_activities)) flags.push('phishing');
  if (flag(r.stealing_attack)) flags.push('stealing_attack');
  if (flag(r.blacklist_doubt)) flags.push('blacklisted');
  if (flag(r.honeypot_related_address)) flags.push('honeypot_creator');
  if (flag(r.sanctioned)) flags.push('sanctioned');
  if (flag(r.mixer)) flags.push('mixer');
  if (flag(r.money_laundering)) flags.push('money_laundering');
  if (flag(r.cybercrime)) flags.push('cybercrime');
  if (flag(r.darkweb_transactions)) flags.push('darkweb');
  if (flag(r.financial_crime)) flags.push('financial_crime');
  if (flag(r.blackmail_activities)) flags.push('blackmail');
  if (flag(r.malicious_mining_activities)) flags.push('malicious_mining');
  if (flag(r.fake_kyc)) flags.push('fake_kyc');
  if (flag(r.gas_abuse)) flags.push('gas_abuse');
  if (flag(r.fake_token)) flags.push('fake_token');
  if (flag(r.reinit)) flags.push('reinit_risk');
  if (flag(r.fake_standard_interface)) flags.push('fake_standard_interface');

  return {
    raw: r,
    isMalicious: flags.length > 0,
    isBlacklisted: flag(r.blacklist_doubt),
    isPhishing: flag(r.phishing_activities),
    isSanctioned: flag(r.sanctioned),
    isMixer: flag(r.mixer),
    isHoneypotCreator: flag(r.honeypot_related_address),
    maliciousContractCount: Number(r.number_of_malicious_contracts_created ?? 0),
    dataSource: r.data_source ?? '',
    riskType: flag(r.contract_address) ? 'contract' : 'eoa',
    flags,
  };
}

// ── Approval Security (V2) ──────────────────────────────────

export interface ApprovalSpenderInfo {
  contractName: string;
  isContract: boolean;
  isOpenSource: boolean;
  doubtList: boolean;
  trustList: boolean;
  tag: string;
  maliciousBehavior: string[];
  deployedTime: number | null;
  creatorAddress: string;
}

export interface ApprovalRecord {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  balance: string;
  chainId: string;
  decimals: number;
  isMalicious: boolean;
  maliciousBehavior: string[];
  approvedList: Array<{
    spenderAddress: string;
    approvedAmount: string;
    approvedTime: number | null;
    hash: string;
    spenderInfo: ApprovalSpenderInfo;
  }>;
}

/**
 * Get ERC-20 approval security data for a wallet address.
 */
export async function approvalSecurity(
  address: string,
  chainId: number = 56
): Promise<ApprovalRecord[]> {
  assertAddress(address);
  await ensureAuth();

  let data: SdkResponse<ApprovalRawItem[]>;
  try {
    data = await sdk.erc20ApprovalSecurity(String(chainId), address.toLowerCase());
  } catch (err) {
    throw new ServiceError(SERVICE, err instanceof Error ? err.message : 'Approval security lookup failed');
  }

  if (data.code !== 1) {
    throw new ServiceError(SERVICE, data.message || 'Approval security lookup failed');
  }

  return (data.result ?? []).map((item) => ({
    tokenAddress: item.token_address,
    tokenName: item.token_name,
    tokenSymbol: item.token_symbol,
    balance: item.balance,
    chainId: item.chain_id,
    decimals: item.decimals,
    isMalicious: item.malicious_address === 1,
    maliciousBehavior: item.malicious_behavior ?? [],
    approvedList: (item.approved_list ?? []).map((a) => ({
      spenderAddress: a.approved_contract,
      approvedAmount: a.approved_amount,
      approvedTime: a.approved_time || null,
      hash: a.hash,
      spenderInfo: {
        contractName: a.address_info?.contract_name ?? '',
        isContract: a.address_info?.is_contract === 1,
        isOpenSource: a.address_info?.is_open_source === 1,
        doubtList: a.address_info?.doubt_list === 1,
        trustList: a.address_info?.trust_list === 1,
        tag: a.address_info?.tag ?? '',
        maliciousBehavior: a.address_info?.malicious_behavior ?? [],
        deployedTime: a.address_info?.deployed_time || null,
        creatorAddress: a.address_info?.creator_address ?? '',
      },
    })),
  }));
}

// ── Phishing Site Detection ─────────────────────────────────

export interface PhishingSiteResult {
  isPhishing: boolean;
}

/**
 * Check if a URL is a known phishing site.
 */
export async function phishingSite(url: string): Promise<PhishingSiteResult> {
  await ensureAuth();

  let data: SdkResponse<{ phishing_site: number }>;
  try {
    data = await sdk.phishingSite(url);
  } catch (err) {
    throw new ServiceError(SERVICE, err instanceof Error ? err.message : 'Phishing check failed');
  }

  if (data.code !== 1) {
    throw new ServiceError(SERVICE, data.message || 'Phishing check failed');
  }
  return { isPhishing: data.result?.phishing_site === 1 };
}

// ── dApp Security ───────────────────────────────────────────

export interface DAppSecurityResult {
  projectName: string;
  isAudit: boolean;
  trustList: boolean;
  url: string;
  auditInfo: Array<{ firm: string; link: string; time: string }>;
  contractsSecurity: Array<{
    chainId: string;
    contracts: Array<{
      address: string;
      isOpenSource: boolean;
      isMalicious: boolean;
      creatorAddress: string;
    }>;
  }>;
}

/**
 * Get security information about a dApp by URL.
 */
export async function dappSecurity(url: string): Promise<DAppSecurityResult> {
  await ensureAuth();

  let data: SdkResponse<DAppRaw>;
  try {
    data = await sdk.dappSecurity(url);
  } catch (err) {
    throw new ServiceError(SERVICE, err instanceof Error ? err.message : 'dApp security check failed');
  }

  if (data.code !== 1) {
    throw new ServiceError(SERVICE, data.message || 'dApp security check failed');
  }
  const r = data.result;
  return {
    projectName: r.project_name ?? '',
    isAudit: r.is_audit === 1,
    trustList: r.trust_list === 1,
    url: r.url ?? url,
    auditInfo: (r.audit_info ?? []).map((a) => ({
      firm: a.audit_firm,
      link: a.audit_link,
      time: a.audit_time,
    })),
    contractsSecurity: (r.contracts_security ?? []).map((cs) => ({
      chainId: cs.chain_id,
      contracts: (cs.contracts ?? []).map((c) => ({
        address: c.contract_address,
        isOpenSource: c.is_open_source === 1,
        isMalicious: c.malicious_contract === 1,
        creatorAddress: c.creator_address,
      })),
    })),
  };
}

// ── Signature Data Decode ───────────────────────────────────

export interface SignatureDecodeResult {
  method: string;
  contractName: string;
  isMaliciousContract: boolean;
  isRiskySignature: boolean;
  riskDescription: string;
  signatureDetail: string;
  params: Array<{
    name: string;
    type: string;
    value: unknown;
    addressInfo?: {
      isMalicious: boolean;
      isContract: boolean;
      name: string;
      symbol: string;
    };
  }>;
}

/**
 * Decode transaction input data and assess risk.
 */
export async function signatureDecode(params: {
  chainId: number;
  contractAddress?: string;
  data: string;
  signer?: string;
}): Promise<SignatureDecodeResult> {
  await ensureAuth();

  let resp: SdkResponse<InputDecodeRaw>;
  try {
    resp = await sdk.inputDecodeWithOpts(
      String(params.chainId),
      params.contractAddress ?? '',
      params.data,
      { signer: params.signer }
    );
  } catch (err) {
    throw new ServiceError(SERVICE, err instanceof Error ? err.message : 'Signature decode failed');
  }

  if (resp.code !== 1) {
    throw new ServiceError(SERVICE, resp.message || 'Signature decode failed');
  }
  const r = resp.result;
  return {
    method: r.method ?? '',
    contractName: r.contract_name ?? '',
    isMaliciousContract: r.malicious_contract === 1,
    isRiskySignature: r.risky_signature === 1,
    riskDescription: r.risk ?? '',
    signatureDetail: r.signature_detail ?? '',
    params: (r.params ?? []).map((p) => ({
      name: p.name,
      type: p.type,
      value: p.input,
      addressInfo: p.address_info
        ? {
            isMalicious: p.address_info.malicious_address === 1,
            isContract: p.address_info.is_contract === 1,
            name: p.address_info.name ?? '',
            symbol: p.address_info.symbol ?? '',
          }
        : undefined,
    })),
  };
}

// ── NFT Security ────────────────────────────────────────────

export interface NFTSecurityResult {
  nftName: string;
  nftSymbol: string;
  nftErc: string;
  isOpenSource: boolean;
  isProxy: boolean;
  isMalicious: boolean;
  isTrustList: boolean;
  ownerNumber: number;
  totalItems: number;
  restrictedApproval: boolean;
  transferWithoutApproval: boolean;
  privilegedMinting: boolean;
  privilegedBurn: boolean;
  oversupplyMinting: boolean;
  selfDestruct: boolean;
}

/**
 * Get NFT security data.
 */
export async function nftSecurity(
  contractAddress: string,
  chainId: number = 56,
  tokenId?: string
): Promise<NFTSecurityResult> {
  assertAddress(contractAddress);
  await ensureAuth();

  let data: SdkResponse<NftRaw>;
  try {
    data = await sdk.nftSecurity(String(chainId), contractAddress.toLowerCase(), tokenId);
  } catch (err) {
    throw new ServiceError(SERVICE, err instanceof Error ? err.message : 'NFT security lookup failed');
  }

  if (data.code !== 1) {
    throw new ServiceError(SERVICE, data.message || 'NFT security lookup failed');
  }
  const r = data.result;
  return {
    nftName: r.nft_name ?? '',
    nftSymbol: r.nft_symbol ?? '',
    nftErc: r.nft_erc ?? '',
    isOpenSource: r.nft_open_source === 1,
    isProxy: r.nft_proxy === 1,
    isMalicious: r.malicious_nft_contract === 1,
    isTrustList: r.trust_list === 1,
    ownerNumber: r.nft_owner_number ?? 0,
    totalItems: r.nft_items ?? 0,
    restrictedApproval: r.restricted_approval === 1,
    transferWithoutApproval: r.transfer_without_approval?.value === 1,
    privilegedMinting: r.privileged_minting?.value === 1,
    privilegedBurn: r.privileged_burn?.value === 1,
    oversupplyMinting: r.oversupply_minting === 1,
    selfDestruct: r.self_destruct?.value === 1,
  };
}

// ── Re-export convenience aliases ───────────────────────────

/** @deprecated Use tokenSecurity() instead */
export const checkTokenSecurity = tokenSecurity;
/** @deprecated Use addressSecurity() instead */
export const checkAddressSecurity = addressSecurity;
