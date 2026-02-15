'use client';

import { Fuel } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface GasPriceCardData {
  safeGasPrice: string;
  proposeGasPrice: string;
  fastGasPrice: string;
  suggestBaseFee?: string | null;
  lastBlock?: string;
  summary?: string;
}

export function GasPriceCard({ data }: { data: GasPriceCardData }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Fuel className="size-4 text-primary" />
          BSC Gas Price
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-3">
            <p className="text-xs text-muted-foreground mb-1">Safe</p>
            <p className="text-lg font-bold text-emerald-400">{data.safeGasPrice}</p>
          </div>
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 px-2.5 py-3">
            <p className="text-xs text-muted-foreground mb-1">Standard</p>
            <p className="text-lg font-bold text-blue-400">{data.proposeGasPrice}</p>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-2.5 py-3">
            <p className="text-xs text-muted-foreground mb-1">Fast</p>
            <p className="text-lg font-bold text-amber-400">{data.fastGasPrice}</p>
          </div>
        </div>
        {data.suggestBaseFee && (
          <p className="text-xs text-muted-foreground mt-2 text-center">Base fee: {data.suggestBaseFee}</p>
        )}
        {data.lastBlock && (
          <p className="text-xs text-muted-foreground mt-1 text-center">Block #{data.lastBlock}</p>
        )}
      </CardContent>
    </Card>
  );
}
