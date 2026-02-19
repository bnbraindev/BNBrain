import type { QuickAction } from './types';

export const INITIAL_MESSAGE_PAGE_SIZE = 5;
export const MESSAGE_PAGE_SIZE = 20;
export const AUTO_LOAD_TOP_THRESHOLD = 96;
export const AUTO_LOAD_COOLDOWN_MS = 250;
export const AUTO_SCROLL_SETTLE_INTERVAL_MS = 90;
export const AUTO_SCROLL_SETTLE_MAX_ATTEMPTS = 8;
export const AUTO_SCROLL_SETTLE_GAP_PX = 6;
export const SYNC_QUEUE_MAX_RETRIES = 2;
export const SYNC_QUEUE_RETRY_BASE_MS = 1200;
export const SYNC_QUEUE_RETRY_MAX_MS = 10000;
export const SYNC_BATCH_WINDOW_MS = 320;
export const CONNECTING_SOFT_TIMEOUT_MS = 7000;
export const CONNECTING_HARD_TIMEOUT_MS = 25000;
export const STREAM_STALL_SOFT_TIMEOUT_MS = 15000;
export const STREAM_STALL_HARD_TIMEOUT_MS = 90000;
export const RESTORED_RUN_STALE_MS = 10 * 60 * 1000;
export const RUN_START_DEDUP_WINDOW_MS = 1200;

export const QUICK_ACTION_KEYS = [
  // Security
  'quick.checkToken',
  'quick.approvals',
  'quick.approvalRisk',
  'quick.phishing',
  'quick.nft',
  'quick.dappSecurity',
  // Wallet
  'quick.balance',
  'quick.health',
  'quick.persona',
  'quick.transfer',
  'quick.transferHistory',
  // Trading / DeFi
  'quick.swap',
  'quick.liquidity',
  'quick.pairReserves',
  // Analysis
  'quick.address',
  'quick.txDecode',
  'quick.simulate',
  'quick.tokenSearch',
  'quick.tokenPrice',
  // Contract
  'quick.contract',
  'quick.deployToken',
  'quick.contractCall',
  // On-chain proof
  'quick.storeProof',
  'quick.verifyProof',
  // Discovery & utility
  'quick.newTokens',
  'quick.gas',
  // CEX data
  'quick.binancePrice',
  'quick.klineChart',
  'quick.technicalAnalysis',
] as const;

export const QUICK_ACTIONS_EN: QuickAction[] = [
  // Security
  { label: 'Is this token safe?', prompt: 'Is this token safe? Check 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82' },
  { label: 'Scan my approvals', prompt: 'Scan all token approvals on my wallet' },
  { label: 'Check approval risks', prompt: 'Run a deep approval risk analysis on my wallet' },
  { label: 'Is this site safe?', prompt: 'Is this URL a phishing site? Check https://example.com' },
  { label: 'Check NFT security', prompt: 'Check the security of this NFT collection' },
  { label: 'Check dApp security', prompt: 'Is PancakeSwap audited? Check the dApp security' },
  // Wallet
  { label: 'Show my wallet balance', prompt: 'Show my wallet balance' },
  { label: 'Run a health check', prompt: 'Run a full security health check on my wallet' },
  { label: 'Wallet persona analysis', prompt: 'Analyze my wallet persona and on-chain behavior' },
  { label: 'Transfer tokens', prompt: 'Transfer 0.01 BNB to 0x000...dead' },
  { label: 'View transfer history', prompt: 'Show my recent token transfer history' },
  // Trading / DeFi
  { label: 'Swap tokens', prompt: 'Swap 0.01 BNB for USDT on PancakeSwap' },
  { label: 'Check pair liquidity', prompt: 'Check the liquidity of the CAKE/BNB pair' },
  { label: 'Check pair reserves', prompt: 'Show the raw on-chain reserves for the CAKE/BNB pair' },
  // Analysis
  { label: 'Analyze an address', prompt: 'Analyze the address 0xF977814e90dA44bFA03b6295A0616a897441aceC' },
  { label: 'Decode a transaction', prompt: 'Decode this transaction: 0x' },
  { label: 'Simulate a transaction', prompt: 'Simulate a swap of 1 BNB to USDT before executing' },
  { label: 'Search token by name', prompt: 'Search for the token called CAKE on BSC' },
  { label: 'Check token price', prompt: 'What is the current price of CAKE?' },
  // Contract
  { label: 'Inspect a contract', prompt: 'Inspect the contract at 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82' },
  { label: 'Deploy an ERC20 token', prompt: 'Help me deploy a simple ERC20 token' },
  { label: 'Call a contract function', prompt: 'Call a read function on a smart contract' },
  // On-chain proof
  { label: 'Store proof on-chain', prompt: 'Store my latest security scan result as on-chain proof' },
  { label: 'Verify on-chain proof', prompt: 'Verify an on-chain report proof by hash' },
  // Discovery & utility
  { label: 'Show new BSC tokens', prompt: 'Show me the newest tokens on BSC' },
  { label: 'Check gas price', prompt: 'What is the current gas price on BSC?' },
  // CEX data
  { label: 'Get Binance price', prompt: 'Show me the 24h Binance ticker for BNB' },
  { label: 'View K-line chart', prompt: 'Show the 1-hour K-line chart for BNB on Binance' },
  { label: 'Technical analysis', prompt: 'Run a technical analysis on BNB with RSI, MACD, and Bollinger Bands' },
];

export const QUICK_ACTIONS_ZH: QuickAction[] = [
  // Security
  { label: '这个代币安全吗？', prompt: '帮我检测 CAKE 代币安全吗？地址 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82' },
  { label: '扫描我的授权', prompt: '扫描我钱包的所有代币授权' },
  { label: '授权风险深度检查', prompt: '对我的钱包做一次深度授权风险分析' },
  { label: '这个网站安全吗？', prompt: '帮我检测这个网址是否是钓鱼网站 https://example.com' },
  { label: '检查 NFT 安全', prompt: '帮我检查这个 NFT 合集的安全性' },
  { label: '检查 dApp 安全', prompt: 'PancakeSwap 做过审计吗？帮我查一下这个 dApp 的安全性' },
  // Wallet
  { label: '查看我的钱包余额', prompt: '查看我的钱包余额' },
  { label: '帮我做个钱包体检', prompt: '帮我做一个完整的钱包安全体检' },
  { label: '钱包画像分析', prompt: '分析我的钱包画像和链上行为' },
  { label: '转账', prompt: '转 0.01 BNB 到 0x000...dead' },
  { label: '查看转账记录', prompt: '看看我最近的代币转账记录' },
  // Trading / DeFi
  { label: '兑换代币', prompt: '用 0.01 BNB 兑换 USDT' },
  { label: '查看流动性', prompt: '查看 CAKE/BNB 交易对的流动性' },
  { label: '查看交易对储备', prompt: '查看 CAKE/BNB 交易对的链上储备量' },
  // Analysis
  { label: '分析一个地址', prompt: '分析这个地址 0xF977814e90dA44bFA03b6295A0616a897441aceC' },
  { label: '解码交易', prompt: '解码这笔交易：0x' },
  { label: '模拟交易', prompt: '模拟一笔 1 BNB 兑换 USDT 的交易' },
  { label: '搜索代币', prompt: '帮我搜索 BSC 上叫 CAKE 的代币' },
  { label: '查看代币价格', prompt: 'CAKE 现在什么价格？' },
  // Contract
  { label: '查看合约信息', prompt: '查看合约 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82 的详细信息' },
  { label: '部署 ERC20 代币', prompt: '帮我部署一个简单的 ERC20 代币' },
  { label: '调用合约方法', prompt: '帮我调用一个智能合约的只读方法' },
  // On-chain proof
  { label: '存证上链', prompt: '把我最近一次安全扫描结果存证上链' },
  { label: '验证链上存证', prompt: '通过哈希验证一条链上报告存证' },
  // Discovery & utility
  { label: '看看最新的 BSC 代币', prompt: '看看最近新上线的 BSC 代币' },
  { label: '查看 Gas 费', prompt: '当前 BSC 的 Gas 价格是多少？' },
  // CEX data
  { label: '查看币安价格', prompt: '查看 BNB 在币安的 24 小时行情' },
  { label: '查看 K 线图', prompt: '查看 BNB 在币安的 1 小时 K 线图' },
  { label: '技术分析', prompt: '对 BNB 做一个包含 RSI、MACD、布林带的技术分析' },
];
