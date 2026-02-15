'use client';

import { ArrowDown, AlertCircle, Loader2, CheckCircle, ExternalLink, XCircle, Wallet } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useTransactionExecutor } from '@/lib/hooks/use-tx';
import { useAccount } from 'wagmi';
import { EXPLORER_URLS } from '@/lib/utils/constants';
import { encodeFunctionData, parseUnits } from 'viem';

const BNB_YELLOW = '#F0B90B';
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

const SWAP_ABI = [
  {
    name: 'swapExactETHForTokens',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactTokensForTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactTokensForETH',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const;

function shortenAddress(addr: string) {
  if (!addr) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

export interface SwapPreviewProps {
  data: {
    type: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    minAmountOut: string;
    slippage: number;
    decimalsIn?: number;
    decimalsOut?: number;
    router: string;
    path: string[];
    chainId: number;
    description: string;
    error?: string;
  };
  txStateKey?: string;
  conversationId?: string;
  readOnly?: boolean;
}

export function SwapPreview({
  data,
  txStateKey,
  conversationId,
  readOnly,
}: SwapPreviewProps) {
  const { isConnected, address: userAddress } = useAccount();
  const tx = useTransactionExecutor({
    cacheKey: txStateKey,
    sync:
      conversationId && txStateKey
        ? {
            conversationId,
            txKey: txStateKey,
            chainId: data.chainId,
          }
        : undefined,
  });
  const explorerBase = EXPLORER_URLS[data.chainId] ?? EXPLORER_URLS[56];

  if (data.error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Swap Error</p>
              <p className="text-sm text-muted-foreground mt-1">{data.error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleConfirm = async () => {
    if (!userAddress) return;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min
    const path = data.path.map((p) => p as `0x${string}`);
    const isBnbIn = data.tokenIn.toLowerCase() === WBNB.toLowerCase();
    const isBnbOut = data.tokenOut.toLowerCase() === WBNB.toLowerCase();

    const decimalsIn = data.decimalsIn ?? 18;
    const decimalsOut = data.decimalsOut ?? 18;
    const amountInWei = parseUnits(data.amountIn, decimalsIn);
    const minOutWei = parseUnits(data.minAmountOut, decimalsOut);

    if (isBnbIn) {
      // swapExactETHForTokens — send BNB as value
      const calldata = encodeFunctionData({
        abi: SWAP_ABI,
        functionName: 'swapExactETHForTokens',
        args: [minOutWei, path, userAddress, deadline],
      });
      await tx.sendContractCall({
        to: data.router,
        data: calldata,
        value: amountInWei.toString(),
        chainId: data.chainId,
      });
    } else if (isBnbOut) {
      // swapExactTokensForETH
      const calldata = encodeFunctionData({
        abi: SWAP_ABI,
        functionName: 'swapExactTokensForETH',
        args: [amountInWei, minOutWei, path, userAddress, deadline],
      });
      await tx.sendContractCall({
        to: data.router,
        data: calldata,
        chainId: data.chainId,
      });
    } else {
      // swapExactTokensForTokens
      const calldata = encodeFunctionData({
        abi: SWAP_ABI,
        functionName: 'swapExactTokensForTokens',
        args: [amountInWei, minOutWei, path, userAddress, deadline],
      });
      await tx.sendContractCall({
        to: data.router,
        data: calldata,
        chainId: data.chainId,
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <span style={{ color: BNB_YELLOW }}>Swap Preview</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="w-full rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">You pay</p>
            <p className="text-lg font-semibold">{data.amountIn}</p>
            <p className="text-sm text-muted-foreground font-mono">{shortenAddress(data.tokenIn)}</p>
          </div>
          <div className="flex items-center justify-center -my-1">
            <div className="rounded-full p-1.5 border bg-background" style={{ color: BNB_YELLOW }}>
              <ArrowDown className="size-4" />
            </div>
          </div>
          <div className="w-full rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">You receive (est.)</p>
            <p className="text-lg font-semibold">{data.amountOut}</p>
            <p className="text-sm text-muted-foreground font-mono">{shortenAddress(data.tokenOut)}</p>
          </div>
        </div>

        <Separator />

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Minimum received</span>
            <span className="font-medium">{data.minAmountOut}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Slippage tolerance</span>
            <span className="font-medium">{data.slippage}%</span>
          </div>
          {data.path?.length > 0 && (
            <div className="flex justify-between items-start gap-2">
              <span className="text-muted-foreground shrink-0">Route</span>
              <span className="font-mono text-xs truncate text-right">
                {data.path.map(shortenAddress).join(' → ')}
              </span>
            </div>
          )}
        </div>

        {/* Transaction status */}
        {tx.status === 'success' && tx.hash && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3">
            <CheckCircle className="size-5 text-emerald-500 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-emerald-400">Swap Confirmed!</p>
              <a
                href={`${explorerBase}/tx/${tx.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-emerald-400/80 hover:underline flex items-center gap-1 mt-0.5"
              >
                {shortenAddress(tx.hash)} <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
        )}

        {tx.status === 'error' && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
            <XCircle className="size-5 text-destructive shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-destructive">Swap Failed</p>
              <p className="text-xs text-muted-foreground mt-0.5">{tx.error}</p>
              {tx.errorDetails ? (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-xs text-muted-foreground/80">
                    Technical details
                  </summary>
                  <p className="mt-1 text-xs text-muted-foreground break-all whitespace-pre-wrap">
                    {tx.errorDetails}
                  </p>
                </details>
              ) : null}
            </div>
          </div>
        )}

        {tx.status === 'cancelled' && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
            <AlertCircle className="size-5 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-300">Swap Canceled</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You closed or rejected the wallet request. No funds were spent.
              </p>
            </div>
          </div>
        )}

        {tx.status === 'pending' && (
          <div className="flex items-center gap-3 rounded-lg border border-[#F0B90B]/50 bg-[#F0B90B]/10 px-4 py-3">
            <Loader2 className="size-5 animate-spin text-[#F0B90B] shrink-0" />
            <div>
              <p className="text-sm font-medium">Confirming swap…</p>
              {tx.hash && (
                <a href={`${explorerBase}/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-mono text-muted-foreground hover:underline flex items-center gap-1 mt-0.5">
                  {shortenAddress(tx.hash)} <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Action button — hidden in share/readOnly mode */}
        {!readOnly && tx.status === 'idle' && (
          <>
            {!isConnected ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                Connect your wallet first to execute swap
              </p>
            ) : (
              <Button
                className="w-full font-medium"
                style={{ backgroundColor: BNB_YELLOW, color: '#000' }}
                onClick={handleConfirm}
              >
                <Wallet className="size-4 mr-2" />
                Confirm Swap
              </Button>
            )}
          </>
        )}

        {!readOnly && tx.status === 'confirming' && (
          <Button className="w-full font-medium" disabled>
            <Loader2 className="size-4 mr-2 animate-spin" />
            Confirm in Wallet…
          </Button>
        )}

        {!readOnly && (tx.status === 'error' || tx.status === 'success' || tx.status === 'cancelled') && (
          <Button variant="outline" className="w-full" onClick={tx.reset}>
            {tx.status === 'success' ? 'Done' : 'Try Again'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
