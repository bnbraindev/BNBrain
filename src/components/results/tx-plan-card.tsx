'use client';

import {
  AlertCircle,
  CheckCircle,
  Code2,
  Copy,
  ExternalLink,
  FileCode2,
  Loader2,
  Rocket,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTransactionExecutor } from '@/lib/hooks/use-tx';
import { EXPLORER_URLS } from '@/lib/utils/constants';
import { CodeViewerModal } from '@/components/ui/code-viewer-modal';
import { useTxCompletionStore } from '@/lib/stores/tx-completion-store';

type TxPlanMode = 'native_transfer' | 'contract_call' | 'contract_deploy';
type TxCardTheme = 'amber' | 'blue' | 'emerald' | 'purple' | 'rose' | 'slate';

const THEME_CLASS: Record<TxCardTheme, string> = {
  amber: 'border-amber-400/35 bg-amber-500/10',
  blue: 'border-ring/35 bg-primary/10',
  emerald: 'border-emerald-400/35 bg-emerald-500/10',
  purple: 'border-violet-400/35 bg-violet-500/10',
  rose: 'border-rose-400/35 bg-rose-500/10',
  slate: 'border-border bg-muted',
};

interface TxPlanCardConfig {
  title?: string;
  subtitle?: string;
  theme?: TxCardTheme;
  confirmText?: string;
  bullets?: string[];
}

interface TxPlanData {
  type: 'tx_plan';
  mode: TxPlanMode;
  to?: string | null;
  data?: string;
  value?: string;
  chainId?: number;
  description?: string;
  card?: TxPlanCardConfig;
  metadata?: Record<string, unknown>;
  error?: string;
}

function shortenHex(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function formatWeiValue(value?: string): string {
  if (!value) return '0';
  try {
    const asBigInt = BigInt(value);
    return `${formatEther(asBigInt)} BNB`;
  } catch {
    return `${value} wei`;
  }
}

function modeLabel(mode: TxPlanMode, locale = 'en'): string {
  const zh = locale === 'zh';
  if (mode === 'contract_deploy') return zh ? '合约部署' : 'Contract Deploy';
  if (mode === 'contract_call') return zh ? '合约调用' : 'Contract Call';
  return zh ? '原生转账' : 'Native Transfer';
}

/** Button + modal Solidity source code preview */
function SourceCodePreview({ code, contractName, locale = 'en' }: { code: string; contractName?: string; locale?: string }) {
  const [open, setOpen] = useState(false);
  const lineCount = code.split('\n').length;
  const label = contractName ? `${contractName}.sol` : 'Contract.sol';

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors"
      >
        <Code2 className="size-3 shrink-0 text-primary" />
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground/60">({lineCount} {locale === 'zh' ? '行' : 'lines'})</span>
        <span className="ml-auto text-primary text-[10px] font-medium shrink-0">
          {locale === 'zh' ? '查看源码' : 'View Source'}
        </span>
      </button>
      <CodeViewerModal
        open={open}
        onOpenChange={setOpen}
        code={code}
        fileName={label}
        locale={locale}
      />
    </div>
  );
}

export function TxPlanCard({
  data,
  txStateKey,
  conversationId,
  readOnly,
  locale = 'en',
}: {
  data: TxPlanData;
  txStateKey?: string;
  conversationId?: string;
  readOnly?: boolean;
  locale?: string;
}) {
  const zh = locale === 'zh';
  const { isConnected } = useAccount();
  const derivedTxStateKey = useMemo(
    () =>
      [
        'tx-plan',
        data.mode,
        String(data.chainId ?? 56),
        data.to ?? 'contract-creation',
        data.value ?? '0',
        data.data ? data.data.slice(0, 66) : '0x',
        data.description ?? '',
      ].join('|'),
    [data.mode, data.chainId, data.to, data.value, data.data, data.description]
  );
  const effectiveKey = txStateKey ?? derivedTxStateKey;
  const tx = useTransactionExecutor({
    cacheKey: effectiveKey,
    sync:
      conversationId && effectiveKey
        ? {
            conversationId,
            txKey: effectiveKey,
            chainId: data.chainId ?? 56,
          }
        : undefined,
  });
  const chainId = data.chainId ?? 56;
  const explorerBase = EXPLORER_URLS[chainId] ?? EXPLORER_URLS[56];

  // Extract source code from metadata for deploy mode
  const sourceCode = data.metadata?.sourceCode as string | undefined;
  const contractName = data.metadata?.contractName as string | undefined;
  const isDeployMode = data.mode === 'contract_deploy';

  // Extract contract address from receipt for deploy transactions
  const contractAddress = isDeployMode && tx.receipt?.contractAddress
    ? tx.receipt.contractAddress
    : undefined;

  // Push tx completion event when status transitions to 'success'
  const prevStatusRef = useRef(tx.status);
  useEffect(() => {
    const wasTerminal = ['success', 'error', 'cancelled'].includes(prevStatusRef.current);
    prevStatusRef.current = tx.status;
    if (wasTerminal) return;
    if (tx.status !== 'success' || !tx.hash) return;
    if (!conversationId) return;

    useTxCompletionStore.getState().push({
      conversationId,
      toolName: data.mode === 'contract_deploy' ? 'compileContractDeploy' : 'buildContractCall',
      mode: data.mode,
      hash: tx.hash,
      contractAddress: isDeployMode ? tx.receipt?.contractAddress ?? undefined : undefined,
      chainId,
      // Include source code and contract name so AI can verify without recompiling
      extraContext: isDeployMode && data.metadata?.sourceCode
        ? JSON.stringify({
            sourceCode: data.metadata.sourceCode,
            contractName: data.metadata.contractName ?? 'Token',
          })
        : undefined,
    });
  }, [tx.status, tx.hash, tx.receipt?.contractAddress, conversationId, data.mode, chainId, isDeployMode, data.metadata]);

  if (data.error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="pt-6">
          <p className="text-sm font-medium text-destructive">{zh ? '交易计划错误' : 'Transaction Plan Error'}</p>
          <p className="mt-1 text-sm text-muted-foreground">{data.error}</p>
        </CardContent>
      </Card>
    );
  }

  const theme = data.card?.theme ?? 'blue';
  const title = data.card?.title ?? (zh ? '交易计划' : 'Transaction Plan');
  const subtitle =
    data.card?.subtitle ??
    data.description ??
    (zh ? '请仔细审核后在钱包中签名。' : 'Review details carefully before signing in your wallet.');
  const confirmText = data.card?.confirmText ?? (zh ? '签名并发送' : 'Sign & Send');
  const bullets = data.card?.bullets ?? [];

  const handleConfirm = async () => {
    await tx.sendTransaction({
      to: data.to ?? undefined,
      data: data.data,
      value: data.value ?? '0',
      chainId,
    });
  };

  return (
    <Card className={THEME_CLASS[theme]}>
      <CardHeader className="pb-3">
        <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
          {isDeployMode ? (
            <Rocket className="size-4 shrink-0 text-primary" />
          ) : (
            <FileCode2 className="size-4 shrink-0 text-primary" />
          )}
          <span className="min-w-0 truncate">{title}</span>
          <Badge variant="outline" className="ml-auto shrink-0 text-xs">
            {modeLabel(data.mode, locale)}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{subtitle}</p>

        {/* Source code preview for contract deployments */}
        {isDeployMode && sourceCode && (
          <SourceCodePreview code={sourceCode} contractName={contractName} locale={locale} />
        )}

        <div className="space-y-2 rounded-lg border bg-background/50 px-3 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{zh ? '链' : 'Chain'}</span>
            <span className="font-medium">{chainId}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{zh ? '接收方' : 'To'}</span>
            <span className="font-mono">
              {data.to ? shortenHex(data.to) : (zh ? '创建合约' : 'Contract Creation')}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{zh ? '金额' : 'Value'}</span>
            <span className="font-medium">{formatWeiValue(data.value)}</span>
          </div>
          {data.data ? (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{zh ? '调用数据' : 'Calldata'}</span>
              <span className="font-mono">{shortenHex(data.data)}</span>
            </div>
          ) : null}
        </div>

        {bullets.length > 0 ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {bullets.map((item, index) => (
              <li key={`${item}-${index}`}>- {item}</li>
            ))}
          </ul>
        ) : null}

        {/* Success: show tx hash + contract address for deploys */}
        {tx.status === 'success' && tx.hash ? (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs">
            <p className="font-medium text-emerald-400">{zh ? '交易已确认' : 'Transaction confirmed'}</p>
            <a
              href={`${explorerBase}/tx/${tx.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-emerald-400/80 hover:underline"
            >
              Tx: {shortenHex(tx.hash)}
              <ExternalLink className="size-3" />
            </a>
            {contractAddress && (
              <div className="mt-1 flex items-center gap-1">
                <a
                  href={`${explorerBase}/address/${contractAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-400/80 hover:underline"
                >
                  {shortenHex(contractAddress)}
                  <ExternalLink className="size-3" />
                </a>
                <button
                  type="button"
                  className="shrink-0 cursor-pointer rounded p-0.5 text-emerald-500 hover:bg-emerald-500/10"
                  onClick={() => navigator.clipboard.writeText(contractAddress)}
                  title={zh ? '复制合约地址' : 'Copy contract address'}
                >
                  <Copy className="size-3" />
                </button>
              </div>
            )}
          </div>
        ) : null}

        {tx.status === 'pending' ? (
          <div className="rounded-lg border border-[#F0B90B]/40 bg-[#F0B90B]/10 px-3 py-2 text-xs">
            <div className="flex items-center gap-2 text-[#F0B90B]">
              <Loader2 className="size-3 animate-spin icon-spin" />
              {zh ? '等待链上确认…' : 'Waiting for on-chain confirmation…'}
            </div>
          </div>
        ) : null}

        {tx.status === 'cancelled' ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-3" />
              {zh ? '钱包请求已取消，未发送交易。' : 'Wallet request canceled. No transaction was sent.'}
            </div>
          </div>
        ) : null}

        {tx.status === 'error' && tx.error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <div className="flex items-center gap-2">
              <XCircle className="size-3" />
              {tx.error}
            </div>
            {tx.errorDetails ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {zh ? '技术详情' : 'Technical details'}
                </summary>
                <p className="mt-1 break-all whitespace-pre-wrap text-xs text-muted-foreground">
                  {tx.errorDetails}
                </p>
              </details>
            ) : null}
          </div>
        ) : null}

        {!readOnly && tx.status === 'idle' ? (
          !isConnected ? (
            <p className="text-center text-sm text-muted-foreground">
              {zh ? '请先连接钱包以执行交易。' : 'Connect wallet first to execute this transaction.'}
            </p>
          ) : (
            <Button className="w-full" onClick={handleConfirm}>
              <Wallet className="mr-2 size-4" />
              {confirmText}
            </Button>
          )
        ) : null}

        {!readOnly && tx.status === 'confirming' ? (
          <Button className="w-full" disabled>
            <Loader2 className="mr-2 size-4 animate-spin icon-spin" />
            {zh ? '请在钱包中确认…' : 'Confirm in wallet…'}
          </Button>
        ) : null}

        {!readOnly && (tx.status === 'success' || tx.status === 'cancelled' || tx.status === 'error') ? (
          <Button variant="outline" className="w-full" onClick={tx.reset}>
            {tx.status === 'success' ? (
              <>
                <CheckCircle className="mr-2 size-4" />
                {zh ? '新交易' : 'New Transaction'}
              </>
            ) : (
              zh ? '重试' : 'Try Again'
            )}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
