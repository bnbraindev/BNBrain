'use client';

import { useMemo, memo } from 'react';
import type { UIMessage } from 'ai';
import { isToolUIPart, getToolName } from 'ai';
import { Sparkles } from 'lucide-react';

interface SuggestedRepliesProps {
  messages: UIMessage[];
  isStreaming: boolean;
  locale: 'en' | 'zh';
  onSelect: (text: string) => void;
}

type Suggestion = {
  en: string;
  zh: string;
  action?: 'verify-contract';
};

/**
 * Map from tool name → follow-up suggestions.
 * Falls back to GENERIC_SUGGESTIONS if no tool match.
 */
const TOOL_SUGGESTIONS: Record<string, Suggestion[]> = {
  // --- 13 original tools (keys fixed to production names) ---
  tokenSecurity: [
    { en: 'Check my token approvals', zh: '查看我的代币授权' },
    { en: "What's the price?", zh: '价格是多少？' },
    { en: 'Scan another token', zh: '扫描另一个代币' },
  ],
  balanceQuery: [
    { en: 'Run a wallet health check', zh: '做一次钱包体检' },
    { en: 'Check my token approvals', zh: '查看授权' },
    { en: 'Check a token security', zh: '检查代币安全' },
  ],
  walletHealth: [
    { en: 'Check my token approvals', zh: '查看我的代币授权' },
    { en: 'Analyze my wallet personality', zh: '分析我的钱包人格' },
    { en: 'Show my balance', zh: '查看余额' },
  ],
  scanApprovals: [
    { en: 'Revoke risky approvals', zh: '撤销高风险授权' },
    { en: 'Run a wallet health check', zh: '做一次钱包体检' },
    { en: 'Check a specific token', zh: '检查某个代币' },
  ],
  tokenInfo: [
    { en: "Check this token's security", zh: '检查这个代币安全性' },
    { en: 'Swap this token', zh: '兑换这个代币' },
    { en: 'Search for another token', zh: '搜索另一个代币' },
  ],
  searchTokenByName: [
    { en: "Check this token's security", zh: '检查这个代币安全性' },
    { en: 'What is the current price?', zh: '当前价格是多少？' },
    { en: 'Show liquidity info', zh: '显示流动性信息' },
  ],
  buildSwap: [
    { en: 'Execute this swap', zh: '执行这笔兑换' },
    { en: 'Check the token security first', zh: '先检查代币安全性' },
    { en: 'Try a different amount', zh: '换一个金额试试' },
  ],
  addressAnalysis: [
    { en: "Check this address's balance", zh: '查看这个地址的余额' },
    { en: 'Show transaction history', zh: '显示交易历史' },
    { en: 'Analyze another address', zh: '分析另一个地址' },
  ],
  getTokenTransferHistory: [
    { en: 'Analyze this address', zh: '分析这个地址' },
    { en: 'Check wallet balance', zh: '查看钱包余额' },
    { en: 'Run a security scan', zh: '运行安全扫描' },
  ],
  newTokenRadar: [
    { en: 'Check one of these tokens', zh: '检查其中一个代币' },
    { en: 'Which ones look safe?', zh: '哪些看起来安全？' },
    { en: 'Refresh the radar', zh: '刷新新币雷达' },
  ],
  simulateTx: [
    { en: 'Execute this transaction', zh: '执行这笔交易' },
    { en: 'Simulate with different params', zh: '用不同参数模拟' },
    { en: 'Check the contract security', zh: '检查合约安全性' },
  ],
  walletPersona: [
    { en: 'Show my balance', zh: '查看余额' },
    { en: 'Run a security health check', zh: '做安全体检' },
    { en: 'Analyze another wallet', zh: '分析另一个钱包' },
  ],
  storeReport: [
    { en: 'Run another security scan', zh: '再做一次安全扫描' },
    { en: 'Show my balance', zh: '查看余额' },
    { en: 'Check a token', zh: '检查代币' },
  ],
  // --- New high-frequency tools ---
  buildTransfer: [
    { en: 'Check my balance', zh: '查看余额' },
    { en: 'Check this address', zh: '分析目标地址' },
    { en: 'Simulate first', zh: '先模拟一下' },
  ],
  compileContractDeploy: [
    { en: 'Verify this contract', zh: '验证这个合约', action: 'verify-contract' },
    { en: 'Check the contract security', zh: '检查合约安全' },
    { en: 'Add liquidity', zh: '添加流动性' },
  ],
  deployToken: [
    { en: 'Verify on BscScan', zh: '在 BscScan 验证', action: 'verify-contract' },
    { en: 'Check the security', zh: '检查安全性' },
    { en: 'Add liquidity', zh: '添加流动性' },
  ],
  verifyContract: [
    { en: 'Check the contract', zh: '查看合约信息' },
    { en: 'Check token security', zh: '检查代币安全' },
    { en: 'Add liquidity', zh: '添加流动性' },
  ],
  deepTokenAnalysis: [
    { en: 'Check the price', zh: '查看价格' },
    { en: 'View technical analysis', zh: '看技术分析' },
    { en: 'Swap this token', zh: '兑换这个代币' },
  ],
  technicalAnalysis: [
    { en: 'View K-line chart', zh: '看K线图' },
    { en: 'Run deep analysis', zh: '深度分析' },
    { en: 'Check token security', zh: '检查安全性' },
  ],
  binanceTicker: [
    { en: 'View K-line chart', zh: '看K线图' },
    { en: 'Technical analysis', zh: '技术分析' },
    { en: 'Deep analysis', zh: '深度分析' },
  ],
  binanceKlines: [
    { en: 'Technical analysis', zh: '技术分析' },
    { en: 'Check token security', zh: '检查安全' },
    { en: 'View 24h ticker', zh: '看24h行情' },
  ],
  checkPhishing: [
    { en: 'Check another URL', zh: '检查另一个网址' },
    { en: 'Check a dApp', zh: '检查 dApp 安全' },
    { en: 'Scan my wallet', zh: '扫描我的钱包' },
  ],
  checkDapp: [
    { en: 'Check for phishing', zh: '钓鱼检测' },
    { en: 'Check my approvals', zh: '查看我的授权' },
    { en: 'Run a health check', zh: '做钱包体检' },
  ],
  inspectContract: [
    { en: 'Check token security', zh: '检查代币安全' },
    { en: 'Verify this contract', zh: '验证这个合约', action: 'verify-contract' },
    { en: 'Check liquidity', zh: '查看流动性' },
  ],
  checkLiquidity: [
    { en: 'Check token security', zh: '检查安全性' },
    { en: 'Check the price', zh: '查看价格' },
    { en: 'Swap this token', zh: '兑换代币' },
  ],
  revokeApproval: [
    { en: 'Scan remaining approvals', zh: '扫描剩余授权' },
    { en: 'Run health check', zh: '做钱包体检' },
    { en: 'Check my balance', zh: '查看余额' },
  ],
  decodeTransaction: [
    { en: 'Simulate this transaction', zh: '模拟这笔交易' },
    { en: 'Check the address', zh: '分析地址' },
    { en: 'Check contract info', zh: '查看合约信息' },
  ],
  checkApprovalRisk: [
    { en: 'Revoke risky approvals', zh: '撤销风险授权' },
    { en: 'Full approval scan', zh: '完整授权扫描' },
    { en: 'Wallet health check', zh: '钱包体检' },
  ],
};

const GENERIC_SUGGESTIONS: Suggestion[] = [
  { en: "Check a token's security", zh: '检查代币安全性' },
  { en: 'Show my wallet balance', zh: '查看我的钱包余额' },
  { en: 'What can you do?', zh: '你能做什么？' },
];

function getLastToolPart(messages: UIMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    const toolParts = msg.parts.filter(isToolUIPart);
    if (toolParts.length > 0) {
      return toolParts[toolParts.length - 1];
    }
  }
  return null;
}

function shouldSuppressVerifySuggestions(lastToolPart: ReturnType<typeof getLastToolPart>): boolean {
  if (!lastToolPart || lastToolPart.state !== 'output-available') return false;
  const output = lastToolPart.output;
  if (!output || typeof output !== 'object') return false;

  const toolName = getToolName(lastToolPart);
  const payload = output as Record<string, unknown>;
  if (toolName === 'verifyContract') {
    return payload.verificationStatus === 'verified';
  }
  if (toolName === 'inspectContract') {
    return payload.isVerified === true;
  }
  return false;
}

export const SuggestedReplies = memo(function SuggestedReplies({
  messages,
  isStreaming,
  locale,
  onSelect,
}: SuggestedRepliesProps) {
  const suggestions = useMemo(() => {
    if (messages.length === 0) return null;
    const lastMsg = messages[messages.length - 1];
    // Only show after assistant messages
    if (lastMsg.role !== 'assistant') return null;

    const lastToolPart = getLastToolPart(messages);
    const toolName = lastToolPart ? getToolName(lastToolPart) : null;
    const pool = toolName && TOOL_SUGGESTIONS[toolName]
      ? TOOL_SUGGESTIONS[toolName]
      : GENERIC_SUGGESTIONS;
    const verifiedAlready = shouldSuppressVerifySuggestions(lastToolPart);
    const filteredPool = verifiedAlready
      ? pool.filter((item) => item.action !== 'verify-contract')
      : pool;
    if (filteredPool.length === 0) return null;

    return filteredPool.slice(0, 3).map((item) => (locale === 'zh' ? item.zh : item.en));
  }, [messages, locale]);

  if (!suggestions || isStreaming) return null;

  return (
    <div className="animate-stagger-in mx-auto flex w-full max-w-4xl flex-wrap items-center gap-1.5 px-3 pt-1 sm:px-4">
      <Sparkles className="size-3 text-primary/60" aria-hidden="true" />
      {suggestions.map((text) => {
        return (
          <button
            key={text}
            type="button"
            className="cursor-pointer rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/10 hover:text-foreground hover:shadow-sm active:scale-95"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect(text);
            }}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
});
