'use client';

import { useEffect } from 'react';
import { useChatStore } from '@/lib/stores/chat-store';

interface UseGlobalShortcutsParams {
  onToggleShortcutsHelp: () => void;
}

export function useGlobalShortcuts({ onToggleShortcutsHelp }: UseGlobalShortcutsParams) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (meta && e.key === 'k') {
        e.preventDefault();
        const store = useChatStore.getState();
        if (!store.sidebarOpen) store.setSidebarOpen(true);
        store.setSearchOpen(true);
        return;
      }

      if (meta && e.key === 'n') {
        e.preventDefault();
        const store = useChatStore.getState();
        const isSharePath =
          typeof window !== 'undefined' && /^\/share\/[^/]+$/.test(window.location.pathname);
        if (isSharePath) {
          store.setSharedViewConversation(null);
          window.history.replaceState(null, '', '/');
        }
        store.startDraftConversation(store.authenticatedAddress ?? undefined);
        return;
      }

      if (meta && e.key === '.') {
        e.preventDefault();
        const store = useChatStore.getState();
        store.setSidebarOpen(!store.sidebarOpen);
        return;
      }

      if (e.key === '?' && !isInput && !meta) {
        e.preventDefault();
        onToggleShortcutsHelp();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onToggleShortcutsHelp]);
}
