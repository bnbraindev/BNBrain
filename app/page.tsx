'use client';

import { ChatPanel } from '@/components/chat/chat-panel';
import { Sidebar } from '@/components/sidebar/sidebar';
import { WalletButton } from '@/components/wallet/connect-button';
import { ChevronDown, Pencil, Pin, PinOff, Trash2, Plus, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WalletReconnectGuard } from '@/components/wallet/reconnect-guard';
import { useChatStore } from '@/lib/stores/chat-store';
import { useI18n } from '@/lib/i18n/context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGlobalShortcuts } from '@/components/chat/hooks/use-global-shortcuts';
import { ShortcutsHelpDialog } from '@/components/chat/shortcuts-help-dialog';
import { ChatErrorBoundary } from '@/components/chat/chat-error-boundary';
import { SetupWizard } from '@/components/setup/setup-wizard';

/**
 * Extract conversation ID from the current URL path.
 * Supports /chat/[id] format.
 */
function getConversationIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/chat\/([^/]+)$/);
  return match?.[1] ?? null;
}

function getShareTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/share\/([^/]+)$/);
  return match?.[1] ?? null;
}

export default function Home() {
  const { t, locale } = useI18n();
  const {
    toggleSidebar,
    startDraftConversation,
    activeConversationId,
    authenticatedAddress,
    draftConversation,
    setActiveConversation,
    conversations,
    hasHydrated,
    deleteConversation,
    updateConversationTitle,
    toggleConversationStarred,
    sharedViewConversation,
  } = useChatStore(
    useShallow((state) => ({
      toggleSidebar: state.toggleSidebar,
      startDraftConversation: state.startDraftConversation,
      activeConversationId: state.activeConversationId,
      authenticatedAddress: state.authenticatedAddress,
      draftConversation: state.draftConversation,
      setActiveConversation: state.setActiveConversation,
      conversations: state.conversations,
      hasHydrated: state.hasHydrated,
      deleteConversation: state.deleteConversation,
      updateConversationTitle: state.updateConversationTitle,
      toggleConversationStarred: state.toggleConversationStarred,
      sharedViewConversation: state.sharedViewConversation,
    }))
  );
  const lastUrlSyncId = useRef<string | null | undefined>(undefined);
  const previousShareTokenRef = useRef<string | null>(null);
  const shareToken = getShareTokenFromUrl();
  const sharedViewTitle = sharedViewConversation?.title || null;

  // Setup wizard gate: check if first-run setup is needed.
  // Skip for share pages (determined at init, not inside effect).
  const isSharePage = typeof window !== 'undefined' && /^\/share\//.test(window.location.pathname);
  const [setupState, setSetupState] = useState<'loading' | 'setup' | 'ready'>(
    isSharePage ? 'ready' : 'loading'
  );
  useEffect(() => {
    if (setupState !== 'loading') return;
    fetch('/api/setup/status')
      .then((r) => r.json())
      .then((data) => {
        setSetupState(data.completed ? 'ready' : 'setup');
      })
      .catch(() => setSetupState('ready')); // Fail open — don't block chat
  }, [setupState]);

  // Global keyboard shortcuts
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const toggleShortcuts = useCallback(() => setShortcutsOpen((v) => !v), []);
  useGlobalShortcuts({ onToggleShortcutsHelp: toggleShortcuts });

  const handleNew = useCallback(() => {
    startDraftConversation(authenticatedAddress ?? undefined);
  }, [startDraftConversation, authenticatedAddress]);

  // Current conversation for title display
  const activeConversation = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)
    : null;

  // Inline rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback(() => {
    if (!activeConversation) return;
    setRenameValue(activeConversation.title);
    setIsRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, [activeConversation]);

  const confirmRename = useCallback(() => {
    if (!activeConversationId || !renameValue.trim()) {
      setIsRenaming(false);
      return;
    }
    updateConversationTitle(activeConversationId, renameValue.trim());
    setIsRenaming(false);
  }, [activeConversationId, renameValue, updateConversationTitle]);

  const cancelRename = useCallback(() => {
    setIsRenaming(false);
  }, []);

  const handleDelete = useCallback(() => {
    if (!activeConversationId) return;
    deleteConversation(activeConversationId);
  }, [activeConversationId, deleteConversation]);

  // Sync URL with active conversation after hydration.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hasHydrated) return;

    const newId = activeConversationId ?? null;
    if (lastUrlSyncId.current === newId) return;

    const currentShareToken = getShareTokenFromUrl();
    if (currentShareToken) {
      if (lastUrlSyncId.current === undefined) {
        // First sync after mount: activeConversationId may be a stale value
        // from sessionStorage. Don't redirect away from the share URL.
        // Effect 2 will clear it; subsequent user-initiated navigations
        // (e.g. sidebar click) will have lastUrlSyncId initialized.
        lastUrlSyncId.current = newId;
        return;
      }
      if (!newId) {
        return;
      }
    }

    const currentUrlId = getConversationIdFromUrl();
    if (!newId && currentUrlId && !draftConversation) {
      // Avoid bouncing /chat/:id to / during transient restore windows.
      return;
    }

    lastUrlSyncId.current = newId;
    const targetPath = newId ? `/chat/${newId}` : '/';
    if (window.location.pathname !== targetPath) {
      window.history.replaceState(null, '', targetPath);
    }
  }, [hasHydrated, activeConversationId, draftConversation]);

  // Restore active conversation from URL after store hydration.
  useEffect(() => {
    if (!hasHydrated) return;

    const shareTokenFromUrl = getShareTokenFromUrl();
    if (shareTokenFromUrl !== previousShareTokenRef.current) {
      previousShareTokenRef.current = shareTokenFromUrl;
      if (shareTokenFromUrl && activeConversationId) {
        setActiveConversation(null);
        return;
      }
    }
    if (shareTokenFromUrl) {
      return;
    }

    const urlId = getConversationIdFromUrl();
    if (urlId && urlId !== activeConversationId) {
      const exists = conversations.some((c) => c.id === urlId);
      if (exists) {
        setActiveConversation(urlId);
      }
      // Keep URL as source of truth while waiting for conversation hydration.
      return;
    }

    if (!urlId && !activeConversationId && !draftConversation) {
      startDraftConversation(authenticatedAddress ?? undefined);
    }
  }, [
    hasHydrated,
    conversations,
    activeConversationId,
    draftConversation,
    setActiveConversation,
    startDraftConversation,
    authenticatedAddress,
  ]);

  // Show setup wizard if needed
  if (setupState === 'setup') {
    return <SetupWizard onComplete={() => setSetupState('ready')} />;
  }

  // Show loading while checking setup status (brief flash)
  if (setupState === 'loading') {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary/60 animate-pulse" />
          <span className="size-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:200ms]" />
          <span className="size-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:400ms]" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-[100dvh] min-h-0 overflow-hidden bg-background">
      <WalletReconnectGuard />
      <ShortcutsHelpDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <a
        href="#main-content"
        className="sr-only z-[70] rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
      >
        {locale === 'zh' ? '跳转到主内容' : 'Skip to main content'}
      </a>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,oklch(0.78_0.16_85/0.10),transparent_44%),radial-gradient(circle_at_100%_100%,oklch(0.78_0.16_85/0.06),transparent_42%)]" />

      <Sidebar shareToken={shareToken} />

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Top bar — sidebar toggle + title (left) + wallet (right) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-3 pt-2.5 sm:px-4">
          {/* Left: sidebar toggle + conversation title dropdown */}
          <div className="pointer-events-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 cursor-pointer rounded-md bg-card/80 text-muted-foreground shadow-sm backdrop-blur-md hover:bg-card hover:text-foreground lg:hidden"
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M16.5 4C17.3284 4 18 4.67157 18 5.5V14.5C18 15.3284 17.3284 16 16.5 16H3.5C2.67157 16 2 15.3284 2 14.5V5.5C2 4.67157 2.67157 4 3.5 4H16.5ZM7 15H16.5C16.7761 15 17 14.7761 17 14.5V5.5C17 5.22386 16.7761 5 16.5 5H7V15ZM3.5 5C3.22386 5 3 5.22386 3 5.5V14.5C3 14.7761 3.22386 15 3.5 15H6V5H3.5Z" />
              </svg>
            </Button>

            {/* Conversation title + dropdown */}
            {activeConversation ? (
              isRenaming ? (
                <div className="flex items-center gap-1">
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRename();
                      if (e.key === 'Escape') cancelRename();
                    }}
                    onBlur={confirmRename}
                    className="h-7 w-[160px] rounded-md border border-border bg-card/90 px-2 text-base font-medium text-foreground outline-none backdrop-blur-md sm:w-[240px] md:text-sm"
                    autoFocus
                  />
                  <Button variant="ghost" size="icon" className="size-6 rounded-md" onClick={confirmRename}>
                    <Check className="size-3.5" aria-hidden="true" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-6 rounded-md" onClick={cancelRename}>
                    <X className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex max-w-[200px] cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-card/80 sm:max-w-[300px]">
                      <span className="truncate">{activeConversation.title}</span>
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onClick={handleNew}>
                      <Plus className="size-4" aria-hidden="true" />
                      {t('new.chat')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={startRename}>
                      <Pencil className="size-4" aria-hidden="true" />
                      {t('sidebar.menu.rename')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => activeConversationId && toggleConversationStarred(activeConversationId)}>
                      {activeConversation.isStarred ? (
                        <PinOff className="size-4" aria-hidden="true" />
                      ) : (
                        <Pin className="size-4" aria-hidden="true" />
                      )}
                      {activeConversation.isStarred ? t('sidebar.menu.unstar') : t('sidebar.menu.star')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={handleDelete}>
                      <Trash2 className="size-4" aria-hidden="true" />
                      {t('sidebar.menu.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            ) : sharedViewTitle ? (
              <span className="max-w-[200px] truncate px-2 py-1.5 text-sm font-medium text-muted-foreground sm:max-w-[300px]">
                {sharedViewTitle}
              </span>
            ) : null}
          </div>

          {/* Right: wallet */}
          <div className="pointer-events-auto flex items-center">
            <WalletButton />
          </div>
        </div>

        <main id="main-content" className="min-h-0 flex-1">
          <ChatErrorBoundary>
            <ChatPanel shareToken={shareToken} />
          </ChatErrorBoundary>
        </main>
      </div>
    </div>
  );
}
