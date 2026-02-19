[English](README.md) | 中文

# BNBrain — BNB Chain 上的 AI 安全代理

> **参赛赛道：Agent（AI Agent x 链上操作）**
>
> 用自然语言操控 BNB Chain。一个 AI 代理完成安全扫描、交易执行、合约部署和钱包管理。

**在线演示**: [https://app.bnbrain.dev](https://app.bnbrain.dev) | **仓库**: [github.com/bnbraindev/BNBrain](https://github.com/bnbraindev/BNBrain)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/QoOIlX)


![Contract Deployment Flow](https://static.bnbrain.dev/contract.png)
---

## BNBrain 是什么？

BNBrain 是一个能在 BNB Chain 上**执行真实操作**的 AI 代理。不用再在 DexScreener、GoPlus、PancakeSwap、BscScan 之间来回切换——直接和它对话就行。

问它某个代币安不安全，它调用 GoPlus API 获取安全数据，展示一张交互式报告卡片。问它帮你把 BNB 换成 USDT，它从 PancakeSwap 获取报价、构建交易，让你一键签名。问它写一个合约，它编写 Solidity、编译（支持 OpenZeppelin）、给你一个部署按钮——部署后自动到 BscScan 验证。

**37 个工具。24 张交互式结果卡片。零复制粘贴。**

---

## 链上证明

所有操作在 **BSC 主网** 和 **opBNB** 上执行。查看 [`bsc.address`](bsc.address) 获取完整合约信息和对话回放链接。

| 合约 | 链 | 地址 | 说明 |
|------|---|------|------|
| ReportRegistry | BSC Mainnet (56) | [`0x6BAd70d55753b35BDE6820F570452F0E1BD371d4`](https://bscscan.com/address/0x6bad70d55753b35bde6820f570452f0e1bd371d4) | 链上安全报告哈希存证，由 BNBrain 自身部署并验证（[对话回放](https://app.bnbrain.dev/share/e94008ed-759a-4b9b-af3f-3160b4ae7ebd)） |
| BNBrain (ERC20 Token) | BSC Mainnet (56) | [`0xcF7C93e9A8D27b706263Ce3ca88BC65C051C83e4`](https://bscscan.com/address/0xcf7c93e9a8d27b706263ce3ca88bc65c051c83e4) | 用自然语言描述需求，AI 生成 Solidity、编译、部署并自动验证（[对话回放](https://app.bnbrain.dev/share/d814c63f-280f-4cbf-bd6b-9282f30eb8d2)） |
| GeneralLocker | BSC Mainnet (56) | [`0x113D68588700A05d7CFbAf788cB6Fb184c3586Ac`](https://bscscan.com/address/0x113d68588700a05d7cfbaf788cb6fb184c3586ac) | 通用代币锁仓合约，基于 OpenZeppelin SafeERC20 和 Ownable（[对话回放](https://app.bnbrain.dev/share/8c22ee75-a42f-48fd-b383-ac87f4f454b6)） |

---

## 功能列表

### 安全与分析
- **代币安全扫描** — 蜜罐检测、隐藏铸造、黑名单、持仓集中度（GoPlus + Honeypot.is 交叉验证）
- **地址分析** — 恶意地址检查 + 交易历史
- **钓鱼检测** — 检查任意 URL 是否为已知钓鱼/诈骗
- **dApp 安全** — 审计状态、信任列表、合约验证
- **NFT 安全** — 集合级风险评估
- **交易解码** — 解码 calldata 并评估签名风险
- **授权风险分析** — GoPlus V2 高级恶意行为检测

### 交易与 DeFi
- **兑换（PancakeSwap V2）** — 精确输入或精确输出，含滑点保护
- **代币价格与行情** — DexScreener + Binance 实时数据
- **代币搜索** — 按名称/符号查找
- **交易对流动性** — DEX 深度和成交量
- **池子储备** — 链上 PancakeSwap 储备数据
- **Gas 价格** — 当前 BSC Gas 预言机
- **新币雷达** — 最新代币 + 自动安全筛查
- **技术指标分析** — RSI、MACD、布林带等

### 钱包管理
- **余额查询** — BNB + ERC20 组合
- **授权扫描** — 发现并撤销高风险无限授权
- **钱包健康评分** — 综合健康评估
- **钱包人格** — 基于链上行为的性格画像
- **转账历史** — 近期 ERC20 代币转账

### 智能合约
- **一键发币** — "部署一个叫 X 的代币，总量 10 亿" → 完成
- **自定义合约部署** — 写任意 Solidity，自动编译（支持 OpenZeppelin）部署
- **合约验证** — 部署后自动到 BscScan 验证
- **通用合约调用** — 用 ABI 调用任意合约函数
- **交易模拟** — 预览效果，不实际发送
- **合约检查器** — 查看已验证的源码和 ABI

### 链上存证
- **存储报告** — 将安全扫描哈希存到 ReportRegistry 合约，作为防篡改证据
- **验证报告** — 检查报告哈希是否已上链

### 基础设施
- **SIWE 认证** — 钱包签名登录
- **Worker 后台运行** — 关闭标签页 AI 继续执行
- **会话历史** — 服务端同步，刷新不丢失
- **双语** — 中文和英文（i18n）
- **管理后台** — 系统健康、模型管理、数据源监控
- **一键部署** — Railway 按钮或 Docker，初始化向导自动配置

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
│  Anthropic Claude + 37 个 AI 工具 + 系统提示词          │
│  Worker 模式：AI 在后台运行，刷新不中断                   │
└───────┬───────┬───────┬───────┬──────────────────────┘
        │       │       │       │
   ┌────▼──┐ ┌──▼───┐ ┌▼────┐ ┌▼──────┐
   │GoPlus │ │DexScr│ │BscSc│ │Pancake│
   │7 个API│ │4 个API│ │6个API│ │Swap V2│
   └───────┘ └──────┘ └─────┘ └───────┘
        │       │       │       │
   ┌────▼───────▼───────▼───────▼──────┐
   │     BNB Chain (BSC + opBNB)       │
   │       RPC + 智能合约                │
   └───────────────────────────────────┘
```

---

## 快速开始

### 方式一：一键部署到 Railway（推荐）

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/QoOIlX)

1. 点击按钮 — Railway 自动创建应用 + PostgreSQL 数据库
2. 部署在 1 分钟内完成（预构建镜像）
3. 打开应用地址 → **初始化向导**引导完成配置
4. 输入 Anthropic API Key 和可选的服务密钥
5. 连接钱包，开始对话

### 方式二：Docker 一键部署（自托管）

内置 PostgreSQL，无需外部数据库：

```bash
git clone https://github.com/bnbraindev/BNBrain.git
cd BNBrain
docker compose -f docker-compose.deploy.yml up -d
# 打开 http://localhost:3000 → 初始化向导
```

### 方式三：本地开发

**前置条件**：Node.js 22+、PostgreSQL 16+

```bash
git clone https://github.com/bnbraindev/BNBrain.git
cd BNBrain
npm install
cp .env.example .env.local
# 编辑 .env.local 填入 DATABASE_URL
npm run dev
# 打开 http://localhost:3099
```

> 部署时只需 `DATABASE_URL`。所有其他设置（API Key、RPC 端点、认证配置）通过内置的**初始化向导**和**管理后台**配置。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| AI | Vercel AI SDK 6, Anthropic Claude |
| 区块链 | wagmi 2, viem 2, RainbowKit 2 |
| 智能合约 | Solidity 0.8.33, OpenZeppelin 5.4, solc |
| 数据库 | PostgreSQL 17 |
| 认证 | SIWE（以太坊签名登录） |
| 部署 | Docker, Railway, Vercel |

---

## 文档

- [项目概述](docs/PROJECT.zh-CN.md) ([English](docs/PROJECT.md)) — 问题、方案、生态影响、路线图
- [技术文档](docs/TECHNICAL.zh-CN.md) ([English](docs/TECHNICAL.md)) — 架构、搭建说明、演示场景
- [附录](docs/EXTRAS.zh-CN.md) ([English](docs/EXTRAS.md)) — 在线演示、AI 构建日志、演示材料
- [链上地址](bsc.address) — 已部署合约和交易证据

---

## 许可证

MIT
