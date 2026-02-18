'use client';

import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import {
  Shield, User, Send, ChevronRight, AlertTriangle, CheckCircle, XCircle,
  Wallet, ArrowRightLeft, BarChart3, Lock, Zap, PanelLeftClose, PanelLeft,
  FileCode, Rocket, BadgeCheck, ExternalLink, Copy, Check, Loader2,
  Activity, TrendingUp, Clock, Hash, ChevronDown, Sparkles, RotateCcw,
  X, Plus, Slash, ArrowDown, Square,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

type CardType =
  | 'security' | 'token-info' | 'balance' | 'approval' | 'swap'
  | 'contract-code' | 'deploy' | 'verify' | 'tx-receipt' | 'health-report'
  | 'deep-analysis-progress';

interface MockCard {
  id: string;
  type: CardType;
  title: string;
  delay: number;
  data: Record<string, unknown>;
}

interface ScenarioStep {
  userMessage?: string;
  aiText: string;
  cards: MockCard[];
  /** Tool activity hints shown while streaming */
  toolHints?: string[];
  /** Follow-up suggestion chips shown after streaming completes */
  suggestions?: string[];
}

interface MockScenario {
  label: string;
  description: string;
  steps: ScenarioStep[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming: boolean;
  toolHints?: string[];
  suggestions?: string[];
}

interface VisibleCard {
  card: MockCard;
  loading: boolean;
  collapsed: boolean;
  /** Which scenario step produced this card (for auto-collapse grouping) */
  stepKey: string;
}

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: 'success' | 'error' | 'info' | 'warning';
}

// ============================================================================
// Toast System
// ============================================================================

const ToastContext = createContext<{
  pushToast: (t: Omit<Toast, 'id'>) => void;
}>({ pushToast: () => {} });

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-message-in flex items-start gap-2.5 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md ${
              t.variant === 'success' ? 'border-emerald-500/30 bg-emerald-950/80 text-emerald-300' :
              t.variant === 'error' ? 'border-red-500/30 bg-red-950/80 text-red-300' :
              t.variant === 'warning' ? 'border-amber-500/30 bg-amber-950/80 text-amber-300' :
              'border-blue-500/30 bg-blue-950/80 text-blue-300'
            }`}
          >
            {t.variant === 'success' ? <CheckCircle className="mt-0.5 size-4 shrink-0" /> :
             t.variant === 'error' ? <XCircle className="mt-0.5 size-4 shrink-0" /> :
             t.variant === 'warning' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> :
             <Zap className="mt-0.5 size-4 shrink-0" />}
            <div className="min-w-0">
              <div className="text-sm font-medium">{t.title}</div>
              {t.description && <div className="mt-0.5 text-xs opacity-80">{t.description}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ============================================================================
// Mock Scenarios
// ============================================================================

const SCENARIOS: MockScenario[] = [
  // ── 1. Security Check ──
  {
    label: 'Token Security',
    description: 'Check token security with multi-source analysis',
    steps: [{
      userMessage: 'Check the security of token 0x0E09...5CB6',
      aiText: `I'll analyze this token's security for you. Let me check multiple data sources to give you a comprehensive report.

**Token: PancakeSwap (CAKE)**

Based on my analysis from GoPlus and Honeypot.is:

1. **Contract Verification** - The contract is verified on BscScan, which is a positive sign
2. **Honeypot Check** - This token is **not a honeypot**. Buy and sell transactions work normally
3. **Tax Analysis** - Buy tax: 0%, Sell tax: 0%. No hidden fees detected
4. **Ownership** - The contract ownership has been renounced
5. **Liquidity** - The liquidity pool is locked, providing rug pull protection

Overall, this token appears to be **safe** for trading.`,
      toolHints: ['Scanning GoPlus', 'Checking Honeypot.is', 'Fetching token data'],
      suggestions: ['Check another token', 'Show top holders', 'Compare with BUSD'],
      cards: [
        {
          id: 'token-info-s1', type: 'token-info', title: 'Token Info', delay: 600,
          data: { name: 'PancakeSwap', symbol: 'CAKE', price: '$2.45', marketCap: '$742M', holders: '1.2M', totalSupply: '389M' },
        },
        {
          id: 'security-s1', type: 'security', title: 'Security Report', delay: 1400,
          data: { riskLevel: 'safe', riskScore: 92, isHoneypot: false, isMintable: false, isProxy: false, buyTax: '0%', sellTax: '0%', ownershipRenounced: true, liquidityLocked: true },
        },
      ],
    }],
  },

  // ── 2. Contract Full Flow: Create → Deploy → Verify ──
  {
    label: 'Contract Deploy',
    description: 'Full flow: create → deploy → verify contract',
    steps: [
      {
        userMessage: 'Help me deploy a BEP-20 token called "TestCoin" (TST) with 1M supply',
        aiText: `I'll help you deploy a BEP-20 token contract on BNB Chain. Let me prepare everything.

**Contract Details**
- Name: TestCoin
- Symbol: TST
- Total Supply: 1,000,000 TST
- Decimals: 18
- Standard: BEP-20 (OpenZeppelin ERC20)

I've generated the contract code and prepared the deployment transaction. You can review the contract source code on the right panel.

When you're ready, click **"Deploy Contract"** to send the deployment transaction.`,
        toolHints: ['Generating contract', 'Estimating gas'],
        cards: [
          {
            id: 'contract-code-1', type: 'contract-code', title: 'Contract Source', delay: 800,
            data: {
              name: 'TestCoin',
              symbol: 'TST',
              supply: '1,000,000',
              compiler: 'Solidity 0.8.20',
              features: ['Ownable', 'ERC20Burnable', 'ERC20Permit'],
            },
          },
          {
            id: 'deploy-1', type: 'deploy', title: 'Deploy Contract', delay: 2000,
            data: {
              name: 'TestCoin',
              symbol: 'TST',
              estimatedGas: '0.0045 BNB',
              gasPrice: '3 Gwei',
              network: 'BNB Smart Chain',
            },
          },
        ],
      },
      {
        aiText: `Contract deployed successfully! Here's your deployment receipt:

**Deployed Contract**: \`0x1a2B...9eF0\`
**Transaction Hash**: \`0xabcd...ef12\`
**Block**: #35,847,291
**Gas Used**: 1,247,832 (0.0037 BNB)

Now let's verify the contract on BscScan so that anyone can read the source code. Click **"Verify Contract"** on the right panel to start the verification process.`,
        cards: [
          {
            id: 'tx-receipt-1', type: 'tx-receipt', title: 'Deploy Receipt', delay: 400,
            data: {
              txHash: '0xabcd...ef12',
              contractAddress: '0x1a2B...9eF0',
              block: '#35,847,291',
              gasUsed: '1,247,832',
              gasCost: '0.0037 BNB',
              status: 'success',
            },
          },
          {
            id: 'verify-1', type: 'verify', title: 'Contract Verification', delay: 1200,
            data: {
              contractAddress: '0x1a2B...9eF0',
              compiler: 'v0.8.20+commit.a1b79de6',
              optimization: true,
              runs: 200,
              license: 'MIT',
            },
          },
        ],
      },
      {
        aiText: `Contract verified successfully on BscScan!

**Verification Summary**
- Contract: \`0x1a2B...9eF0\`
- Status: Verified and Published
- Compiler: v0.8.20
- License: MIT

Your TestCoin (TST) is now fully deployed and verified on BNB Chain. Anyone can read the contract source code on BscScan.

**Next steps you might consider:**
1. Add liquidity on PancakeSwap
2. Lock the liquidity tokens
3. Renounce ownership (if appropriate)
4. Submit to token lists (CoinGecko, CMC)`,
        cards: [],
      },
    ],
  },

  // ── 3. Wallet Balance + Approvals ──
  {
    label: 'Wallet & Approvals',
    description: 'Check balance and scan risky approvals',
    steps: [{
      userMessage: 'Show my wallet balance and check for risky approvals',
      aiText: `I'll check your wallet balance and scan for any risky token approvals.

**Wallet Overview**

Your wallet currently holds assets across multiple tokens on BNB Chain:

1. **Total Portfolio Value**: ~$3,247.82
2. **Native BNB**: 2.15 BNB ($1,284.50)
3. **Top Holdings**: CAKE, BUSD, and several smaller positions

**Approval Scan Results**

I found **3 active approvals**, and one has a potential risk:

- **PancakeSwap Router** - Unlimited CAKE approval (Safe)
- **Venus Protocol** - Unlimited BUSD approval (Safe)
- **Unknown Contract 0x7f3a...** - Unlimited USDT approval (Risky!)

I recommend revoking the risky approval. Click **"Revoke"** on the approval card.`,
      toolHints: ['Querying balances', 'Scanning approvals'],
      suggestions: ['Revoke risky approval', 'Check all token prices', 'Export report'],
      cards: [
        {
          id: 'balance-s3', type: 'balance', title: 'Wallet Balance', delay: 600,
          data: {
            totalValue: '$3,247.82',
            tokens: [
              { symbol: 'BNB', amount: '2.15', value: '$1,284.50', change: '+2.4%' },
              { symbol: 'CAKE', amount: '342.5', value: '$839.12', change: '-1.1%' },
              { symbol: 'BUSD', amount: '824.20', value: '$824.20', change: '0.0%' },
              { symbol: 'USDT', amount: '300.00', value: '$300.00', change: '0.0%' },
            ],
          },
        },
        {
          id: 'approval-s3', type: 'approval', title: 'Approval Scan', delay: 1800,
          data: {
            total: 3, risky: 1,
            approvals: [
              { spender: 'PancakeSwap Router', token: 'CAKE', risk: 'safe', address: '0x10ED...4326' },
              { spender: 'Venus Protocol', token: 'BUSD', risk: 'safe', address: '0xfD36...5B70' },
              { spender: '0x7f3a...8e2d', token: 'USDT', risk: 'danger', address: '0x7f3a...8e2d' },
            ],
          },
        },
      ],
    }],
  },

  // ── 4. Swap with route comparison ──
  {
    label: 'Smart Swap',
    description: 'Find best route and execute swap',
    steps: [
      {
        userMessage: 'Swap 0.5 BNB to CAKE with best route',
        aiText: `I'll find the best swap route for 0.5 BNB to CAKE.

**Route Analysis**

I've compared rates across multiple DEXs:

| DEX | Output | Price Impact |
|-----|--------|-------------|
| PancakeSwap V3 | 121.45 CAKE | 0.02% |
| PancakeSwap V2 | 120.89 CAKE | 0.05% |
| BiSwap | 119.72 CAKE | 0.12% |

**Best Route: PancakeSwap V3**
- You'll receive approximately **121.45 CAKE**
- Slippage tolerance: 0.5%
- Estimated gas: ~0.0012 BNB ($0.72)

Review the swap preview and click **"Confirm Swap"** when ready.`,
        toolHints: ['Comparing DEX routes', 'Fetching prices'],
        cards: [
          {
            id: 'swap-s4', type: 'swap', title: 'Swap Preview', delay: 1500,
            data: {
              fromToken: 'BNB', fromAmount: '0.5', toToken: 'CAKE', toAmount: '121.45',
              dex: 'PancakeSwap V3', priceImpact: '0.02%', gas: '~0.0012 BNB', slippage: '0.5%',
            },
          },
        ],
      },
      {
        aiText: `Swap executed successfully!

**Transaction Confirmed**
- Sent: 0.5 BNB
- Received: **121.45 CAKE**
- Tx Hash: \`0x9f8e...7d6c\`
- Gas Used: 0.0011 BNB ($0.66)

The CAKE tokens are now in your wallet. You saved **$1.03** compared to the next best route (PancakeSwap V2).`,
        cards: [
          {
            id: 'tx-receipt-s4', type: 'tx-receipt', title: 'Swap Receipt', delay: 400,
            data: {
              txHash: '0x9f8e...7d6c', status: 'success',
              block: '#35,847,503', gasUsed: '184,721', gasCost: '0.0011 BNB',
              details: 'Swap 0.5 BNB → 121.45 CAKE via PancakeSwap V3',
            },
          },
        ],
      },
    ],
  },

  // ── 5. Deep Analysis (multi-step progress) ──
  {
    label: 'Deep Analysis',
    description: 'Multi-source deep token analysis with live progress',
    steps: [{
      userMessage: 'Give me a deep analysis of 0x2170...BaFE (ETH on BSC)',
      aiText: `I'll perform a comprehensive deep analysis of this token, pulling data from multiple sources in real-time.

**Deep Analysis: Ethereum (ETH) — Binance-Peg**

After analyzing 7 data sources, here's my complete assessment:

**Security**: The contract is a standard Binance-Peg token with **proxy pattern** (upgradeable). This is normal for Binance bridge tokens. The proxy owner is Binance's multi-sig.

**Market Data**: ETH is trading at **$2,847.30** with 24h volume of **$1.2B** on BSC alone. The token has strong liquidity across PancakeSwap, BiSwap, and other DEXs.

**On-Chain Activity**: 847K holders on BSC. Average daily transactions: ~125K. No unusual transfer patterns detected.

**Risk Assessment**: Score **95/100** — Very Safe. This is a major bridged asset backed by Binance reserves.`,
      toolHints: ['GoPlus Security', 'Honeypot.is', 'DexScreener', 'BscScan', 'CoinGecko', 'Sourcify', 'Holder scan'],
      suggestions: ['Compare with WBNB', 'Check liquidity depth', 'View holder distribution'],
      cards: [
        {
          id: 'deep-progress-s5', type: 'deep-analysis-progress', title: 'Deep Analysis', delay: 300,
          data: {
            sources: [
              { name: 'GoPlus Security', status: 'done', time: '1.2s' },
              { name: 'Honeypot.is', status: 'done', time: '0.8s' },
              { name: 'DexScreener', status: 'done', time: '1.5s' },
              { name: 'BscScan Analytics', status: 'done', time: '2.1s' },
              { name: 'CoinGecko', status: 'done', time: '0.6s' },
              { name: 'Sourcify Verify', status: 'done', time: '1.8s' },
              { name: 'Holder Analysis', status: 'done', time: '3.2s' },
            ],
          },
        },
        {
          id: 'health-s5', type: 'health-report', title: 'Health Report', delay: 5000,
          data: {
            overallScore: 95,
            categories: [
              { name: 'Security', score: 93, icon: 'shield' },
              { name: 'Liquidity', score: 98, icon: 'droplet' },
              { name: 'Community', score: 94, icon: 'users' },
              { name: 'Code Quality', score: 96, icon: 'code' },
            ],
          },
        },
      ],
    }],
  },

  // ── 6. Wallet Health Check ──
  {
    label: 'Wallet Health',
    description: 'Comprehensive wallet health & risk scan',
    steps: [{
      userMessage: 'Run a full health check on my wallet',
      aiText: `Running a comprehensive health check on your wallet...

**Wallet Health Report**

I've analyzed your wallet across multiple dimensions:

**Portfolio Diversification**: Your portfolio is **moderately diversified** with 4 active tokens. Consider spreading across more assets to reduce risk.

**Security Posture**:
- 3 active token approvals (1 risky — see approval scan)
- No interaction with known scam contracts
- Last transaction: 2 hours ago

**Gas Efficiency**: Your recent transactions averaged **3.2 Gwei**, which is optimal for BSC.

**Recommendations**:
1. Revoke the risky USDT approval (0x7f3a...)
2. Consider adding stablecoin exposure for balance
3. Enable transaction alerts for large transfers`,
      toolHints: ['Analyzing portfolio', 'Scanning approvals', 'Checking gas history'],
      suggestions: ['Revoke risky approvals', 'Optimize gas usage', 'View full report'],
      cards: [
        {
          id: 'health-s6', type: 'health-report', title: 'Health Report', delay: 1000,
          data: {
            overallScore: 78,
            categories: [
              { name: 'Diversification', score: 62, icon: 'pie' },
              { name: 'Security', score: 75, icon: 'shield' },
              { name: 'Gas Efficiency', score: 94, icon: 'zap' },
              { name: 'Activity', score: 82, icon: 'activity' },
            ],
          },
        },
        {
          id: 'balance-s6', type: 'balance', title: 'Wallet Balance', delay: 600,
          data: {
            totalValue: '$3,247.82',
            tokens: [
              { symbol: 'BNB', amount: '2.15', value: '$1,284.50', change: '+2.4%' },
              { symbol: 'CAKE', amount: '342.5', value: '$839.12', change: '-1.1%' },
              { symbol: 'BUSD', amount: '824.20', value: '$824.20', change: '0.0%' },
              { symbol: 'USDT', amount: '300.00', value: '$300.00', change: '0.0%' },
            ],
          },
        },
      ],
    }],
  },
];

// ============================================================================
// Reusable UI Pieces
// ============================================================================

function StepDot({ active, done, label, index }: { active: boolean; done: boolean; label: string; index: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`flex size-6 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-500 ${
        done ? 'bg-emerald-500 text-white scale-100' :
        active ? 'bg-primary text-primary-foreground animate-pulse scale-110' :
        'bg-muted text-muted-foreground scale-100'
      }`}>
        {done ? <Check className="size-3" /> : index + 1}
      </div>
      <span className={`text-xs transition-colors ${done ? 'text-emerald-400' : active ? 'text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </span>
    </div>
  );
}

function ProgressBar({ percent, className = '' }: { percent: number; className?: string }) {
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-muted/50 ${className}`}>
      <div
        className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      title="Copy"
    >
      {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
    </button>
  );
}

// ============================================================================
// Card Components
// ============================================================================

function SecurityCard({ data }: { data: Record<string, unknown> }) {
  const score = data.riskScore as number;
  const level = data.riskLevel as string;
  const color = level === 'safe' ? 'text-emerald-400' : level === 'warning' ? 'text-amber-400' : 'text-red-400';
  const bgColor = level === 'safe' ? 'bg-emerald-500/10 border-emerald-500/20' : level === 'warning' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20';
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={`rounded-xl border p-4 transition-all ${bgColor}`}>
      <button onClick={() => setExpanded(!expanded)} className="mb-2 flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className={`size-5 ${color}`} />
          <span className="text-sm font-semibold text-foreground">Security Report</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${bgColor} ${color}`}>{level}</div>
          <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="animate-expand-in">
          <div className="mb-4 flex items-center justify-center">
            <div className="relative flex size-20 items-center justify-center">
              <svg className="size-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="35" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="5" />
                <circle cx="40" cy="40" r="35" fill="none" stroke="currentColor" className={color} strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={`${(score / 100) * 220} 220`} style={{ transition: 'stroke-dasharray 1s ease-out' }} />
              </svg>
              <span className={`absolute text-xl font-bold ${color}`}>{score}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: 'Honeypot', ok: !data.isHoneypot },
              { label: 'Mintable', ok: !data.isMintable },
              { label: 'Proxy', ok: !data.isProxy },
              { label: 'Owner Renounced', ok: data.ownershipRenounced },
              { label: 'Liquidity Locked', ok: data.liquidityLocked },
            ].map((c) => (
              <div key={c.label} className="flex items-center gap-1.5 rounded-md bg-background/40 px-2 py-1.5">
                {c.ok ? <CheckCircle className="size-3.5 text-emerald-400" /> : <XCircle className="size-3.5 text-red-400" />}
                <span className="text-muted-foreground">{c.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-md bg-background/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Buy Tax: <span className="text-foreground">{data.buyTax as string}</span></span>
            <span className="text-muted-foreground">Sell Tax: <span className="text-foreground">{data.sellTax as string}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

function TokenInfoCard({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="rounded-xl border border-border bg-card/80 p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="size-5 text-primary" />
        <span className="text-sm font-semibold text-foreground">Token Info</span>
      </div>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">
          {(data.symbol as string)?.[0]}
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">{data.name as string}</div>
          <div className="text-xs text-muted-foreground">{data.symbol as string}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-sm font-semibold text-foreground">{data.price as string}</div>
          <div className="text-xs text-muted-foreground">MCap: {data.marketCap as string}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {[
          { label: 'Holders', value: data.holders as string },
          { label: 'Total Supply', value: data.totalSupply as string },
        ].map((item) => (
          <div key={item.label} className="rounded-md bg-background/40 px-2.5 py-2">
            <div className="text-muted-foreground">{item.label}</div>
            <div className="text-sm font-medium text-foreground">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BalanceCard({ data }: { data: Record<string, unknown> }) {
  const tokens = data.tokens as Array<{ symbol: string; amount: string; value: string; change?: string }>;
  return (
    <div className="rounded-xl border border-border bg-card/80 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="size-5 text-primary" />
          <span className="text-sm font-semibold text-foreground">Wallet Balance</span>
        </div>
        <span className="text-sm font-bold text-primary">{data.totalValue as string}</span>
      </div>
      <div className="space-y-1.5">
        {tokens.map((token) => (
          <div key={token.symbol} className="flex items-center justify-between rounded-md bg-background/40 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{token.symbol[0]}</div>
              <div>
                <span className="font-medium text-foreground">{token.symbol}</span>
                <span className="ml-1.5 text-muted-foreground">{token.amount}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{token.value}</span>
              {token.change && (
                <span className={`text-[10px] ${token.change.startsWith('+') ? 'text-emerald-400' : token.change.startsWith('-') ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {token.change}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApprovalCard({ data }: { data: Record<string, unknown> }) {
  const approvals = data.approvals as Array<{ spender: string; token: string; risk: string; address: string }>;
  const { pushToast } = useContext(ToastContext);
  const [revokedSet, setRevokedSet] = useState<Set<string>>(new Set());
  const [revokingSet, setRevokingSet] = useState<Set<string>>(new Set());

  const handleRevoke = (address: string, spender: string) => {
    setRevokingSet((prev) => new Set(prev).add(address));
    setTimeout(() => {
      setRevokingSet((prev) => { const n = new Set(prev); n.delete(address); return n; });
      setRevokedSet((prev) => new Set(prev).add(address));
      pushToast({ title: 'Approval Revoked', description: `Successfully revoked ${spender} approval`, variant: 'success' });
    }, 2000);
  };

  return (
    <div className="rounded-xl border border-border bg-card/80 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="size-5 text-primary" />
          <span className="text-sm font-semibold text-foreground">Approval Scan</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{approvals.length} found</span>
          {(data.risky as number) > 0 && !revokedSet.size && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-red-400">{data.risky as number} risky</span>
          )}
          {revokedSet.size > 0 && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">Fixed!</span>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        {approvals.map((a) => {
          const isRevoked = revokedSet.has(a.address);
          const isRevoking = revokingSet.has(a.address);
          return (
            <div key={a.address} className={`flex items-center justify-between rounded-md px-3 py-2 text-xs transition-all ${
              isRevoked ? 'bg-emerald-500/5 border border-emerald-500/20' :
              a.risk === 'danger' ? 'border border-red-500/20 bg-red-500/5' : 'bg-background/40'
            }`}>
              <div className="flex items-center gap-2">
                {isRevoked ? <CheckCircle className="size-3.5 text-emerald-400" /> :
                 a.risk === 'safe' ? <CheckCircle className="size-3.5 text-emerald-400" /> :
                 <AlertTriangle className="size-3.5 text-red-400" />}
                <span className={`text-foreground ${isRevoked ? 'line-through opacity-60' : ''}`}>{a.spender}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{a.token}</span>
                {a.risk === 'danger' && !isRevoked && (
                  <button
                    onClick={() => handleRevoke(a.address, a.spender)}
                    disabled={isRevoking}
                    className="flex items-center gap-1 rounded-md bg-red-500/20 px-2 py-0.5 text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-60"
                  >
                    {isRevoking ? <Loader2 className="size-3 animate-spin" /> : null}
                    {isRevoking ? 'Revoking...' : 'Revoke'}
                  </button>
                )}
                {isRevoked && <span className="text-emerald-400">Revoked</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SwapPreviewCard({ data, onAction }: { data: Record<string, unknown>; onAction?: () => void }) {
  const { pushToast } = useContext(ToastContext);
  const [state, setState] = useState<'ready' | 'signing' | 'confirming' | 'done'>('ready');

  const handleConfirm = () => {
    setState('signing');
    pushToast({ title: 'Waiting for wallet signature...', variant: 'info' });
    setTimeout(() => {
      setState('confirming');
      pushToast({ title: 'Transaction submitted', description: 'Waiting for confirmation...', variant: 'info' });
      setTimeout(() => {
        setState('done');
        pushToast({ title: 'Swap Successful!', description: `Received ${data.toAmount as string} ${data.toToken as string}`, variant: 'success' });
        onAction?.();
      }, 2500);
    }, 1500);
  };

  return (
    <div className={`rounded-xl border p-4 transition-all ${state === 'done' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-primary/30 bg-card/80'}`}>
      <div className="mb-3 flex items-center gap-2">
        <ArrowRightLeft className={`size-5 ${state === 'done' ? 'text-emerald-400' : 'text-primary'}`} />
        <span className="text-sm font-semibold text-foreground">Swap Preview</span>
        {state === 'done' && <CheckCircle className="ml-auto size-4 text-emerald-400" />}
      </div>

      <div className="mb-4 flex items-center justify-between px-2">
        <div className="flex flex-col items-center gap-1">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{(data.fromToken as string)[0]}</div>
          <span className="text-xs text-muted-foreground">{data.fromToken as string}</span>
          <span className="text-sm font-semibold text-foreground">{data.fromAmount as string}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          {state === 'confirming' ? <Loader2 className="size-5 text-primary animate-spin" /> : <ChevronRight className="size-5 text-primary" />}
          <span className="text-[10px] text-muted-foreground">{data.dex as string}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{(data.toToken as string)[0]}</div>
          <span className="text-xs text-muted-foreground">{data.toToken as string}</span>
          <span className="text-sm font-semibold text-foreground">{data.toAmount as string}</span>
        </div>
      </div>

      <div className="mb-3 space-y-1 text-xs">
        {[
          { label: 'Price Impact', value: data.priceImpact as string, color: 'text-emerald-400' },
          { label: 'Gas Fee', value: data.gas as string },
          { label: 'Slippage', value: data.slippage as string },
        ].map((row) => (
          <div key={row.label} className="flex justify-between rounded-md bg-background/40 px-3 py-1.5">
            <span className="text-muted-foreground">{row.label}</span>
            <span className={row.color || 'text-foreground'}>{row.value}</span>
          </div>
        ))}
      </div>

      {state === 'ready' && (
        <button onClick={handleConfirm} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]">
          Confirm Swap
        </button>
      )}
      {state === 'signing' && (
        <button disabled className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary/60 py-2.5 text-sm font-semibold text-primary-foreground">
          <Loader2 className="size-4 animate-spin" /> Signing...
        </button>
      )}
      {state === 'confirming' && (
        <div className="space-y-2">
          <button disabled className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary/60 py-2.5 text-sm font-semibold text-primary-foreground">
            <Loader2 className="size-4 animate-spin" /> Confirming...
          </button>
          <ProgressBar percent={65} />
        </div>
      )}
      {state === 'done' && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500/15 py-2.5 text-sm font-semibold text-emerald-400">
          <CheckCircle className="size-4" /> Swap Complete
        </div>
      )}
    </div>
  );
}

// ── Contract-specific cards ──

function ContractCodeCard({ data }: { data: Record<string, unknown> }) {
  const [showCode, setShowCode] = useState(false);
  const features = data.features as string[];
  const codeSnippet = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ${data.name} is ERC20, ERC20Burnable, ERC20Permit, Ownable {
    constructor()
        ERC20("${data.name}", "${data.symbol}")
        ERC20Permit("${data.name}")
        Ownable(msg.sender)
    {
        _mint(msg.sender, ${(data.supply as string).replace(/,/g, '')} * 10 ** decimals());
    }
}`;

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode className="size-5 text-blue-400" />
          <span className="text-sm font-semibold text-foreground">Contract Source</span>
        </div>
        <span className="text-xs text-muted-foreground">{data.compiler as string}</span>
      </div>

      <div className="mb-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Name</span>
          <span className="font-medium text-foreground">{data.name as string} ({data.symbol as string})</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Supply</span>
          <span className="font-medium text-foreground">{data.supply as string}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {features.map((f) => (
            <span key={f} className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400">{f}</span>
          ))}
        </div>
      </div>

      <button onClick={() => setShowCode(!showCode)} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-background/40 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <FileCode className="size-3" />
        {showCode ? 'Hide Source Code' : 'View Source Code'}
      </button>

      {showCode && (
        <div className="animate-expand-in mt-3 overflow-x-auto rounded-lg bg-background/60 p-3">
          <pre className="text-[11px] leading-relaxed text-foreground/80"><code>{codeSnippet}</code></pre>
        </div>
      )}
    </div>
  );
}

function DeployCard({ data, onAction }: { data: Record<string, unknown>; onAction?: () => void }) {
  const { pushToast } = useContext(ToastContext);
  const [state, setState] = useState<'ready' | 'signing' | 'deploying' | 'done'>('ready');
  const [progress, setProgress] = useState(0);

  const handleDeploy = () => {
    setState('signing');
    pushToast({ title: 'Requesting wallet signature...', variant: 'info' });
    setTimeout(() => {
      setState('deploying');
      pushToast({ title: 'Deploying contract...', description: 'Broadcasting transaction to BNB Chain', variant: 'info' });
      // Simulate progress
      let p = 0;
      const iv = setInterval(() => {
        p += Math.random() * 15 + 5;
        if (p >= 100) { p = 100; clearInterval(iv); }
        setProgress(p);
      }, 400);
      setTimeout(() => {
        clearInterval(iv);
        setProgress(100);
        setState('done');
        pushToast({ title: 'Contract Deployed!', description: '0x1a2B...9eF0', variant: 'success' });
        setTimeout(() => onAction?.(), 800);
      }, 3500);
    }, 1500);
  };

  return (
    <div className={`rounded-xl border p-4 transition-all duration-500 ${
      state === 'done' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-primary/30 bg-card/80'
    }`}>
      <div className="mb-3 flex items-center gap-2">
        <Rocket className={`size-5 ${state === 'done' ? 'text-emerald-400' : 'text-primary'}`} />
        <span className="text-sm font-semibold text-foreground">Deploy Contract</span>
        {state === 'done' && <CheckCircle className="ml-auto size-4 text-emerald-400" />}
      </div>

      <div className="mb-3 space-y-1 text-xs">
        {[
          { label: 'Token', value: `${data.name} (${data.symbol})` },
          { label: 'Network', value: data.network as string },
          { label: 'Est. Gas', value: data.estimatedGas as string },
          { label: 'Gas Price', value: data.gasPrice as string },
        ].map((row) => (
          <div key={row.label} className="flex justify-between rounded-md bg-background/40 px-3 py-1.5">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="text-foreground">{row.value as string}</span>
          </div>
        ))}
      </div>

      {state === 'ready' && (
        <button onClick={handleDeploy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]">
          <Rocket className="size-4" /> Deploy Contract
        </button>
      )}
      {state === 'signing' && (
        <button disabled className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary/60 py-2.5 text-sm font-semibold text-primary-foreground">
          <Loader2 className="size-4 animate-spin" /> Waiting for signature...
        </button>
      )}
      {state === 'deploying' && (
        <div className="space-y-2">
          <button disabled className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary/60 py-2.5 text-sm font-semibold text-primary-foreground">
            <Loader2 className="size-4 animate-spin" /> Deploying...
          </button>
          <ProgressBar percent={progress} />
          <p className="text-center text-[10px] text-muted-foreground">Broadcasting to BNB Chain...</p>
        </div>
      )}
      {state === 'done' && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500/15 py-2.5 text-sm font-semibold text-emerald-400">
          <CheckCircle className="size-4" /> Deployed Successfully
        </div>
      )}
    </div>
  );
}

function TxReceiptCard({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <CheckCircle className="size-5 text-emerald-400" />
        <span className="text-sm font-semibold text-foreground">{data.details ? 'Transaction Receipt' : 'Deploy Receipt'}</span>
      </div>

      <div className="space-y-1 text-xs">
        {data.txHash ? (
          <div className="flex items-center justify-between rounded-md bg-background/40 px-3 py-1.5">
            <span className="text-muted-foreground">Tx Hash</span>
            <div className="flex items-center gap-1">
              <code className="font-mono text-foreground">{String(data.txHash)}</code>
              <CopyButton text={String(data.txHash)} />
              <ExternalLink className="size-3 text-muted-foreground" />
            </div>
          </div>
        ) : null}
        {data.contractAddress ? (
          <div className="flex items-center justify-between rounded-md bg-background/40 px-3 py-1.5">
            <span className="text-muted-foreground">Contract</span>
            <div className="flex items-center gap-1">
              <code className="font-mono text-primary">{String(data.contractAddress)}</code>
              <CopyButton text={String(data.contractAddress)} />
            </div>
          </div>
        ) : null}
        {([
          data.block ? { label: 'Block', value: String(data.block) } : null,
          data.gasUsed ? { label: 'Gas Used', value: String(data.gasUsed) } : null,
          data.gasCost ? { label: 'Gas Cost', value: String(data.gasCost) } : null,
          data.details ? { label: 'Details', value: String(data.details) } : null,
        ].filter((r): r is { label: string; value: string } => r !== null)).map((row) => (
          <div key={row.label} className="flex items-center justify-between rounded-md bg-background/40 px-3 py-1.5">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="text-foreground">{row.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-center gap-1 rounded-md bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
        <CheckCircle className="size-3" />
        <span>{data.status as string === 'success' ? 'Transaction Confirmed' : data.status as string}</span>
      </div>
    </div>
  );
}

function VerifyCard({ data, onAction }: { data: Record<string, unknown>; onAction?: () => void }) {
  const { pushToast } = useContext(ToastContext);
  const [state, setState] = useState<'ready' | 'verifying' | 'done'>('ready');
  const [currentStep, setCurrentStep] = useState(0);
  const steps = ['Compiling source', 'Matching bytecode', 'Submitting to BscScan', 'Publishing ABI'];

  const handleVerify = () => {
    setState('verifying');
    pushToast({ title: 'Starting contract verification...', variant: 'info' });
    let step = 0;
    const iv = setInterval(() => {
      step += 1;
      setCurrentStep(step);
      if (step >= steps.length) {
        clearInterval(iv);
        setTimeout(() => {
          setState('done');
          pushToast({ title: 'Contract Verified!', description: 'Source code published on BscScan', variant: 'success' });
          setTimeout(() => onAction?.(), 800);
        }, 600);
      }
    }, 1200);
  };

  return (
    <div className={`rounded-xl border p-4 transition-all duration-500 ${
      state === 'done' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-blue-500/20 bg-blue-500/5'
    }`}>
      <div className="mb-3 flex items-center gap-2">
        <BadgeCheck className={`size-5 ${state === 'done' ? 'text-emerald-400' : 'text-blue-400'}`} />
        <span className="text-sm font-semibold text-foreground">Contract Verification</span>
        {state === 'done' && <CheckCircle className="ml-auto size-4 text-emerald-400" />}
      </div>

      <div className="mb-3 space-y-1 text-xs">
        {[
          { label: 'Contract', value: data.contractAddress as string },
          { label: 'Compiler', value: data.compiler as string },
          { label: 'Optimization', value: data.optimization ? `Yes (${data.runs} runs)` : 'No' },
          { label: 'License', value: data.license as string },
        ].map((row) => (
          <div key={row.label} className="flex justify-between rounded-md bg-background/40 px-3 py-1.5">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="text-foreground">{row.value as string}</span>
          </div>
        ))}
      </div>

      {/* Step indicators */}
      {state === 'verifying' && (
        <div className="mb-3 space-y-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2 text-xs">
              {i < currentStep ? <CheckCircle className="size-3.5 text-emerald-400" /> :
               i === currentStep ? <Loader2 className="size-3.5 text-blue-400 animate-spin" /> :
               <div className="size-3.5 rounded-full border border-muted-foreground/30" />}
              <span className={i <= currentStep ? 'text-foreground' : 'text-muted-foreground'}>{s}</span>
              {i < currentStep && <span className="ml-auto text-muted-foreground/50">Done</span>}
            </div>
          ))}
        </div>
      )}

      {state === 'ready' && (
        <button onClick={handleVerify} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-500/90 active:scale-[0.98]">
          <BadgeCheck className="size-4" /> Verify Contract
        </button>
      )}
      {state === 'verifying' && (
        <ProgressBar percent={(currentStep / steps.length) * 100} />
      )}
      {state === 'done' && (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500/15 py-2.5 text-sm font-semibold text-emerald-400">
            <BadgeCheck className="size-4" /> Verified & Published
          </div>
          <button className="flex w-full items-center justify-center gap-1.5 rounded-md bg-background/40 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ExternalLink className="size-3" /> View on BscScan
          </button>
        </div>
      )}
    </div>
  );
}

function HealthReportCard({ data }: { data: Record<string, unknown> }) {
  const overall = data.overallScore as number;
  const categories = data.categories as Array<{ name: string; score: number; icon: string }>;
  const color = overall >= 80 ? 'text-emerald-400' : overall >= 60 ? 'text-amber-400' : 'text-red-400';
  const bgColor = overall >= 80 ? 'border-emerald-500/20' : overall >= 60 ? 'border-amber-500/20' : 'border-red-500/20';

  const iconMap: Record<string, React.ReactNode> = {
    shield: <Shield className="size-3.5" />,
    activity: <Activity className="size-3.5" />,
    zap: <Zap className="size-3.5" />,
    droplet: <TrendingUp className="size-3.5" />,
    users: <User className="size-3.5" />,
    code: <FileCode className="size-3.5" />,
    pie: <BarChart3 className="size-3.5" />,
  };

  return (
    <div className={`rounded-xl border ${bgColor} bg-card/80 p-4`}>
      <div className="mb-3 flex items-center gap-2">
        <Activity className="size-5 text-primary" />
        <span className="text-sm font-semibold text-foreground">Health Report</span>
      </div>

      <div className="mb-4 flex items-center justify-center">
        <div className="relative flex size-24 items-center justify-center">
          <svg className="size-24 -rotate-90" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="42" fill="none" stroke="currentColor" className="text-muted/20" strokeWidth="6" />
            <circle cx="48" cy="48" r="42" fill="none" stroke="currentColor" className={color} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${(overall / 100) * 264} 264`} style={{ transition: 'stroke-dasharray 1.2s ease-out' }} />
          </svg>
          <div className="absolute text-center">
            <span className={`text-2xl font-bold ${color}`}>{overall}</span>
            <div className="text-[9px] text-muted-foreground">/ 100</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {categories.map((cat) => {
          const catColor = cat.score >= 80 ? 'text-emerald-400 bg-emerald-500' : cat.score >= 60 ? 'text-amber-400 bg-amber-500' : 'text-red-400 bg-red-500';
          return (
            <div key={cat.name} className="rounded-md bg-background/40 px-3 py-2">
              <div className="mb-1 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  {iconMap[cat.icon] || <Zap className="size-3.5" />}
                  <span>{cat.name}</span>
                </div>
                <span className={catColor.split(' ')[0]}>{cat.score}</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted/30">
                <div className={`h-full rounded-full ${catColor.split(' ')[1]} transition-all duration-1000 ease-out`}
                  style={{ width: `${cat.score}%`, opacity: 0.7 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeepAnalysisProgressCard({ data }: { data: Record<string, unknown> }) {
  const sources = data.sources as Array<{ name: string; status: string; time: string }>;
  const [animatedCount, setAnimatedCount] = useState(0);

  useEffect(() => {
    let count = 0;
    const iv = setInterval(() => {
      count += 1;
      setAnimatedCount(count);
      if (count >= sources.length) clearInterval(iv);
    }, 800);
    return () => clearInterval(iv);
  }, [sources.length]);

  const allDone = animatedCount >= sources.length;

  return (
    <div className="rounded-xl border border-border bg-card/80 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className={`size-5 ${allDone ? 'text-emerald-400' : 'text-primary'}`} />
          <span className="text-sm font-semibold text-foreground">Data Sources</span>
        </div>
        <span className="text-xs text-muted-foreground">{Math.min(animatedCount, sources.length)}/{sources.length} complete</span>
      </div>

      <ProgressBar percent={(Math.min(animatedCount, sources.length) / sources.length) * 100} className="mb-3" />

      <div className="space-y-1">
        {sources.map((src, i) => {
          const isDone = i < animatedCount;
          const isActive = i === animatedCount;
          return (
            <div key={src.name} className="flex items-center justify-between rounded-md bg-background/40 px-3 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                {isDone ? <CheckCircle className="size-3.5 text-emerald-400" /> :
                 isActive ? <Loader2 className="size-3.5 text-primary animate-spin" /> :
                 <Clock className="size-3.5 text-muted-foreground/40" />}
                <span className={isDone ? 'text-foreground' : isActive ? 'text-foreground' : 'text-muted-foreground'}>{src.name}</span>
              </div>
              {isDone && <span className="text-muted-foreground/50">{src.time}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Card Router ──

function CardRenderer({ card, onAction }: { card: MockCard; onAction?: () => void }) {
  switch (card.type) {
    case 'security': return <SecurityCard data={card.data} />;
    case 'token-info': return <TokenInfoCard data={card.data} />;
    case 'balance': return <BalanceCard data={card.data} />;
    case 'approval': return <ApprovalCard data={card.data} />;
    case 'swap': return <SwapPreviewCard data={card.data} onAction={onAction} />;
    case 'contract-code': return <ContractCodeCard data={card.data} />;
    case 'deploy': return <DeployCard data={card.data} onAction={onAction} />;
    case 'tx-receipt': return <TxReceiptCard data={card.data} />;
    case 'verify': return <VerifyCard data={card.data} onAction={onAction} />;
    case 'health-report': return <HealthReportCard data={card.data} />;
    case 'deep-analysis-progress': return <DeepAnalysisProgressCard data={card.data} />;
    default: return null;
  }
}

// ============================================================================
// Streaming Text
// ============================================================================

function StreamingText({ text, speed = 18 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed('');
    setDone(false);

    const interval = setInterval(() => {
      // Variable chunk size for natural feel
      const char = text[indexRef.current] || '';
      const chunk = char === '\n' ? 1 : char === ' ' ? 2 : Math.random() > 0.6 ? 3 : 2;
      indexRef.current = Math.min(indexRef.current + chunk, text.length);
      setDisplayed(text.slice(0, indexRef.current));

      if (indexRef.current >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <div className="text-[15px] leading-[1.7] text-foreground">
      <SimpleMarkdown content={displayed} />
      {!done && <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-pulse bg-primary" />}
    </div>
  );
}

// ============================================================================
// Minimal Markdown
// ============================================================================

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (tableRows.length === 0) return;
    elements.push(
      <div key={`table-${elements.length}`} className="my-2 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {tableRows[0].map((cell, i) => (
                <th key={i} className="px-3 py-1.5 text-left font-medium text-muted-foreground">{cell.trim()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.slice(2).map((row, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0">
                {row.map((cell, j) => <td key={j} className="px-3 py-1.5 text-foreground">{cell.trim()}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('|')) { inTable = true; tableRows.push(line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)); continue; }
    if (inTable) { flushTable(); inTable = false; }

    const hm = line.match(/^(#{1,4})\s+(.+)/);
    if (hm) { const sizes = ['text-lg font-bold', 'text-base font-bold', 'text-sm font-semibold', 'text-sm font-medium']; elements.push(<div key={i} className={`mt-3 mb-1 ${sizes[hm[1].length - 1] || sizes[3]} text-foreground`}><InlineFormat text={hm[2]} /></div>); continue; }

    const lm = line.match(/^(\d+\.|[-*])\s+(.+)/);
    if (lm) { elements.push(<div key={i} className="flex gap-2 pl-1 py-0.5"><span className="shrink-0 text-muted-foreground">{/^\d+\./.test(lm[1]) ? lm[1] : '•'}</span><span><InlineFormat text={lm[2]} /></span></div>); continue; }

    if (!line.trim()) { elements.push(<div key={i} className="h-2" />); continue; }
    elements.push(<p key={i} className="py-0.5"><InlineFormat text={line} /></p>);
  }
  if (inTable) flushTable();
  return <>{elements}</>;
}

function InlineFormat({ text }: { text: string }) {
  const parts = text.split(/(\*\*\*.+?\*\*\*|\*\*.+?\*\*|\*.+?\*|`.+?`|\[.+?\]\(.+?\))/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('***') && part.endsWith('***')) return <strong key={i} className="italic text-foreground">{part.slice(3, -3)}</strong>;
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="text-foreground">{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
        if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="rounded bg-muted px-1 py-0.5 text-xs text-primary">{part.slice(1, -1)}</code>;
        const lm = part.match(/\[(.+?)\]\((.+?)\)/);
        if (lm) return <a key={i} href={lm[2]} className="text-primary underline">{lm[1]}</a>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ============================================================================
// Loading Pill
// ============================================================================

function CardLoadingPill({ title }: { title: string }) {
  return (
    <div className="animate-pulse-glow flex items-center gap-2 rounded-xl border border-border bg-card/60 px-4 py-3">
      <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
        <Zap className="size-4 text-primary animate-pulse" />
      </div>
      <div>
        <div className="text-xs font-medium text-foreground">{title}</div>
        <div className="text-[10px] text-muted-foreground">Analyzing...</div>
      </div>
      <div className="ml-auto flex gap-0.5">
        <span className="size-1 rounded-full bg-primary/60 animate-pulse" />
        <span className="size-1 rounded-full bg-primary/60 animate-pulse [animation-delay:200ms]" />
        <span className="size-1 rounded-full bg-primary/60 animate-pulse [animation-delay:400ms]" />
      </div>
    </div>
  );
}

// ============================================================================
// Compact (Collapsed) Card View — keeps key links visible
// ============================================================================

function CompactCardView({ card, onExpand }: { card: MockCard; onExpand: () => void }) {
  const d = card.data;

  // Per-type compact rendering: icon + summary + actionable links
  const compactContent = (() => {
    switch (card.type) {
      case 'contract-code':
        return (
          <>
            <FileCode className="size-4 shrink-0 text-blue-400" />
            <span className="truncate text-foreground">{d.name as string} ({d.symbol as string})</span>
            <span className="shrink-0 text-muted-foreground">{d.compiler as string}</span>
          </>
        );
      case 'deploy':
        return (
          <>
            <Rocket className="size-4 shrink-0 text-emerald-400" />
            <CheckCircle className="size-3 shrink-0 text-emerald-400" />
            <span className="text-foreground">Deployed</span>
          </>
        );
      case 'tx-receipt':
        return (
          <>
            <CheckCircle className="size-4 shrink-0 text-emerald-400" />
            <span className="text-foreground">Confirmed</span>
            {d.contractAddress && (
              <span className="flex items-center gap-1 font-mono text-primary">
                {d.contractAddress as string}
                <CopyButton text={d.contractAddress as string} />
                <ExternalLink className="size-3 text-muted-foreground hover:text-primary" />
              </span>
            )}
            {d.txHash && !d.contractAddress && (
              <span className="flex items-center gap-1 font-mono text-muted-foreground">
                {d.txHash as string}
                <CopyButton text={d.txHash as string} />
                <ExternalLink className="size-3 hover:text-primary" />
              </span>
            )}
          </>
        );
      case 'verify':
        return (
          <>
            <BadgeCheck className="size-4 shrink-0 text-emerald-400" />
            <span className="text-foreground">Verified</span>
            <span className="flex items-center gap-1 font-mono text-primary">
              {d.contractAddress as string}
              <ExternalLink className="size-3 text-muted-foreground hover:text-primary" />
            </span>
          </>
        );
      case 'security':
        return (
          <>
            <Shield className={`size-4 shrink-0 ${(d.riskLevel as string) === 'safe' ? 'text-emerald-400' : (d.riskLevel as string) === 'warning' ? 'text-amber-400' : 'text-red-400'}`} />
            <span className="text-foreground">Score {d.riskScore as number}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              (d.riskLevel as string) === 'safe' ? 'bg-emerald-500/15 text-emerald-400' :
              (d.riskLevel as string) === 'warning' ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'
            }`}>{d.riskLevel as string}</span>
          </>
        );
      case 'token-info':
        return (
          <>
            <BarChart3 className="size-4 shrink-0 text-primary" />
            <span className="font-medium text-foreground">{d.symbol as string}</span>
            <span className="text-muted-foreground">{d.price as string}</span>
            <span className="text-muted-foreground">MCap {d.marketCap as string}</span>
          </>
        );
      case 'balance':
        return (
          <>
            <Wallet className="size-4 shrink-0 text-primary" />
            <span className="font-medium text-primary">{d.totalValue as string}</span>
            <span className="text-muted-foreground">{(d.tokens as unknown[]).length} tokens</span>
          </>
        );
      case 'approval':
        return (
          <>
            <Lock className="size-4 shrink-0 text-primary" />
            <span className="text-foreground">{d.total as number} approvals</span>
            {(d.risky as number) > 0 && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] text-red-400">{d.risky as number} risky</span>}
          </>
        );
      case 'swap':
        return (
          <>
            <ArrowRightLeft className="size-4 shrink-0 text-emerald-400" />
            <CheckCircle className="size-3 shrink-0 text-emerald-400" />
            <span className="text-foreground">{d.fromAmount as string} {d.fromToken as string} → {d.toAmount as string} {d.toToken as string}</span>
          </>
        );
      case 'health-report':
        return (
          <>
            <Activity className="size-4 shrink-0 text-primary" />
            <span className="text-foreground">Health Score</span>
            <span className={`font-bold ${(d.overallScore as number) >= 80 ? 'text-emerald-400' : (d.overallScore as number) >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
              {d.overallScore as number}/100
            </span>
          </>
        );
      case 'deep-analysis-progress':
        return (
          <>
            <Sparkles className="size-4 shrink-0 text-emerald-400" />
            <span className="text-foreground">Analysis Complete</span>
            <span className="text-muted-foreground">{(d.sources as unknown[]).length} sources</span>
          </>
        );
      default:
        return <span className="text-foreground">{card.title}</span>;
    }
  })();

  // Extra row of links for receipt-like cards
  const linksRow = (() => {
    if (card.type === 'tx-receipt') {
      return (
        <div className="mt-1.5 flex items-center gap-3 pl-0.5 text-[10px]">
          {d.txHash ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              Tx: <code className="font-mono">{String(d.txHash)}</code>
              <CopyButton text={String(d.txHash)} />
              <ExternalLink className="size-2.5 cursor-pointer hover:text-primary" />
            </span>
          ) : null}
          {d.contractAddress ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              Contract: <code className="font-mono text-primary">{String(d.contractAddress)}</code>
              <CopyButton text={String(d.contractAddress)} />
              <ExternalLink className="size-2.5 cursor-pointer hover:text-primary" />
            </span>
          ) : null}
        </div>
      );
    }
    if (card.type === 'deploy') {
      // In the deployed state, show mock contract address
      return (
        <div className="mt-1.5 flex items-center gap-3 pl-0.5 text-[10px]">
          <span className="flex items-center gap-1 text-muted-foreground">
            Contract: <code className="font-mono text-primary">0x1a2B...9eF0</code>
            <CopyButton text="0x1a2B...9eF0" />
            <ExternalLink className="size-2.5 cursor-pointer hover:text-primary" />
          </span>
        </div>
      );
    }
    if (card.type === 'verify') {
      return (
        <div className="mt-1.5 flex items-center gap-2 pl-0.5 text-[10px]">
          <button className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary">
            <ExternalLink className="size-2.5" /> View on BscScan
          </button>
        </div>
      );
    }
    return null;
  })();

  return (
    <div onClick={onExpand} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onExpand(); }} className="group w-full cursor-pointer text-left">
      <div className="rounded-xl border border-border/60 bg-card/40 px-3 py-2 transition-all hover:border-border hover:bg-card/60">
        <div className="flex items-center gap-2 text-xs">
          {compactContent}
          <ChevronDown className="ml-auto size-3 shrink-0 text-muted-foreground/40 transition-transform group-hover:text-muted-foreground" />
        </div>
        {linksRow}
      </div>
    </div>
  );
}

// ============================================================================
// Messages
// ============================================================================

function UserMessage({ text }: { text: string }) {
  return (
    <div className="animate-message-in">
      <div className="rounded-2xl border border-border bg-card/80 px-4 py-3 backdrop-blur-sm">
        <div className="mb-1.5 flex items-center gap-1.5">
          <div className="flex size-5 items-center justify-center rounded-full bg-primary/15"><User className="size-3 text-primary" /></div>
          <span className="text-xs font-semibold text-foreground/90">You</span>
        </div>
        <div className="pl-[26px]"><p className="text-[15px] leading-[1.7] whitespace-pre-wrap text-foreground">{text}</p></div>
      </div>
    </div>
  );
}

function AssistantMessage({ text, streaming, speed, toolHints, suggestions, onSuggestion }: {
  text: string; streaming: boolean; speed?: number;
  toolHints?: string[]; suggestions?: string[]; onSuggestion?: (s: string) => void;
}) {
  return (
    <div className="animate-message-in">
      <div className="border-l-2 border-primary/20 pl-4">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="flex size-5 items-center justify-center rounded-full bg-primary/10"><Shield className="size-3 text-primary" /></div>
          <span className="text-xs font-semibold text-foreground/90">BNBrain</span>
          {streaming && <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] text-primary animate-pulse">typing</span>}
        </div>
        {/* Tool activity hints — shows what's being analyzed */}
        {streaming && toolHints && toolHints.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {toolHints.map((hint) => (
              <span key={hint} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] text-primary">
                <Loader2 className="size-2.5 animate-spin" />
                {hint}
              </span>
            ))}
          </div>
        )}
        <div className="min-w-0">
          {streaming ? <StreamingText text={text} speed={speed} /> : <div className="text-[15px] leading-[1.7] text-foreground"><SimpleMarkdown content={text} /></div>}
        </div>
        {/* Follow-up suggestions */}
        {!streaming && suggestions && suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} onClick={() => onSuggestion?.(s)}
                className="rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground transition-all hover:border-primary/30 hover:bg-card hover:text-foreground">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function MockChatLayout() {
  return (
    <ToastProvider>
      <MockChatLayoutInner />
    </ToastProvider>
  );
}

function MockChatLayoutInner() {
  const { pushToast } = useContext(ToastContext);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [visibleCards, setVisibleCards] = useState<VisibleCard[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [activeScenario, setActiveScenario] = useState<{ scenario: MockScenario; stepIndex: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const cardsEndRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Track scroll position for scroll-to-bottom button
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(distFromBottom > 200);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Track which interactive cards have been used
  const actionableCardTypes = new Set(['deploy', 'verify', 'swap']);

  const scrollMessagesToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  const scrollCardsToBottom = useCallback(() => {
    setTimeout(() => cardsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }, []);

  useEffect(() => { scrollMessagesToBottom(); }, [messages, scrollMessagesToBottom]);
  useEffect(() => { scrollCardsToBottom(); }, [visibleCards, scrollCardsToBottom]);

  // Play a single step: add AI message + schedule cards
  const playStep = useCallback((scenario: MockScenario, stepIndex: number) => {
    const step = scenario.steps[stepIndex];
    if (!step) return;

    const stepKey = `${scenario.label}-${stepIndex}`;

    // Collapse all cards from previous steps (smart fold)
    if (stepIndex > 0) {
      setVisibleCards((prev) => prev.map((vc) => (vc.stepKey !== stepKey ? { ...vc, collapsed: true } : vc)));
    }

    // If step has a user message, add it first
    if (step.userMessage) {
      const userId = `user-${Date.now()}`;
      setMessages((prev) => [...prev, { id: userId, role: 'user', text: step.userMessage!, streaming: false }]);
    }

    // Add AI message with delay
    const delay = step.userMessage ? 600 : 300;
    setTimeout(() => {
      const assistantId = `assistant-${Date.now()}`;
      setMessages((prev) => [...prev, {
        id: assistantId, role: 'assistant', text: step.aiText, streaming: true,
        toolHints: step.toolHints, suggestions: step.suggestions,
      }]);

      // Schedule cards
      step.cards.forEach((card) => {
        setTimeout(() => {
          setVisibleCards((prev) => [...prev, { card, loading: true, collapsed: false, stepKey }]);
          setTimeout(() => {
            setVisibleCards((prev) => prev.map((vc) => (vc.card.id === card.id ? { ...vc, loading: false } : vc)));
          }, 1000);
        }, card.delay);
      });

      // Mark streaming done
      const streamDuration = step.aiText.length * 11;
      setTimeout(() => {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)));
        // If step has no interactive cards, and there are more steps, auto-advance
        const hasActionable = step.cards.some((c) => actionableCardTypes.has(c.type));
        if (!hasActionable && stepIndex < scenario.steps.length - 1) {
          // Auto-advance after a pause
          setTimeout(() => playStep(scenario, stepIndex + 1), 1500);
        } else if (!hasActionable) {
          setIsRunning(false);
          setActiveScenario(null);
        }
      }, streamDuration);
    }, delay);
  }, [scrollMessagesToBottom]);

  // Handle card interactive actions (deploy click, verify click, swap confirm)
  const handleCardAction = useCallback(() => {
    if (!activeScenario) return;
    const nextStep = activeScenario.stepIndex + 1;
    if (nextStep < activeScenario.scenario.steps.length) {
      setActiveScenario({ ...activeScenario, stepIndex: nextStep });
      setTimeout(() => playStep(activeScenario.scenario, nextStep), 1200);
    } else {
      setIsRunning(false);
      setActiveScenario(null);
    }
  }, [activeScenario, playStep]);

  const runScenario = useCallback((index: number) => {
    if (isRunning) return;
    const scenario = SCENARIOS[index];
    setIsRunning(true);
    setActiveScenario({ scenario, stepIndex: 0 });
    playStep(scenario, 0);
  }, [isRunning, playStep]);

  const handleReset = useCallback(() => {
    setMessages([]);
    setVisibleCards([]);
    setIsRunning(false);
    setActiveScenario(null);
    pushToast({ title: 'Session reset', variant: 'info' });
  }, [pushToast]);

  const hasCards = visibleCards.length > 0;

  // Flow step indicators for contract deploy scenario
  const contractFlowSteps = activeScenario?.scenario.label === 'Contract Deploy'
    ? ['Create', 'Deploy', 'Verify', 'Complete']
    : null;
  const contractFlowCurrent = contractFlowSteps ? Math.min(activeScenario!.stepIndex, contractFlowSteps.length - 1) : 0;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,oklch(0.78_0.16_85/0.10),transparent_44%),radial-gradient(circle_at_100%_100%,oklch(0.78_0.16_85/0.06),transparent_42%)]" />

      {/* Mini sidebar */}
      <div className="hidden w-[52px] shrink-0 border-r border-border bg-sidebar/80 lg:block">
        <div className="flex flex-col items-center gap-3 pt-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15"><Shield className="size-4 text-primary" /></div>
          <div className="h-px w-6 bg-border/50" />
          {SCENARIOS.map((s, i) => (
            <button key={i} onClick={() => runScenario(i)} disabled={isRunning}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
              title={s.label}>
              <span className="text-[10px] font-bold">{i + 1}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1">
        {/* LEFT: Conversation */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/50 px-4">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-primary" />
              {activeScenario ? (
                <>
                  <span className="text-sm font-medium text-foreground">{activeScenario.scenario.label}</span>
                  {isRunning && <Loader2 className="size-3 text-primary animate-spin" />}
                </>
              ) : (
                <span className="text-sm font-medium text-foreground">BNBrain</span>
              )}
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">SPLIT LAYOUT</span>
            </div>
            <div className="flex items-center gap-2">
              {hasCards && (
                <button onClick={() => setRightPanelOpen(!rightPanelOpen)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  {rightPanelOpen ? <PanelLeftClose className="size-3.5" /> : <PanelLeft className="size-3.5" />}
                  {rightPanelOpen ? 'Hide' : 'Show'}
                </button>
              )}
              <button onClick={handleReset}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <RotateCcw className="size-3" /> Reset
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="relative flex-1 overflow-y-auto" ref={messagesScrollRef}>
            <div className="px-4 py-6 sm:px-6">
              <div className="mx-auto max-w-3xl space-y-6">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    {/* Hero — matches production empty-state */}
                    <div className="animate-hero-entrance animate-shield-glow relative mb-5 flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-ring/30 bg-primary/10 shadow-[0_0_0_1px_rgba(0,0,0,0.12)]">
                      <Shield className="relative z-10 size-9 text-primary" />
                      <div className="animate-scan-line pointer-events-none absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
                    </div>
                    <h2 className="animate-title-slide-up mb-1.5 text-2xl font-bold tracking-tight text-foreground">BNBrain</h2>
                    <p className="animate-title-slide-up mb-1 max-w-md text-sm text-muted-foreground [animation-delay:0.2s]">
                      AI-Powered Security Agent for BNB Chain
                    </p>
                    <p className="animate-title-slide-up mb-8 max-w-sm text-xs text-muted-foreground/50 [animation-delay:0.3s]">
                      Split layout prototype — text streams left, cards render right
                    </p>

                    <div className="animate-stagger-in grid w-full max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
                      {SCENARIOS.map((s, i) => (
                        <button key={i} onClick={() => runScenario(i)} disabled={isRunning}
                          className="card-hover-lift flex items-start gap-2.5 rounded-xl border border-border bg-card p-3 text-left shadow-[0_8px_22px_-20px_rgba(0,0,0,0.45)] transition-opacity disabled:opacity-50">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                            <Hash className="size-3.5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-foreground">{s.label}</p>
                            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-2">{s.description}</p>
                            {s.steps.length > 1 && (
                              <p className="mt-1 flex items-center gap-1 text-[10px] text-primary/60">
                                <Sparkles className="size-2.5" />
                                {s.steps.length}-step flow
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg) =>
                  msg.role === 'user'
                    ? <UserMessage key={msg.id} text={msg.text} />
                    : <AssistantMessage key={msg.id} text={msg.text} streaming={msg.streaming} speed={11}
                        toolHints={msg.toolHints} suggestions={msg.suggestions}
                        onSuggestion={(s) => { pushToast({ title: `"${s}"`, description: 'This would trigger a new query in production', variant: 'info' }); }}
                      />
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Scroll-to-bottom button */}
            {showScrollBtn && (
              <button onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur-md transition-all hover:bg-card hover:text-foreground">
                <ArrowDown className="size-3" />
                Scroll to bottom
              </button>
            )}
          </div>

          {/* Input — matches production style: raised card, shadow, toolbar */}
          <div className="shrink-0 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 sm:px-4 sm:pb-4">
            <div className="relative mx-auto w-full max-w-3xl rounded-2xl border border-border bg-card/92 p-2 shadow-[0_18px_34px_-24px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-2.5">
              {/* Textarea */}
              <textarea
                placeholder="Ask anything about BNB Chain... ( / )"
                className="h-11 min-h-[44px] max-h-[160px] w-full resize-none border-0 bg-transparent px-2 py-2.5 text-base text-foreground transition-colors placeholder:text-muted-foreground/60 focus-visible:outline-none md:text-sm"
                readOnly
                rows={1}
              />
              {/* Toolbar row */}
              <div className="flex items-center justify-between pt-1">
                <button
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Quick commands"
                >
                  <Plus className="size-4" />
                </button>
                <div className="flex items-center gap-1.5">
                  {/* Model selector pill */}
                  <button className="flex items-center gap-1 rounded-full border border-border bg-background/60 px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground">
                    <Sparkles className="size-3 text-primary" />
                    GPT-4o
                    <ChevronDown className="size-2.5" />
                  </button>
                  <button
                    onClick={() => { if (!isRunning) runScenario(Math.floor(Math.random() * SCENARIOS.length)); }}
                    disabled={isRunning}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary shadow-[0_12px_24px_-16px_rgba(0,0,0,0.9)] transition-all hover:brightness-105 active:scale-95 disabled:opacity-50"
                  >
                    {isRunning ? <Square className="size-3.5 fill-white text-white" /> : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#fff" viewBox="0 0 256 256">
                        <path d="M208.49,120.49a12,12,0,0,1-17,0L140,69V216a12,12,0,0,1-24,0V69L64.49,120.49a12,12,0,0,1-17-17l72-72a12,12,0,0,1,17,0l72,72A12,12,0,0,1,208.49,120.49Z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Cards panel */}
        <div className={`shrink-0 border-l border-border/50 bg-background/80 backdrop-blur-sm transition-all duration-300 ease-in-out ${
          hasCards && rightPanelOpen ? 'w-[400px] opacity-100' : 'w-0 overflow-hidden opacity-0'
        }`}>
          <div className="flex h-full w-[400px] flex-col overflow-hidden">
            {/* Panel header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Analysis Results</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                  {visibleCards.length}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {visibleCards.some((vc) => !vc.loading) && (
                  <button
                    onClick={() => {
                      const anyExpanded = visibleCards.some((vc) => !vc.collapsed && !vc.loading);
                      setVisibleCards((prev) => prev.map((vc) => vc.loading ? vc : { ...vc, collapsed: anyExpanded }));
                    }}
                    className="rounded-md px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {visibleCards.some((vc) => !vc.collapsed && !vc.loading) ? 'Collapse All' : 'Expand All'}
                  </button>
                )}
                <button onClick={() => setRightPanelOpen(false)} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Contract flow stepper */}
            {contractFlowSteps && (
              <div className="shrink-0 border-b border-border/50 px-4 py-3">
                <div className="flex items-center gap-3">
                  {contractFlowSteps.map((label, i) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <StepDot active={i === contractFlowCurrent} done={i < contractFlowCurrent} label={label} index={i} />
                      {i < contractFlowSteps.length - 1 && (
                        <div className={`h-px w-4 ${i < contractFlowCurrent ? 'bg-emerald-500' : 'bg-muted/30'}`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cards list */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-3">
                {visibleCards.map(({ card, loading, collapsed }) => (
                  <div key={card.id} className="animate-message-in">
                    {loading ? (
                      <CardLoadingPill title={card.title} />
                    ) : collapsed ? (
                      <CompactCardView
                        card={card}
                        onExpand={() => setVisibleCards((prev) => prev.map((vc) => vc.card.id === card.id ? { ...vc, collapsed: false } : vc))}
                      />
                    ) : (
                      <div className="relative">
                        {/* Collapse button overlay */}
                        <button
                          onClick={() => setVisibleCards((prev) => prev.map((vc) => vc.card.id === card.id ? { ...vc, collapsed: true } : vc))}
                          className="absolute -right-1 -top-1 z-10 flex size-5 items-center justify-center rounded-full bg-card border border-border text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground [div:hover>&]:opacity-100"
                          title="Collapse card"
                        >
                          <ChevronDown className="size-3 rotate-180" />
                        </button>
                        <CardRenderer card={card} onAction={handleCardAction} />
                      </div>
                    )}
                  </div>
                ))}
                <div ref={cardsEndRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
