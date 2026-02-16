import { tool } from 'ai';
import { z } from 'zod';
import { tokenSecurity, addressSecurity, phishingSite, dappSecurity, signatureDecode, nftSecurity, approvalSecurity } from '@/lib/services/goplus';
import { getTokenPrice, getLatestTokens, searchToken } from '@/lib/services/dexscreener';
import { getPublicClient } from '@/lib/chain/server-client';
import { ERC20_ABI } from '@/lib/utils/constants';
import { formatEther, formatUnits, parseEther, parseUnits, isAddress as viemIsAddress, encodeFunctionData, encodeDeployData, type Abi } from 'viem';

/** viem's isAddress is strict about EIP-55 checksum. Normalize to lowercase first. */
function isAddress(address: string): boolean {
  return viemIsAddress(address.trim().toLowerCase());
}

/** Normalize address to lowercase 0x format for all downstream calls. */
function normalizeAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}
import { getTokensForChain, getPancakeRouterAddress } from '@/lib/chain/config';
import { getTransactionHistory, getTokenTransfers, scanApprovalEvents, getGasOracle, getContractSourceCode, getContractABI } from '@/lib/services/bscscan';
import { getPairInfo } from '@/lib/services/dexscreener';
import * as pancakeswap from '@/lib/services/pancakeswap';
import { hashReport, buildStoreReportCalldata, REPORT_REGISTRY_ADDRESS } from '@/lib/chain/report-registry';
import { compileSolidityContract } from '@/lib/services/solidity';
import {
  isCached,
  getCachedMetadata,
  saveContractSource,
  getMainContractSource,
} from '@/lib/server/contract-source-cache';
import { getTicker24h, getKlines, resolveSymbol, isValidInterval } from '@/lib/services/binance';
import type { KlineInterval } from '@/lib/services/binance';
import { generateText } from 'ai';
import { createReport } from '@/lib/server/report-store';
import type { ReportStep } from '@/lib/server/report-store';
import { serperSearchParallel, type SerperParallelResults } from '@/lib/services/serper';
import { scrapeWebsite, crawlSubPages } from '@/lib/services/web-scraper';
import type { ScrapedPage, CrawledSubPage } from '@/lib/services/web-scraper';
import { reportJsonPrompt } from '@/lib/ai/report-prompt';
import { renderReport } from '@/lib/report/render-report';
import type { ReportJSON } from '@/lib/report/types';
import { resolveRuntimeChatModel, createRuntimeLanguageModel } from '@/lib/server/chat-model-store';
import { getChatRunContext } from '@/lib/server/chat-runtime';
import { setAnalysisProgress, type StepProgress } from '@/lib/server/analysis-progress';
import {
  extractSocialLinksFromUrls,
  extractSocialLinksFromDexScreener,
  mergeSocialLinks,
  type SocialLinks,
} from '@/lib/utils/social-links';

const TxCardSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  subtitle: z.string().min(1).max(220).optional(),
  theme: z.enum(['amber', 'blue', 'emerald', 'purple', 'rose', 'slate']).optional(),
  confirmText: z.string().min(1).max(40).optional(),
  bullets: z.array(z.string().min(1).max(140)).max(6).optional(),
});

function deriveTokenSymbol(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (cleaned.length >= 3) return cleaned.slice(0, 3);
  if (cleaned.length === 2) return cleaned;
  if (cleaned.length === 1) return `${cleaned}X`;
  return 'TKN';
}

function parseTotalSupplyWithUnits(rawSupply: string, decimals: number): bigint {
  const normalized = rawSupply.trim().replace(/[,_\s，]/g, '').toLowerCase();
  if (!normalized) {
    throw new Error('totalSupply is empty');
  }

  const unitPowers: Array<[string, number]> = [
    ['billion', 9],
    ['million', 6],
    ['thousand', 3],
    ['bn', 9],
    ['mn', 6],
    ['亿', 8],
    ['万', 4],
    ['千', 3],
    ['b', 9],
    ['m', 6],
    ['k', 3],
  ];

  let valuePart = normalized;
  let extraPower = 0;
  for (const [unit, power] of unitPowers) {
    if (normalized.endsWith(unit)) {
      valuePart = normalized.slice(0, -unit.length);
      extraPower = power;
      break;
    }
  }

  if (!/^\d+(\.\d+)?$/.test(valuePart)) {
    throw new Error('Invalid totalSupply format');
  }

  return parseUnits(valuePart, decimals + extraPower);
}

function toSolidityIdentifier(name: string, fallback: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '');
  if (!cleaned) return fallback;
  if (/^[a-zA-Z_]/.test(cleaned)) return cleaned;
  return `C${cleaned}`;
}

function buildSimpleErc20Source(contractName: string): string {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ${contractName} {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals, uint256 _initialSupply) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        totalSupply = _initialSupply;
        balanceOf[msg.sender] = _initialSupply;
        emit Transfer(address(0), msg.sender, _initialSupply);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(to != address(0), "Transfer to zero address");
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        require(spender != address(0), "Approve to zero address");
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(from != address(0), "Transfer from zero address");
        require(to != address(0), "Transfer to zero address");
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");

        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
`;
}

function parseArrayLikeArg(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value !== 'string') return [value];

  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fallback to manual split.
    }
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  return [trimmed];
}

function normalizeArgBySolidityType(value: unknown, solidityType: string): unknown {
  const arrayMatch = solidityType.match(/^(.*)\[(\d*)\]$/);
  if (arrayMatch) {
    const itemType = arrayMatch[1];
    const parsed = parseArrayLikeArg(value);
    if (!parsed) return value;
    return parsed.map((item) => normalizeArgBySolidityType(item, itemType));
  }

  if (solidityType === 'address') {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (isAddress(trimmed)) {
      return normalizeAddress(trimmed);
    }
    return trimmed;
  }

  if (solidityType.startsWith('uint') || solidityType.startsWith('int')) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^-?\d+$/.test(trimmed)) {
        try {
          return BigInt(trimmed);
        } catch {
          return value;
        }
      }
    }
    if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) {
      try {
        return BigInt(value);
      } catch {
        return value;
      }
    }
  }

  if (solidityType === 'bool' && typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }

  return value;
}

function normalizeConstructorArgsByAbi(
  abi: Abi,
  rawArgs: readonly unknown[]
): { args: readonly unknown[]; changed: boolean } {
  const args = Array.isArray(rawArgs) ? [...rawArgs] : [];
  const constructorItem = abi.find((item) => item.type === 'constructor');
  const inputs = Array.isArray(constructorItem?.inputs)
    ? constructorItem.inputs
    : [];
  if (args.length === 0 || inputs.length === 0) {
    return { args, changed: false };
  }

  let changed = false;
  const normalizedArgs = args.map((arg, index) => {
    const inputType = inputs[index]?.type;
    if (!inputType) return arg;
    const normalized = normalizeArgBySolidityType(arg, inputType);
    if (!Object.is(normalized, arg)) {
      changed = true;
    }
    return normalized;
  });

  return { args: normalizedArgs, changed };
}

/* ── inspectContract helpers ─────────────────────────────────── */

import type { ContractSourceMetadata } from '@/lib/server/contract-source-cache';

/** Max source chars to auto-inline in tool result (~14K tokens). */
const SOURCE_INLINE_LIMIT = 50_000;

function buildResult(addr: `0x${string}`, meta: ContractSourceMetadata): Record<string, unknown> {
  return {
    address: addr,
    isVerified: true,
    contractName: meta.contractName,
    compilerVersion: meta.compilerVersion,
    optimizationUsed: meta.optimizationUsed,
    runs: meta.runs || null,
    evmVersion: meta.evmVersion || null,
    licenseType: meta.licenseType || null,
    isProxy: meta.proxy,
    implementation: meta.implementation || null,
    isMultiFile: meta.isMultiFile,
    files: meta.files,
    totalSourceChars: meta.totalSourceChars,
    tokenEstimate: meta.tokenEstimate,
    downloadUrl: `/api/source/${meta.chainId}/${addr}`,
  };
}

function addSourceToResult(
  result: Record<string, unknown>,
  meta: ContractSourceMetadata,
  chainId: number,
  addr: string,
  includeSource: boolean
): void {
  // Auto-include for small contracts, or when explicitly requested
  if (meta.totalSourceChars <= SOURCE_INLINE_LIMIT || includeSource) {
    const main = getMainContractSource(chainId, addr);
    if (main) {
      result.mainSourceFile = main.filePath;
      result.mainSourceCode = main.content;
    }
  }
}

export const aiTools = {
  tokenSecurity: tool({
    description: 'Check if a token/coin is safe. Detects honeypots, hidden mints, blacklists, holder concentration, and more.',
    inputSchema: z.object({
      address: z.string().describe('The token contract address to check'),
      chainId: z.number().optional().default(56).describe('Chain ID (56=BSC, 97=BSC Testnet, 204=opBNB)'),
    }),
    execute: async ({ address, chainId }) => {
      try {
        if (!isAddress(address)) {
          return { error: 'Invalid token contract address' };
        }
        return await tokenSecurity(address, chainId);
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Token security check failed' };
      }
    },
  }),

  balanceQuery: tool({
    description: 'Query wallet balance for native BNB and ERC20 tokens. Use when user asks about their balance or portfolio.',
    inputSchema: z.object({
      walletAddress: z.string().describe('The wallet address to query'),
      tokenAddresses: z.array(z.string()).optional().describe('Specific token addresses to check. If empty, checks BNB + common tokens (USDT, USDC, CAKE)'),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ walletAddress, tokenAddresses, chainId }) => {
      try {
        if (!isAddress(walletAddress)) {
          return { error: 'Invalid wallet address' };
        }
        if (tokenAddresses?.some((addr) => !isAddress(addr))) {
          return { error: 'tokenAddresses contains invalid address' };
        }
        const wallet = normalizeAddress(walletAddress);

        const client = await getPublicClient(chainId);
        const balances: Array<{ symbol: string; address: string; balance: string; decimals: number }> = [];

        const nativeBalance = await client.getBalance({ address: wallet });
        balances.push({
          symbol: 'BNB',
          address: 'native',
          balance: formatEther(nativeBalance),
          decimals: 18,
        });

        const chainTokens = getTokensForChain(chainId);
        const defaultTokens = [chainTokens.USDT, chainTokens.USDC, chainTokens.CAKE].filter(
          Boolean
        ) as string[];
        const isUserSpecified = Boolean(tokenAddresses?.length);
        const tokensToCheck = isUserSpecified ? tokenAddresses! : defaultTokens;

        for (const tokenAddr of tokensToCheck) {
          try {
            const [balance, symbol, decimals] = await Promise.all([
              client.readContract({
                address: tokenAddr as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [wallet],
              }),
              client.readContract({
                address: tokenAddr as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'symbol',
              }),
              client.readContract({
                address: tokenAddr as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'decimals',
              }),
            ]);
            const balanceBn = balance as bigint;
            const symbolStr = symbol as string;
            const decimalsNum = Number(decimals);
            if (balanceBn > 0n || isUserSpecified) {
              balances.push({
                symbol: symbolStr,
                address: tokenAddr,
                balance: formatUnits(balanceBn, decimalsNum),
                decimals: decimalsNum,
              });
            }
          } catch {
            // Skip tokens that fail to read
          }
        }

        return { balances };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Balance query failed' };
      }
    },
  }),

  tokenInfo: tool({
    description: 'Get current DEX price and market data for a token from DexScreener. For CEX prices of mainstream tokens (BNB, ETH, BTC, CAKE etc.) use binanceTicker instead. NOT for K-line charts or technical analysis — use binanceKlines/technicalAnalysis for those.',
    inputSchema: z.object({
      address: z.string().describe('Token contract address'),
    }),
    execute: async ({ address }) => {
      try {
        if (!isAddress(address)) {
          return { error: 'Invalid token address' };
        }
        const price = await getTokenPrice(address);
        return price ?? { error: 'Token price not found' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to fetch token info' };
      }
    },
  }),

  buildTransfer: tool({
    description: 'Build a transfer transaction for BNB or ERC20 tokens. Returns unsigned transaction data for the user to sign with their wallet.',
    inputSchema: z.object({
      to: z.string().describe('Recipient address'),
      amount: z.string().describe('Amount to send (human readable, e.g. "0.1")'),
      tokenAddress: z.string().optional().describe('ERC20 token address. If not provided, transfers native BNB.'),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ to, amount, tokenAddress, chainId }) => {
      try {
        if (!isAddress(to)) {
          return { error: 'Invalid recipient address' };
        }
        const numericAmount = Number(amount);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
          return { error: 'Amount must be a positive number' };
        }

        if (tokenAddress) {
          if (!isAddress(tokenAddress)) {
            return { error: 'Invalid token address' };
          }
          const client = await getPublicClient(chainId);
          const decimals = (await client.readContract({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'decimals',
          })) as number;
          const symbol = (await client.readContract({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'symbol',
          })) as string;
          const parsedAmount = parseUnits(amount, decimals);

          return {
            type: 'erc20_transfer',
            to: tokenAddress,
            data: encodeFunctionData({
              abi: ERC20_ABI,
              functionName: 'transfer',
              args: [to as `0x${string}`, parsedAmount],
            }),
            value: '0',
            description: `Transfer ${amount} ${symbol} to ${to}`,
            chainId,
          };
        } else {
          return {
            type: 'native_transfer',
            to,
            value: parseEther(amount).toString(),
            data: '0x',
            description: `Transfer ${amount} BNB to ${to}`,
            chainId,
          };
        }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to build transfer' };
      }
    },
  }),

  buildContractCall: tool({
    description:
      'Build a generic contract-call transaction from ABI + function args and return an unsigned tx plan. ' +
      'Use when user asks to execute any contract method not covered by specialized tools. ' +
      'Input requires: target contract address, ABI array, functionName, args, optional value(wei), optional chainId. ' +
      'Optional card fields (title/subtitle/theme/confirmText/bullets) customize frontend transaction card.',
    inputSchema: z.object({
      to: z.string().describe('Target contract address'),
      abi: z.array(z.any()).describe('Contract ABI as JSON array'),
      functionName: z.string().describe('Function name in ABI'),
      args: z.array(z.any()).optional().default([]).describe('Function arguments'),
      value: z.string().optional().default('0').describe('Native token value in wei'),
      chainId: z.number().optional().default(56),
      description: z.string().optional().describe('Human-readable transaction description'),
      card: TxCardSchema.optional().describe('Optional card presentation settings'),
    }),
    execute: async ({ to, abi, functionName, args, value, chainId, description, card }) => {
      try {
        if (!isAddress(to)) {
          return { error: 'Invalid contract address' };
        }

        // Reject dangerous low-level function types that could cause irreversible harm.
        const BLOCKED_FUNCTIONS = new Set([
          'selfdestruct', 'suicide', 'delegatecall', 'callcode',
        ]);
        if (BLOCKED_FUNCTIONS.has(functionName.toLowerCase())) {
          return { error: `Function "${functionName}" is blocked for safety reasons` };
        }
        if (!Array.isArray(abi) || abi.length === 0) {
          return { error: 'ABI must be a non-empty array' };
        }
        for (const entry of abi) {
          if (typeof entry !== 'object' || entry === null || !('type' in entry)) {
            return { error: 'Each ABI entry must be an object with a "type" field' };
          }
        }

        const valueWei = value ?? '0';
        try {
          BigInt(valueWei);
        } catch {
          return { error: 'Invalid value: must be a wei string' };
        }

        const data = encodeFunctionData({
          abi: abi as Abi,
          functionName,
          args: args as readonly unknown[],
        });

        const defaultDescription = description ?? `Call ${functionName} on ${to}`;
        return {
          type: 'tx_plan' as const,
          mode: 'contract_call' as const,
          to,
          data,
          value: valueWei,
          chainId,
          description: defaultDescription,
          card: {
            title: card?.title ?? `Contract Call: ${functionName}`,
            subtitle:
              card?.subtitle ??
              `Prepared calldata for ${functionName}. Verify target address and arguments before signing.`,
            theme: card?.theme ?? 'blue',
            confirmText: card?.confirmText ?? 'Sign & Execute',
            bullets: card?.bullets ?? [],
          },
          metadata: {
            functionName,
            argCount: args.length,
          },
        };
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? `Failed to build contract call: ${error.message}`
              : 'Failed to build contract call',
        };
      }
    },
  }),

  compileContractDeploy: tool({
    description:
      'Compile Solidity source code and build a contract-deployment transaction plan. ' +
      'Use when user provides custom Solidity and wants one-click wallet deployment. ' +
      'Input supports optional contractName and constructorArgs. ' +
      'Returns deployment calldata (to=null), metadata, and optional card customization fields.',
    inputSchema: z.object({
      sourceCode: z.string().min(1).max(80000).describe('Complete Solidity source code'),
      contractName: z.string().optional().describe('Contract name to deploy (optional if only one contract)'),
      constructorArgs: z.array(z.any()).optional().default([]).describe('Constructor arguments'),
      chainId: z.number().optional().default(56),
      description: z.string().optional().describe('Human-readable description'),
      card: TxCardSchema.optional().describe('Optional card presentation settings'),
    }),
    execute: async ({
      sourceCode,
      contractName,
      constructorArgs,
      chainId,
      description,
      card,
    }) => {
      try {
        const compiled = await compileSolidityContract(sourceCode, contractName);
        const rawConstructorArgs = constructorArgs as readonly unknown[];
        const normalizedArgs = normalizeConstructorArgsByAbi(
          compiled.abi as Abi,
          rawConstructorArgs
        );

        let effectiveConstructorArgs = rawConstructorArgs;
        let deployData: `0x${string}`;
        try {
          deployData = encodeDeployData({
            abi: compiled.abi as Abi,
            bytecode: compiled.bytecode,
            args: effectiveConstructorArgs,
          });
        } catch (error) {
          if (!normalizedArgs.changed) throw error;
          effectiveConstructorArgs = normalizedArgs.args;
          deployData = encodeDeployData({
            abi: compiled.abi as Abi,
            bytecode: compiled.bytecode,
            args: effectiveConstructorArgs,
          });
        }
        const bytecodeBytes = (compiled.bytecode.length - 2) / 2;

        return {
          type: 'tx_plan' as const,
          mode: 'contract_deploy' as const,
          to: null,
          data: deployData,
          value: '0',
          chainId,
          description:
            description ?? `Deploy contract ${compiled.contractName} from compiled Solidity source`,
          card: {
            title: card?.title ?? `Deploy ${compiled.contractName}`,
            subtitle:
              card?.subtitle ??
              `Compilation succeeded. Review deployment info and sign once in wallet to deploy.`,
            theme: card?.theme ?? 'purple',
            confirmText: card?.confirmText ?? 'Sign & Deploy',
            bullets: card?.bullets ?? [],
          },
          metadata: {
            contractName: compiled.contractName,
            constructorArgCount: effectiveConstructorArgs.length,
            bytecodeBytes,
            warnings: compiled.warnings,
            sourceCode,
          },
        };
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? `Failed to compile/deploy contract: ${error.message}`
              : 'Failed to compile/deploy contract',
        };
      }
    },
  }),

  deployToken: tool({
    description:
      'Deploy a standard ERC20 token with one wallet signature flow. ' +
      'Automatically generates Solidity, compiles it, and prepares deployment calldata. ' +
      'Best for natural-language requests like "write/deploy a token". ' +
      'Supports totalSupply in human units (e.g. 1000000000, 1b, 10亿), optional symbol auto-derivation, and card customization.',
    inputSchema: z.object({
      name: z.string().min(1).max(60).describe('Token name, e.g. XXXTest'),
      symbol: z.string().min(2).max(12).optional().describe('Token symbol, optional. If omitted, it will be derived from name.'),
      totalSupply: z.string().describe('Total token supply in human units, e.g. "1000000000", "1b", or "10亿"'),
      decimals: z.number().int().min(0).max(18).optional().default(18),
      chainId: z.number().optional().default(56),
      card: TxCardSchema.optional().describe('Optional card presentation settings'),
    }),
    execute: async ({ name, symbol, totalSupply, decimals, chainId, card }) => {
      try {
        const finalSymbol = (symbol?.trim() || deriveTokenSymbol(name)).toUpperCase();
        if (!/^[A-Z0-9]{2,12}$/.test(finalSymbol)) {
          return { error: 'Invalid token symbol. Use 2-12 uppercase letters/numbers.' };
        }

        let parsedSupply: bigint;
        try {
          parsedSupply = parseTotalSupplyWithUnits(totalSupply, decimals);
        } catch {
          return { error: 'Invalid totalSupply format' };
        }

        const contractName = toSolidityIdentifier(`${name}Token`, 'GeneratedToken');
        const sourceCode = buildSimpleErc20Source(contractName);
        const compiled = await compileSolidityContract(sourceCode, contractName);
        const deployData = encodeDeployData({
          abi: compiled.abi as Abi,
          bytecode: compiled.bytecode,
          args: [name, finalSymbol, decimals, parsedSupply] as const,
        });

        return {
          type: 'tx_plan' as const,
          mode: 'contract_deploy' as const,
          to: null,
          data: deployData,
          value: '0',
          chainId,
          description: `Deploy ERC20 token ${name} (${finalSymbol}) with total supply ${totalSupply}`,
          card: {
            title: card?.title ?? `Deploy ${name} (${finalSymbol})`,
            subtitle:
              card?.subtitle ??
              `Total supply ${totalSupply} (decimals ${decimals}). Full supply is minted to deployer.`,
            theme: card?.theme ?? 'amber',
            confirmText: card?.confirmText ?? 'Deploy Token',
            bullets:
              card?.bullets ??
              [
                'Standard ERC20 functions: transfer / approve / transferFrom',
                'Minted once in constructor to msg.sender',
                'Immutable token metadata after deployment',
              ],
          },
          metadata: {
            tokenName: name,
            tokenSymbol: finalSymbol,
            totalSupply,
            decimals,
            contractName: compiled.contractName,
            warnings: compiled.warnings,
            sourceCode,
          },
        };
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? `Failed to build token deployment: ${error.message}`
              : 'Failed to build token deployment',
        };
      }
    },
  }),

  buildSwap: tool({
    description: 'Build a swap transaction using PancakeSwap V2. Gets a quote and returns unsigned transaction data. Supports exact input ("I want to sell X") and exact output ("I want to buy exactly Y") modes.',
    inputSchema: z.object({
      tokenIn: z.string().describe('Address of token to sell (use "BNB" for native BNB)'),
      tokenOut: z.string().describe('Address of token to buy (use "BNB" for native BNB)'),
      amountIn: z.string().optional().describe('Amount of tokenIn to sell (human readable). Provide this OR amountOut.'),
      amountOut: z.string().optional().describe('Exact amount of tokenOut to buy (human readable). Provide this OR amountIn.'),
      slippage: z.number().min(0).max(50).optional().default(0.5).describe('Slippage tolerance in percent'),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ tokenIn, tokenOut, amountIn, amountOut, slippage, chainId }) => {
      try {
        if (!amountIn && !amountOut) {
          return { error: 'Provide either amountIn or amountOut' };
        }
        if (amountIn) {
          const numIn = Number(amountIn);
          if (!Number.isFinite(numIn) || numIn <= 0) {
            return { error: 'amountIn must be a positive number' };
          }
        }
        if (amountOut) {
          const numOut = Number(amountOut);
          if (!Number.isFinite(numOut) || numOut <= 0) {
            return { error: 'amountOut must be a positive number' };
          }
        }
        if (!pancakeswap.isSupported(chainId)) {
          return { error: `PancakeSwap V2 is not available on chain ${chainId}` };
        }

        const client = await getPublicClient(chainId);
        const contracts = pancakeswap.getContracts(chainId)!;
        const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`;
        const actualTokenIn = tokenIn.toUpperCase() === 'BNB'
          ? contracts.wbnb
          : (tokenIn as `0x${string}`);
        const actualTokenOut = tokenOut.toUpperCase() === 'BNB'
          ? contracts.wbnb
          : (tokenOut as `0x${string}`);

        if (!isAddress(actualTokenIn) || !isAddress(actualTokenOut)) {
          return { error: 'Invalid token address in swap pair' };
        }

        let decimalsIn = 18;
        if (actualTokenIn.toLowerCase() !== contracts.wbnb.toLowerCase()) {
          decimalsIn = (await client.readContract({
            address: actualTokenIn,
            abi: ERC20_ABI,
            functionName: 'decimals',
          })) as number;
        }

        let decimalsOut = 18;
        if (actualTokenOut.toLowerCase() !== contracts.wbnb.toLowerCase()) {
          decimalsOut = (await client.readContract({
            address: actualTokenOut,
            abi: ERC20_ABI,
            functionName: 'decimals',
          })) as number;
        }

        const slippageBps = Math.round((slippage ?? 0.5) * 100);
        const routerAddress = getPancakeRouterAddress(chainId);
        const isBnbIn = tokenIn.toUpperCase() === 'BNB';
        const isBnbOut = tokenOut.toUpperCase() === 'BNB';

        // Exact output mode: "I want to buy exactly Y tokenOut"
        if (amountOut && !amountIn) {
          const parsedAmountOut = parseUnits(amountOut, decimalsOut);
          const quote = await pancakeswap.getQuoteExactOut({
            chainId,
            tokenIn: isBnbIn ? ZERO : actualTokenIn,
            tokenOut: isBnbOut ? ZERO : actualTokenOut,
            amountOut: parsedAmountOut,
          });
          const maxAmountIn = (quote.amountIn * BigInt(10000 + slippageBps)) / 10000n;

          return {
            type: 'swap',
            mode: 'exact_output',
            tokenIn: actualTokenIn,
            tokenOut: actualTokenOut,
            amountIn: formatUnits(quote.amountIn, decimalsIn),
            maxAmountIn: formatUnits(maxAmountIn, decimalsIn),
            amountOut,
            decimalsIn,
            decimalsOut,
            slippage: slippage ?? 0.5,
            router: routerAddress,
            path: quote.path,
            chainId,
            description: `Buy exactly ${amountOut} ${tokenOut}, estimated cost ~${formatUnits(quote.amountIn, decimalsIn)} ${tokenIn}`,
          };
        }

        // Default: exact input mode
        const parsedAmountIn = parseUnits(amountIn!, decimalsIn);
        const quote = await pancakeswap.getQuote({
          chainId,
          tokenIn: isBnbIn ? ZERO : actualTokenIn,
          tokenOut: isBnbOut ? ZERO : actualTokenOut,
          amountIn: parsedAmountIn,
        });
        const minAmountOut = pancakeswap.applySlippage(quote.amountOut, slippageBps);

        return {
          type: 'swap',
          mode: 'exact_input',
          tokenIn: actualTokenIn,
          tokenOut: actualTokenOut,
          amountIn,
          amountOut: formatUnits(quote.amountOut, decimalsOut),
          minAmountOut: formatUnits(minAmountOut, decimalsOut),
          decimalsIn,
          decimalsOut,
          slippage: slippage ?? 0.5,
          router: routerAddress,
          path: quote.path,
          chainId,
          description: `Swap ${amountIn} ${tokenIn} for ~${formatUnits(quote.amountOut, decimalsOut)} ${tokenOut}`,
        };
      } catch (error) {
        return { error: `Failed to get swap quote: ${error instanceof Error ? error.message : 'Unknown error'}` };
      }
    },
  }),

  scanApprovals: tool({
    description: 'Scan all ERC20 token approvals for a wallet. Identifies unlimited and risky approvals. Uses on-chain event scanning for reliable results.',
    inputSchema: z.object({
      walletAddress: z.string().describe('Wallet address to scan'),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ walletAddress, chainId }) => {
      try {
        if (!isAddress(walletAddress)) {
          return { error: 'Invalid wallet address' };
        }
        const wallet = normalizeAddress(walletAddress);
        const client = await getPublicClient(chainId);
        const approvalEvents = await scanApprovalEvents(wallet, chainId);

        // Enrich with token symbols
        const approvals: Array<{
          tokenAddress: string;
          tokenSymbol: string;
          spender: string;
          allowance: string;
          isUnlimited: boolean;
          txHash: string;
        }> = [];

        for (const evt of approvalEvents.slice(0, 30)) {
          let symbol = evt.tokenAddress.slice(0, 8) + '...';
          try {
            symbol = (await client.readContract({
              address: evt.tokenAddress as `0x${string}`,
              abi: ERC20_ABI,
              functionName: 'symbol',
            })) as string;
          } catch { /* use truncated address */ }

          approvals.push({
            tokenAddress: evt.tokenAddress,
            tokenSymbol: symbol,
            spender: evt.spender,
            allowance: evt.isUnlimited ? 'UNLIMITED' : evt.value,
            isUnlimited: evt.isUnlimited,
            txHash: evt.hash,
          });
        }

        const unlimitedCount = approvals.filter(a => a.isUnlimited).length;

        return {
          totalApprovals: approvals.length,
          unlimitedApprovals: unlimitedCount,
          approvals,
          warning: unlimitedCount > 0
            ? `${unlimitedCount} unlimited approval(s) detected! These allow contracts to spend ALL your tokens. Consider revoking.`
            : approvals.length > 10
              ? 'You have many active approvals. Consider revoking unused ones.'
              : null,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to scan approvals' };
      }
    },
  }),

  revokeApproval: tool({
    description: 'Build a transaction to revoke (set to 0) an ERC20 token approval. Returns unsigned tx for the user to sign.',
    inputSchema: z.object({
      tokenAddress: z.string().describe('ERC20 token contract address'),
      spenderAddress: z.string().describe('The spender address to revoke approval for'),
      walletAddress: z.string().describe('The wallet address that granted the approval'),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ tokenAddress, spenderAddress, walletAddress, chainId }) => {
      try {
        if (!isAddress(tokenAddress) || !isAddress(spenderAddress) || !isAddress(walletAddress)) {
          return { error: 'Invalid token, spender, or wallet address' };
        }
        const client = await getPublicClient(chainId);
        const symbol = (await client.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'symbol',
        })) as string;

        return {
          type: 'erc20_transfer' as const,
          to: tokenAddress,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [spenderAddress as `0x${string}`, 0n],
          }),
          value: '0',
          description: `Revoke ${symbol} approval for ${spenderAddress}`,
          chainId,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to build revoke transaction' };
      }
    },
  }),

  walletHealth: tool({
    description: 'Comprehensive wallet health check. Scans BNB balance, token holdings, approvals, and generates a health score.',
    inputSchema: z.object({
      walletAddress: z.string().describe('Wallet address to check'),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ walletAddress, chainId }) => {
      try {
        if (!isAddress(walletAddress)) {
          return { error: 'Invalid wallet address' };
        }
        const wallet = normalizeAddress(walletAddress);
        const client = await getPublicClient(chainId);
        const issues: string[] = [];
        const recommendations: string[] = [];
        let score = 100;

        // 1. Check native balance
        const nativeBalance = await client.getBalance({ address: wallet });
        const bnbBalance = formatEther(nativeBalance);
        if (nativeBalance === 0n) {
          issues.push('Wallet has 0 BNB — cannot pay gas fees');
          score -= 20;
          recommendations.push('Deposit some BNB to cover gas fees');
        }

        // 2. Check common token holdings
        const healthChainTokens = getTokensForChain(chainId);
        const tokensToCheck: string[] = [healthChainTokens.USDT, healthChainTokens.USDC];
        if (healthChainTokens.CAKE) tokensToCheck.push(healthChainTokens.CAKE);
        let tokenCount = 0;

        for (const tokenAddr of tokensToCheck) {
          try {
            const bal = (await client.readContract({
              address: tokenAddr as `0x${string}`,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [wallet],
            })) as bigint;
            if (bal > 0n) tokenCount++;
          } catch { /* skip */ }
        }

        // 3. Scan approvals via RPC events (reliable, no API key needed)
        const approvalEvents = await scanApprovalEvents(wallet, chainId);
        const approvalCount = approvalEvents.length;
        const riskyApprovals = approvalEvents.filter(a => a.isUnlimited).length;

        if (riskyApprovals > 0) {
          issues.push(`${riskyApprovals} unlimited approval(s) detected — these allow contracts to spend all your tokens`);
          score -= Math.min(30, riskyApprovals * 10);
          recommendations.push('Revoke unlimited approvals you no longer use');
        }

        if (approvalCount > 20) {
          issues.push(`${approvalCount} total approvals — many may be unnecessary`);
          score -= 10;
          recommendations.push('Review and revoke old approvals to reduce risk');
        }

        if (issues.length === 0) {
          recommendations.push('Your wallet looks healthy! Keep monitoring regularly.');
        }

        score = Math.max(0, score);
        const level = score >= 70 ? 'healthy' : score >= 40 ? 'warning' : 'danger';

        return {
          address: walletAddress,
          chainId,
          score,
          level,
          nativeBalance: bnbBalance,
          tokenCount,
          approvalCount,
          riskyApprovals,
          issues,
          recommendations,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Wallet health check failed' };
      }
    },
  }),

  addressAnalysis: tool({
    description: 'Analyze an address: check if it is a scam via GoPlus, get transaction history summary, and activity pattern.',
    inputSchema: z.object({
      address: z.string().describe('The address to analyze'),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ address, chainId }) => {
      try {
        if (!isAddress(address)) {
          return { error: 'Invalid address' };
        }

        const addr = normalizeAddress(address);
        const [securityResult, history] = await Promise.allSettled([
          addressSecurity(addr, chainId),
          getTransactionHistory(addr, { page: 1, pageSize: 20, chainId }),
        ]);

        const security = securityResult.status === 'fulfilled' ? securityResult.value : null;
        const txHistory = history.status === 'fulfilled' ? history.value : [];
        const txCount = txHistory.length;
        const recentTxs = txHistory.slice(0, 5).map((tx) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          valueRaw: tx.value || '0',
          method: tx.functionName?.split('(')[0] || 'transfer',
          timestamp:
            Number.isFinite(Number(tx.timeStamp)) && Number(tx.timeStamp) > 0
              ? new Date(Number(tx.timeStamp) * 1000).toISOString()
              : null,
        }));

        return {
          address,
          chainId,
          security: security
            ? {
                isMalicious: security.isMalicious,
                isPhishing: security.isPhishing,
                isSanctioned: security.isSanctioned,
                isMixer: security.isMixer,
                isHoneypotCreator: security.isHoneypotCreator,
                flags: security.flags,
                dataSource: security.dataSource,
              }
            : null,
          recentTransactionCount: txCount,
          recentTransactions: recentTxs,
          summary: security?.isMalicious
            ? `WARNING: Address flagged as malicious (${security.flags.join(', ')}). ${txCount} recent transactions found.`
            : `Address has ${txCount} recent transactions. No malicious flags detected.`,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Address analysis failed' };
      }
    },
  }),

  storeReport: tool({
    description:
      'Store a security report hash on-chain as tamper-proof evidence. ' +
      'Call this AFTER a tokenSecurity, walletHealth, or addressAnalysis scan to create an immutable on-chain proof. ' +
      'Returns an unsigned transaction for the user to sign.',
    inputSchema: z.object({
      targetAddress: z.string().describe('The address that was scanned (token or wallet)'),
      reportData: z.any().describe('The full report data object from a previous scan tool'),
      reportType: z.enum(['token_security', 'address_analysis', 'wallet_health']).describe('Type of report'),
      chainId: z.number().optional().default(97).describe('Chain to store proof on (97=BSC Testnet, 204=opBNB)'),
    }),
    execute: async ({ targetAddress, reportData, reportType, chainId }) => {
      try {
        if (!isAddress(targetAddress)) {
          return { error: 'Invalid target address' };
        }

        const registryAddr = REPORT_REGISTRY_ADDRESS[chainId];
        if (!registryAddr || registryAddr === '0x0000000000000000000000000000000000000000') {
          return {
            error: `ReportRegistry not deployed on chain ${chainId}. Please deploy first.`,
            hint: 'Deploy the ReportRegistry contract and update REPORT_REGISTRY_ADDRESS',
          };
        }

        const reportHash = hashReport(reportData);
        const calldata = buildStoreReportCalldata({
          target: targetAddress as `0x${string}`,
          reportHash,
          reportType,
        });

        return {
          type: 'contract_call' as const,
          to: registryAddr,
          data: calldata,
          value: '0',
          chainId,
          reportHash,
          description: `Store ${reportType} report proof on-chain for ${targetAddress.slice(0, 8)}...${targetAddress.slice(-4)}`,
          metadata: {
            targetAddress,
            reportType,
            reportHash,
            registry: registryAddr,
          },
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to build storeReport transaction' };
      }
    },
  }),

  simulateTx: tool({
    description:
      'Simulate a transaction using eth_call to preview what would happen WITHOUT actually sending it. ' +
      'Shows estimated gas, whether it would succeed or revert, and decodes the return value. ' +
      'Use when user asks "what would happen if I..." or "simulate this transaction".',
    inputSchema: z.object({
      to: z.string().describe('Target contract or address'),
      data: z.string().optional().describe('Calldata (hex encoded). Leave empty for native transfer simulation.'),
      value: z.string().optional().default('0').describe('Value in wei to send'),
      from: z.string().optional().describe('Sender address for simulation context'),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ to, data, value, from, chainId }) => {
      try {
        if (!isAddress(to)) {
          return { error: 'Invalid target address' };
        }

        const client = await getPublicClient(chainId);

        // Check if target is a contract
        const code = await client.getCode({ address: to as `0x${string}` });
        const isContract = code !== undefined && code !== '0x';

        // Estimate gas
        let gasEstimate: bigint | null = null;
        let gasPrice: bigint | null = null;
        let simulationResult: string | null = null;
        let wouldSucceed = true;
        let revertReason: string | null = null;

        const callParams: {
          to: `0x${string}`;
          data?: `0x${string}`;
          value?: bigint;
          account?: `0x${string}`;
        } = {
          to: to as `0x${string}`,
        };

        if (data && data !== '0x') {
          callParams.data = data as `0x${string}`;
        }
        if (value && value !== '0') {
          callParams.value = BigInt(value);
        }
        if (from && isAddress(from)) {
          callParams.account = from as `0x${string}`;
        }

        // Try eth_call first
        try {
          const result = await client.call(callParams);
          simulationResult = result.data ?? null;
        } catch (err) {
          wouldSucceed = false;
          revertReason = err instanceof Error ? err.message : 'Unknown revert';
          // Try to extract revert reason
          const revertMatch = revertReason.match(/reverted with reason string '([^']+)'/);
          if (revertMatch) {
            revertReason = revertMatch[1];
          }
        }

        // Try gas estimation
        try {
          gasEstimate = await client.estimateGas(callParams);
        } catch {
          // Gas estimation failed — tx would likely revert
        }
        try {
          gasPrice = await client.getGasPrice();
        } catch {
          // Optional
        }
        const estimatedCostWei =
          gasEstimate !== null && gasPrice !== null
            ? gasEstimate * gasPrice
            : null;

        // Decode method signature if data is provided
        let methodId: string | null = null;
        if (data && data.length >= 10) {
          methodId = data.slice(0, 10);
        }

        return {
          simulation: {
            wouldSucceed,
            revertReason,
            gasEstimate: gasEstimate ? gasEstimate.toString() : null,
            gasPriceWei: gasPrice ? gasPrice.toString() : null,
            gasPriceGwei: gasPrice ? formatUnits(gasPrice, 9) : null,
            estimatedCostWei: estimatedCostWei ? estimatedCostWei.toString() : null,
            gasEstimateFormatted: estimatedCostWei
              ? `~${formatEther(estimatedCostWei)} BNB`
              : null,
            returnData: simulationResult,
          },
          target: {
            address: to,
            isContract,
          },
          transaction: {
            methodId,
            value: value ?? '0',
            valueFormatted: value && value !== '0' ? formatEther(BigInt(value)) + ' BNB' : '0 BNB',
          },
          chainId,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Transaction simulation failed' };
      }
    },
  }),

  verifyReport: tool({
    description: 'Verify if a security report hash exists on-chain. Proves a scan was performed and recorded.',
    inputSchema: z.object({
      reportHash: z.string().describe('The keccak256 report hash to verify (0x prefixed)'),
      chainId: z.number().optional().default(97),
    }),
    execute: async ({ reportHash, chainId }) => {
      try {
        if (!/^0x[a-fA-F0-9]{64}$/.test(reportHash)) {
          return { error: 'Invalid reportHash format. Expected bytes32 hex string.' };
        }
        const registryAddr = REPORT_REGISTRY_ADDRESS[chainId];
        if (!registryAddr || registryAddr === '0x0000000000000000000000000000000000000000') {
          return { error: `ReportRegistry not deployed on chain ${chainId}` };
        }

        const client = await getPublicClient(chainId);
        const exists = await client.readContract({
          address: registryAddr,
          abi: [
            {
              name: 'verifyReport',
              type: 'function',
              stateMutability: 'view',
              inputs: [{ name: 'reportHash', type: 'bytes32' }],
              outputs: [{ name: '', type: 'bool' }],
            },
          ] as const,
          functionName: 'verifyReport',
          args: [reportHash as `0x${string}`],
        });

        return {
          reportHash,
          exists,
          chainId,
          registry: registryAddr,
          message: exists
            ? 'Report is verified on-chain. This scan result is tamper-proof.'
            : 'Report hash not found on-chain. It may not have been stored yet.',
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to verify report' };
      }
    },
  }),

  newTokenRadar: tool({
    description: 'Scan for the latest new tokens on BSC/opBNB with optional GoPlus security check. Use when users ask about new coins, trending tokens, or token radar.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(20).default(8).describe('Number of tokens to return'),
      checkSecurity: z.boolean().default(true).describe('Whether to check GoPlus security for each token'),
      chainId: z.number().optional().default(56).describe('Chain ID (56=BSC, 204=opBNB)'),
    }),
    execute: async ({ limit, checkSecurity, chainId }) => {
      try {
        const tokens = await getLatestTokens({ limit, chainId });

        if (tokens.length === 0) {
          return { tokens: [], message: 'No new tokens found at this time.' };
        }

        let enriched = tokens.map((t) => ({
          ...t,
          security: null as Awaited<ReturnType<typeof tokenSecurity>> | null,
        }));
        if (checkSecurity) {
          const securityChecks = await Promise.allSettled(
            tokens.map((t) => tokenSecurity(t.address, chainId))
          );
          enriched = tokens.map((t, i) => {
            const result = securityChecks[i];
            const sec = result.status === 'fulfilled' ? result.value : null;
            return { ...t, security: sec };
          });
        }

        return {
          tokens: enriched.map((t) => ({
            address: t.address,
            name: t.name,
            symbol: t.symbol,
            priceUsd: t.priceUsd,
            priceChange24h: t.priceChange24h,
            volume24h: t.volume24h,
            liquidity: t.liquidity,
            dexName: t.dexName,
            url: t.url,
            chainId: t.chainId,
            isHoneypot: t.security?.isHoneypot ?? false,
            isMintable: t.security?.isMintable ?? false,
            riskLevel: t.security?.riskLevel ?? null,
            riskScore: t.security?.riskScore ?? null,
            riskCount: t.security?.risks?.length ?? null,
          })),
          scannedAt: new Date().toISOString(),
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to scan new tokens' };
      }
    },
  }),

  walletPersona: tool({
    description: 'Analyze a wallet address to generate a personality profile based on on-chain behavior: trading frequency, holding patterns, risk appetite, DeFi usage, etc.',
    inputSchema: z.object({
      address: z.string().describe('Wallet address to analyze'),
      chainId: z.number().default(56).describe('Chain ID'),
    }),
    execute: async ({ address, chainId }) => {
      try {
        if (!isAddress(address)) return { error: 'Invalid address' };
        const addr = normalizeAddress(address);

        const client = await getPublicClient(chainId);

        // Gather data in parallel
        const [bnbBalance, txHistory, approvals] = await Promise.all([
          client.getBalance({ address: addr }),
          getTransactionHistory(addr, { chainId, page: 1, pageSize: 50 }),
          scanApprovalEvents(addr, chainId).catch(() => []),
        ]);

        const bnbValue = Number(formatEther(bnbBalance));
        const txCount = txHistory.length;

        // Analyze patterns
        const traits: string[] = [];
        const tags: string[] = [];
        let riskLevel: 'conservative' | 'moderate' | 'aggressive' | 'degen' = 'moderate';

        // Wealth tier
        if (bnbValue >= 100) { tags.push('Whale'); traits.push('Holds significant BNB reserves'); }
        else if (bnbValue >= 10) { tags.push('Mid-tier Holder'); traits.push('Healthy BNB balance'); }
        else if (bnbValue >= 1) { tags.push('Retail Trader'); traits.push('Standard retail balance'); }
        else { tags.push('Light User'); traits.push('Minimal on-chain footprint'); }

        // Activity level
        if (txCount >= 40) { tags.push('Power User'); traits.push('Extremely active trader'); riskLevel = 'aggressive'; }
        else if (txCount >= 15) { tags.push('Active'); traits.push('Regular on-chain activity'); }
        else if (txCount >= 5) { tags.push('Casual'); traits.push('Occasional transactions'); riskLevel = 'conservative'; }
        else { tags.push('Observer'); traits.push('Mostly watching from the sidelines'); riskLevel = 'conservative'; }

        // Approval behavior
        const unlimitedApprovals = approvals.filter((a) => a.isUnlimited);
        if (unlimitedApprovals.length > 5) { tags.push('Approval Risk'); traits.push('Many unlimited approvals — high risk appetite'); riskLevel = 'degen'; }
        else if (unlimitedApprovals.length > 0) { traits.push(`${unlimitedApprovals.length} unlimited approval(s) active`); }
        else if (approvals.length === 0) { tags.push('Security-Minded'); traits.push('No active unlimited approvals'); }

        // DeFi usage (check if interacted with known routers)
        const routerAddr = getPancakeRouterAddress(chainId).toLowerCase();
        const dexInteractions = txHistory.filter(
          (tx) => tx.to?.toLowerCase() === routerAddr
        ).length;
        if (dexInteractions > 10) { tags.push('DeFi Native'); traits.push('Heavy PancakeSwap user'); }
        else if (dexInteractions > 0) { tags.push('DeFi Explorer'); traits.push('Has used DEX trading'); }

        // Generate persona summary
        const personaNames: Record<string, string> = {
          conservative: 'The Guardian',
          moderate: 'The Strategist',
          aggressive: 'The Maverick',
          degen: 'The Degen',
        };

        const personaEmojis: Record<string, string> = {
          conservative: '🛡️',
          moderate: '♟️',
          aggressive: '🚀',
          degen: '🔥',
        };

        return {
          address,
          chainId,
          persona: personaNames[riskLevel],
          emoji: personaEmojis[riskLevel],
          riskLevel,
          tags,
          traits,
          stats: {
            bnbBalance: `${bnbValue.toFixed(4)} BNB`,
            transactionCount: txCount,
            approvalCount: approvals.length,
            unlimitedApprovals: unlimitedApprovals.length,
            dexInteractions,
          },
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to analyze wallet persona' };
      }
    },
  }),

  // ── New tools using expanded SDK capabilities ─────────────

  checkPhishing: tool({
    description: 'Quick phishing/scam detection for a URL. Returns yes/no phishing verdict. ALWAYS use this FIRST when user asks "is this site safe?" or shares a suspicious link. For deeper dApp project info (audits, contracts), use checkDapp separately.',
    inputSchema: z.object({
      url: z.string().min(1).describe('The URL or domain to check'),
    }),
    execute: async ({ url }) => {
      try {
        const result = await phishingSite(url);
        return {
          url,
          isPhishing: result.isPhishing,
          verdict: result.isPhishing
            ? 'WARNING: This is a known phishing site. Do NOT interact with it.'
            : 'No phishing indicators found for this URL.',
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Phishing check failed' };
      }
    },
  }),

  checkDapp: tool({
    description: 'Get detailed dApp project security: audit reports, trust list, associated smart contracts. Use when user asks about a DeFi protocol/project details (e.g. "PancakeSwap 审计了吗?"). Do NOT use for simple URL safety checks — use checkPhishing for that.',
    inputSchema: z.object({
      url: z.string().min(1).describe('The dApp URL to check'),
    }),
    execute: async ({ url }) => {
      try {
        const result = await dappSecurity(url);
        return {
          url,
          projectName: result.projectName,
          isAudit: result.isAudit,
          trustList: result.trustList,
          auditInfo: result.auditInfo,
          contractsSecurity: result.contractsSecurity,
          verdict: result.trustList
            ? 'This dApp is on the GoPlus trust list and appears safe.'
            : result.isAudit
              ? 'This dApp has been audited but is not on the trust list. Exercise caution.'
              : 'This dApp has no audit records. Use with extreme caution.',
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'dApp security check failed' };
      }
    },
  }),

  decodeTransaction: tool({
    description: 'Decode and analyze a transaction calldata for potential risks. Use when user pastes transaction data or asks "what does this transaction do?".',
    inputSchema: z.object({
      data: z.string().min(1).describe('Transaction calldata (hex encoded, 0x prefixed)'),
      contractAddress: z.string().optional().describe('Target contract address for better decoding'),
      signer: z.string().optional().describe('Signer address for context'),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ data, contractAddress, signer, chainId }) => {
      try {
        const result = await signatureDecode({
          chainId,
          data,
          contractAddress,
          signer,
        });
        return {
          method: result.method,
          contractName: result.contractName,
          isMaliciousContract: result.isMaliciousContract,
          isRiskySignature: result.isRiskySignature,
          riskDescription: result.riskDescription,
          signatureDetail: result.signatureDetail,
          params: result.params,
          verdict: result.isRiskySignature
            ? `WARNING: This transaction is risky. ${result.riskDescription}`
            : result.isMaliciousContract
              ? 'WARNING: Target contract is flagged as malicious.'
              : `Transaction calls ${result.method || 'unknown'} on ${result.contractName || 'unknown contract'}. No immediate risk detected.`,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Transaction decode failed' };
      }
    },
  }),

  searchTokenByName: tool({
    description: 'Search for tokens by name or symbol on BSC. Use when user mentions a token by name but does not provide an address.',
    inputSchema: z.object({
      query: z.string().min(1).describe('Token name, symbol, or partial match'),
      limit: z.number().int().min(1).max(10).optional().default(5),
    }),
    execute: async ({ query, limit }) => {
      try {
        const results = await searchToken(query, { chainId: 56, limit });
        if (results.length === 0) {
          return { results: [], message: `No tokens found matching "${query}" on BSC.` };
        }
        return {
          results: results.map((t) => ({
            address: t.address,
            name: t.name,
            symbol: t.symbol,
            priceUsd: t.priceUsd,
            volume24h: t.volume24h,
            liquidity: t.liquidity,
            dexName: t.dexName,
            url: t.url,
          })),
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Token search failed' };
      }
    },
  }),

  checkNft: tool({
    description: 'Check NFT collection security on BSC. Use when user asks about an NFT project safety.',
    inputSchema: z.object({
      contractAddress: z.string().describe('NFT contract address'),
      tokenId: z.string().optional().describe('Specific token ID to check'),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ contractAddress, tokenId, chainId }) => {
      try {
        if (!isAddress(contractAddress)) {
          return { error: 'Invalid NFT contract address' };
        }
        const result = await nftSecurity(normalizeAddress(contractAddress), chainId, tokenId);
        const risks: string[] = [];
        if (result.isMalicious) risks.push('Flagged as malicious NFT');
        if (!result.isOpenSource) risks.push('Contract is not open source');
        if (result.isProxy) risks.push('Uses proxy contract');
        if (result.selfDestruct) risks.push('Has self-destruct function');
        if (result.transferWithoutApproval) risks.push('Can transfer without approval');
        if (result.privilegedBurn) risks.push('Owner can burn tokens');
        if (result.privilegedMinting) risks.push('Has privileged minting');
        if (result.oversupplyMinting) risks.push('Can mint beyond supply limit');
        if (result.restrictedApproval) risks.push('Restricted approval — may not trade on DEX');

        return {
          ...result,
          risks,
          riskLevel: result.isMalicious ? 'danger' : risks.length > 3 ? 'warning' : 'safe',
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'NFT security check failed' };
      }
    },
  }),

  checkApprovalRisk: tool({
    description: 'Advanced approval risk check via GoPlus (more comprehensive than basic RPC scan). Shows spender risk info, malicious behavior, and trust status.',
    inputSchema: z.object({
      walletAddress: z.string().describe('Wallet address to check approvals for'),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ walletAddress, chainId }) => {
      try {
        if (!isAddress(walletAddress)) {
          return { error: 'Invalid wallet address' };
        }
        const records = await approvalSecurity(normalizeAddress(walletAddress), chainId);
        const riskyCount = records.filter((r) => r.isMalicious).length;
        const totalApprovals = records.reduce(
          (sum, r) => sum + r.approvedList.length,
          0
        );
        const riskySpenders = records.flatMap((r) =>
          r.approvedList
            .filter((a) => a.spenderInfo.doubtList || a.spenderInfo.maliciousBehavior.length > 0)
            .map((a) => ({
              token: r.tokenSymbol,
              spender: a.spenderAddress,
              spenderName: a.spenderInfo.contractName,
              amount: a.approvedAmount,
              risks: a.spenderInfo.maliciousBehavior,
            }))
        );

        return {
          totalTokensWithApprovals: records.length,
          totalApprovals,
          riskyTokens: riskyCount,
          riskySpenders,
          records: records.slice(0, 20).map((r) => ({
            token: `${r.tokenSymbol} (${r.tokenAddress.slice(0, 8)}...)`,
            isMalicious: r.isMalicious,
            approvalCount: r.approvedList.length,
          })),
          verdict: riskySpenders.length > 0
            ? `WARNING: ${riskySpenders.length} risky spender(s) found. Consider revoking.`
            : totalApprovals > 20
              ? `${totalApprovals} approvals found. Consider reviewing unused ones.`
              : 'Approval status looks clean.',
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Approval risk check failed' };
      }
    },
  }),

  checkGasPrice: tool({
    description: 'Get current BSC gas price oracle data. Use when user asks "how much is gas?", "is gas expensive now?", or before estimating transaction costs.',
    inputSchema: z.object({
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ chainId }) => {
      try {
        const oracle = await getGasOracle(chainId);
        if (!oracle) {
          return { error: 'Gas oracle data not available for this chain' };
        }
        return {
          lastBlock: oracle.lastBlock,
          safeGasPrice: `${oracle.safeGasPrice} Gwei`,
          proposeGasPrice: `${oracle.proposeGasPrice} Gwei`,
          fastGasPrice: `${oracle.fastGasPrice} Gwei`,
          suggestBaseFee: oracle.suggestBaseFee ? `${oracle.suggestBaseFee} Gwei` : null,
          summary: `Gas prices — Safe: ${oracle.safeGasPrice} Gwei, Standard: ${oracle.proposeGasPrice} Gwei, Fast: ${oracle.fastGasPrice} Gwei`,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to fetch gas prices' };
      }
    },
  }),

  inspectContract: tool({
    description:
      'Inspect a smart contract: check verification status, compiler info, and optionally retrieve ABI or source code. ' +
      'Source code is auto-cached locally and available for download. ' +
      'Use when user asks "is this contract verified?", "show me the contract code", "看看这个合约", or wants to understand a contract before interacting.',
    inputSchema: z.object({
      address: z.string().describe('Contract address to inspect'),
      includeAbi: z.boolean().optional().default(false).describe('Whether to also fetch ABI JSON'),
      includeSource: z.boolean().optional().default(false).describe(
        'Whether to include main contract source code. ' +
        'Source is auto-included for small contracts (<50K chars). ' +
        'For large multi-file contracts, only the main contract file is returned.'
      ),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ address, includeAbi, includeSource, chainId }) => {
      try {
        if (!isAddress(address)) {
          return { error: 'Invalid contract address' };
        }
        const addr = normalizeAddress(address);

        // Check cache first
        let meta = getCachedMetadata(chainId, addr);

        if (!meta) {
          // Fetch from BscScan and auto-cache
          const source = await getContractSourceCode(addr, chainId);
          if (!source || !source.sourceCode) {
            return {
              address: addr,
              isVerified: false,
              message: 'Contract source code not found. The contract may not be verified on the explorer.',
            };
          }

          meta = await saveContractSource(chainId, addr, source);

          // Also fetch ABI if requested (not in cache flow)
          if (includeAbi) {
            const abi = await getContractABI(addr, chainId);
            const result: Record<string, unknown> = buildResult(addr, meta);
            result.abi = abi ? JSON.parse(abi) : null;
            addSourceToResult(result, meta, chainId, addr, includeSource);
            return result;
          }
        }

        const result: Record<string, unknown> = buildResult(addr, meta);

        if (includeAbi) {
          const abi = await getContractABI(addr, chainId);
          result.abi = abi ? JSON.parse(abi) : null;
        }

        addSourceToResult(result, meta, chainId, addr, includeSource);
        return result;
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Contract inspection failed' };
      }
    },
  }),

  getTokenTransferHistory: tool({
    description: 'Get recent ERC-20 token transfer history for an address. Use when user asks "what tokens did I receive/send recently?" or "show my USDT transfers".',
    inputSchema: z.object({
      walletAddress: z.string().describe('Wallet address to query'),
      contractAddress: z.string().optional().describe('Filter by specific token contract address'),
      limit: z.number().int().min(1).max(50).optional().default(10),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ walletAddress, contractAddress, limit, chainId }) => {
      try {
        if (!isAddress(walletAddress)) {
          return { error: 'Invalid wallet address' };
        }
        if (contractAddress && !isAddress(contractAddress)) {
          return { error: 'Invalid token contract address' };
        }
        const transfers = await getTokenTransfers(normalizeAddress(walletAddress), {
          contractAddress: contractAddress ? normalizeAddress(contractAddress) : undefined,
          chainId,
          pageSize: limit,
        });

        if (transfers.length === 0) {
          return {
            totalFound: 0,
            transfers: [],
            message: contractAddress
              ? 'No token transfers found for this token and address.'
              : 'No token transfers found for this address.',
          };
        }

        return {
          totalFound: transfers.length,
          transfers: transfers.slice(0, limit).map((t) => ({
            hash: t.hash,
            from: t.from,
            to: t.to,
            tokenName: t.tokenName,
            tokenSymbol: t.tokenSymbol,
            amount: t.value,
            decimals: t.tokenDecimal,
            contractAddress: t.contractAddress,
            timestamp: Number(t.timeStamp) > 0
              ? new Date(Number(t.timeStamp) * 1000).toISOString()
              : null,
            direction: t.from.toLowerCase() === walletAddress.toLowerCase() ? 'out' : 'in',
          })),
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to fetch transfer history' };
      }
    },
  }),

  checkLiquidity: tool({
    description: 'Get USD-denominated market data for a DEX pair: liquidity in USD, 24h volume, price, market cap (via DexScreener). PRIMARY tool for liquidity questions. Use when user asks "流动性多少/how much liquidity/volume".',
    inputSchema: z.object({
      pairAddress: z.string().describe('DEX pair contract address'),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ pairAddress, chainId }) => {
      try {
        if (!isAddress(pairAddress)) {
          return { error: 'Invalid pair address' };
        }
        const info = await getPairInfo(chainId, normalizeAddress(pairAddress));
        if (!info) {
          return { error: 'Pair not found. It may not be indexed on DexScreener yet.' };
        }
        const liquidityWarning = info.liquidity < 10000
          ? 'WARNING: Very low liquidity (< $10K). Large trades may suffer high slippage.'
          : info.liquidity < 50000
            ? 'Moderate liquidity. Be cautious with large trade sizes.'
            : null;

        return {
          ...info,
          liquidityFormatted: `$${info.liquidity.toLocaleString()}`,
          volume24hFormatted: `$${info.volume24h.toLocaleString()}`,
          warning: liquidityWarning,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to check liquidity' };
      }
    },
  }),

  checkPairReserves: tool({
    description: 'Get raw on-chain token reserves from PancakeSwap V2 contract (token amounts, not USD). Use ONLY for reserve ratios or price impact calculation. For general liquidity questions, prefer checkLiquidity.',
    inputSchema: z.object({
      tokenA: z.string().describe('First token address'),
      tokenB: z.string().describe('Second token address (use "BNB" for native BNB)'),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ tokenA, tokenB, chainId }) => {
      try {
        if (!isAddress(tokenA)) return { error: 'Invalid tokenA address' };
        const contracts = pancakeswap.getContracts(chainId);
        if (!contracts) return { error: `PancakeSwap not available on chain ${chainId}` };

        const addrA = normalizeAddress(tokenA);
        const addrB = tokenB.toUpperCase() === 'BNB'
          ? contracts.wbnb
          : normalizeAddress(tokenB);

        if (!isAddress(addrB)) return { error: 'Invalid tokenB address' };

        const reserves = await pancakeswap.getPairReserves(chainId, addrA, addrB);
        if (!reserves) {
          return { error: 'No liquidity pair found for these tokens on PancakeSwap V2.' };
        }
        return {
          pairAddress: reserves.pairAddress,
          token0: reserves.token0,
          token1: reserves.token1,
          reserve0: reserves.reserve0.toString(),
          reserve1: reserves.reserve1.toString(),
          chainId,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to fetch pair reserves' };
      }
    },
  }),

  // ── Binance CEX data ──────────────────────────────────────

  binanceTicker: tool({
    description: 'Get 24h CEX ticker data from Binance: price, change%, volume, bid/ask. PREFERRED for mainstream token prices (BNB, ETH, BTC, CAKE, SOL, DOGE, XRP). Use this instead of tokenInfo for these tokens.',
    inputSchema: z.object({
      symbol: z.string().describe('Token symbol (e.g. "BNB", "ETH", "BTC") or trading pair (e.g. "BNBUSDT")'),
    }),
    execute: async ({ symbol }) => {
      try {
        const ticker = await getTicker24h(symbol);
        if (!ticker) return { error: `No Binance ticker found for "${symbol}". The token may not be listed on Binance.` };
        return ticker;
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to fetch Binance ticker' };
      }
    },
  }),

  binanceKlines: tool({
    description: 'Get K-line/candlestick (OHLCV) data from Binance. MUST use this when user asks for K线, 走势图, candle chart, 历史价格, or any chart data. Returns OHLCV candles for rendering.',
    inputSchema: z.object({
      symbol: z.string().describe('Token symbol or trading pair'),
      interval: z.string().default('1h').describe('Candle interval: 1m, 5m, 15m, 1h, 4h, 1d, 1w'),
      limit: z.number().default(100).describe('Number of candles (max 500)'),
    }),
    execute: async ({ symbol, interval, limit }) => {
      try {
        const validInterval: KlineInterval = isValidInterval(interval) ? interval : '1h';
        const candles = await getKlines(symbol, validInterval, limit);
        if (candles.length === 0) return { error: `No kline data for "${symbol}". The token may not be listed on Binance.` };
        return {
          symbol: resolveSymbol(symbol),
          interval: validInterval,
          candles,
          count: candles.length,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to fetch kline data' };
      }
    },
  }),

  technicalAnalysis: tool({
    description: 'Compute technical indicators (RSI, MACD, MA, EMA, Bollinger Bands) and generate trading signals. MUST use this when user asks for 技术分析, RSI, MACD, 超买超卖, 布林带, or any technical indicator.',
    inputSchema: z.object({
      symbol: z.string().describe('Token symbol or trading pair'),
      interval: z.string().default('1h').describe('Candle interval for analysis'),
    }),
    execute: async ({ symbol, interval }) => {
      try {
        const validInterval: KlineInterval = isValidInterval(interval) ? interval : '1h';
        const candles = await getKlines(symbol, validInterval, 200);
        if (candles.length < 30) return { error: `Insufficient data for "${symbol}" (need ≥30 candles, got ${candles.length}).` };

        const closes = candles.map((c) => c.close);
        const highs = candles.map((c) => c.high);
        const lows = candles.map((c) => c.low);
        const currentPrice = closes[closes.length - 1];

        const ti = await import('technicalindicators');

        // MA / EMA
        const ma20 = ti.SMA.calculate({ period: 20, values: closes });
        const ma50 = ti.SMA.calculate({ period: 50, values: closes });
        const ema12 = ti.EMA.calculate({ period: 12, values: closes });
        const ema26 = ti.EMA.calculate({ period: 26, values: closes });

        // RSI
        const rsiValues = ti.RSI.calculate({ period: 14, values: closes });
        const rsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;

        // MACD
        const macdResult = ti.MACD.calculate({
          values: closes,
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9,
          SimpleMAOscillator: false,
          SimpleMASignal: false,
        });
        const macd = macdResult.length > 0 ? macdResult[macdResult.length - 1] : null;

        // Bollinger Bands
        const bbResult = ti.BollingerBands.calculate({
          period: 20,
          values: closes,
          stdDev: 2,
        });
        const bb = bbResult.length > 0 ? bbResult[bbResult.length - 1] : null;

        // Generate signals
        const signals: string[] = [];

        if (rsi !== null) {
          if (rsi > 70) signals.push('RSI overbought (>70) — bearish signal');
          else if (rsi < 30) signals.push('RSI oversold (<30) — bullish signal');
        }

        if (macd) {
          const prevMacd = macdResult.length > 1 ? macdResult[macdResult.length - 2] : null;
          if (prevMacd && macd.histogram !== undefined && prevMacd.histogram !== undefined) {
            if (prevMacd.histogram < 0 && macd.histogram >= 0) signals.push('MACD golden cross — bullish signal');
            else if (prevMacd.histogram > 0 && macd.histogram <= 0) signals.push('MACD death cross — bearish signal');
          }
        }

        if (ma20.length > 0 && ma50.length > 0) {
          const latestMa20 = ma20[ma20.length - 1];
          const latestMa50 = ma50[ma50.length - 1];
          if (latestMa20 > latestMa50) signals.push('MA20 above MA50 — bullish trend');
          else signals.push('MA20 below MA50 — bearish trend');
        }

        if (bb) {
          if (currentPrice > bb.upper) signals.push('Price above upper Bollinger Band — potential pullback');
          else if (currentPrice < bb.lower) signals.push('Price below lower Bollinger Band — potential bounce');
        }

        // Overall signal
        let bullish = 0;
        let bearish = 0;
        for (const s of signals) {
          if (s.includes('bullish')) bullish++;
          if (s.includes('bearish')) bearish++;
        }
        const overallSignal = bullish > bearish ? 'bullish' : bearish > bullish ? 'bearish' : 'neutral';

        return {
          symbol: resolveSymbol(symbol),
          interval: validInterval,
          currentPrice,
          indicators: {
            rsi: rsi !== null ? Math.round(rsi * 100) / 100 : null,
            macd: macd
              ? {
                  MACD: Math.round((macd.MACD ?? 0) * 10000) / 10000,
                  signal: Math.round((macd.signal ?? 0) * 10000) / 10000,
                  histogram: Math.round((macd.histogram ?? 0) * 10000) / 10000,
                }
              : null,
            ma20: ma20.length > 0 ? Math.round(ma20[ma20.length - 1] * 10000) / 10000 : null,
            ma50: ma50.length > 0 ? Math.round(ma50[ma50.length - 1] * 10000) / 10000 : null,
            ema12: ema12.length > 0 ? Math.round(ema12[ema12.length - 1] * 10000) / 10000 : null,
            ema26: ema26.length > 0 ? Math.round(ema26[ema26.length - 1] * 10000) / 10000 : null,
            bollingerBands: bb
              ? {
                  upper: Math.round(bb.upper * 10000) / 10000,
                  middle: Math.round(bb.middle * 10000) / 10000,
                  lower: Math.round(bb.lower * 10000) / 10000,
                }
              : null,
          },
          signals,
          overallSignal,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to compute technical analysis' };
      }
    },
  }),

  // ── Deep Token Analysis ──────────────────────────────────────

  deepTokenAnalysis: tool({
    description:
      'Perform comprehensive deep analysis of a token: security scan, contract audit, market data, web search, social sentiment. ' +
      'Generates a full HTML report stored at a shareable URL. Takes ~15-30 seconds. ' +
      'Use when user asks for "深度分析/deep analysis/详细报告/全面分析/comprehensive report" on a token.',
    inputSchema: z.object({
      tokenAddress: z.string().describe('Token contract address to analyze'),
      chainId: z.number().optional().default(56),
    }),
    execute: async ({ tokenAddress, chainId }) => {
      const startTime = Date.now();
      const log = (msg: string) => console.log(`[deep-analysis] [${Date.now() - startTime}ms] ${msg}`);
      const runCtx = getChatRunContext();
      const chatId = runCtx?.chatId;
      const runLogger = runCtx?.logger;

      if (!isAddress(tokenAddress)) {
        return { error: 'Invalid token address' };
      }
      const addr = normalizeAddress(tokenAddress);
      const steps: ReportStep[] = [];
      log(`START ${addr} chain=${chainId} chatId=${chatId ?? 'none'}`);
     try {

      // Declare mutable state BEFORE any closures that reference them (avoids TDZ in minified builds)
      let securityData: Record<string, unknown> | null = null;
      let contractData: Record<string, unknown> | null = null;
      let marketData: Record<string, unknown> | null = null;
      let tokenName: string | null = null;
      let tokenSymbol: string | null = null;
      let websiteUrl: string | null = null;

      // All step definitions for progress tracking
      const ALL_STEPS: StepProgress[] = [
        { key: 'security', label: 'Token Security Scan', status: 'pending' },
        { key: 'contract', label: 'Contract Audit', status: 'pending' },
        { key: 'market', label: 'Market Data', status: 'pending' },
        { key: 'search', label: 'Web & Social Search', status: 'pending' },
        { key: 'analysis', label: 'AI Analysis', status: 'pending' },
        { key: 'render', label: 'Report Render', status: 'pending' },
      ];

      /** Emit progress update to the in-memory store. */
      const emitProgress = (phase: string, updates?: Partial<Record<string, Partial<StepProgress>>>) => {
        if (!chatId) return;
        if (updates) {
          for (const [key, patch] of Object.entries(updates)) {
            const step = ALL_STEPS.find((s) => s.key === key);
            if (step) Object.assign(step, patch);
          }
        }
        setAnalysisProgress(chatId, {
          tokenAddress: addr,
          tokenName,
          tokenSymbol,
          phase,
          steps: ALL_STEPS.map((s) => ({ ...s })),
          startedAt: startTime,
        });
      };

      emitProgress('init');

      // ── Phase 1: Parallel data collection ──
      emitProgress('phase1', {
        security: { status: 'running' },
        contract: { status: 'running' },
        market: { status: 'running' },
      });

      const phase1Start = Date.now();
      const [secResult, contractResult, marketResult] = await Promise.allSettled([
        tokenSecurity(addr, chainId),
        getContractSourceCode(addr, chainId),
        getTokenPrice(addr, chainId),
      ]);
      log(`Phase1 done (${Date.now() - phase1Start}ms): goplus=${secResult.status} bscscan=${contractResult.status} dex=${marketResult.status}`);
      const p1dur = Date.now() - phase1Start;

      if (secResult.status === 'fulfilled') {
        const r = secResult.value;
        tokenName = r.tokenName || null;
        tokenSymbol = r.tokenSymbol || null;
        securityData = {
          tokenName: r.tokenName, tokenSymbol: r.tokenSymbol,
          isHoneypot: r.isHoneypot, isMintable: r.isMintable,
          isProxy: r.isProxy, isBlacklisted: r.isBlacklisted,
          isOpenSource: r.isOpenSource, isAntiWhale: r.isAntiWhale,
          cannotBuy: r.cannotBuy, cannotSellAll: r.cannotSellAll,
          transferPausable: r.transferPausable, hiddenOwner: r.hiddenOwner,
          selfDestruct: r.selfDestruct, buyTax: r.buyTax, sellTax: r.sellTax,
          holderCount: r.holderCount, lpHolderCount: r.lpHolderCount,
          totalSupply: r.totalSupply, creatorAddress: r.creatorAddress,
          ownerAddress: r.ownerAddress, riskLevel: r.riskLevel,
          riskScore: r.riskScore, risks: r.risks,
          holders: r.holders?.slice(0, 10), dex: r.dex,
        };
        steps.push({ key: 'security', label: 'Token Security Scan', status: 'completed',
          summary: `${r.riskLevel} — ${r.risks.length} risk(s)`, durationMs: Date.now() - phase1Start });
      } else {
        steps.push({ key: 'security', label: 'Token Security Scan', status: 'failed',
          summary: 'Security data unavailable', durationMs: Date.now() - phase1Start });
      }

      if (contractResult.status === 'fulfilled' && contractResult.value?.sourceCode) {
        const src = contractResult.value;
        contractData = {
          contractName: src.contractName, compilerVersion: src.compilerVersion,
          optimizationUsed: src.optimizationUsed, evmVersion: src.evmVersion,
          licenseType: src.licenseType, isProxy: src.proxy === '1',
          sourceLineCount: src.sourceCode.split('\n').length,
          sourcePreview: src.sourceCode.slice(0, 3000),
        };
        if (!tokenName && src.contractName) tokenName = src.contractName;
        steps.push({ key: 'contract', label: 'Contract Audit', status: 'completed',
          summary: `${src.contractName} — ${src.sourceCode.split('\n').length} lines`, durationMs: Date.now() - phase1Start });
      } else {
        steps.push({ key: 'contract', label: 'Contract Audit',
          status: contractResult.status === 'rejected' ? 'failed' : 'skipped',
          summary: contractResult.status === 'rejected' ? 'Contract data unavailable' : 'Contract not verified',
          durationMs: Date.now() - phase1Start });
      }

      if (marketResult.status === 'fulfilled' && marketResult.value) {
        const p = marketResult.value;
        marketData = {
          name: p.name, symbol: p.symbol, priceUsd: p.priceUsd,
          priceChange24h: p.priceChange24h, volume24h: p.volume24h,
          liquidity: p.liquidity, fdv: p.fdv, marketCap: p.marketCap,
          pairAddress: p.pairAddress, dexName: p.dexName, txns24h: p.txns24h,
        };
        if (!tokenName && p.name) tokenName = p.name;
        if (!tokenSymbol && p.symbol) tokenSymbol = p.symbol;
        steps.push({ key: 'market', label: 'Market Data', status: 'completed',
          summary: `$${p.priceUsd.toFixed(6)} — Liq: $${formatCompact(p.liquidity)}`, durationMs: Date.now() - phase1Start });
      } else {
        steps.push({ key: 'market', label: 'Market Data',
          status: marketResult.status === 'rejected' ? 'failed' : 'skipped',
          summary: marketResult.status === 'rejected' ? 'Market data unavailable' : 'No DEX listing found',
          durationMs: Date.now() - phase1Start });
      }

      // Emit Phase 1 completion
      emitProgress('phase1-done', {
        security: {
          status: secResult.status === 'fulfilled' ? 'completed' : 'failed',
          summary: steps.find((s) => s.key === 'security')?.summary ?? undefined,
          durationMs: p1dur,
        },
        contract: {
          status: contractResult.status === 'fulfilled' && contractResult.value?.sourceCode ? 'completed'
            : contractResult.status === 'rejected' ? 'failed' : 'skipped',
          summary: steps.find((s) => s.key === 'contract')?.summary ?? undefined,
          durationMs: p1dur,
        },
        market: {
          status: marketResult.status === 'fulfilled' && marketResult.value ? 'completed'
            : marketResult.status === 'rejected' ? 'failed' : 'skipped',
          summary: steps.find((s) => s.key === 'market')?.summary ?? undefined,
          durationMs: p1dur,
        },
      });

      // ── RunLogger: Phase 1 steps ──
      if (runLogger) {
        for (const s of steps) {
          runLogger.deepAnalysisPhase({ phase: 'phase1', tokenAddress: addr, stepKey: s.key, stepStatus: s.status, durationMs: s.durationMs });
        }
      }

      if (!securityData && !marketData) {
        log('ABORT: no security + no market data');
        emitProgress('error', {});
        return { error: 'Unable to gather sufficient data. Both security and market data unavailable.' };
      }

      // ── Phase 2: Web intelligence ──

      // Pre-populate websiteUrl from DexScreener info.websites (project-submitted, reliable)
      if (!websiteUrl && marketResult.status === 'fulfilled' && marketResult.value?.websites?.length) {
        const dexWebsite = marketResult.value.websites.find(w => w.url);
        if (dexWebsite?.url) websiteUrl = dexWebsite.url;
      }

      const searchName = tokenName || tokenSymbol || addr.slice(0, 10);
      let searchResults: SerperParallelResults = { twitter: [], general: [], news: [], security: [], community: [], tokenomics: [] };
      let websiteText: string | null = null;
      let websiteScraped: ScrapedPage | null = null;

      const phase2Start = Date.now();
      emitProgress('phase2', { search: { status: 'running' } });
      const [serperResult, websiteResult] = await Promise.allSettled([
        serperSearchParallel(searchName, tokenSymbol || '', addr),
        websiteUrl ? scrapeWebsite(websiteUrl) : Promise.resolve(null),
      ]);
      log(`Phase2 done (${Date.now() - phase2Start}ms): serper=${serperResult.status}`);

      if (serperResult.status === 'fulfilled') {
        searchResults = serperResult.value;
        const total = searchResults.twitter.length + searchResults.general.length
          + searchResults.news.length + searchResults.security.length;
        steps.push({ key: 'search', label: 'Web & Social Search',
          status: total > 0 ? 'completed' : 'skipped',
          summary: total > 0
            ? `${total} results (${searchResults.twitter.length} social, ${searchResults.general.length + searchResults.news.length} web, ${searchResults.security.length} security)`
            : 'No search results',
          durationMs: Date.now() - phase2Start });
      } else {
        steps.push({ key: 'search', label: 'Web & Social Search', status: 'failed',
          summary: 'Search unavailable', durationMs: Date.now() - phase2Start });
      }

      if (websiteResult.status === 'fulfilled' && websiteResult.value) {
        websiteScraped = websiteResult.value;
        websiteText = websiteScraped.text.slice(0, 4000);
      }
      if (!websiteText && searchResults.general.length > 0) {
        // Filter out known aggregator domains
        const EXCLUDED_DOMAINS = [
          'bscscan.com', 'etherscan.io', 'dexscreener.com', 'dextools.io',
          'twitter.com', 'x.com', 'coinmarketcap.com', 'coingecko.com',
          'reddit.com', 'medium.com', 'youtube.com', 'facebook.com',
          'dappradar.com', 'defillama.com', 'defilama.com',
          'certik.com', 'immunefi.com', 'hacken.io',
          'binance.com', 'okx.com', 'bybit.com', 'gate.io', 'kucoin.com',
          'google.com', 'bing.com', 'yahoo.com',
        ];
        const candidates = searchResults.general.filter(r =>
          !EXCLUDED_DOMAINS.some(d => r.link.includes(d))
        );
        // Prefer URLs whose domain contains the token name or symbol (case-insensitive)
        const namePattern = (tokenName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const symPattern = (tokenSymbol || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const officialSite = candidates.find(r => {
          const domain = r.link.toLowerCase();
          return (namePattern && domain.includes(namePattern)) || (symPattern && domain.includes(symPattern));
        }) ?? candidates[0];
        if (officialSite) {
          websiteUrl = officialSite.link;
          try {
            const scraped = await scrapeWebsite(officialSite.link);
            if (scraped) {
              websiteScraped = scraped;
              websiteText = scraped.text.slice(0, 4000);
            }
          } catch { /* ignore */ }
        }
      }

      // ── Internal link crawling (sub-pages: tokenomics, about, team, etc.) ──
      let subPages: CrawledSubPage[] = [];
      if (websiteScraped && websiteUrl && !websiteScraped.sparse) {
        try {
          subPages = await crawlSubPages(websiteUrl, websiteScraped.links, { maxPages: 3 });
          if (subPages.length > 0) {
            log(`Phase2 crawled ${subPages.length} sub-pages: ${subPages.map(p => p.matchedKeyword).join(', ')}`);
          }
        } catch { /* ignore crawl errors */ }
      }

      // ── Social link extraction & cross-validation ──
      // Priority: official website > DexScreener (project-submitted) > search results
      const allScrapedUrls = [
        ...(websiteScraped?.links?.map(l => l.url) ?? []),
        ...subPages.flatMap(p => p.links.map(l => l.url)),
      ];
      const websiteSocialLinks: SocialLinks = allScrapedUrls.length > 0
        ? extractSocialLinksFromUrls(allScrapedUrls, { includeWebsite: true })
        : {};

      const dexScreenerSocialLinks: SocialLinks = marketResult.status === 'fulfilled' && marketResult.value
        ? extractSocialLinksFromDexScreener(marketResult.value.websites, marketResult.value.socials)
        : {};

      const searchSocialLinks: SocialLinks = extractSocialLinksFromUrls([
        ...searchResults.general.map(r => r.link),
        ...searchResults.twitter.map(r => r.link),
        ...searchResults.community.map(r => r.link),
      ]);

      const verifiedSocialLinks = mergeSocialLinks(
        websiteSocialLinks,
        dexScreenerSocialLinks,
        searchSocialLinks,
      );
      // Override website with the scraped URL if we have it
      if (websiteUrl && !verifiedSocialLinks.website) {
        verifiedSocialLinks.website = websiteUrl;
      }
      log(`Phase2 social links: ${JSON.stringify(verifiedSocialLinks)}`);

      // Emit Phase 2 completion
      {
        const searchStep = steps.find((s) => s.key === 'search');
        emitProgress('phase2-done', {
          search: {
            status: searchStep?.status === 'completed' ? 'completed'
              : searchStep?.status === 'failed' ? 'failed' : 'skipped',
            summary: searchStep?.summary ?? undefined,
            durationMs: Date.now() - phase2Start,
          },
        });
      }

      // ── RunLogger: Phase 2 step ──
      if (runLogger) {
        const searchStep = steps.find((s) => s.key === 'search');
        if (searchStep) {
          runLogger.deepAnalysisPhase({ phase: 'phase2', tokenAddress: addr, stepKey: searchStep.key, stepStatus: searchStep.status, durationMs: searchStep.durationMs });
        }
      }

      // ── Phase 3: LLM generates ReportJSON ──
      emitProgress('phase3', { analysis: { status: 'running' } });

      const phase3Start = Date.now();
      let reportJson: ReportJSON;
      let riskScore: number | null = null;
      let summary = '';

      try {
        // Model priority: REPORT_MODEL_ID env > user's frontend selection > system default
        const envModelId = process.env.REPORT_MODEL_ID || null;
        const userModelId = getChatRunContext()?.userModelId || null;
        const reportModelId = envModelId || userModelId;
        const resolved = await resolveRuntimeChatModel(reportModelId);
        const source = envModelId ? 'REPORT_MODEL_ID' : userModelId ? 'user-selected' : 'default';
        log(`Phase3 model resolved: ${resolved.displayName} (${resolved.providerModelId}) via ${resolved.baseUrl} [${source}]`);
        const model = createRuntimeLanguageModel(resolved);

        const dataPayload = JSON.stringify({
          tokenAddress: addr, chainId, tokenName, tokenSymbol,
          security: securityData, contract: contractData, market: marketData,
          search: {
            general: searchResults.general.slice(0, 10),
            twitter: searchResults.twitter.slice(0, 10),
            news: searchResults.news.slice(0, 8),
            security: searchResults.security.slice(0, 8),
            community: searchResults.community.slice(0, 6),
            tokenomics: searchResults.tokenomics.slice(0, 6),
          },
          website: websiteText ? {
            url: websiteUrl,
            text: websiteText,
            headings: websiteScraped?.headings?.slice(0, 20),
            links: websiteScraped?.links?.filter(l => l.url.startsWith('http')).slice(0, 30),
            meta: websiteScraped?.meta,
            jsonLd: websiteScraped?.jsonLd?.slice(0, 3),
            sparse: websiteScraped?.sparse,
          } : null,
          subPages: subPages.length > 0 ? subPages.map(p => ({
            url: p.url,
            keyword: p.matchedKeyword,
            text: p.text.slice(0, 4000),
            headings: p.headings?.slice(0, 10),
          })) : undefined,
          socialLinks: verifiedSocialLinks,
          generatedAt: new Date().toISOString(),
        }, null, 2);
        log(`Phase3 payload: ${(dataPayload.length / 1024).toFixed(1)}KB`);

        // 60s hard timeout to prevent indefinite hangs
        const llmAbort = AbortSignal.timeout(60_000);
        const { text } = await generateText({
          model,
          system: reportJsonPrompt,
          prompt: `Analyze this BNB Chain token and output ReportJSON.\n\nData:\n${dataPayload}`,
          maxOutputTokens: 8000,
          abortSignal: llmAbort,
        });
        log(`Phase3 LLM done (${Date.now() - phase3Start}ms): ${text.length} chars`);

        let jsonStr = text.trim();
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        }
        reportJson = JSON.parse(jsonStr) as ReportJSON;

        riskScore = Math.min(100, Math.max(0, reportJson.riskScore));
        const riskLabel = riskScore <= 30 ? 'Low Risk' : riskScore <= 60 ? 'Medium Risk' : 'High Risk';
        const nameLabel = tokenName ? `${tokenName}${tokenSymbol ? ` ($${tokenSymbol})` : ''}` : addr.slice(0, 10) + '...';
        summary = `${nameLabel}: ${riskLabel} (${riskScore}/100)`;

        steps.push({ key: 'analysis', label: 'AI Analysis', status: 'completed',
          summary: `Risk: ${riskScore}/100 — ${reportJson.security.length} checks, ${reportJson.intel.length} intel items`,
          durationMs: Date.now() - phase3Start });
        emitProgress('phase3-done', {
          analysis: { status: 'completed', summary: `Risk: ${riskScore}/100`, durationMs: Date.now() - phase3Start },
        });
        // ── RunLogger: Phase 3 step ──
        if (runLogger) {
          runLogger.deepAnalysisPhase({ phase: 'phase3', tokenAddress: addr, stepKey: 'analysis', stepStatus: 'completed', durationMs: Date.now() - phase3Start });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        log(`Phase3 FAILED (${Date.now() - phase3Start}ms): ${msg}`);
        if (runLogger) {
          runLogger.deepAnalysisPhase({ phase: 'phase3', tokenAddress: addr, stepKey: 'analysis', stepStatus: 'failed', durationMs: Date.now() - phase3Start });
        }
        emitProgress('phase3-failed', { analysis: { status: 'failed', summary: msg } });
        return { error: `Failed to generate analysis: ${msg}` };
      }

      // ── Phase 4: Render HTML + Store ──
      emitProgress('phase4', { render: { status: 'running' } });

      let html: string;
      try {
        html = renderReport(reportJson);
        log(`Phase4 render: ${(html.length / 1024).toFixed(1)}KB HTML`);
        steps.push({ key: 'render', label: 'Report Render', status: 'completed',
          summary: `${Math.round(html.length / 1024)}KB HTML`, durationMs: 0 });
        emitProgress('phase4-done', {
          render: { status: 'completed', summary: `${Math.round(html.length / 1024)}KB`, durationMs: 0 },
        });
      } catch (error) {
        log(`Phase4 render FAILED: ${error instanceof Error ? error.message : error}`);
        return { error: `Failed to render report: ${error instanceof Error ? error.message : 'Unknown error'}` };
      }

      try {
        const report = await createReport({
          tokenAddress: addr, tokenName, tokenSymbol, chainId,
          html, summary, riskScore, steps,
        });
        const totalMs = Date.now() - startTime;
        log(`DONE reportId=${report.id} risk=${riskScore} total=${totalMs}ms`);

        // ── RunLogger: Final result ──
        if (runLogger) {
          runLogger.deepAnalysisResult({
            reportId: report.id,
            riskScore,
            summary,
            steps,
            payloadSizeKB: 0,
            llmOutputChars: 0,
            htmlSizeKB: Math.round(html.length / 1024),
          });
        }

        // Mark progress as finished with result
        if (chatId) {
          setAnalysisProgress(chatId, {
            tokenAddress: addr,
            tokenName,
            tokenSymbol,
            phase: 'done',
            steps: ALL_STEPS.map((s) => ({ ...s })),
            startedAt: startTime,
            finished: true,
            result: {
              reportId: report.id,
              reportUrl: `/report/${report.id}`,
              riskScore,
              summary,
              durationMs: totalMs,
            },
          });
        }

        return {
          reportId: report.id, reportUrl: `/report/${report.id}`,
          tokenName, tokenSymbol, tokenAddress: addr, chainId,
          riskScore, summary, steps, durationMs: totalMs,
        };
      } catch (error) {
        log(`Phase4 store FAILED: ${error instanceof Error ? error.message : error}`);
        return { error: `Failed to store report: ${error instanceof Error ? error.message : 'Unknown error'}` };
      }
     } catch (outerError) {
      // Top-level catch — ensures ANY unhandled error is returned as a clean error object
      // instead of propagating as a tool-output-error to the AI SDK.
      const msg = outerError instanceof Error ? outerError.message : String(outerError);
      log(`FATAL UNHANDLED: ${msg}`);
      if (outerError instanceof Error && outerError.stack) {
        console.error(`[deep-analysis] stack:`, outerError.stack);
      }
      if (chatId) {
        setAnalysisProgress(chatId, {
          tokenAddress: addr,
          tokenName: null,
          tokenSymbol: null,
          phase: 'error',
          steps: [],
          startedAt: startTime,
          finished: true,
          error: msg,
        });
      }
      return { error: `Deep analysis failed: ${msg}` };
     }
    },
  }),
};

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}
