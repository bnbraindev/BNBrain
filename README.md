English | [中文](README.zh-CN.md)

# BNBrain — AI-Powered Security Agent for BNB Chain

> **Hackathon Track: Agent (AI Agent x Onchain Actions)**
>
> Speak naturally, execute on-chain. One AI agent handles security scanning, trading, contract deployment, and wallet management — all through conversation.

**Live Demo**: [https://app.bnbrain.dev](https://app.bnbrain.dev) | **Repo**: [github.com/bnbraindev/BNBrain](https://github.com/bnbraindev/BNBrain)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/QoOIlX)

![Contract Deployment Flow](https://static.bnbrain.dev/contract.png)

---

## What is BNBrain?

BNBrain is an AI agent that takes **real actions** on BNB Chain. Instead of switching between DexScreener, GoPlus, PancakeSwap, and BscScan — you just talk to it.

Ask it to check if a token is safe. It calls GoPlus API, gets the security data, and shows you an interactive report card. Ask it to swap BNB for USDT. It gets a quote from PancakeSwap, builds the transaction, and lets you sign with one click. Ask it to write and deploy a smart contract. It writes Solidity, compiles it with OpenZeppelin, and gives you a deploy button — then auto-verifies on BscScan.

**37 tools. 24 interactive result cards. Zero copy-paste.**

---

## On-Chain Proof

All actions execute on **BSC Mainnet** and **opBNB**. See [`bsc.address`](bsc.address) for deployed contract addresses and example transaction hashes.

| Contract | Chain | Address |
|----------|-------|---------|
| ReportRegistry | opBNB (204) | See `bsc.address` |

---

## Features

### Security & Analysis
- **Token Security Scan** — Honeypot detection, hidden mint, blacklist, holder concentration (GoPlus + Honeypot.is cross-verification)
- **Address Analysis** — Malicious address check + transaction history
- **Phishing Detection** — Check any URL for known phishing/scam
- **dApp Security** — Audit status, trust list, contract verification
- **NFT Security** — Collection-level risk assessment
- **Transaction Decode** — Decode calldata and assess signing risk
- **Approval Risk Analysis** — Advanced spender risk via GoPlus V2

### Trading & DeFi
- **Swap (PancakeSwap V2)** — Exact input or exact output, with slippage protection
- **Token Price & Market Data** — Real-time from DexScreener + Binance
- **Token Search** — Find tokens by name/symbol
- **Pair Liquidity** — Check DEX pair depth and volume
- **Pool Reserves** — On-chain PancakeSwap reserve data
- **Gas Price** — Current BSC gas oracle
- **New Token Radar** — Latest tokens with automatic security screening
- **Technical Analysis** — RSI, MACD, Bollinger Bands and more

### Wallet Management
- **Balance Query** — BNB + ERC20 portfolio
- **Approval Scanner** — Find and revoke risky unlimited approvals
- **Wallet Health Score** — Comprehensive health assessment
- **Wallet Persona** — Behavioral personality profile based on on-chain activity
- **Transfer History** — Recent ERC20 token transfers

### Smart Contracts
- **One-Click Token Deploy** — "Deploy a token called X with 1B supply" → done
- **Custom Contract Deploy** — Write any Solidity, auto-compile with OpenZeppelin support, deploy
- **Contract Verification** — Auto-verify on BscScan after deployment
- **Generic Contract Call** — Call any function on any contract
- **Transaction Simulation** — Preview what would happen without sending
- **Contract Inspector** — View verified source code and ABI

### On-Chain Proof
- **Store Report** — Record security scan hash on-chain (ReportRegistry) as tamper-proof evidence
- **Verify Report** — Check if a report hash exists on-chain

### Infrastructure
- **SIWE Authentication** — Sign-In with Ethereum wallet signature
- **Worker-Based Runtime** — AI keeps running even if you close the tab
- **Conversation History** — Server-synced, survives refresh
- **Multi-language** — Chinese and English (i18n)
- **Admin Dashboard** — System health, model management, data source monitoring
- **One-Click Deploy** — Railway button or Docker, Setup Wizard handles configuration

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
│  Anthropic Claude + 37 AI tools + system prompt       │
│  Worker-based: AI runs in background, survives refresh│
└───────┬───────┬───────┬───────┬──────────────────────┘
        │       │       │       │
   ┌────▼──┐ ┌──▼───┐ ┌▼────┐ ┌▼──────┐
   │GoPlus │ │DexScr│ │BscSc│ │Pancake│
   │7 APIs │ │4 APIs│ │6 API│ │Swap V2│
   └───────┘ └──────┘ └─────┘ └───────┘
        │       │       │       │
   ┌────▼───────▼───────▼───────▼──────┐
   │     BNB Chain (BSC + opBNB)       │
   │   RPC + Smart Contracts           │
   └───────────────────────────────────┘
```

---

## Quick Start

### Option 1: Deploy to Railway (Recommended)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/QoOIlX)

1. Click the button — Railway provisions app + PostgreSQL automatically
2. Deploy completes in under 1 minute (pre-built image)
3. Open your app URL → **Setup Wizard** guides you through configuration
4. Enter your Anthropic API key and optional service keys
5. Connect wallet and start chatting

### Option 2: Docker One-Click (Self-Hosted)

PostgreSQL included — no external database needed:

```bash
git clone https://github.com/bnbraindev/BNBrain.git
cd BNBrain 
docker compose -f docker-compose.deploy.yml up -d
# Open http://localhost:3000 → Setup Wizard
```

### Option 3: Local Development

**Prerequisites**: Node.js 22+, PostgreSQL 16+

```bash
git clone https://github.com/bnbraindev/BNBrain.git
cd BNBrain
npm install
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL
npm run dev
# Open http://localhost:3099
```

> Only `DATABASE_URL` is required. All other settings (API keys, RPC endpoints, auth config) are configured through the built-in **Setup Wizard** and **Admin Dashboard**.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| AI | Vercel AI SDK 6, Anthropic Claude |
| Blockchain | wagmi 2, viem 2, RainbowKit 2 |
| Smart Contracts | Solidity 0.8.33, OpenZeppelin 5.4, solc |
| Database | PostgreSQL 17 |
| Auth | SIWE (Sign-In with Ethereum) |
| Deployment | Docker, Railway, Vercel |

---

## Documentation

- [Project Overview](docs/PROJECT.md) ([中文](docs/PROJECT.zh-CN.md)) — Problem, solution, ecosystem impact, roadmap
- [Technical Guide](docs/TECHNICAL.md) ([中文](docs/TECHNICAL.zh-CN.md)) — Architecture, setup instructions, demo scenarios
- [Extras](docs/EXTRAS.md) ([中文](docs/EXTRAS.zh-CN.md)) — Live demo, AI build log, presentation materials
- [On-Chain Addresses](bsc.address) — Deployed contracts and transaction evidence

---

## License

MIT
