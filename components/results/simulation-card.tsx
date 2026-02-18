'use client';

import { Beaker, CheckCircle, XCircle, Fuel, FileCode2, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SimulationData {
  simulation: {
    wouldSucceed: boolean;
    revertReason: string | null;
    gasEstimate: string | null;
    gasEstimateFormatted: string | null;
    returnData: string | null;
  };
  target: {
    address: string;
    isContract: boolean;
  };
  transaction: {
    methodId: string | null;
    value: string;
    valueFormatted: string;
  };
  chainId: number;
}

function shortenAddr(addr: string) {
  return addr.slice(0, 8) + '…' + addr.slice(-4);
}

export function SimulationCard({ data, locale = 'en' }: { data: SimulationData; locale?: string }) {
  const zh = locale === 'zh';
  const { simulation, target, transaction } = data;
  const success = simulation.wouldSucceed;

  return (
    <Card className={success ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Beaker className={`size-4 ${success ? 'text-emerald-500' : 'text-red-500'}`} />
          {zh ? '交易模拟' : 'Transaction Simulation'}
          <Badge
            variant="outline"
            className={`ml-auto text-xs ${
              success
                ? 'text-emerald-400 border-emerald-500/30'
                : 'text-red-400 border-red-500/30'
            }`}
          >
            {success ? (zh ? '会成功' : 'Would Succeed') : (zh ? '会回滚' : 'Would Revert')}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Result */}
        <div className="flex items-start gap-2">
          {success ? (
            <CheckCircle className="size-4 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
          )}
          <div className="text-sm">
            {success ? (
              <p>{zh ? '该交易将在链上成功执行。' : <>This transaction would <strong className="text-emerald-400">succeed</strong> on-chain.</>}</p>
            ) : (
              <div>
                <p>{zh ? '该交易将会回滚。' : <>This transaction would <strong className="text-red-400">revert</strong>.</>}</p>
                {simulation.revertReason && (
                  <p className="text-xs text-muted-foreground mt-1 font-mono bg-muted/50 rounded px-2 py-1">
                    {simulation.revertReason}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Target */}
          <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-2">
            <FileCode2 className="size-3.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">{zh ? '目标' : 'Target'}</p>
              <p className="font-mono truncate">{shortenAddr(target.address)}</p>
              <p className="text-xs text-muted-foreground">
                {target.isContract ? (zh ? '合约' : 'Contract') : 'EOA'}
              </p>
            </div>
          </div>

          {/* Gas */}
          <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-2">
            <Fuel className="size-3.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">{zh ? 'Gas 估算' : 'Gas estimate'}</p>
              {simulation.gasEstimate ? (
                <>
                  <p className="font-mono">{Number(simulation.gasEstimate).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{simulation.gasEstimateFormatted}</p>
                </>
              ) : (
                <p className="text-muted-foreground">N/A</p>
              )}
            </div>
          </div>

          {/* Value */}
          {transaction.value !== '0' && (
            <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 col-span-2">
              <Wallet className="size-3.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-muted-foreground text-xs">{zh ? '金额' : 'Value'}</p>
                <p className="font-mono">{transaction.valueFormatted}</p>
              </div>
            </div>
          )}
        </div>

        {/* Method ID */}
        {transaction.methodId && (
          <div className="text-xs">
            <span className="text-muted-foreground">{zh ? '方法: ' : 'Method: '}</span>
            <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">
              {transaction.methodId}
            </code>
          </div>
        )}

        {/* Return data */}
        {simulation.returnData && simulation.returnData !== '0x' && success && (
          <div className="text-xs">
            <p className="text-muted-foreground mb-1">{zh ? '返回数据:' : 'Return data:'}</p>
            <pre className="font-mono text-xs bg-muted/50 rounded px-2 py-1.5 overflow-x-auto">
              {simulation.returnData.length > 66
                ? simulation.returnData.slice(0, 66) + '…'
                : simulation.returnData}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
