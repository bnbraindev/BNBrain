'use client';

import { Wallet } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

const BNB_YELLOW = '#F0B90B';

export interface BalanceCardProps {
  data: {
    balances: Array<{
      symbol: string;
      address: string;
      balance: string;
      decimals: number;
    }>;
  };
  locale?: string;
}

function TokenDot({ isBnb }: { isBnb: boolean }) {
  return (
    <span
      className={cn(
        'size-2.5 shrink-0 rounded-full',
        isBnb
          ? 'ring-2 ring-offset-2 ring-offset-background'
          : 'bg-muted-foreground/60'
      )}
      style={isBnb ? { backgroundColor: BNB_YELLOW } : undefined}
    />
  );
}

export function BalanceCard({ data, locale = 'en' }: BalanceCardProps) {
  const zh = locale === 'zh';
  const { balances } = data;
  const isEmpty = !balances || balances.length === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-5" style={{ color: BNB_YELLOW }} />
          {zh ? '持仓' : 'Portfolio'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {zh ? '未发现代币' : 'No tokens found'}
          </p>
        ) : (
          <div className="space-y-1">
            {balances.map((token, i) => {
              const isBnb = token.address === 'native' || token.symbol.toUpperCase() === 'BNB';
              return (
                <div
                  key={token.address + i}
                  className={cn(
                    'flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors',
                    isBnb && 'bg-amber-500/10'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <TokenDot isBnb={isBnb} />
                    <span
                      className={cn(
                        'font-semibold truncate',
                        isBnb && 'text-amber-400'
                      )}
                    >
                      {token.symbol}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'text-sm font-medium tabular-nums shrink-0',
                      isBnb && 'text-amber-400'
                    )}
                  >
                    {token.balance}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
