[English](TECHNICAL.md) | 中文

# BNBrain — 技术文档：架构、搭建与演示

---

## 1. 架构

### 系统概述

BNBrain 是一个全栈 AI 代理应用，基于 **Next.js 16（App Router）** 构建，采用 **Worker 模式的聊天运行时**，编排 37 个 AI 工具，覆盖 BNB Chain 上的安全、DeFi、钱包管理和智能合约操作。

系统遵循**三层架构**：前端 React 层包含 24 个交互式结果卡片；服务端 AI 运行时通过 Vercel AI SDK 调用 Anthropic Claude；服务层集成 10+ 外部数据源（GoPlus、DexScreener、BscScan、PancakeSwap、Binance 等）。

### 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| **前端** | Next.js（App Router）、React、Tailwind CSS 4、shadcn/ui（Radix） | 16.x、19.x |
| **AI 运行时** | Vercel AI SDK、Anthropic Claude | 6.x |
| **区块链** | wagmi、viem、RainbowKit | 2.19、2.45、2.2 |
| **智能合约** | Solidity（solc）、OpenZeppelin Contracts | 0.8.33、5.4 |
| **数据库** | PostgreSQL | 17 |
| **认证** | SIWE（以太坊签名登录） | - |
| **状态管理** | Zustand、TanStack React Query | 5.x |
| **国际化** | 自定义（中文 + 英文） | - |
| **部署** | Docker（standalone）、Railway、Vercel | - |

### 组件架构图

```mermaid
flowchart TB
    subgraph Frontend["前端 (Next.js 16 + React 19)"]
        UI[聊天界面]
        Cards[24 个结果卡片]
        Wallet[RainbowKit 钱包]
    end

    subgraph Runtime["服务端：聊天运行时"]
        Worker[Worker 循环]
        AI[Anthropic Claude]
        Tools[37 个 AI 工具]
        SSE[SSE 流]
    end

    subgraph Services["服务层"]
        GoPlus[GoPlus Security<br/>7 个 API]
        DexScr[DexScreener<br/>4 个 API]
        BscScan[BscScan/Etherscan V2<br/>6 个 API]
        PCS[PancakeSwap V2<br/>链上调用]
        Binance[Binance<br/>行情数据]
        Solc[Solidity 编译器<br/>Worker Thread]
    end

    subgraph Storage["数据层"]
        DB[(PostgreSQL<br/>12 张表)]
    end

    subgraph Chain["BNB Chain"]
        BSC[BSC 主网<br/>Chain 56]
        opBNB[opBNB<br/>Chain 204]
        Contracts[ReportRegistry<br/>+ 用户合约]
    end

    UI --> |POST /api/chat| Worker
    Worker --> AI
    AI --> Tools
    Tools --> GoPlus & DexScr & BscScan & PCS & Binance & Solc
    Worker --> |事件| SSE
    SSE --> |Server-Sent Events| UI
    Tools --> |读写| DB
    Worker --> |运行状态| DB
    UI --> |签名交易| Wallet
    Wallet --> |发送交易| BSC & opBNB
    PCS --> |链上调用| BSC
    Tools --> |部署/调用| Contracts
    GoPlus & DexScr & BscScan --> |API 调用| Chain
```

### 数据流：安全扫描 → 兑换

```mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant W as Worker
    participant AI as Claude AI
    participant G as GoPlus
    participant H as Honeypot.is
    participant P as PancakeSwap
    participant C as BSC 链

    U->>F: "0x... 安全吗？安全就换 0.1 BNB"
    F->>W: POST /api/chat（创建 run）
    W->>AI: 流式调用，37 个工具可用
    AI->>G: tokenSecurity(address)
    AI->>H: honeypotCheck(address)
    G-->>AI: 安全报告
    H-->>AI: 蜜罐检测结果
    AI-->>F: [SSE] 安全报告卡片
    Note over AI: 代币安全 → 继续兑换
    AI->>P: getAmountsOut(0.1 BNB → token)
    P-->>AI: 报价：X 个代币，价格影响 0.3%
    AI-->>F: [SSE] 兑换预览卡片
    F-->>U: 显示兑换预览 + 签名按钮
    U->>F: 点击"确认兑换"
    F->>C: 发送兑换交易（通过钱包）
    C-->>F: 交易哈希
    F-->>U: 交易已确认 ✓
```

### Worker 后台聊天运行时

聊天系统采用 **Worker 后台架构**，即使用户断开连接，AI 仍持续处理：

1. **请求**：前端 `POST /api/chat` → 创建 `chat_run` 记录（状态：`queued`）
2. **Worker 拾取**：后台 Worker 轮询队列（最多 3 个并发）
3. **AI 执行**：Claude 流式处理，工具调用写入 `chat_run_events` 表
4. **SSE 传输**：前端通过 `GET /api/chat/[id]/stream` 消费事件
5. **断线恢复**：客户端可从 `lastEventSeq` 继续消费，数据不丢失
6. **租约机制**：每个 run 60 秒租约，每 15 秒续租，防止死锁
7. **心跳**：长工具调用期间每 8 秒发送心跳，防止超时

### 链上 vs 链下

| 组件 | 链上 | 链下 |
|------|------|------|
| **安全报告** | 哈希存入 ReportRegistry（BSC） | 完整报告存 PostgreSQL |
| **代币兑换** | PancakeSwap V2 Router 交易（BSC） | 报价计算、滑点检查 |
| **合约部署** | 部署交易（BSC/opBNB） | 编译（solc Worker Thread） |
| **合约验证** | - | BscScan API 提交 |
| **钱包认证** | SIWE 签名（EIP-4361） | 会话令牌存 DB |
| **聊天历史** | - | PostgreSQL（12 张表） |

### 安全设计

- **SIWE 认证** — 钱包签名登录，无密码，会话 30 天过期
- **速率限制** — 每 IP 20 请求/分钟（滑动窗口，数据库驱动）
- **Owner 验证** — 每个 API 调用携带 `x-bnb-owner-type` + `x-bnb-owner-id` 头
- **交易安全** — 所有交易需用户显式钱包签名；AI 无法签名
- **审计日志** — `security_audit_logs` 表记录所有敏感操作
- **XSS 防护** — HTML 报告输出渲染前消毒
- **URL 安全** — 所有外部 URL 进行协议注入过滤

---

## 2. 搭建与运行

### 前置条件

- **Node.js** 22+（推荐使用 [fnm](https://github.com/Schniz/fnm) 管理版本）
- **PostgreSQL** 16+（本地安装、Docker 或托管服务如 Railway/Supabase）
- **Anthropic API Key**（在 [console.anthropic.com](https://console.anthropic.com) 获取）
- **MetaMask** 或任何 EVM 兼容的钱包浏览器扩展
- **Git** 用于克隆仓库

### 方式一：Railway 一键部署

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/QoOIlX)

1. 点击部署按钮 — Railway 自动创建应用 + PostgreSQL
2. 等待约 3 分钟完成构建
3. 打开应用地址 → 首次访问出现**初始化向导**
4. 输入 Anthropic API Key（必填）和可选的服务密钥
5. 连接钱包，开始对话

### 方式二：Docker 自部署

```bash
# 克隆
git clone https://github.com/bnbraindev/BNBrain.git
cd BNBrain

# 配置
cp .env.example .env
# 编辑 .env — 设置 DATABASE_URL（唯一必填变量）
# 示例：DATABASE_URL=postgresql://user:pass@localhost:5432/bnbrain

# 构建并运行
docker compose up -d

# 打开 http://localhost:3000
# 初始化向导会引导完成后续配置
```

### 方式三：本地开发

```bash
# 克隆
git clone https://github.com/bnbraindev/BNBrain.git
cd BNBrain

# 安装依赖
npm install

# 配置
cp .env.example .env.local
# 编辑 .env.local — 设置 DATABASE_URL

# 启动开发服务器
npm run dev

# 打开 http://localhost:3099
```

### 环境变量

启动时只需 **`DATABASE_URL`**。其他所有设置可通过内置的**初始化向导**（首次访问）和**管理后台**（持续管理）配置：

| 变量 | 必填 | UI 可配置 | 用途 |
|------|------|----------|------|
| `DATABASE_URL` | **是** | 否 | PostgreSQL 连接 |
| `ANTHROPIC_API_KEY` | 否* | 初始化向导 | AI 服务（聊天功能必需） |
| `ETHERSCAN_API_KEY` | 否 | 管理后台 | BscScan 合约验证与交易历史 |
| `GOPLUS_APP_KEY` / `GOPLUS_APP_SECRET` | 否 | 管理后台 | 安全扫描频率提升 |
| `SERPER_API_KEY` | 否 | 管理后台 | Google 搜索（深度分析用） |
| `STEEL_API_KEY` | 否 | 管理后台 | 无头浏览器抓取 |
| `RPC_URL_56` / `RPC_URL_204` | 否 | 管理后台 | 自定义 RPC 端点 |
| `NEXT_PUBLIC_WC_PROJECT_ID` | 否 | 否（构建时） | WalletConnect |

### 验证安装

启动应用后：

1. 打开应用地址 — 应看到初始化向导（首次）或聊天界面
2. 点击右上角按钮连接钱包
3. 试试："当前 BNB 的 Gas 价格是多少？" — 应返回 Gas 价格卡片
4. 试试："检查 CAKE 代币是否安全" — 应返回安全报告卡片
5. 访问 `/admin` 查看管理后台系统健康状态

---

## 3. 演示指南

### 访问方式

- **在线演示**：[https://app.bnbrain.dev](https://app.bnbrain.dev)
- **本地**：`http://localhost:3000`（Docker）或 `http://localhost:3099`（开发模式）

### 用户流程

```mermaid
journey
    title BNBrain 演示流程
    section 连接
      打开 app.bnbrain.dev: 5: 用户
      连接 MetaMask 钱包: 5: 用户
      签署 SIWE 消息: 5: 用户
    section 安全扫描
      问"0x... 这个代币安全吗？": 5: 用户
      查看安全报告卡片: 5: 用户
    section 交易
      问"用 0.01 BNB 换 USDT": 5: 用户
      查看兑换预览: 5: 用户
      在钱包中确认交易: 5: 用户
    section 部署
      问"部署一个叫 TestCoin 的代币": 4: 用户
      查看编译结果: 5: 用户
      部署并在 BscScan 验证: 4: 用户
```

### 推荐尝试的操作

**1. 安全扫描（只读，无需连接钱包）**
```
"这个代币安全吗：0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"
→ 返回：交互式安全报告卡片，含风险评分
```

**2. 代币搜索与行情**
```
"搜索 PancakeSwap 代币"
→ 返回：代币搜索结果，含价格、成交量和链接

"查看 Binance 上 BNB/USDT 的价格"
→ 返回：实时行情卡片，含 24 小时统计
```

**3. 钱包健康检查（需连接钱包）**
```
"扫描我的钱包健康状况"
→ 返回：健康评分、授权风险、余额概览

"查看我的代币授权"
→ 返回：授权列表 + 一键撤销按钮
```

**4. DeFi 交易（需连接钱包 + 持有 BNB）**
```
"用 0.01 BNB 换 USDT"
→ 返回：兑换预览卡片，含价格影响、滑点和确认按钮

"PancakeSwap 上 BNB/USDT 交易对的流动性如何？"
→ 返回：流动性深度卡片，含储备数据
```

**5. 智能合约部署（需连接钱包 + BNB 支付 Gas）**
```
"部署一个 ERC20 代币，名叫 DemoToken，符号 DEMO，总量 100 万"
→ 返回：编译预览 + 部署按钮
→ 部署后：自动到 BscScan 验证
```

**6. 深度分析（耗时 30-60 秒）**
```
"对 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82 做深度分析"
→ 返回：全面的 HTML 报告，覆盖安全、市场、持仓和社交数据
```

**7. 链上报告存证**
```
"把上一份安全报告存到链上"
→ 返回：交易，将报告哈希存入 ReportRegistry 合约
```

### 预期结果

| 操作 | 你会看到 |
|------|---------|
| 安全扫描 | 交互式卡片，含风险等级（安全/警告/危险）、详细发现、多源交叉验证 |
| 兑换 | 预览卡片：代币进出、价格影响、最低收到、滑点、确认按钮 |
| 部署合约 | 编译结果、预估 Gas、部署按钮、部署后 BscScan 验证 |
| 钱包扫描 | 健康评分（0-100）、授权列表含风险等级、撤销按钮 |
| 深度分析 | 完整 HTML 报告：安全、市场、持仓、社交、技术分析 |

### 常见问题排查

| 问题 | 解决方案 |
|------|---------|
| "请先连接钱包" | 点击右上角钱包按钮，连接 MetaMask |
| 网络错误 | 在 MetaMask 中切换到 BSC 主网（Chain ID: 56） |
| 兑换失败 "余额不足" | 确保有足够的 BNB 用于兑换金额和 Gas |
| 安全扫描无数据 | 非常新的代币可能还没有 GoPlus 数据；先试知名代币 |
| AI 响应似乎卡住 | 检查 Worker 是否在运行；状态指示器显示处理状态 |
| "频率限制" | 等待 1 分钟；限制为每 IP 20 请求/分钟 |
