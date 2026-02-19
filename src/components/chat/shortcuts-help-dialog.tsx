'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n/context';
import { Keyboard } from 'lucide-react';

interface ShortcutsHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUTS = [
  { keys: ['⌘', 'N'], keysNonMac: ['Ctrl', 'N'], labelKey: 'shortcuts.newChat' },
  { keys: ['⌘', 'K'], keysNonMac: ['Ctrl', 'K'], labelKey: 'shortcuts.searchChats' },
  { keys: ['⌘', '.'], keysNonMac: ['Ctrl', '.'], labelKey: 'shortcuts.toggleSidebar' },
  { keys: ['Enter'], keysNonMac: ['Enter'], labelKey: 'shortcuts.sendMessage' },
  { keys: ['Shift', 'Enter'], keysNonMac: ['Shift', 'Enter'], labelKey: 'shortcuts.newLine' },
  { keys: ['/'], keysNonMac: ['/'], labelKey: 'shortcuts.slashCommands' },
];

export function ShortcutsHelpDialog({ open, onOpenChange }: ShortcutsHelpDialogProps) {
  const { t } = useI18n();
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,28rem)]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-4 text-primary" />
            {t('shortcuts.title')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1 px-5 pb-5">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.labelKey}
              className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-accent/50"
            >
              <span className="text-muted-foreground">{t(shortcut.labelKey)}</span>
              <div className="flex items-center gap-1">
                {(isMac ? shortcut.keys : shortcut.keysNonMac).map((key) => (
                  <kbd
                    key={key}
                    className="inline-flex min-w-[24px] items-center justify-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
          <p className="pt-2 text-center text-xs text-muted-foreground/60">
            Press <kbd className="rounded border border-border bg-muted px-1 text-xs">?</kbd> to toggle this dialog
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
