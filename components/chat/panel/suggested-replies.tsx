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

type Suggestion = { en: string; zh: string };

/**
 * Map from tool name → follow-up suggestions.
 * Falls back to GENERIC_SUGGESTIONS if no tool match.
 */
const TOOL_SUGGESTIONS: Record<string, Suggestion[]> = {
  checkTokenSecurity: [
    { en: 'Check my token approvals', zh: '查看我的代币授权' },
    { en: "What is this token's price?", zh: '这个代币的价格是多少？' },
    { en: 'Scan another token', zh: '扫描另一个代币' },
  ],
  getWalletBalance: [
    { en: 'Run a wallet health check', zh: '做一次钱包体检' },
    { en: 'Show my recent transactions', zh: '显示最近的交易记录' },
    { en: 'Check my token approvals', zh: '查看我的代币授权' },
  ],
  walletHealthCheck: [
    { en: 'Check my token approvals', zh: '查看我的代币授权' },
    { en: 'Analyze my wallet personality', zh: '分析我的钱包人格' },
    { en: 'Show my balance', zh: '查看余额' },
  ],
  getTokenApprovals: [
    { en: 'Revoke risky approvals', zh: '撤销高风险授权' },
    { en: 'Run a wallet health check', zh: '做一次钱包体检' },
    { en: 'Check a specific token', zh: '检查某个代币' },
  ],
  getTokenPrice: [
    { en: "Check this token's security", zh: '检查这个代币安全性' },
    { en: 'Swap this token', zh: '兑换这个代币' },
    { en: 'Search for another token', zh: '搜索另一个代币' },
  ],
  searchToken: [
    { en: "Check this token's security", zh: '检查这个代币安全性' },
    { en: 'What is the current price?', zh: '当前价格是多少？' },
    { en: 'Show liquidity info', zh: '显示流动性信息' },
  ],
  previewSwap: [
    { en: 'Execute this swap', zh: '执行这笔兑换' },
    { en: 'Check the token security first', zh: '先检查代币安全性' },
    { en: 'Try a different amount', zh: '换一个金额试试' },
  ],
  analyzeAddress: [
    { en: "Check this address's balance", zh: '查看这个地址的余额' },
    { en: 'Show transaction history', zh: '显示交易历史' },
    { en: 'Analyze another address', zh: '分析另一个地址' },
  ],
  getTransactionHistory: [
    { en: 'Analyze this address', zh: '分析这个地址' },
    { en: 'Check wallet balance', zh: '查看钱包余额' },
    { en: 'Run a security scan', zh: '运行安全扫描' },
  ],
  newTokenRadar: [
    { en: 'Check one of these tokens', zh: '检查其中一个代币' },
    { en: 'Which ones look safe?', zh: '哪些看起来安全？' },
    { en: 'Refresh the radar', zh: '刷新新币雷达' },
  ],
  simulateTransaction: [
    { en: 'Execute this transaction', zh: '执行这笔交易' },
    { en: 'Simulate with different params', zh: '用不同参数模拟' },
    { en: 'Check the contract security', zh: '检查合约安全性' },
  ],
  walletPersona: [
    { en: 'Show my balance', zh: '查看余额' },
    { en: 'Run a security health check', zh: '做安全体检' },
    { en: 'Analyze another wallet', zh: '分析另一个钱包' },
  ],
  storeProofOnchain: [
    { en: 'Run another security scan', zh: '再做一次安全扫描' },
    { en: 'Show my balance', zh: '查看余额' },
    { en: 'Check a token', zh: '检查代币' },
  ],
};

const GENERIC_SUGGESTIONS: Suggestion[] = [
  { en: "Check a token's security", zh: '检查代币安全性' },
  { en: 'Show my wallet balance', zh: '查看我的钱包余额' },
  { en: 'What can you do?', zh: '你能做什么？' },
];

function getLastToolName(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    const toolParts = msg.parts.filter(isToolUIPart);
    if (toolParts.length > 0) {
      return getToolName(toolParts[toolParts.length - 1]);
    }
  }
  return null;
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

    const toolName = getLastToolName(messages);
    const pool = toolName && TOOL_SUGGESTIONS[toolName]
      ? TOOL_SUGGESTIONS[toolName]
      : GENERIC_SUGGESTIONS;

    return pool.slice(0, 3);
  }, [messages]);

  if (!suggestions || isStreaming) return null;

  return (
    <div className="animate-stagger-in mx-auto flex w-full max-w-4xl flex-wrap items-center gap-1.5 px-3 pt-1 sm:px-4">
      <Sparkles className="size-3 text-primary/60" aria-hidden="true" />
      {suggestions.map((s) => {
        const text = locale === 'zh' ? s.zh : s.en;
        return (
          <button
            key={text}
            type="button"
            className="cursor-pointer rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/10 hover:text-foreground hover:shadow-sm active:scale-95"
            onClick={() => onSelect(text)}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
});
