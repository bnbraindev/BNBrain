import type { Project, StandaloneChat, AbiFunction } from './types';

// ============================================================================
// Mock Projects — matches spec §3, §6 memory format
// ============================================================================

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    shortId: 'a3f2x9',
    name: 'BabyDoge Token',
    description: 'Community-driven memecoin with anti-whale mechanics and auto-LP on BSC',
    type: 'token',
    status: 'active',
    primaryChainId: 56,
    primaryContractAddress: '0x1a2B3c4D5e6F7a8B9c0D1e2F3a4B5c6D7e8F9eF0',
    contracts: [
      { role: 'token', chainId: 56, address: '0x1a2B3c4D5e6F7a8B9c0D1e2F3a4B5c6D7e8F9eF0', name: 'BabyDoge', deployedAt: '2026-02-15', verified: true, deployTxHash: '0xabc123def456789...' },
      { role: 'lp_lock', chainId: 56, address: '0x9eF0a1B2c3D4e5F6789012345678ABCDEF012345', name: 'PinkLock', deployedAt: '2026-02-16', verified: true },
    ],
    memory: `# BabyDoge (BDOGE) — Project Memory

> Auto-maintained by BNB Shield AI. Last updated: 2026-02-16 14:30.

## Contract

- Chain: BSC Mainnet (56)
- Address: \`0x1a2B3c4D5e6F7a8B9c0D1e2F3a4B5c6D7e8F9eF0\`
- Standard: ERC20
- Compiler: solc 0.8.19, optimizer 200 runs
- Verified: Yes (BscScan)
- Owner: \`0x742d35Cc6634C0532925a3b844Bc9e7595f4E28\`

## Token Economics

- Total Supply: 1,000,000,000 BDOGE
- Decimals: 18
- Mintable: No
- Burnable: No
- Buy Tax: 3% | Sell Tax: 3%
- Anti-whale: max 2% per tx

## Liquidity

- PancakeSwap V3: 500,000 BDOGE + 10 BNB
- LP Token: 0x8765...4321
- Locked: Yes until 2026-08-15 (PinkLock at 0x9eF0...2345)

## History

- 2026-02-13 10:00 — Project created
- 2026-02-14 15:30 — Contract compiled, anti-whale mechanism added
- 2026-02-15 11:20 — Deployed at 0x1a2B...9eF0 (tx: 0xabc123de...)
- 2026-02-15 12:00 — Verified on BscScan
- 2026-02-16 09:45 — Added liquidity on PancakeSwap V3
- 2026-02-16 14:30 — LP locked for 6 months via PinkLock

## TODO

- [x] Deploy contract
- [x] Verify on explorer
- [x] Add liquidity
- [x] Lock LP tokens
- [ ] Renounce ownership
- [ ] Submit to CoinGecko listing
- [ ] Marketing campaign launch

## Notes

- Listing target: PancakeSwap V3
- Marketing budget: 5% of supply allocated
- Community TG group created: t.me/BabyDogeBSC`,
    files: [
      {
        path: 'contracts/BabyDoge.sol',
        language: 'solidity',
        contentType: 'text/x-solidity',
        updatedBy: 'ai',
        version: 2,
        sizeBytes: 1420,
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BabyDoge is ERC20, Ownable {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18;
    uint256 public buyTax = 300;  // 3%
    uint256 public sellTax = 300; // 3%
    uint256 public maxTxAmount;

    mapping(address => bool) public isExcludedFromTax;

    constructor() ERC20("BabyDoge", "BDOGE") Ownable(msg.sender) {
        maxTxAmount = MAX_SUPPLY * 2 / 100;
        isExcludedFromTax[msg.sender] = true;
        _mint(msg.sender, MAX_SUPPLY);
    }

    function _update(address from, address to, uint256 amount) internal override {
        require(amount <= maxTxAmount || isExcludedFromTax[from], "Exceeds max tx");
        uint256 tax = 0;
        if (!isExcludedFromTax[from] && !isExcludedFromTax[to]) {
            tax = (amount * buyTax) / 10000;
        }
        super._update(from, to, amount - tax);
        if (tax > 0) super._update(from, address(this), tax);
    }
}`,
      },
      {
        path: 'artifacts/BabyDoge.abi.json',
        language: 'json',
        contentType: 'application/json',
        updatedBy: 'ai',
        version: 1,
        sizeBytes: 2840,
        content: `[{"type":"function","name":"name","inputs":[],"outputs":[{"type":"string"}],"stateMutability":"view"},{"type":"function","name":"symbol","inputs":[],"outputs":[{"type":"string"}],"stateMutability":"view"}]`,
      },
      {
        path: 'artifacts/deployment.json',
        language: 'json',
        contentType: 'application/json',
        updatedBy: 'system',
        version: 1,
        sizeBytes: 580,
        content: `{
  "network": "bsc-mainnet",
  "chainId": 56,
  "address": "0x1a2B3c4D5e6F7a8B9c0D1e2F3a4B5c6D7e8F9eF0",
  "txHash": "0xabc123def456789...",
  "blockNumber": 38291047,
  "deployer": "0x742d35Cc6634C0532925a3b844Bc9e7595f4E28",
  "gasUsed": 2145302,
  "timestamp": 1739614800
}`,
      },
      {
        path: 'memory.md',
        language: 'markdown',
        contentType: 'text/markdown',
        updatedBy: 'ai',
        version: 6,
        sizeBytes: 1204,
        content: '', // memory.md content is stored in project.memory
      },
    ],
    conversations: [
      { id: 'conv-1', title: 'Initial token design', lastMessage: 'Anti-whale mechanism set to 2% max per tx.', messageCount: 12, updatedAt: '2026-02-14' },
      { id: 'conv-2', title: 'Deploy to BSC Mainnet', lastMessage: 'Contract deployed at 0x1a2B...9eF0', messageCount: 8, updatedAt: '2026-02-15' },
      { id: 'conv-3', title: 'Add liquidity + Lock LP', lastMessage: 'LP locked for 6 months via PinkLock.', messageCount: 5, updatedAt: '2026-02-16' },
    ],
    createdAt: '2026-02-13',
    updatedAt: '2026-02-16',
  },
  {
    id: 'proj-2',
    shortId: '7bk4m1',
    name: 'DEX Arbitrage Bot',
    description: 'Cross-DEX arbitrage monitoring PancakeSwap, BiSwap, and BabySwap',
    type: 'defi',
    status: 'active',
    primaryChainId: 56,
    primaryContractAddress: undefined,
    contracts: [],
    memory: `# DEX Arbitrage Bot — Project Memory

> Auto-maintained by BNB Shield AI. Last updated: 2026-02-18 10:00.

## Overview

Cross-DEX arbitrage bot monitoring price differences across PancakeSwap V3, BiSwap, and BabySwap on BSC.

## Strategy

- Pairs: BNB/USDT, BNB/BUSD, CAKE/BNB
- Min profit threshold: 0.3% after gas
- Max position: 2 BNB per trade
- Flash loan: PancakeSwap V3

## Performance

- Total trades: 147
- Win rate: 73.4%
- Total profit: 4.2 BNB
- Avg gas/trade: 0.0012 BNB

## History

- 2026-02-10 — Project created
- 2026-02-12 — Bot wallet funded: 5 BNB
- 2026-02-15 — Switched to multicall, gas -34%
- 2026-02-18 — Weekly: +1.3 BNB across 42 trades

## TODO

- [ ] Add DODO as 4th DEX source
- [ ] Implement stop-loss circuit breaker
- [x] Optimize gas with multicall`,
    files: [
      {
        path: 'config/strategy.json',
        language: 'json',
        contentType: 'application/json',
        updatedBy: 'user',
        version: 3,
        sizeBytes: 420,
        content: `{
  "pairs": ["BNB/USDT", "BNB/BUSD", "CAKE/BNB"],
  "dexes": ["pancakeswap-v3", "biswap", "babyswap"],
  "minProfitBps": 30,
  "maxPositionBNB": 2,
  "maxSlippageBps": 50,
  "gasPriceLimitGwei": 5
}`,
      },
      {
        path: 'memory.md',
        language: 'markdown',
        contentType: 'text/markdown',
        updatedBy: 'ai',
        version: 4,
        sizeBytes: 680,
        content: '',
      },
    ],
    conversations: [
      { id: 'conv-4', title: 'Set up monitoring', lastMessage: 'WebSocket connections live for all 3 DEXes.', messageCount: 15, updatedAt: '2026-02-16' },
      { id: 'conv-5', title: 'Optimize gas usage', lastMessage: 'Multicall batching reduces gas by 34%.', messageCount: 6, updatedAt: '2026-02-17' },
      { id: 'conv-6', title: 'Weekly profit review', lastMessage: 'This week: +1.3 BNB across 42 trades.', messageCount: 4, updatedAt: '2026-02-18' },
    ],
    createdAt: '2026-02-10',
    updatedAt: '2026-02-18',
  },
  {
    id: 'proj-3',
    shortId: 'p0w9z2',
    name: 'NFT Marketplace',
    description: 'Peer-to-peer NFT trading with escrow and EIP-2981 royalty enforcement',
    type: 'nft',
    status: 'draft',
    primaryChainId: 56,
    primaryContractAddress: undefined,
    contracts: [],
    memory: `# NFT Marketplace — Project Memory

> Auto-maintained by BNB Shield AI. Last updated: 2026-02-12.

## Contract

- Chain: BSC Mainnet (56)
- Address: (not deployed yet)
- Status: Draft

## Architecture

- Listing contract: manages sell orders
- Escrow contract: holds NFTs during trades
- Royalty registry: on-chain EIP-2981 enforcement
- Platform fee: 2.5%

## History

- 2026-02-11 — Project created
- 2026-02-12 — Architecture design completed

## TODO

- [ ] Deploy listing contract
- [ ] Deploy escrow contract
- [ ] Verify on explorer
- [ ] Build frontend with wagmi`,
    files: [
      {
        path: 'contracts/NFTMarket.sol',
        language: 'solidity',
        contentType: 'text/x-solidity',
        updatedBy: 'user',
        version: 1,
        sizeBytes: 680,
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract NFTMarket {
    struct Listing {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 price;
        bool active;
    }

    mapping(uint256 => Listing) public listings;
    uint256 public nextListingId;
    uint256 public platformFeeBps = 250; // 2.5%

    event Listed(uint256 indexed listingId, address indexed seller, uint256 price);
    event Sold(uint256 indexed listingId, address indexed buyer, uint256 price);

    function list(address nftContract, uint256 tokenId, uint256 price) external {
        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);
        listings[nextListingId] = Listing(msg.sender, nftContract, tokenId, price, true);
        emit Listed(nextListingId++, msg.sender, price);
    }
}`,
      },
      {
        path: 'memory.md',
        language: 'markdown',
        contentType: 'text/markdown',
        updatedBy: 'system',
        version: 1,
        sizeBytes: 480,
        content: '',
      },
    ],
    conversations: [
      { id: 'conv-7', title: 'Design marketplace architecture', lastMessage: 'Separated listing + escrow contracts.', messageCount: 9, updatedAt: '2026-02-12' },
    ],
    createdAt: '2026-02-11',
    updatedAt: '2026-02-12',
  },
];

// ============================================================================
// Mock Standalone Chats
// ============================================================================

export const MOCK_CHATS: StandaloneChat[] = [
  { id: 'chat-1', title: 'Check 0xDead token safety', updatedAt: '2026-02-18', preview: 'This token has a high risk score...' },
  { id: 'chat-2', title: 'Wallet health check', updatedAt: '2026-02-17', preview: 'Found 3 pending approvals to revoke.' },
  { id: 'chat-3', title: 'Swap BNB → CAKE best route', updatedAt: '2026-02-16', preview: 'PancakeSwap V3, 0.1% slippage.' },
];

// ============================================================================
// Mock ABI for BabyDoge Token (ERC20 + custom)
// ============================================================================

export const MOCK_ABI: AbiFunction[] = [
  // Read functions
  { type: 'function', name: 'name', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'maxTxAmount', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'buyTax', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'sellTax', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'isExcludedFromTax', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  // Write functions
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferFrom', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'renounceOwnership', inputs: [], outputs: [], stateMutability: 'nonpayable' },
];

export const MOCK_READ_RESULTS: Record<string, string> = {
  name: 'BabyDoge',
  symbol: 'BDOGE',
  decimals: '18',
  totalSupply: '1000000000000000000000000000',
  owner: '0x742d35Cc6634C0532925a3b844Bc9e7595f4E28',
  maxTxAmount: '20000000000000000000000000',
  buyTax: '300',
  sellTax: '300',
};
