'use client';

import { Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDebugMode } from '@/lib/debug/context';
import { useI18n } from '@/lib/i18n/context';

export function DebugToggle() {
  const { enabled, toggle } = useDebugMode();
  const { t } = useI18n();

  return (
    <Button
      variant={enabled ? 'outline' : 'ghost'}
      size="sm"
      className="h-8 gap-1.5 rounded-lg px-2 text-xs text-muted-foreground data-[variant=outline]:border-ring/50 data-[variant=outline]:bg-primary/10 data-[variant=outline]:text-primary"
      onClick={toggle}
      title={enabled ? t('debug.off') : t('debug.on')}
      aria-label={enabled ? t('debug.off') : t('debug.on')}
    >
      <Bug className="size-3.5" aria-hidden="true" />
      <span>{enabled ? t('debug.on') : t('debug.label')}</span>
    </Button>
  );
}
