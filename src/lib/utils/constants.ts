import { parseAbi } from 'viem';

// Minimal ERC20 ABI
export const ERC20_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
]);

// PancakeSwap Router V2 ABI (swap functions)
export const PANCAKE_ROUTER_V2_ABI = parseAbi([
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
]);

// WETH (WBNB) ABI for deposit/withdraw
export const WETH_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 wad)',
]);

// BSC explorer URLs by chainId
export const EXPLORER_URLS: Record<number, string> = {
  56: 'https://bscscan.com',
  204: 'https://opbnb.bscscan.com',
};

// Default slippage tolerance (e.g., 1 = 1%)
export const DEFAULT_SLIPPAGE_BPS = 100; // 1%

export const BSC_CHAIN_ID = 56;
export const OPBNB_CHAIN_ID = 204;
