English | [中文](TECHNICAL.zh-CN.md)

# BNBrain — Technical: Architecture, Setup & Demo

---

## 1. Architecture

### System Overview

BNBrain is a full-stack AI agent application built on **Next.js 16 (App Router)** with a **worker-based chat runtime** that orchestrates 37 AI tools across security, DeFi, wallet management, and smart contract operations on BNB Chain.

The system follows a **three-tier architecture**: a React frontend with 24 interactive result cards, a server-side AI runtime powered by Anthropic Claude via the Vercel AI SDK, and a service layer integrating 10+ external data sources (GoPlus, DexScreener, BscScan, PancakeSwap, Binance, etc.).

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | Next.js (App Router), React, Tailwind CSS 4, shadcn/ui (Radix) | 16.x, 19.x |
| **AI Runtime** | Vercel AI SDK, Anthropic Claude | 6.x |
| **Blockchain** | wagmi, viem, RainbowKit | 2.19, 2.45, 2.2 |
| **Smart Contracts** | Solidity (solc), OpenZeppelin Contracts | 0.8.33, 5.4 |
| **Database** | PostgreSQL | 17 |
| **Auth** | SIWE (Sign-In with Ethereum) | - |
| **State** | Zustand, TanStack React Query | 5.x |
| **i18n** | Custom (Chinese + English) | - |
| **Deployment** | Docker (standalone), Railway, Vercel | - |

### Component Diagram

```mermaid
flowchart TB
    subgraph Frontend["Frontend (Next.js 16 + React 19)"]
        UI[Chat Interface]
        Cards[24 Result Cards]
        Wallet[RainbowKit Wallet]
    end

    subgraph Runtime["Server: Chat Runtime"]
        Worker[Worker Loop]
        AI[Anthropic Claude]
        Tools[37 AI Tools]
        SSE[SSE Stream]
    end

    subgraph Services["Service Layer"]
        GoPlus[GoPlus Security<br/>7 APIs]
        DexScr[DexScreener<br/>4 APIs]
        BscScan[BscScan/Etherscan V2<br/>6 APIs]
        PCS[PancakeSwap V2<br/>On-chain]
        Binance[Binance<br/>Market Data]
        Solc[Solidity Compiler<br/>Worker Thread]
    end

    subgraph Storage["Data Layer"]
        DB[(PostgreSQL<br/>12 tables)]
    end

    subgraph Chain["BNB Chain"]
        BSC[BSC Mainnet<br/>Chain 56]
        opBNB[opBNB<br/>Chain 204]
        Contracts[ReportRegistry<br/>+ User Contracts]
    end

    UI --> |POST /api/chat| Worker
    Worker --> AI
    AI --> Tools
    Tools --> GoPlus & DexScr & BscScan & PCS & Binance & Solc
    Worker --> |Events| SSE
    SSE --> |Server-Sent Events| UI
    Tools --> |Read/Write| DB
    Worker --> |Run state| DB
    UI --> |Sign tx| Wallet
    Wallet --> |Send tx| BSC & opBNB
    PCS --> |On-chain calls| BSC
    Tools --> |Deploy/Call| Contracts
    GoPlus & DexScr & BscScan --> |API calls| Chain
```

### Data Flow: Security Scan → Swap

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant W as Worker
    participant AI as Claude AI
    participant G as GoPlus
    participant H as Honeypot.is
    participant P as PancakeSwap
    participant C as BSC Chain

    U->>F: "Is 0x... safe? If yes, swap 0.1 BNB for it"
    F->>W: POST /api/chat (create run)
    W->>AI: Stream with 37 tools
    AI->>G: tokenSecurity(address)
    AI->>H: honeypotCheck(address)
    G-->>AI: Security report
    H-->>AI: Honeypot result
    AI-->>F: [SSE] Security report card
    Note over AI: Token is safe → proceed to swap
    AI->>P: getAmountsOut(0.1 BNB → token)
    P-->>AI: Quote: X tokens, price impact 0.3%
    AI-->>F: [SSE] Swap preview card
    F-->>U: Show swap preview with sign button
    U->>F: Click "Confirm Swap"
    F->>C: Send swap transaction (via wallet)
    C-->>F: Transaction hash
    F-->>U: Transaction confirmed ✓
```

### Worker-Based Chat Runtime

The chat system uses a **worker-based architecture** that ensures AI continues processing even if the user disconnects:

1. **Request**: Frontend `POST /api/chat` → creates `chat_run` record (status: `queued`)
2. **Worker picks up**: Background worker polls for queued runs (max 3 concurrent)
3. **AI execution**: Claude processes with streaming, tool calls written to `chat_run_events` table
4. **SSE delivery**: Frontend consumes events via `GET /api/chat/[id]/stream`
5. **Reconnect**: Client can resume from `lastEventSeq` — no data lost
6. **Lease mechanism**: 60s lease per run, renewed every 15s, prevents deadlocks
7. **Heartbeat**: Long tool calls emit heartbeat every 8s to prevent timeout

### On-Chain vs Off-Chain

| Component | On-Chain | Off-Chain |
|-----------|----------|-----------|
| **Security reports** | Hash stored on ReportRegistry (opBNB) | Full report in PostgreSQL |
| **Token swaps** | PancakeSwap V2 Router tx on BSC | Quote calculation, slippage check |
| **Contract deploy** | Deployment tx on BSC/opBNB | Compilation (solc worker thread) |
| **Contract verify** | - | BscScan API submission |
| **Wallet auth** | SIWE signature (EIP-4361) | Session token in DB |
| **Chat history** | - | PostgreSQL (12 tables) |

### Security Design

- **SIWE authentication** — wallet-signed login, no passwords, sessions expire in 30 days
- **Rate limiting** — 20 requests/minute per IP (sliding window, DB-backed)
- **Owner verification** — every API call carries `x-bnb-owner-type` + `x-bnb-owner-id` headers
- **Transaction safety** — all transactions require explicit user wallet signature; AI cannot sign
- **Audit logging** — `security_audit_logs` table records all sensitive operations
- **XSS prevention** — HTML report output sanitized before rendering
- **URL safety** — protocol injection filtering on all external URLs

---

## 2. Setup & Run

### Prerequisites

- **Node.js** 22+ (recommended: use [fnm](https://github.com/Schniz/fnm) for version management)
- **PostgreSQL** 16+ (local install, Docker, or managed service like Railway/Supabase)
- **Anthropic API Key** (get one at [console.anthropic.com](https://console.anthropic.com))
- **MetaMask** or any EVM-compatible wallet browser extension
- **Git** for cloning the repository

### Option 1: Railway (One-Click Deploy)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/QoOIlX)

1. Click the deploy button — Railway provisions app + PostgreSQL automatically
2. Wait ~3 minutes for the build
3. Open your app URL → **Setup Wizard** appears on first visit
4. Enter your Anthropic API key (required) and optional service keys
5. Connect your wallet and start chatting

### Option 2: Docker (Self-Hosted)

```bash
# Clone
git clone https://github.com/bnbraindev/BNBrain.git
cd bnb-ai

# Configure
cp .env.example .env
# Edit .env — set DATABASE_URL (only required variable)
# Example: DATABASE_URL=postgresql://user:pass@localhost:5432/bnbrain

# Build and run
docker compose up -d

# Open http://localhost:3000
# The Setup Wizard will guide you through the rest
```

### Option 3: Local Development

```bash
# Clone
git clone https://github.com/bnbraindev/BNBrain.git
cd bnb-ai

# Install dependencies
npm install

# Configure
cp .env.example .env.local
# Edit .env.local — set DATABASE_URL

# Start development server
npm run dev

# Open http://localhost:3099
```

### Environment Variables

Only **`DATABASE_URL`** is required at startup. All other settings can be configured through the built-in **Setup Wizard** (first visit) and **Admin Dashboard** (ongoing management):

| Variable | Required | Configurable via UI | Purpose |
|----------|----------|-------------------|---------|
| `DATABASE_URL` | **Yes** | No | PostgreSQL connection |
| `ANTHROPIC_API_KEY` | No* | Setup Wizard | AI provider (required for chat to work) |
| `ETHERSCAN_API_KEY` | No | Admin Dashboard | BscScan contract verification & tx history |
| `GOPLUS_APP_KEY` / `GOPLUS_APP_SECRET` | No | Admin Dashboard | Enhanced security scanning rate limits |
| `SERPER_API_KEY` | No | Admin Dashboard | Google search for deep analysis |
| `STEEL_API_KEY` | No | Admin Dashboard | Headless browser scraping |
| `RPC_URL_56` / `RPC_URL_204` | No | Admin Dashboard | Custom RPC endpoints |
| `NEXT_PUBLIC_WC_PROJECT_ID` | No | No (build-time) | WalletConnect |

### Verify Installation

After starting the app:

1. Open the app URL — you should see the Setup Wizard (first time) or the chat interface
2. Connect your wallet using the button in the top-right corner
3. Try: "What is the current BNB gas price?" — should return a gas price card
4. Try: "Check if CAKE token is safe" — should return a security report card
5. Check the Admin Dashboard at `/admin` for system health status

---

## 3. Demo Guide

### Access

- **Live demo**: [https://app.bnbrain.dev](https://app.bnbrain.dev)
- **Local**: `http://localhost:3000` (Docker) or `http://localhost:3099` (dev)

### User Flow

```mermaid
journey
    title BNBrain Demo Flow
    section Connect
      Open app.bnbrain.dev: 5: User
      Connect MetaMask wallet: 5: User
      Sign SIWE message: 5: User
    section Security Scan
      Ask "Is 0x... token safe?": 5: User
      View security report card: 5: User
    section Trade
      Ask "Swap 0.01 BNB for USDT": 5: User
      Review swap preview: 5: User
      Confirm transaction in wallet: 5: User
    section Deploy
      Ask "Deploy a token called TestCoin": 4: User
      Review compiled contract: 5: User
      Deploy and verify on BscScan: 4: User
```

### Key Actions to Try

**1. Security Scanning (no wallet needed for read-only)**
```
"Is this token safe: 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"
→ Returns: Interactive security report card with risk scores
```

**2. Token Search & Market Data**
```
"Search for PancakeSwap token"
→ Returns: Token search results with prices, volume, and links

"Show me the BNB/USDT price on Binance"
→ Returns: Real-time ticker card with 24h stats
```

**3. Wallet Health Check (requires connected wallet)**
```
"Scan my wallet health"
→ Returns: Health score, approval risks, balance overview

"Show my token approvals"
→ Returns: Approval list with one-click revoke buttons
```

**4. DeFi Trading (requires connected wallet + BNB)**
```
"Swap 0.01 BNB for USDT"
→ Returns: Swap preview card with price impact, slippage, and confirm button

"What's the liquidity of the BNB/USDT pair on PancakeSwap?"
→ Returns: Liquidity depth card with reserve amounts
```

**5. Smart Contract Deployment (requires connected wallet + BNB for gas)**
```
"Deploy an ERC20 token called DemoToken with symbol DEMO and 1 million supply"
→ Returns: Compiled contract preview + deploy button
→ After deploy: Auto-verifies on BscScan
```

**6. Deep Analysis (takes 30-60 seconds)**
```
"Do a deep analysis on 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"
→ Returns: Comprehensive HTML report covering security, market, holders, and social data
```

**7. On-Chain Report Storage**
```
"Store the last security report on-chain"
→ Returns: Transaction to store report hash on ReportRegistry contract
```

### Expected Outcomes

| Action | What You See |
|--------|-------------|
| Security scan | Interactive card with risk level (Safe/Warning/Danger), detailed findings, cross-source verification |
| Swap | Preview card showing: tokens in/out, price impact, minimum received, slippage, confirm button |
| Deploy contract | Compilation result, estimated gas, deploy button, post-deploy BscScan verification |
| Wallet scan | Health score (0-100), list of approvals with risk levels, revoke buttons |
| Deep analysis | Full HTML report with sections: Security, Market, Holders, Social, Technical |

### Troubleshooting

| Issue | Solution |
|-------|---------|
| "Connect your wallet first" | Click the wallet button in top-right, connect MetaMask |
| Wrong network | Switch to BSC Mainnet (Chain ID: 56) in MetaMask |
| Swap fails with "insufficient funds" | Ensure you have enough BNB for both the swap amount and gas |
| Security scan returns no data | Some very new tokens may not have GoPlus data yet; try a well-known token first |
| AI response seems stuck | Check if the worker is running; the status indicator shows processing state |
| "Rate limit exceeded" | Wait 1 minute; the limit is 20 requests/minute per IP |
