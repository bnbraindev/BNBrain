'use client';

import { useI18n } from '@/lib/i18n/context';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
      title={locale === 'en' ? '切换中文' : 'Switch to English'}
      aria-label={locale === 'en' ? 'Switch language to Chinese' : 'Switch language to English'}
    >
      <Globe className="size-3.5" aria-hidden="true" />
      <span>{locale === 'en' ? '中文' : 'EN'}</span>
    </Button>
  );
}
