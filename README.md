English | [中文](README.zh-CN.md)

# BNBrain — AI-Powered Security Agent for BNB Chain

> Speak naturally, execute on-chain. One AI agent handles security scanning, trading, contract deployment, and wallet management — all through conversation.

**Live Demo**: [https://app.bnbrain.dev](https://app.bnbrain.dev)

**Hackathon**: Good Vibes Only: OpenClaw Edition (Agent Track)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/YOUR_TEMPLATE_ID)

---

## What is BNBrain?

BNBrain is an AI agent that takes **real actions** on BNB Chain. Instead of switching between DexScreener, GoPlus, PancakeSwap, and BscScan — you just talk to it.

Ask it to check if a token is safe. It calls GoPlus API, gets the security data, and shows you an interactive report card. Ask it to swap BNB for USDT. It gets a quote from PancakeSwap, builds the transaction, and lets you sign with one click. Ask it to write a lock contract. It writes Solidity, compiles it, and gives you a deploy button.

**28 tools. 24 interactive result cards. Zero copy-paste.**

---

## Features

### Security & Analysis
- **Token Security Scan** — Honeypot detection, hidden mint, blacklist, holder concentration (GoPlus)
- **Address Analysis** — Malicious address check + transaction history
- **Phishing Detection** — Check any URL for known phishing/scam
- **dApp Security** — Audit status, trust list, contract verification
- **NFT Security** — Collection-level risk assessment
- **Transaction Decode** — Decode calldata and assess signing risk
- **Approval Risk Analysis** — Advanced spender risk via GoPlus V2

### Trading & DeFi
- **Swap (PancakeSwap V2)** — Exact input or exact output, with slippage protection
- **Token Price & Market Data** — Real-time from DexScreener
- **Token Search** — Find tokens by name/symbol
- **Pair Liquidity** — Check DEX pair depth and volume
- **Pool Reserves** — On-chain PancakeSwap reserve data
- **Gas Price** — Current BSC gas oracle
- **New Token Radar** — Latest tokens with automatic security screening

### Wallet Management
- **Balance Query** — BNB + ERC20 portfolio
- **Approval Scanner** — Find and revoke risky unlimited approvals
- **Wallet Health Score** — Comprehensive health assessment
- **Wallet Persona** — Behavioral personality profile based on on-chain activity
- **Transfer History** — Recent ERC20 token transfers

### Smart Contracts
- **One-Click Token Deploy** — "Deploy a token called X with 1B supply" → done
- **Custom Contract Deploy** — Write any Solidity, auto-compile and deploy
- **Generic Contract Call** — Call any function on any contract with ABI
- **Transaction Simulation** — Preview what would happen without sending

### On-Chain Proof
- **Store Report** — Record security scan hash on-chain as tamper-proof evidence
- **Verify Report** — Check if a report hash exists on-chain

### Infrastructure
- **SIWE Authentication** — Sign-In with Ethereum wallet signature
- **Conversation History** — Server-synced, survives refresh
- **Resume on Disconnect** — AI keeps running even if you close the tab
- **Multi-language** — Chinese and English
- **Admin Dashboard** — System health, chat run metrics, multi-admin management

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Frontend                            │
│  Next.js 16 App Router + Vercel AI SDK + wagmi        │
│  24 interactive result cards + wallet signing          │
└───────────────────────┬──────────────────────────────┘
                        │ SSE stream
┌───────────────────────▼──────────────────────────────┐
│                   Chat Runtime                        │
│  Anthropic Claude + 28 AI tools + system prompt       │
│  Worker-based: AI runs in background, survives refresh│
└───────┬───────┬───────┬───────┬──────────────────────┘
        │       │       │       │
   ┌────▼──┐ ┌──▼───┐ ┌▼────┐ ┌▼──────┐
   │GoPlus │ │DexScr│ │BscSc│ │Pancake│
   │7 APIs │ │4 APIs│ │6 API│ │Swap V2│
   └───────┘ └──────┘ └─────┘ └───────┘
        │       │       │       │
   ┌────▼───────▼───────▼───────▼──────┐
   │         BNB Chain (BSC)            │
   │    RPC + Smart Contracts           │
   └───────────────────────────────────┘
```

### SDK Layer

| Service | APIs | Auth |
|---------|------|------|
| **GoPlus Security** | Token, Address, Approval, Phishing, dApp, NFT, Signature Decode | API Key (optional, improves rate limits) |
| **DexScreener** | Price, Search, Latest Tokens, Pair Info | No key needed |
| **BscScan/Etherscan V2** | Tx History, Token Transfers, Balance, Contract, Gas Oracle | API Key |
| **PancakeSwap V2** | Quote, Reverse Quote, Pair Reserves | On-chain (no key) |

All SDK calls include **12-second timeout**, **3x exponential backoff retry**, and **standardized error handling**.

---

## Quick Start

### Option 1: Deploy to Railway (Recommended)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/YOUR_TEMPLATE_ID)

1. Click the button above — Railway provisions the app + PostgreSQL automatically
2. Wait ~3 minutes for the build to complete
3. Open your app URL — the **Setup Wizard** appears on first visit
4. Enter your Anthropic API key and optional service keys
5. Done! Start chatting with your AI agent

> No environment variables needed at deploy time. The built-in Setup Wizard handles all configuration through a visual interface.

### Option 2: Docker (Self-Hosted)

```bash
git clone https://github.com/bnbraindev/BNBrain.git
cd bnb-ai
cp .env.example .env
# Edit .env — only DATABASE_URL is required, other keys can be configured via Setup Wizard
docker compose up -d
# Open http://localhost:3000
```

### Option 3: Local Development

**Prerequisites**: Node.js 22+, PostgreSQL 16+

```bash
git clone https://github.com/bnbraindev/BNBrain.git
cd bnb-ai
npm install
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL
npm run dev
# Open http://localhost:3099
```

### Environment Variables

Only `DATABASE_URL` is required. All other settings can be configured through the **Setup Wizard** and **Admin Dashboard** after deployment:

| Variable | Required | UI Configurable | Description |
|----------|----------|----------------|-------------|
| `DATABASE_URL` | Yes | No | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | No | Setup Wizard | AI provider API key |
| `ANTHROPIC_BASE_URL` | No | Setup Wizard | Custom API endpoint |
| `ETHERSCAN_API_KEY` | No | Admin Dashboard | BscScan/Etherscan V2 |
| `GOPLUS_APP_KEY/SECRET` | No | Admin Dashboard | GoPlus Security |
| `SERPER_API_KEY` | No | Admin Dashboard | Google Search (Serper.dev) |
| `STEEL_API_KEY` | No | Admin Dashboard | Web scraper (Steel.dev) |
| `SIWE_DOMAIN` | No | Admin Dashboard | Auth domain pinning |
| `SIWE_ALLOWED_CHAIN_IDS` | No | Admin Dashboard | Restrict auth chains |
| `RPC_URL_56/97/204` | No | Admin Dashboard | Custom RPC endpoints |
| `NEXT_PUBLIC_WC_PROJECT_ID` | No | No (build-time) | WalletConnect project ID |
| `ADMIN_DASHBOARD_TOKEN` | No | No (env-only) | Admin panel access token |

---

## Testing

```bash
# Lint
npm run lint

# Unit: resume guard logic
npm run test:resume-guard

# E2E: full AI tool chain (28 tools, real API calls)
npx tsx -r tsconfig-paths/register tests/e2e/tool-chain.test.ts

# E2E: prompt intelligence (intent resolution)
npx tsx -r tsconfig-paths/register tests/e2e/prompt-intelligence.test.ts
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS, shadcn/ui |
| AI | Vercel AI SDK, Anthropic Claude |
| Blockchain | wagmi, viem, RainbowKit |
| Database | PostgreSQL 17, pg driver |
| Auth | SIWE (Sign-In with Ethereum) |
| Deployment | Docker, Railway, Cloudflare Tunnel |

---

## Documentation

- [Project Overview](docs/PROJECT.md) — Problem, solution, business value
- [Technical Guide](docs/TECHNICAL.md) — Architecture, deployment, demo scenarios
- [Extras](docs/EXTRAS.md) — Live demo, AI build log, tech choices

---

## License

MIT
