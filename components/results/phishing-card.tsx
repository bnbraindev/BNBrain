'use client';

import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface PhishingCardData {
  url: string;
  isPhishing: boolean;
  verdict: string;
}

export function PhishingCard({ data, locale = 'en' }: { data: PhishingCardData; locale?: string }) {
  const zh = locale === 'zh';
  const danger = data.isPhishing;
  return (
    <Card className={danger ? 'border-red-500/30 bg-red-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {danger ? <ShieldAlert className="size-4 text-red-500" /> : <ShieldCheck className="size-4 text-emerald-500" />}
          {zh ? '钓鱼检测' : 'Phishing Check'}
          <Badge variant="outline" className={`ml-auto text-xs ${danger ? 'border-red-500/30 text-red-500' : 'border-emerald-500/30 text-emerald-500'}`}>
            {danger ? (zh ? '危险' : 'DANGER') : (zh ? '安全' : 'SAFE')}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs font-mono text-muted-foreground break-all">{data.url}</p>
        <p className="text-sm">{data.verdict}</p>
      </CardContent>
    </Card>
  );
}
