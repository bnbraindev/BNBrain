'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { Share2, Check, Download, Twitter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ShareButtonProps {
  /** The parent card element ref to capture */
  cardRef: React.RefObject<HTMLDivElement | null>;
  /** Short text summary for sharing */
  shareText: string;
  locale?: string;
}

export function ShareButton({ cardRef, shareText, locale = 'en' }: ShareButtonProps) {
  const zh = locale === 'zh';
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

  const handleCopyText = useCallback(async () => {
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [shareText]);

  const handleShareTwitter = useCallback(() => {
    const text = encodeURIComponent(
      `${shareText}\n\nScanned with BNBrain - AI Security Agent for @BNBCHAIN\n#VibingOnBNB #OpenClaw`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, '_blank');
  }, [shareText]);

  const handleDownloadImage = useCallback(async () => {
    const el = cardRef.current;
    if (!el) return;

    // Use html2canvas dynamically
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, {
        backgroundColor: '#1a1a1a',
        scale: 2,
      });
      const link = document.createElement('a');
      link.download = 'bnbrain-report.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // Fallback: just copy text
      handleCopyText();
    }
  }, [cardRef, handleCopyText]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={copied ? (zh ? '已复制分享文本' : 'Share text copied') : (zh ? '打开分享选项' : 'Open share options')}
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-500" aria-hidden="true" />
          ) : (
            <Share2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleCopyText} className="gap-2 text-xs">
          <Share2 className="size-3.5" aria-hidden="true" />
          {zh ? '复制文本' : 'Copy as text'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleShareTwitter} className="gap-2 text-xs">
          <Twitter className="size-3.5" aria-hidden="true" />
          {zh ? '分享到 X' : 'Share on X'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownloadImage} className="gap-2 text-xs">
          <Download className="size-3.5" aria-hidden="true" />
          {zh ? '保存为图片' : 'Save as image'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
