'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Square, Slash, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/context';
import { ModelSelector } from '@/components/chat/model-selector';

const SLASH_COMMANDS_EN = [
  { command: '/security', label: 'Token security scan', prompt: 'Check if this token is safe: ' },
  { command: '/balance', label: 'Check wallet balance', prompt: 'What is my wallet balance?' },
  { command: '/price', label: 'Token price query', prompt: 'What is the current price of ' },
  { command: '/swap', label: 'Swap tokens', prompt: 'I want to swap ' },
  { command: '/transfer', label: 'Transfer funds', prompt: 'Transfer ' },
  { command: '/health', label: 'Wallet health check', prompt: 'Run a wallet health check on ' },
  { command: '/approvals', label: 'Scan approvals', prompt: 'Scan my token approvals' },
  { command: '/analyze', label: 'Analyze address', prompt: 'Analyze this address: ' },
  { command: '/revoke', label: 'Revoke approval', prompt: 'Revoke approval for token ' },
  { command: '/prove', label: 'Store proof on-chain', prompt: 'Store the last report on-chain' },
  { command: '/persona', label: 'Wallet personality profile', prompt: 'Analyze the personality of wallet: ' },
  { command: '/radar', label: 'New token radar', prompt: 'Show me the latest new tokens on BSC' },
  { command: '/simulate', label: 'Simulate transaction', prompt: 'Simulate a transaction to ' },
];

const SLASH_COMMANDS_ZH = [
  { command: '/security', label: '代币安全扫描', prompt: '帮我检测这个代币是否安全：' },
  { command: '/balance', label: '查询钱包余额', prompt: '查询我的钱包余额' },
  { command: '/price', label: '代币价格查询', prompt: '查询这个代币当前价格：' },
  { command: '/swap', label: '代币兑换', prompt: '我想兑换 ' },
  { command: '/transfer', label: '转账', prompt: '帮我转账 ' },
  { command: '/health', label: '钱包体检', prompt: '帮我做钱包体检：' },
  { command: '/approvals', label: '扫描授权', prompt: '扫描我的代币授权' },
  { command: '/analyze', label: '地址分析', prompt: '分析这个地址：' },
  { command: '/revoke', label: '撤销授权', prompt: '撤销这个代币授权：' },
  { command: '/prove', label: '链上存证', prompt: '把上一份报告存证到链上' },
  { command: '/persona', label: '钱包人格画像', prompt: '分析这个钱包的人格画像：' },
  { command: '/radar', label: '新币雷达', prompt: '显示 BSC 最新新币' },
  { command: '/simulate', label: '交易模拟', prompt: '帮我模拟这笔交易：' },
];

interface ChatInputProps {
  onSend: (text: string) => boolean | void;
  onStop?: () => void;
  isStreaming: boolean;
  isProcessing?: boolean;
  isDraftConversation?: boolean;
  prefillRequest?: {
    id: number;
    text: string;
  } | null;
  onPrefillApplied?: (id: number) => void;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  isProcessing = false,
  isDraftConversation = false,
  prefillRequest = null,
  onPrefillApplied,
}: ChatInputProps) {
  const { t, locale } = useI18n();
  const SLASH_COMMANDS = locale === 'zh' ? SLASH_COMMANDS_ZH : SLASH_COMMANDS_EN;
  const commandListId = 'chat-slash-command-list';
  const placeholderText = isDraftConversation
    ? t('chat.placeholderDraft')
    : t('chat.placeholder');
  const [value, setValue] = useState('');
  const [showSlash, setShowSlash] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);

  const filteredCommands = SLASH_COMMANDS.filter((c) =>
    c.command.includes(slashFilter.toLowerCase()) ||
    c.label.toLowerCase().includes(slashFilter.toLowerCase())
  );

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  useEffect(() => {
    if (!prefillRequest) return;
    const el = textareaRef.current;
    if (el) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(el, prefillRequest.text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
    }
    onPrefillApplied?.(prefillRequest.id);
  }, [prefillRequest, onPrefillApplied]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);

    // Detect slash command
    if (v.startsWith('/')) {
      setShowSlash(true);
      setSlashFilter(v.slice(1));
      setSelectedIdx(0);
    } else {
      setShowSlash(false);
    }
  };

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming || isProcessing || isComposingRef.current) return;
    const result = onSend(trimmed);
    // Only clear input if onSend succeeded (didn't return false)
    if (result === false) return;
    setValue('');
    setShowSlash(false);
    // Reset textarea height and refocus for next message
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  }, [value, isStreaming, isProcessing, onSend]);

  const handlePrimaryAction = useCallback(() => {
    if (isProcessing) return;
    if (isStreaming) {
      onStop?.();
      return;
    }
    handleSend();
  }, [isProcessing, isStreaming, onStop, handleSend]);

  const selectCommand = useCallback((cmd: typeof SLASH_COMMANDS[0]) => {
    setValue(cmd.prompt);
    setShowSlash(false);
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const nativeEvent = e.nativeEvent as KeyboardEvent & { keyCode?: number };
    const isComposing =
      nativeEvent.isComposing ||
      isComposingRef.current ||
      nativeEvent.keyCode === 229; // 229 is common during IME composition.

    if (isComposing) {
      return;
    }

    // Slash command navigation
    if (showSlash && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filteredCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectCommand(filteredCommands[selectedIdx]);
        return;
      }
      if (e.key === 'Escape') {
        setShowSlash(false);
        return;
      }
    }

    // Enter to send (Shift+Enter for newline)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (e.repeat) return;
      handleSend();
    }
  };

  const handlePlusClick = useCallback(() => {
    setValue('/');
    setShowSlash(true);
    setSlashFilter('');
    setSelectedIdx(0);
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="shrink-0 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 sm:px-4 sm:pb-4">
      <div className="relative mx-auto w-full max-w-4xl rounded-2xl border border-border bg-card/92 p-2 shadow-[0_18px_34px_-24px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-2.5">
        {/* Slash command dropdown */}
        {showSlash && filteredCommands.length > 0 && (
          <div
            id={commandListId}
            role="listbox"
            aria-label="Slash command suggestions"
            className="absolute bottom-full left-0 right-0 z-50 mb-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
          >
            <div className="px-3 p-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Commands
            </div>
            {filteredCommands.map((cmd, i) => (
              <button
                key={cmd.command}
                type="button"
                role="option"
                aria-selected={i === selectedIdx}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm transition-colors duration-200 motion-reduce:transition-none focus-visible:bg-primary/10 focus-visible:text-foreground focus-visible:outline-none',
                  i === selectedIdx ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent'
                )}
                onClick={() => selectCommand(cmd)}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <Slash className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="font-mono text-xs text-primary">{cmd.command}</span>
                <span className="text-xs text-muted-foreground">{cmd.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Textarea row */}
        <textarea
          ref={textareaRef}
          value={value}
          name="chatMessage"
          autoComplete="off"
          aria-label={placeholderText}
          aria-controls={showSlash ? commandListId : undefined}

          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          placeholder={`${placeholderText} ( / )`}
          className="textarea-smooth h-11 min-h-[44px] max-h-[160px] w-full resize-none border-0 bg-transparent px-2 py-2.5 text-base text-foreground transition-colors duration-200 motion-reduce:transition-none placeholder:text-muted-foreground/60 focus-visible:outline-none disabled:opacity-50 md:text-sm"
          disabled={isProcessing}
          rows={1}
        />

        {/* Toolbar row */}
        <div className="flex items-center justify-between pt-1">
          {/* Left: + button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 cursor-pointer rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={handlePlusClick}
            aria-label={locale === 'zh' ? '快捷命令' : 'Quick commands'}
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button>

          {/* Right: model selector + send button */}
          <div className="flex items-center gap-1.5">
            <ModelSelector />
            <Button
              type="button"
              size="icon"
              disabled={isProcessing || (isStreaming ? !onStop : !value.trim())}
              className="size-8 shrink-0 cursor-pointer rounded-md border-0 bg-primary shadow-[0_12px_24px_-16px_rgba(0,0,0,0.9)] transition-all duration-200 motion-reduce:transition-none hover:brightness-105 active:scale-95 disabled:cursor-not-allowed"
              onClick={handlePrimaryAction}
              aria-label={
                isProcessing
                  ? locale === 'zh'
                    ? '处理中'
                    : 'Processing'
                  : isStreaming
                  ? locale === 'zh'
                    ? '停止生成'
                    : 'Stop response'
                  : locale === 'zh'
                    ? '发送消息'
                    : 'Send message'
              }
            >
              {isProcessing ? (
                <Loader2 className="size-4 animate-spin text-white" aria-hidden="true" />
              ) : isStreaming ? (
                <Square className="size-3.5 fill-white text-white" aria-hidden="true" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#fff" viewBox="0 0 256 256" aria-hidden="true">
                  <path d="M208.49,120.49a12,12,0,0,1-17,0L140,69V216a12,12,0,0,1-24,0V69L64.49,120.49a12,12,0,0,1-17-17l72-72a12,12,0,0,1,17,0l72,72A12,12,0,0,1,208.49,120.49Z" />
                </svg>
              )}
            </Button>
          </div>
        </div>
      </div>

    </div>
  );
}
