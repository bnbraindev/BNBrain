'use client';

import { useAccount, useSwitchChain } from 'wagmi';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const CHAIN_INFO: Record<number, { name: string; color: string; symbol: string }> = {
  56:  { name: 'BSC', color: 'border-primary/30 bg-primary/10 text-primary', symbol: 'BNB' },
  97:  { name: 'BSC Testnet', color: 'border-amber-500/30 bg-amber-500/10 text-amber-400', symbol: 'tBNB' },
  204: { name: 'opBNB', color: 'border-violet-500/30 bg-violet-500/10 text-violet-400', symbol: 'BNB' },
};

export function NetworkBadge() {
  const { chain, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();

  if (!isConnected || !chain) return null;

  const info = CHAIN_INFO[chain.id];

  if (!info) {
    return (
      <Badge
        variant="outline"
        className="cursor-pointer border-red-500/30 bg-red-500/10 text-xs text-red-400"
        onClick={() => switchChain?.({ chainId: 56 })}
      >
        <span className="size-1.5 rounded-full bg-red-500 mr-1.5 animate-pulse" />
        Wrong network
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn('cursor-default gap-1.5 text-xs font-medium', info.color)}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {info.name}
    </Badge>
  );
}
