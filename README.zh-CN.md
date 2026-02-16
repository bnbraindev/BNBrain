[English](README.md) | 中文

# BNBrain — BNB Chain 上的 AI 安全代理

> 用自然语言操控 BNB Chain。一个 AI 代理完成安全扫描、交易执行、合约部署和钱包管理。

**在线演示**: [https://app.bnbrain.dev](https://app.bnbrain.dev)

**黑客松**: Good Vibes Only: OpenClaw Edition (Agent 赛道)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/4x9OKQ?referralCode=P0oSOk)

---

## BNBrain 是什么？

BNBrain 是一个能在 BNB Chain 上**执行真实操作**的 AI 代理。不用再在 DexScreener、GoPlus、PancakeSwap、BscScan 之间来回切换——直接和它对话就行。

问它某个代币安不安全，它调用 GoPlus API 获取安全数据，展示一张交互式报告卡片。问它帮你把 BNB 换成 USDT，它从 PancakeSwap 获取报价、构建交易，让你一键签名。问它写一个锁仓合约，它编写 Solidity、编译、给你一个部署按钮。

**28 个工具。24 张交互式结果卡片。零复制粘贴。**

---

## 功能列表

### 安全与分析
- **代币安全扫描** — 蜜罐检测、隐藏铸造、黑名单、持仓集中度（GoPlus）
- **地址分析** — 恶意地址检查 + 交易历史
- **钓鱼检测** — 检查任意 URL 是否为已知钓鱼/诈骗
- **dApp 安全** — 审计状态、信任列表、合约验证
- **NFT 安全** — 集合级风险评估
- **交易解码** — 解码 calldata 并评估签名风险
- **授权风险分析** — GoPlus V2 高级恶意行为检测

### 交易与 DeFi
- **兑换（PancakeSwap V2）** — 精确输入或精确输出，含滑点保护
- **代币价格与行情** — DexScreener 实时数据
- **代币搜索** — 按名称/符号查找
- **交易对流动性** — DEX 深度和成交量
- **池子储备** — 链上 PancakeSwap 储备数据
- **Gas 价格** — 当前 BSC Gas 预言机
- **新币雷达** — 最新代币 + 自动安全筛查

### 钱包管理
- **余额查询** — BNB + ERC20 组合
- **授权扫描** — 发现并撤销高风险无限授权
- **钱包健康评分** — 综合健康评估
- **钱包人格** — 基于链上行为的性格画像
- **转账历史** — 近期 ERC20 代币转账

### 智能合约
- **一键发币** — "部署一个叫 X 的代币，总量 10 亿" → 完成
- **自定义合约部署** — 写任意 Solidity，自动编译部署
- **通用合约调用** — 用 ABI 调用任意合约函数
- **交易模拟** — 预览效果，不实际发送

### 链上存证
- **存储报告** — 将安全扫描哈希上链作为防篡改证据
- **验证报告** — 检查报告哈希是否已上链

### 基础设施
- **SIWE 认证** — 钱包签名登录
- **会话历史** — 服务端同步，刷新不丢失
- **断线恢复** — 关闭标签页 AI 继续运行
- **双语** — 中文和英文
- **管理后台** — 系统健康、聊天运行指标、多管理员管理

---

## 架构

```
┌──────────────────────────────────────────────────────┐
│                     前端                               │
│  Next.js 16 App Router + Vercel AI SDK + wagmi        │
│  24 个交互式结果卡片 + 钱包签名                          │
└───────────────────────┬──────────────────────────────┘
                        │ SSE 流
┌───────────────────────▼──────────────────────────────┐
│                   聊天运行时                            │
│  Anthropic Claude + 28 个 AI 工具 + 系统提示词          │
│  Worker 模式：AI 在后台运行，刷新不中断                   │
└───────┬───────┬───────┬───────┬──────────────────────┘
        │       │       │       │
   ┌────▼──┐ ┌──▼───┐ ┌▼────┐ ┌▼──────┐
   │GoPlus │ │DexScr│ │BscSc│ │Pancake│
   │7 个API│ │4 个API│ │6个API│ │Swap V2│
   └───────┘ └──────┘ └─────┘ └───────┘
        │       │       │       │
   ┌────▼───────▼───────▼───────▼──────┐
   │         BNB Chain (BSC)            │
   │       RPC + 智能合约                │
   └───────────────────────────────────┘
```

### SDK 层

| 服务 | API | 认证 |
|------|-----|------|
| **GoPlus Security** | 代币、地址、授权、钓鱼、dApp、NFT、签名解码 | API Key（可选，提高频率限制） |
| **DexScreener** | 价格、搜索、最新代币、交易对 | 无需密钥 |
| **BscScan/Etherscan V2** | 交易历史、代币转账、余额、合约、Gas | API Key |
| **PancakeSwap V2** | 报价、反向报价、池子储备 | 链上调用（无需密钥） |

所有 SDK 调用包含 **12 秒超时**、**3 次指数退避重试**和**标准化错误处理**。

---

## 快速开始

### 方式一：一键部署到 Railway（推荐）

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/4x9OKQ?referralCode=P0oSOk)

1. 点击上方按钮 — Railway 自动创建应用 + PostgreSQL 数据库
2. 等待约 3 分钟完成构建
3. 打开应用地址 — 首次访问会看到**初始化向导**
4. 输入 Anthropic API Key 和可选的服务密钥
5. 完成！开始和 AI 代理对话

> 部署时无需填写任何环境变量。所有配置通过内置的可视化初始化向导完成。

### 方式二：Docker 自部署

```bash
git clone https://github.com/bnbraindev/BNBrain.git
cd bnb-ai
cp .env.example .env
# 编辑 .env — 只需填 DATABASE_URL，其他密钥可通过初始化向导配置
docker compose up -d
# 打开 http://localhost:3000
```

### 方式三：本地开发

**前置条件**：Node.js 22+、PostgreSQL 16+

```bash
git clone https://github.com/bnbraindev/BNBrain.git
cd bnb-ai
npm install
cp .env.example .env.local
# 编辑 .env.local 填入 DATABASE_URL
npm run dev
# 打开 http://localhost:3099
```

### 环境变量

只需 `DATABASE_URL`。所有其他设置都可以在部署后通过**初始化向导**和**管理后台**配置：

| 变量 | 必填 | UI 可配置 | 说明 |
|------|------|----------|------|
| `DATABASE_URL` | 是 | 否 | PostgreSQL 连接字符串 |
| `ANTHROPIC_API_KEY` | 否 | 初始化向导 | AI 服务 API Key |
| `ANTHROPIC_BASE_URL` | 否 | 初始化向导 | 自定义 API 端点 |
| `ETHERSCAN_API_KEY` | 否 | 管理后台 | BscScan/Etherscan V2 |
| `GOPLUS_APP_KEY/SECRET` | 否 | 管理后台 | GoPlus Security |
| `SERPER_API_KEY` | 否 | 管理后台 | Google 搜索（Serper.dev） |
| `STEEL_API_KEY` | 否 | 管理后台 | 网页抓取（Steel.dev） |
| `SIWE_DOMAIN` | 否 | 管理后台 | 认证域名锁定 |
| `SIWE_ALLOWED_CHAIN_IDS` | 否 | 管理后台 | 限制认证链 |
| `RPC_URL_56/97/204` | 否 | 管理后台 | 自定义 RPC 端点 |
| `NEXT_PUBLIC_WC_PROJECT_ID` | 否 | 否（构建时） | WalletConnect 项目 ID |
| `ADMIN_DASHBOARD_TOKEN` | 否 | 否（仅环境变量） | 管理后台访问令牌 |

---

## 测试

```bash
# Lint 检查
npm run lint

# 单元测试：恢复守卫
npm run test:resume-guard

# 端到端：28 个工具链完整测试（真实 API 调用）
npx tsx -r tsconfig-paths/register tests/e2e/tool-chain.test.ts

# 端到端：提示词智能测试（意图解析）
npx tsx -r tsconfig-paths/register tests/e2e/prompt-intelligence.test.ts
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16, React 19, Tailwind CSS, shadcn/ui |
| AI | Vercel AI SDK, Anthropic Claude |
| 区块链 | wagmi, viem, RainbowKit |
| 数据库 | PostgreSQL 17, pg 驱动 |
| 认证 | SIWE（以太坊签名登录） |
| 部署 | Docker, Railway, Cloudflare Tunnel |

---

## 文档

- [项目概述](docs/PROJECT.md) — 问题、方案、商业价值
- [技术文档](docs/TECHNICAL.md) — 架构、部署、演示场景
- [附录](docs/EXTRAS.md) — 在线演示、AI 构建日志、技术选型

---

## 许可证

MIT
