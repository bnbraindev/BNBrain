'use client';

import { useState, useCallback } from 'react';
import { Copy, Check, FileCode2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CodeViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  fileName: string;
  language?: string;
  locale?: string;
}

export function CodeViewerModal({
  open,
  onOpenChange,
  code,
  fileName,
  locale = 'en',
}: CodeViewerModalProps) {
  const [copied, setCopied] = useState(false);
  const lineCount = code.split('\n').length;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,64rem)] max-h-[88vh]" showCloseButton>
        <DialogHeader className="pb-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <FileCode2 className="size-4 text-primary" />
            <span className="font-mono truncate">{fileName}</span>
            <span className="text-xs font-normal text-muted-foreground">
              ({lineCount} {locale === 'zh' ? '行' : 'lines'})
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="ml-auto flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="size-3" />
                  {locale === 'zh' ? '已复制' : 'Copied'}
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  {locale === 'zh' ? '复制' : 'Copy'}
                </>
              )}
            </button>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto px-5 pb-5">
          <pre className="rounded-lg bg-muted/70 p-4 text-xs leading-relaxed text-muted-foreground/80 overflow-x-auto">
            <code>{code}</code>
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
