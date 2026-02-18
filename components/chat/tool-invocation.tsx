'use client';

import { getToolName } from 'ai';
import type { ComponentProps, ReactNode } from 'react';
import { useState, useEffect, useRef } from 'react';
import { Loader2, ChevronDown, ChevronRight, CheckCircle, XCircle, Code2, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SecurityReport } from '@/components/results/security-report';
import { BalanceCard } from '@/components/results/balance-card';
import { SwapPreview } from '@/components/results/swap-preview';
import { ApprovalList } from '@/components/results/approval-list';
import { TransactionPreview } from '@/components/results/transaction-preview';
import { TokenInfoCard } from '@/components/results/token-info-card';
import { AddressAnalysisCard } from '@/components/results/address-analysis-card';
import { HealthReportCard } from '@/components/results/health-report-card';
import { OnchainProofCard, VerifyReportCard } from '@/components/results/onchain-proof-card';
import { SimulationCard } from '@/components/results/simulation-card';
import { PersonaCard } from '@/components/results/persona-card';
import { TokenRadarCard } from '@/components/results/token-radar-card';
import { TxPlanCard } from '@/components/results/tx-plan-card';
import { PhishingCard } from '@/components/results/phishing-card';
import { DappSecurityCard } from '@/components/results/dapp-security-card';
import { TxDecodeCard } from '@/components/results/tx-decode-card';
import { TokenSearchCard } from '@/components/results/token-search-card';
import { NftSecurityCard } from '@/components/results/nft-security-card';
import { ApprovalRiskCard } from '@/components/results/approval-risk-card';
import { GasPriceCard } from '@/components/results/gas-price-card';
import { ContractInfoCard } from '@/components/results/contract-info-card';
import { TransferHistoryCard } from '@/components/results/transfer-history-card';
import { LiquidityCard } from '@/components/results/liquidity-card';
import { BinanceTickerCard } from '@/components/results/binance-ticker-card';
import { KlineChartCard } from '@/components/results/kline-chart-card';
import { TechnicalAnalysisCard } from '@/components/results/technical-analysis-card';
import { DeepAnalysisCard } from '@/components/results/deep-analysis-card';
import { ContractVerificationCard } from '@/components/results/contract-verification-card';
import { InputFormModal } from '@/components/results/input-form-modal';
import { CodeViewerModal } from '@/components/ui/code-viewer-modal';

type ToolPart = Parameters<typeof getToolName>[0];
type SecurityReportData = ComponentProps<typeof SecurityReport>['data'];
type BalanceCardData = ComponentProps<typeof BalanceCard>['data'];
type SwapPreviewData = ComponentProps<typeof SwapPreview>['data'];
type ApprovalListData = ComponentProps<typeof ApprovalList>['data'];
type TransactionPreviewData = ComponentProps<typeof TransactionPreview>['data'];
type TokenInfoCardData = ComponentProps<typeof TokenInfoCard>['data'];
type AddressAnalysisCardData = ComponentProps<typeof AddressAnalysisCard>['data'];
type HealthReportCardData = ComponentProps<typeof HealthReportCard>['data'];
type OnchainProofCardData = ComponentProps<typeof OnchainProofCard>['data'];
type VerifyReportCardData = ComponentProps<typeof VerifyReportCard>['data'];
type SimulationCardData = ComponentProps<typeof SimulationCard>['data'];
type PersonaCardData = ComponentProps<typeof PersonaCard>['data'];
type TokenRadarCardData = ComponentProps<typeof TokenRadarCard>['data'];
type TxPlanCardData = ComponentProps<typeof TxPlanCard>['data'];
type PhishingCardData = ComponentProps<typeof PhishingCard>['data'];
type DappSecurityCardData = ComponentProps<typeof DappSecurityCard>['data'];
type TxDecodeCardData = ComponentProps<typeof TxDecodeCard>['data'];
type TokenSearchCardData = ComponentProps<typeof TokenSearchCard>['data'];
type NftSecurityCardData = ComponentProps<typeof NftSecurityCard>['data'];
type ApprovalRiskCardData = ComponentProps<typeof ApprovalRiskCard>['data'];
type GasPriceCardData = ComponentProps<typeof GasPriceCard>['data'];
type ContractInfoCardData = ComponentProps<typeof ContractInfoCard>['data'];
type TransferHistoryCardData = ComponentProps<typeof TransferHistoryCard>['data'];
type LiquidityCardData = ComponentProps<typeof LiquidityCard>['data'];
type BinanceTickerCardData = ComponentProps<typeof BinanceTickerCard>['data'];
type KlineChartCardData = ComponentProps<typeof KlineChartCard>['data'];
type TechnicalAnalysisCardData = ComponentProps<typeof TechnicalAnalysisCard>['data'];
type DeepAnalysisCardData = ComponentProps<typeof DeepAnalysisCard>['data'];
type ContractVerificationCardData = ComponentProps<typeof ContractVerificationCard>['data'];
type InputFormModalData = ComponentProps<typeof InputFormModal>['data'];

// ── i18n: tool labels ──────────────────────────────────────────

const TOOL_LABELS_EN: Record<string, string> = {
  tokenSecurity: 'Token security check',
  balanceQuery: 'Wallet balance',
  tokenInfo: 'Market data',
  buildTransfer: 'Transfer transaction',
  buildSwap: 'Swap quote',
  scanApprovals: 'Approval scan',
  revokeApproval: 'Revoke transaction',
  walletHealth: 'Wallet health',
  addressAnalysis: 'Address analysis',
  storeReport: 'On-chain proof',
  verifyReport: 'Report verification',
  simulateTx: 'Transaction simulation',
  walletPersona: 'Wallet persona',
  newTokenRadar: 'New token radar',
  buildContractCall: 'Contract call',
  compileContractDeploy: 'Contract deploy',
  deployToken: 'Token deploy',
  checkPhishing: 'Phishing check',
  checkDapp: 'dApp security',
  decodeTransaction: 'Transaction decode',
  searchTokenByName: 'Token search',
  checkNft: 'NFT security',
  checkApprovalRisk: 'Approval risk',
  checkGasPrice: 'Gas price',
  inspectContract: 'Contract info',
  getTokenTransferHistory: 'Transfer history',
  checkLiquidity: 'Pair liquidity',
  checkPairReserves: 'Pool reserves',
  binanceTicker: 'Binance 24h ticker',
  binanceKlines: 'K-line chart',
  technicalAnalysis: 'Technical analysis',
  deepTokenAnalysis: 'Deep analysis',
  verifyContract: 'Contract verification',
  collectUserInput: 'Input form',
};

const TOOL_LABELS_ZH: Record<string, string> = {
  tokenSecurity: '代币安全检测',
  balanceQuery: '钱包余额',
  tokenInfo: '行情数据',
  buildTransfer: '转账交易',
  buildSwap: '兑换报价',
  scanApprovals: '授权扫描',
  revokeApproval: '撤销授权',
  walletHealth: '钱包体检',
  addressAnalysis: '地址分析',
  storeReport: '链上存证',
  verifyReport: '报告验证',
  simulateTx: '交易模拟',
  walletPersona: '钱包画像',
  newTokenRadar: '新币雷达',
  buildContractCall: '合约调用',
  compileContractDeploy: '合约部署',
  deployToken: '代币部署',
  checkPhishing: '钓鱼检测',
  checkDapp: 'dApp 安全',
  decodeTransaction: '交易解码',
  searchTokenByName: '代币搜索',
  checkNft: 'NFT 安全',
  checkApprovalRisk: '授权风险',
  checkGasPrice: 'Gas 费用',
  inspectContract: '合约信息',
  getTokenTransferHistory: '转账记录',
  checkLiquidity: '交易对流动性',
  checkPairReserves: '池子储备',
  binanceTicker: '币安24h行情',
  binanceKlines: 'K线图',
  technicalAnalysis: '技术分析',
  deepTokenAnalysis: '深度分析',
  verifyContract: '合约验证',
  collectUserInput: '信息收集',
};

const LOADING_LABELS_EN: Record<string, string> = {
  tokenSecurity: 'Checking token security…',
  balanceQuery: 'Querying wallet balance…',
  tokenInfo: 'Fetching market data…',
  buildTransfer: 'Building transfer…',
  buildSwap: 'Getting swap quote…',
  scanApprovals: 'Scanning approvals…',
  revokeApproval: 'Building revoke tx…',
  walletHealth: 'Running health scan…',
  addressAnalysis: 'Analyzing address…',
  storeReport: 'Building proof tx…',
  verifyReport: 'Verifying report…',
  simulateTx: 'Simulating transaction…',
  walletPersona: 'Analyzing wallet…',
  newTokenRadar: 'Scanning new tokens…',
  buildContractCall: 'Building contract call…',
  compileContractDeploy: 'Compiling & preparing deploy…',
  deployToken: 'Compiling ERC20…',
  checkPhishing: 'Checking for phishing…',
  checkDapp: 'Checking dApp security…',
  decodeTransaction: 'Decoding transaction…',
  searchTokenByName: 'Searching tokens…',
  checkNft: 'Checking NFT security…',
  checkApprovalRisk: 'Analyzing approvals…',
  checkGasPrice: 'Fetching gas prices…',
  inspectContract: 'Inspecting contract…',
  getTokenTransferHistory: 'Loading transfers…',
  checkLiquidity: 'Checking liquidity…',
  checkPairReserves: 'Fetching reserves…',
  binanceTicker: 'Fetching Binance data…',
  binanceKlines: 'Loading K-line data…',
  technicalAnalysis: 'Computing indicators…',
  deepTokenAnalysis: 'Running deep analysis…',
  verifyContract: 'Verifying contract…',
  collectUserInput: 'Preparing form…',
};

const LOADING_LABELS_ZH: Record<string, string> = {
  tokenSecurity: '正在检测代币安全…',
  balanceQuery: '正在查询余额…',
  tokenInfo: '正在获取行情…',
  buildTransfer: '正在构建转账…',
  buildSwap: '正在获取报价…',
  scanApprovals: '正在扫描授权…',
  revokeApproval: '正在构建撤销交易…',
  walletHealth: '正在进行钱包体检…',
  addressAnalysis: '正在分析地址…',
  storeReport: '正在构建存证交易…',
  verifyReport: '正在验证报告…',
  simulateTx: '正在模拟交易…',
  walletPersona: '正在分析钱包画像…',
  newTokenRadar: '正在扫描新币…',
  buildContractCall: '正在构建合约调用…',
  compileContractDeploy: '正在编译并准备部署…',
  deployToken: '正在编译 ERC20 合约…',
  checkPhishing: '正在检测钓鱼风险…',
  checkDapp: '正在检测 dApp 安全…',
  decodeTransaction: '正在解码交易…',
  searchTokenByName: '正在搜索代币…',
  checkNft: '正在检测 NFT 安全…',
  checkApprovalRisk: '正在分析授权风险…',
  checkGasPrice: '正在获取 Gas 费用…',
  inspectContract: '正在检查合约…',
  getTokenTransferHistory: '正在加载转账记录…',
  checkLiquidity: '正在检查流动性…',
  checkPairReserves: '正在获取储备数据…',
  binanceTicker: '正在获取币安行情…',
  binanceKlines: '正在加载K线数据…',
  technicalAnalysis: '正在计算技术指标…',
  deepTokenAnalysis: '正在进行深度分析…',
  verifyContract: '正在验证合约…',
  collectUserInput: '正在准备表单…',
};

function getToolLabel(toolName: string, locale: string): string {
  const labels = locale === 'zh' ? TOOL_LABELS_ZH : TOOL_LABELS_EN;
  return labels[toolName] ?? toolName;
}

function getLoadingLabel(toolName: string, locale: string): string {
  const labels = locale === 'zh' ? LOADING_LABELS_ZH : LOADING_LABELS_EN;
  return labels[toolName] ?? (locale === 'zh' ? `正在执行 ${toolName}…` : `Running ${toolName}…`);
}

/** Tools whose output is a tx_plan that requires wallet signing */
const TX_TOOLS = new Set([
  'buildTransfer',
  'buildSwap',
  'revokeApproval',
  'buildContractCall',
  'compileContractDeploy',
  'deployToken',
  'storeReport',
]);

/** Tools that require user interaction (signing/form) — always show inline, never collapse */
const INTERACTIVE_TOOLS = new Set([
  ...TX_TOOLS,
  'deepTokenAnalysis',
  'collectUserInput',
]);

// ── Loading context from tool args ──────────────────────────

function shortenAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function getLoadingContext(toolName: string, input: Record<string, unknown> | undefined, locale: string): ReactNode {
  if (!input) return null;

  switch (toolName) {
    case 'compileContractDeploy': {
      const source = input.sourceCode as string | undefined;
      const name = input.contractName as string | undefined;
      if (!source) return null;
      return (
        <LoadingCodePreview
          label={name ? `${name}.sol` : 'Contract.sol'}
          code={source}
          locale={locale}
        />
      );
    }
    case 'deployToken': {
      const name = input.name as string | undefined;
      const symbol = input.symbol as string | undefined;
      const supply = input.totalSupply as string | undefined;
      if (!name) return null;
      return (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{name}{symbol ? ` (${symbol})` : ''}</span>
          {supply && <span>Supply: {supply}</span>}
        </div>
      );
    }
    case 'tokenSecurity':
    case 'tokenInfo': {
      const addr = input.address as string | undefined;
      if (!addr) return null;
      return <span className="ml-1 font-mono text-xs text-muted-foreground/60">{shortenAddr(addr)}</span>;
    }
    case 'balanceQuery':
    case 'walletHealth':
    case 'walletPersona':
    case 'scanApprovals':
    case 'checkApprovalRisk': {
      const addr = (input.walletAddress ?? input.address) as string | undefined;
      if (!addr) return null;
      return <span className="ml-1 font-mono text-xs text-muted-foreground/60">{shortenAddr(addr)}</span>;
    }
    case 'buildSwap': {
      const tIn = input.tokenIn as string | undefined;
      const tOut = input.tokenOut as string | undefined;
      const amt = (input.amountIn ?? input.amountOut) as string | undefined;
      if (!tIn || !tOut) return null;
      const inLabel = tIn.toUpperCase() === 'BNB' ? 'BNB' : shortenAddr(tIn);
      const outLabel = tOut.toUpperCase() === 'BNB' ? 'BNB' : shortenAddr(tOut);
      return (
        <span className="ml-1 text-xs text-muted-foreground/60">
          {amt ? `${amt} ` : ''}{inLabel} → {outLabel}
        </span>
      );
    }
    case 'buildTransfer': {
      const to = input.to as string | undefined;
      const amount = input.amount as string | undefined;
      if (!to) return null;
      return (
        <span className="ml-1 text-xs text-muted-foreground/60">
          {amount ? `${amount} → ` : ''}{shortenAddr(to)}
        </span>
      );
    }
    case 'addressAnalysis': {
      const addr = input.address as string | undefined;
      if (!addr) return null;
      return <span className="ml-1 font-mono text-xs text-muted-foreground/60">{shortenAddr(addr)}</span>;
    }
    case 'checkPhishing':
    case 'checkDapp': {
      const url = input.url as string | undefined;
      if (!url) return null;
      const display = url.length > 40 ? url.slice(0, 37) + '…' : url;
      return <span className="ml-1 text-xs text-muted-foreground/60 truncate max-w-[200px]" title={url}>{display}</span>;
    }
    case 'searchTokenByName': {
      const q = input.query as string | undefined;
      if (!q) return null;
      return <span className="ml-1 text-xs text-muted-foreground/60">"{q}"</span>;
    }
    case 'inspectContract':
    case 'checkNft': {
      const addr = (input.address ?? input.contractAddress) as string | undefined;
      if (!addr) return null;
      return <span className="ml-1 font-mono text-xs text-muted-foreground/60">{shortenAddr(addr)}</span>;
    }
    case 'deepTokenAnalysis': {
      const addr = input.tokenAddress as string | undefined;
      if (!addr) return null;
      return <span className="ml-1 font-mono text-xs text-muted-foreground/60">{shortenAddr(addr)}</span>;
    }
    case 'verifyContract': {
      const addr = input.address as string | undefined;
      const name = input.contractName as string | undefined;
      if (!addr) return null;
      return (
        <span className="ml-1 text-xs text-muted-foreground/60">
          {name ? `${name} ` : ''}{shortenAddr(addr)}
        </span>
      );
    }
    case 'binanceTicker':
    case 'binanceKlines':
    case 'technicalAnalysis': {
      const sym = input.symbol as string | undefined;
      if (!sym) return null;
      return <span className="ml-1 text-xs text-muted-foreground/60">{sym.toUpperCase()}</span>;
    }
    default:
      return null;
  }
}

/** Button + modal code preview shown during compile loading */
function LoadingCodePreview({ label, code, locale }: { label: string; code: string; locale: string }) {
  const [open, setOpen] = useState(false);
  const lineCount = code.split('\n').length;

  return (
    <div className="mt-2 w-full">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors"
      >
        <Code2 className="size-3 shrink-0 text-primary" />
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground/60">({lineCount} {locale === 'zh' ? '行' : 'lines'})</span>
        <span className="ml-auto text-primary text-[10px] font-medium shrink-0">
          {locale === 'zh' ? '查看源码' : 'View Source'}
        </span>
      </button>
      <CodeViewerModal
        open={open}
        onOpenChange={setOpen}
        code={code}
        fileName={label}
        locale={locale}
      />
    </div>
  );
}

// ── Tool summary for collapsed badge ────────────────────────

function getToolSummary(toolName: string, output: Record<string, unknown>, locale: string): string {
  switch (toolName) {
    case 'tokenSecurity': {
      const level = output.riskLevel as string;
      const name = output.tokenName as string;
      const label = name || (locale === 'zh' ? '代币' : 'Token');
      if (level === 'safe') return locale === 'zh' ? `${label}: 安全` : `${label}: Safe`;
      if (level === 'danger') return locale === 'zh' ? `${label}: 危险` : `${label}: Danger`;
      return locale === 'zh' ? `${label}: 需注意` : `${label}: Warning`;
    }
    case 'tokenInfo': {
      const price = output.priceUsd as number;
      const symbol = output.symbol as string;
      return price ? `${symbol}: $${price.toFixed(4)}` : `${symbol || 'Token'} ✓`;
    }
    case 'balanceQuery': {
      const balances = output.balances as Array<{ symbol: string; balance: string }> | undefined;
      if (!balances?.length) return locale === 'zh' ? '无持仓' : 'No tokens found';
      return balances.slice(0, 3).map((b) => `${b.balance} ${b.symbol}`).join(', ');
    }
    case 'walletHealth': {
      const score = output.score as number;
      const level = output.level as string;
      return `${score}/100 (${level})`;
    }
    case 'checkPhishing': {
      const isPhishing = output.isPhishing as boolean;
      return isPhishing
        ? (locale === 'zh' ? '检测到钓鱼!' : 'Phishing detected!')
        : (locale === 'zh' ? '安全' : 'Safe');
    }
    case 'checkGasPrice': {
      const safe = output.safeGasPrice as string;
      return safe ? `Safe: ${safe}` : '✓';
    }
    case 'walletPersona': {
      const persona = output.persona as string;
      const emoji = output.emoji as string;
      return `${emoji || ''} ${persona || (locale === 'zh' ? '画像就绪' : 'Ready')}`.trim();
    }
    case 'searchTokenByName': {
      const results = output.results as Array<unknown> | undefined;
      if (!results?.length) return locale === 'zh' ? '无结果' : 'No results';
      return locale === 'zh' ? `找到 ${results.length} 个` : `${results.length} found`;
    }
    case 'addressAnalysis': {
      const isMalicious = (output.security as Record<string, unknown> | null)?.isMalicious as boolean | undefined;
      if (isMalicious) return locale === 'zh' ? '已标记为恶意!' : 'Flagged malicious!';
      const count = output.recentTransactionCount as number;
      return locale === 'zh' ? `${count} 笔近期交易` : `${count} recent txs`;
    }
    case 'scanApprovals': {
      const total = output.totalApprovals as number;
      const risky = output.unlimitedApprovals as number;
      if (risky > 0) return locale === 'zh' ? `${total} 个授权 (${risky} 风险)` : `${total} approvals (${risky} risky)`;
      return locale === 'zh' ? `${total} 个授权` : `${total} approvals`;
    }
    case 'checkNft': {
      const level = output.riskLevel as string;
      if (level === 'danger') return locale === 'zh' ? '危险' : 'Danger';
      if (level === 'warning') return locale === 'zh' ? '需注意' : 'Warning';
      return locale === 'zh' ? '安全' : 'Safe';
    }
    case 'checkDapp': {
      const trust = output.trustList as boolean;
      if (trust) return locale === 'zh' ? '已信任' : 'Trusted';
      const audit = output.isAudit as boolean;
      if (audit) return locale === 'zh' ? '已审计' : 'Audited';
      return locale === 'zh' ? '未审计' : 'Not audited';
    }
    case 'simulateTx': {
      const sim = output.simulation as Record<string, unknown> | undefined;
      if (!sim) return '✓';
      const ok = sim.wouldSucceed as boolean;
      return ok
        ? (locale === 'zh' ? '模拟成功' : 'Would succeed')
        : (locale === 'zh' ? '会失败' : 'Would revert');
    }
    case 'inspectContract': {
      const verified = output.isVerified as boolean;
      const name = output.contractName as string;
      if (!verified) return locale === 'zh' ? '未验证' : 'Not verified';
      return name || (locale === 'zh' ? '已验证' : 'Verified');
    }
    case 'checkApprovalRisk': {
      const risky = output.riskySpenders as Array<unknown> | undefined;
      if (risky?.length) return locale === 'zh' ? `${risky.length} 个风险` : `${risky.length} risky`;
      return locale === 'zh' ? '正常' : 'Clean';
    }
    case 'getTokenTransferHistory': {
      const count = output.totalFound as number;
      return locale === 'zh' ? `${count ?? 0} 笔` : `${count ?? 0} transfers`;
    }
    case 'checkLiquidity':
    case 'checkPairReserves': {
      const liq = output.liquidityFormatted as string;
      return liq || '✓';
    }
    case 'binanceTicker': {
      const sym = output.symbol as string;
      const price = output.lastPrice as number;
      const pct = output.priceChangePercent as number;
      const sign = pct >= 0 ? '+' : '';
      return price ? `${sym}: $${price.toFixed(2)} (${sign}${pct?.toFixed(2)}%)` : `${sym} ✓`;
    }
    case 'binanceKlines': {
      const sym = output.symbol as string;
      const intv = output.interval as string;
      const cnt = output.count as number;
      return `${sym} ${intv} / ${cnt} candles`;
    }
    case 'technicalAnalysis': {
      const sym = output.symbol as string;
      const sig = output.overallSignal as string;
      const sigMap: Record<string, Record<string, string>> = {
        zh: { bullish: '看涨', bearish: '看跌', neutral: '中性' },
        en: { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' },
      };
      const labels = sigMap[locale] ?? sigMap.en;
      return `${sym}: ${labels[sig] ?? sig}`;
    }
    case 'deepTokenAnalysis': {
      const name = output.tokenName as string;
      const score = output.riskScore as number | null;
      const label = name || (locale === 'zh' ? '代币' : 'Token');
      if (score != null) {
        const risk = score <= 30 ? (locale === 'zh' ? '低风险' : 'Low') : score <= 60 ? (locale === 'zh' ? '中风险' : 'Medium') : (locale === 'zh' ? '高风险' : 'High');
        return `${label}: ${score}/100 (${risk})`;
      }
      return label;
    }
    case 'verifyContract': {
      const status = output.verificationStatus as string;
      const name = output.contractName as string;
      const label = name || (locale === 'zh' ? '合约' : 'Contract');
      if (status === 'verified') return locale === 'zh' ? `${label}: 已验证` : `${label}: Verified`;
      if (status === 'timeout') return locale === 'zh' ? `${label}: 超时` : `${label}: Timed out`;
      return locale === 'zh' ? `${label}: 失败` : `${label}: Failed`;
    }
    case 'buildTransfer':
    case 'buildSwap':
    case 'revokeApproval':
    case 'buildContractCall':
    case 'compileContractDeploy':
    case 'deployToken':
    case 'storeReport':
      return locale === 'zh' ? '待签名' : 'Awaiting signature';
    default:
      return locale === 'zh' ? '完成' : 'Done';
  }
}

/** Detect high-risk output that should auto-expand instead of collapse */
function isHighRisk(output: Record<string, unknown>): boolean {
  if (output.riskLevel === 'danger') return true;
  if (output.isPhishing === true) return true;
  if (output.isMalicious === true) return true;
  const security = output.security as Record<string, unknown> | null | undefined;
  if (security?.isMalicious === true) return true;
  const sim = output.simulation as Record<string, unknown> | null | undefined;
  if (sim && sim.wouldSucceed === false) return true;
  return false;
}

// ── Main component ──────────────────────────────────────────

export interface ToolInvocationProps {
  toolInvocation: ToolPart;
  conversationId?: string;
  locale?: string;
  readOnly?: boolean;
  stepLabel?: string;
}

export function ToolInvocation({ toolInvocation, conversationId, locale = 'en', readOnly, stepLabel }: ToolInvocationProps) {
  const toolName = getToolName(toolInvocation);
  const txStateKey =
    !readOnly &&
    'toolCallId' in toolInvocation &&
    typeof toolInvocation.toolCallId === 'string'
      ? `${conversationId ?? 'local'}:${toolInvocation.toolCallId}`
      : undefined;
  const isDone = toolInvocation.state === 'output-available';
  const isError = toolInvocation.state === 'output-error';
  const [expanded, setExpanded] = useState(false);

  // Delay showing errors by ~1s so that retry tool calls have time to arrive
  // and filter out this error in the parent. If this component unmounts before
  // the timer fires (because the parent filter removed it), the error is never shown.
  const hasOutputError = isDone &&
    toolInvocation.output != null &&
    typeof toolInvocation.output === 'object' &&
    'error' in (toolInvocation.output as Record<string, unknown>) &&
    Boolean((toolInvocation.output as Record<string, unknown>).error);
  const isAnyError = isError || hasOutputError;
  const [errorVisible, setErrorVisible] = useState(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isAnyError) {
      errorTimerRef.current = setTimeout(() => setErrorVisible(true), 1000);
      return () => {
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      };
    }
    setErrorVisible(false);
  }, [isAnyError]);

  // Error state — hidden until delay expires
  if (isError && 'errorText' in toolInvocation) {
    if (!errorVisible) return null;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        <XCircle className="size-3.5 shrink-0" />
        <span className="font-medium">{getToolLabel(toolName, locale)}</span>
        <span className="truncate text-red-400">— {toolInvocation.errorText}</span>
      </div>
    );
  }

  // Loading state — show with tool args context
  if (!isDone) {
    // Deep analysis: render real-time progress card instead of generic loading pill
    if (toolName === 'deepTokenAnalysis') {
      const input = 'input' in toolInvocation
        ? (toolInvocation.input as Record<string, unknown> | undefined)
        : undefined;
      return (
        <DeepAnalysisCard
          isLoading
          locale={locale}
          input={input as { tokenAddress?: string } | undefined}
          chatId={conversationId}
        />
      );
    }

    const input = 'input' in toolInvocation
      ? (toolInvocation.input as Record<string, unknown> | undefined)
      : undefined;
    const context = getLoadingContext(toolName, input, locale);
    const hasCodePreview = toolName === 'compileContractDeploy' && context;

    return (
      <div className={`rounded-lg border border-ring/30 bg-primary/10 px-3 py-2 text-xs text-muted-foreground animate-pulse-glow transition-shadow duration-200 hover:shadow-md ${hasCodePreview ? '' : 'flex items-center gap-2'}`}>
        <div className="flex items-center gap-2">
          <Loader2 className="size-3.5 shrink-0 animate-spin icon-spin text-primary" />
          <span>{getLoadingLabel(toolName, locale)}</span>
          {stepLabel && <span className="ml-auto text-xs text-muted-foreground/60">{stepLabel}</span>}
          {!hasCodePreview && context}
        </div>
        {hasCodePreview && context}
      </div>
    );
  }

  const output = toolInvocation.output as Record<string, unknown> | undefined;
  if (!output || typeof output !== 'object') {
    return <FallbackResult data={output} />;
  }

  // Server-side hidden output — the model explains the error in text instead
  if (output._hidden) return null;

  // Tool returned error in output (legacy/fallback) — hidden until delay expires
  if ('error' in output && output.error) {
    if (!errorVisible) return null;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        <XCircle className="size-3.5 shrink-0" />
        <span className="font-medium">{getToolLabel(toolName, locale)}</span>
        <span className="truncate text-red-400">— {String(output.error).slice(0, 80)}</span>
      </div>
    );
  }

  // Build the full card
  const fullCard = renderFullCard(toolName, output, txStateKey, conversationId, readOnly, locale);

  // Interactive tools (need signing) — always show full inline
  if (INTERACTIVE_TOOLS.has(toolName)) {
    return (
      <div>
        {stepLabel && <div className="mb-1 text-xs text-muted-foreground/60">{stepLabel}</div>}
        {fullCard}
      </div>
    );
  }

  // High-risk results — auto-expand inline, no collapse
  if (isHighRisk(output)) {
    return (
      <div>
        {stepLabel && <div className="mb-1 text-xs text-muted-foreground/60">{stepLabel}</div>}
        <div className="rounded-lg border border-red-500/30 bg-red-500/8 p-0.5">
          {fullCard}
        </div>
      </div>
    );
  }

  // Completed read-only tools — inline collapsible (not dialog)
  const summary = getToolSummary(toolName, output, locale);

  return (
    <div>
      {stepLabel && <div className="mb-1 text-xs text-muted-foreground/60">{stepLabel}</div>}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="tool-card-transition flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-xs shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-ring/40 hover:bg-primary/10 hover:shadow-md"
      >
        <CheckCircle className="size-3.5 shrink-0 text-emerald-500" />
        <span className="font-medium text-foreground">{getToolLabel(toolName, locale)}</span>
        <span className="min-w-0 truncate text-muted-foreground">{summary}</span>
        {expanded ? (
          <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground/60" />
        ) : (
          <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground/60" />
        )}
      </button>

      {expanded && (
        <div className="animate-expand-in mt-2 rounded-lg border border-border/50 bg-card p-3 shadow-sm transition-shadow duration-200 hover:shadow-md">
          {fullCard}
        </div>
      )}
    </div>
  );
}

// ── Card renderer ───────────────────────────────────────────

function renderFullCard(
  toolName: string,
  output: Record<string, unknown>,
  txStateKey?: string,
  conversationId?: string,
  readOnly?: boolean,
  locale = 'en',
): ReactNode {
  switch (toolName) {
    case 'getUserContext':
      return null;
    case 'tokenSecurity':
      return <SecurityReport data={output as unknown as SecurityReportData} locale={locale} />;
    case 'balanceQuery':
      return <BalanceCard data={output as unknown as BalanceCardData} locale={locale} />;
    case 'tokenInfo':
      return <TokenInfoCard data={output as unknown as TokenInfoCardData} locale={locale} />;
    case 'buildTransfer':
    case 'revokeApproval':
      return (
        <TransactionPreview
          data={output as unknown as TransactionPreviewData}
          txStateKey={txStateKey}
          conversationId={conversationId}
          readOnly={readOnly}
          locale={locale}
        />
      );
    case 'buildContractCall':
    case 'compileContractDeploy':
    case 'deployToken':
      return (
        <TxPlanCard
          data={output as unknown as TxPlanCardData}
          txStateKey={txStateKey}
          conversationId={conversationId}
          readOnly={readOnly}
          locale={locale}
        />
      );
    case 'buildSwap':
      return (
        <SwapPreview
          data={output as unknown as SwapPreviewData}
          txStateKey={txStateKey}
          conversationId={conversationId}
          readOnly={readOnly}
          locale={locale}
        />
      );
    case 'scanApprovals':
      return <ApprovalList data={output as unknown as ApprovalListData} locale={locale} />;
    case 'walletHealth':
      return <HealthReportCard data={output as unknown as HealthReportCardData} locale={locale} />;
    case 'addressAnalysis':
      return <AddressAnalysisCard data={output as unknown as AddressAnalysisCardData} locale={locale} />;
    case 'storeReport':
      return (
        <OnchainProofCard
          data={output as unknown as OnchainProofCardData}
          txStateKey={txStateKey}
          conversationId={conversationId}
          readOnly={readOnly}
          locale={locale}
        />
      );
    case 'verifyReport':
      return <VerifyReportCard data={output as unknown as VerifyReportCardData} locale={locale} />;
    case 'simulateTx':
      return <SimulationCard data={output as unknown as SimulationCardData} locale={locale} />;
    case 'walletPersona':
      return <PersonaCard data={output as unknown as PersonaCardData} locale={locale} />;
    case 'newTokenRadar':
      return <TokenRadarCard data={output as unknown as TokenRadarCardData} locale={locale} />;
    case 'checkPhishing':
      return <PhishingCard data={output as unknown as PhishingCardData} locale={locale} />;
    case 'checkDapp':
      return <DappSecurityCard data={output as unknown as DappSecurityCardData} locale={locale} />;
    case 'decodeTransaction':
      return <TxDecodeCard data={output as unknown as TxDecodeCardData} locale={locale} />;
    case 'searchTokenByName':
      return <TokenSearchCard data={output as unknown as TokenSearchCardData} locale={locale} />;
    case 'checkNft':
      return <NftSecurityCard data={output as unknown as NftSecurityCardData} locale={locale} />;
    case 'checkApprovalRisk':
      return <ApprovalRiskCard data={output as unknown as ApprovalRiskCardData} locale={locale} />;
    case 'checkGasPrice':
      return <GasPriceCard data={output as unknown as GasPriceCardData} locale={locale} />;
    case 'inspectContract':
      return <ContractInfoCard data={output as unknown as ContractInfoCardData} locale={locale} />;
    case 'getTokenTransferHistory':
      return <TransferHistoryCard data={output as unknown as TransferHistoryCardData} locale={locale} />;
    case 'checkLiquidity':
    case 'checkPairReserves':
      return <LiquidityCard data={output as unknown as LiquidityCardData} locale={locale} />;
    case 'binanceTicker':
      return <BinanceTickerCard data={output as unknown as BinanceTickerCardData} locale={locale} />;
    case 'binanceKlines':
      return <KlineChartCard data={output as unknown as KlineChartCardData} locale={locale} />;
    case 'technicalAnalysis':
      return <TechnicalAnalysisCard data={output as unknown as TechnicalAnalysisCardData} locale={locale} />;
    case 'deepTokenAnalysis':
      return <DeepAnalysisCard data={output as unknown as DeepAnalysisCardData} locale={locale} chatId={conversationId} />;
    case 'verifyContract':
      return <ContractVerificationCard data={output as unknown as ContractVerificationCardData} locale={locale} />;
    case 'collectUserInput':
      return (
        <InputFormModal
          data={output as unknown as InputFormModalData}
          conversationId={conversationId}
          readOnly={readOnly}
          locale={locale}
        />
      );
    default:
      return <FallbackResult data={output} />;
  }
}

function FallbackResult({ data }: { data: unknown }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <pre className="text-xs overflow-x-auto p-3 rounded-lg bg-muted">
          {JSON.stringify(data, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}

// ── Exports for CardPanel / CompactCardView ─────────────────
export { getToolLabel, getToolSummary, getLoadingLabel, INTERACTIVE_TOOLS, TX_TOOLS, isHighRisk, renderFullCard };
export type { ToolPart };
