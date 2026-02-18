'use client';

import { useCallback, useState, useRef, useEffect, useMemo, memo } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  X,
  Shield,
  LogIn,
  LogOut,
  Pencil,
  Check,
  Download,
  MoreHorizontal,
  Star,
  StarOff,
  Share2,
  Link2Off,
  Loader2,
  Copy,
  Clock3,
  Search,
  Globe,
  Bug,
  ChevronDown,
  FolderOpen,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useChatStore, type Conversation } from '@/lib/stores/chat-store';
import { useProjectStore } from '@/lib/stores/project-store';
import { useAccount, useSignMessage } from 'wagmi';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/context';
import { useShallow } from 'zustand/react/shallow';
import { VList } from 'virtua';
import { warmCachedUIMessages } from '@/lib/chat/ui-message-cache';
import { PROJECT_TYPE_META, STATUS_META } from '@/components/project/ui';
import type { SidebarTab } from '@/components/project/types';
import {
  clearWalletSession,
  getWalletSessionState,
  requestWalletAuthChallenge,
  verifyWalletAuthSignature,
  type WalletSessionState,
} from '@/lib/services/wallet-auth';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useDebugMode } from '@/lib/debug/context';
import { useToast } from '@/components/ui/toast';
import {
  clearConversationShare,
  ensureConversationShare,
  type OwnerIdentity,
} from '@/lib/services/conversation-sync';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function shortenAddress(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function getShareExpiresAtFromPreset(
  preset: ShareExpiryPreset,
  baseMs = Date.now()
): number | null {
  switch (preset) {
    case '24h':
      return baseMs + 24 * 60 * 60 * 1000;
    case '7d':
      return baseMs + 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return baseMs + 30 * 24 * 60 * 60 * 1000;
    case 'never':
      return null;
    default:
      return null;
  }
}

function inferShareExpiryPreset(expiresAt?: number): ShareExpiryPreset {
  if (!expiresAt || !Number.isFinite(expiresAt)) return 'never';
  const deltaMs = expiresAt - Date.now();
  if (deltaMs <= 25 * 60 * 60 * 1000) return '24h';
  if (deltaMs <= 8 * 24 * 60 * 60 * 1000) return '7d';
  if (deltaMs <= 31 * 24 * 60 * 60 * 1000) return '30d';
  return '30d';
}

function formatShareExpiry(
  expiresAt: number | undefined,
  locale: 'zh' | 'en'
): string {
  if (!expiresAt || !Number.isFinite(expiresAt)) {
    return locale === 'zh' ? '永不过期' : 'Never expires';
  }
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(expiresAt));
}

const SESSION_TICK_MS = 30 * 1000;
const SESSION_AUTO_RENEW_RETRY_MS = 60 * 1000;
const FALLBACK_SESSION_HALF_LIFE_MS = 15 * 24 * 60 * 60 * 1000;
type ShareExpiryPreset = '24h' | '7d' | '30d' | 'never';

export function Sidebar({ shareToken }: { shareToken?: string | null } = {}) {
  const { t, locale, setLocale } = useI18n();
  const { address: walletAddress, chain } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { pushToast } = useToast();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [sessionState, setSessionState] = useState<WalletSessionState | null>(null);
  const [sessionNow, setSessionNow] = useState(() => Date.now());
  const autoRenewInFlightRef = useRef(false);
  const lastAutoRenewAttemptAtRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { enabled: debugEnabled, toggle: toggleDebug } = useDebugMode();
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareDialogConversationId, setShareDialogConversationId] = useState<string | null>(null);
  const [shareDialogExpiresPreset, setShareDialogExpiresPreset] =
    useState<ShareExpiryPreset>('7d');
  const [shareDialogSubmitting, setShareDialogSubmitting] = useState(false);
  const [shareDialogError, setShareDialogError] = useState<string | null>(null);
  const [shareDialogLink, setShareDialogLink] = useState<string | null>(null);
  const [shareDialogCopied, setShareDialogCopied] = useState(false);
  const shareCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    conversations,
    activeConversationId,
    draftConversation,
    sidebarOpen,
    searchOpen,
    guestId,
    authenticatedAddress,
    sharedViewConversation,
    setSidebarOpen,
    setSearchOpen,
    startDraftConversation,
    setActiveConversation,
    deleteConversation,
    updateConversationTitle,
    toggleConversationStarred,
    setConversationShareState,
    ensureWalletConversation,
    setAuthenticatedAddress,
    clearWalletConversations,
  } = useChatStore(
    useShallow((state) => ({
      conversations: state.conversations,
      activeConversationId: state.activeConversationId,
      draftConversation: state.draftConversation,
      sidebarOpen: state.sidebarOpen,
      searchOpen: state.searchOpen,
      guestId: state.guestId,
      authenticatedAddress: state.authenticatedAddress,
      sharedViewConversation: state.sharedViewConversation,
      setSidebarOpen: state.setSidebarOpen,
      setSearchOpen: state.setSearchOpen,
      startDraftConversation: state.startDraftConversation,
      setActiveConversation: state.setActiveConversation,
      deleteConversation: state.deleteConversation,
      updateConversationTitle: state.updateConversationTitle,
      toggleConversationStarred: state.toggleConversationStarred,
      setConversationShareState: state.setConversationShareState,
      ensureWalletConversation: state.ensureWalletConversation,
      setAuthenticatedAddress: state.setAuthenticatedAddress,
      clearWalletConversations: state.clearWalletConversations,
    }))
  );

  // ── Project store ──
  const {
    sidebarTab,
    setSidebarTab,
    projects,
    projectsLoading,
    fetchProjects,
    setActiveProject,
  } = useProjectStore(
    useShallow((s) => ({
      sidebarTab: s.sidebarTab,
      setSidebarTab: s.setSidebarTab,
      projects: s.projects,
      projectsLoading: s.projectsLoading,
      fetchProjects: s.fetchProjects,
      setActiveProject: s.setActiveProject,
    }))
  );

  // Fetch projects when switching to projects tab
  useEffect(() => {
    if (sidebarTab === 'projects') {
      void fetchProjects();
    }
  }, [sidebarTab, fetchProjects, authenticatedAddress]);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (!sidebarOpen) return;
    // Only needed on mobile (lg breakpoint uses static sidebar)
    const mq = window.matchMedia('(min-width: 1024px)');
    if (mq.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [sidebarOpen]);

  // Filter conversations: show all if not authed, or only matching wallet
  const visibleConversations = useMemo(
    () => {
      let filtered = authenticatedAddress
        ? conversations.filter(
            (c) =>
              c.scope === 'wallet' &&
              c.walletAddress?.toLowerCase() === authenticatedAddress.toLowerCase()
          )
        : conversations.filter((c) => c.scope === 'guest');

      // Apply search filter (uses debounced value for performance)
      if (debouncedSearchQuery.trim()) {
        const q = debouncedSearchQuery.trim().toLowerCase();
        filtered = filtered.filter(
          (c) =>
            c.title?.toLowerCase().includes(q) ||
            c.messages.some(
              (m) =>
                typeof m.content === 'string' && m.content.toLowerCase().includes(q)
            )
        );
      }

      return filtered
        .slice()
        .sort((a, b) => {
          if (a.isStarred !== b.isStarred) return a.isStarred ? -1 : 1;
          return b.updatedAt - a.updatedAt;
        });
    },
    [conversations, authenticatedAddress, debouncedSearchQuery]
  );

  type SidebarItem =
    | { type: 'header'; label: string; key: string }
    | { type: 'conversation'; conversation: Conversation; key: string };

  const sidebarItems = useMemo(() => {
    const items: SidebarItem[] = [];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekAgo = todayStart.getTime() - 6 * 24 * 60 * 60 * 1000;

    // Separate starred from non-starred to avoid interleaved time groups
    const starred = visibleConversations.filter((c) => c.isStarred);
    const rest = visibleConversations.filter((c) => !c.isStarred);

    if (starred.length > 0) {
      items.push({ type: 'header', label: t('sidebar.group.pinned'), key: 'header-pinned' });
      for (const conv of starred) {
        items.push({ type: 'conversation', conversation: conv, key: conv.id });
      }
    }

    let currentGroup: string | null = null;
    for (const conv of rest) {
      let group: string;
      if (conv.updatedAt >= todayStart.getTime()) {
        group = 'today';
      } else if (conv.updatedAt >= weekAgo) {
        group = 'week';
      } else {
        group = 'earlier';
      }

      if (group !== currentGroup) {
        currentGroup = group;
        const label =
          group === 'today'
            ? t('sidebar.group.today')
            : group === 'week'
              ? t('sidebar.group.week')
              : t('sidebar.group.earlier');
        items.push({ type: 'header', label, key: `header-${group}` });
      }
      items.push({ type: 'conversation', conversation: conv, key: conv.id });
    }

    return items;
  }, [visibleConversations, t]);

  const handleNew = useCallback(() => {
    startDraftConversation(authenticatedAddress ?? undefined);
    setSidebarOpen(false);
  }, [startDraftConversation, authenticatedAddress, setSidebarOpen]);

  const handleSelect = useCallback(
    (id: string) => {
      setActiveConversation(id);
      setSidebarOpen(false);
    },
    [setActiveConversation, setSidebarOpen]
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteConversation(id);
    },
    [deleteConversation]
  );

  const handleRename = useCallback(
    (id: string, title: string) => {
      updateConversationTitle(id, title);
    },
    [updateConversationTitle]
  );

  const handleToggleStar = useCallback(
    (id: string) => {
      toggleConversationStarred(id);
    },
    [toggleConversationStarred]
  );

  const handleSelectProject = useCallback(
    (id: string) => {
      setActiveProject(id);
      setSidebarTab('chats'); // switch back to chats to show project detail later
      setSidebarOpen(false);
      // Navigate to project detail if needed — for now, use URL
      const project = projects.find((p) => p.id === id);
      if (project) {
        window.location.href = `/x/${project.shortId}`;
      }
    },
    [setActiveProject, setSidebarTab, setSidebarOpen, projects]
  );

  const handleSignIn = useCallback(async () => {
    const chainId = chain?.id;
    if (!walletAddress || !chainId || isAuthenticating) return;
    setIsAuthenticating(true);
    try {
      const challenge = await requestWalletAuthChallenge({
        address: walletAddress,
        chainId,
        purpose: 'user',
      });
      const signature = await signMessageAsync({
        message: challenge.message,
      });
      const session = await verifyWalletAuthSignature({
        address: walletAddress,
        nonce: challenge.nonce,
        signature,
        chainId,
        purpose: 'user',
      });
      setAuthenticatedAddress(session.address);
      setSessionState({
        authenticated: true,
        address: session.address,
        purpose: session.purpose,
        expiresAt: session.expiresAt,
        renewAt: session.renewAt,
        isAdmin: session.isAdmin,
      });
      // Activate existing wallet conversation or start a draft (no empty conversation created)
      const normalizedAddr = session.address.toLowerCase();
      const existing = useChatStore.getState().conversations.find(
        (c) =>
          c.scope === 'wallet' &&
          c.walletAddress?.toLowerCase() === normalizedAddr,
      );
      if (existing) {
        ensureWalletConversation(session.address);
      } else {
        startDraftConversation(session.address);
      }
      pushToast({
        title: locale === 'zh' ? '登录成功' : 'Sign in successful',
        message:
          locale === 'zh'
            ? '已完成钱包签名认证'
            : 'Wallet signature verification completed',
        variant: 'info',
      });
    } catch (error) {
      const details =
        error instanceof Error && error.message ? error.message : undefined;
      pushToast({
        title: locale === 'zh' ? '登录失败' : 'Sign in failed',
        message:
          locale === 'zh'
            ? details ?? '钱包签名认证失败'
            : details ?? 'Wallet signature verification failed',
        variant: 'warning',
      });
    } finally {
      setIsAuthenticating(false);
    }
  }, [
    walletAddress,
    isAuthenticating,
    chain?.id,
    signMessageAsync,
    setAuthenticatedAddress,
    ensureWalletConversation,
    startDraftConversation,
    pushToast,
    locale,
  ]);

  const handleSignOut = useCallback(async () => {
    await clearWalletSession({ allDevices: true }).catch(() => undefined);
    clearWalletConversations(authenticatedAddress ?? null);
    setAuthenticatedAddress(null);
    setSessionState(null);
  }, [
    clearWalletConversations,
    authenticatedAddress,
    setAuthenticatedAddress,
  ]);

  const authenticatedAddressRef = useRef(authenticatedAddress);
  authenticatedAddressRef.current = authenticatedAddress;
  const sessionStateRef = useRef(sessionState);
  sessionStateRef.current = sessionState;

  useEffect(() => {
    let cancelled = false;
    const syncWalletSession = async () => {
      try {
        const session = await getWalletSessionState();
        if (cancelled) return;
        if (session?.authenticated && session.address) {
          const normalizedSessionAddress = session.address.toLowerCase();
          setAuthenticatedAddress(normalizedSessionAddress);
          setSessionState(session);
          return;
        }

        const addressToClear = authenticatedAddressRef.current ?? sessionStateRef.current?.address ?? null;
        if (addressToClear) {
          clearWalletConversations(addressToClear);
        }
        setAuthenticatedAddress(null);
        setSessionState(null);
      } catch {
        if (cancelled) return;
        // Keep current session state on transient network failures.
      }
    };
    void syncWalletSession();
    const interval = setInterval(() => {
      void syncWalletSession();
    }, 5 * 60 * 1000);
    const onFocus = () => {
      void syncWalletSession();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncWalletSession();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [
    setAuthenticatedAddress,
    clearWalletConversations,
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSessionNow(Date.now());
    }, SESSION_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!sessionState?.authenticated || !sessionState.expiresAt || !sessionState.address) return;
    const normalizedSessionAddress = sessionState.address.toLowerCase();

    const renewAt =
      sessionState.renewAt ?? sessionState.expiresAt - FALLBACK_SESSION_HALF_LIFE_MS;
    const now = Date.now();
    if (now < renewAt) return;
    if (autoRenewInFlightRef.current) return;
    if (now - lastAutoRenewAttemptAtRef.current < SESSION_AUTO_RENEW_RETRY_MS) return;

    autoRenewInFlightRef.current = true;
    lastAutoRenewAttemptAtRef.current = now;
    let cancelled = false;

    const renewInBackground = async () => {
      try {
        const session = await getWalletSessionState({ forceRenew: true });
        if (cancelled) return;
        if (session?.authenticated && session.address === normalizedSessionAddress) {
          setAuthenticatedAddress(session.address);
          setSessionState(session);
          return;
        }
        clearWalletConversations(normalizedSessionAddress);
        setAuthenticatedAddress(null);
        setSessionState(null);
        pushToast({
          title: locale === 'zh' ? '会话已失效' : 'Session expired',
          message:
            locale === 'zh'
              ? '请重新完成钱包签名登录'
              : 'Please sign in with wallet signature again',
          variant: 'warning',
        });
      } catch {
        // Keep session state and retry later.
      } finally {
        autoRenewInFlightRef.current = false;
      }
    };

    void renewInBackground();
    return () => {
      cancelled = true;
    };
  }, [
    sessionState,
    sessionNow,
    clearWalletConversations,
    setAuthenticatedAddress,
    pushToast,
    locale,
  ]);

  const conversationsById = useMemo(
    () => new Map(conversations.map((conversation) => [conversation.id, conversation])),
    [conversations]
  );
  const activeConversation = useMemo(
    () =>
      activeConversationId
        ? conversationsById.get(activeConversationId)
        : undefined,
    [conversationsById, activeConversationId]
  );

  const handleExport = useCallback((format: 'md' | 'json') => {
    const active = activeConversation;
    if (!active || active.messages.length === 0) return;

    let content: string;
    let filename: string;
    let mime: string;

    if (format === 'md') {
      const lines = [`# ${active.title}\n`, `> Exported from BNBrain\n`];
      for (const msg of active.messages) {
        const role = msg.role === 'user' ? '**You**' : '**BNBrain**';
        lines.push(`### ${role}\n`);
        lines.push(`${msg.content}\n`);
      }
      content = lines.join('\n');
      filename = `bnbrain-${active.id}.md`;
      mime = 'text/markdown';
    } else {
      content = JSON.stringify({
        title: active.title,
        exportedAt: new Date().toISOString(),
        messages: active.messages,
      }, null, 2);
      filename = `bnbrain-${active.id}.json`;
      mime = 'application/json';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeConversation]);

  const handleWarmConversation = useCallback(
    (id: string) => {
      const conversation = conversationsById.get(id);
      if (!conversation || conversation.messages.length === 0) return;
      warmCachedUIMessages(conversation.messages);
    },
    [conversationsById]
  );

  const resolveConversationOwner = useCallback(
    (conversation: Conversation): OwnerIdentity | null => {
      if (conversation.scope === 'wallet') {
        const walletOwner = conversation.walletAddress ?? authenticatedAddress;
        if (!walletOwner) return null;
        return {
          ownerType: 'wallet',
          ownerId: walletOwner,
        };
      }
      return {
        ownerType: 'guest',
        ownerId: guestId,
      };
    },
    [authenticatedAddress, guestId]
  );

  const buildShareUrl = useCallback((token: string) => {
    return typeof window === 'undefined'
      ? `/share/${encodeURIComponent(token)}`
      : `${window.location.origin}/share/${encodeURIComponent(token)}`;
  }, []);

  const handleOpenShareDialog = useCallback(
    (conversationId: string) => {
      const conversation = conversationsById.get(conversationId);
      if (!conversation) return;
      setShareDialogConversationId(conversationId);
      setShareDialogExpiresPreset(inferShareExpiryPreset(conversation.shareExpiresAt));
      setShareDialogError(null);
      setShareDialogLink(
        conversation.shareToken ? buildShareUrl(conversation.shareToken) : null
      );
      setShareDialogCopied(false);
      setShareDialogOpen(true);
    },
    [buildShareUrl, conversationsById]
  );

  const handleSubmitShareDialog = useCallback(async () => {
    const conversationId = shareDialogConversationId;
    if (!conversationId) return;
    const conversation = conversationsById.get(conversationId);
    if (!conversation) return;
    const owner = resolveConversationOwner(conversation);
    if (!owner) {
      setShareDialogError(
        locale === 'zh'
          ? '当前会话缺少归属信息，无法共享'
          : 'Conversation owner context is missing'
      );
      return;
    }

    setShareDialogSubmitting(true);
    setShareDialogError(null);
    try {
      const expiresAt = getShareExpiresAtFromPreset(shareDialogExpiresPreset);
      const shareState = await ensureConversationShare(owner, conversationId, expiresAt);
      if (!shareState.shareToken) {
        throw new Error('Missing share token');
      }
      setConversationShareState(conversationId, {
        isShared: true,
        shareToken: shareState.shareToken,
        sharedAt: shareState.sharedAt,
        shareExpiresAt: shareState.shareExpiresAt,
      });
      const nextLink = buildShareUrl(shareState.shareToken);
      setShareDialogLink(nextLink);
      setShareDialogCopied(false);
    } catch (error) {
      setShareDialogError(
        error instanceof Error && error.message
          ? error.message
          : locale === 'zh'
            ? '共享链接创建失败，请稍后重试'
            : 'Failed to create share link. Please try again.'
      );
    } finally {
      setShareDialogSubmitting(false);
    }
  }, [
    shareDialogConversationId,
    conversationsById,
    resolveConversationOwner,
    locale,
    shareDialogExpiresPreset,
    setConversationShareState,
    buildShareUrl,
  ]);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareDialogLink) return;
    try {
      await navigator.clipboard.writeText(shareDialogLink);
      setShareDialogCopied(true);
      if (shareCopyTimerRef.current) {
        clearTimeout(shareCopyTimerRef.current);
      }
      shareCopyTimerRef.current = setTimeout(() => {
        setShareDialogCopied(false);
      }, 1300);
      pushToast({
        title: t('sidebar.share.copiedTitle'),
        message: t('sidebar.share.copiedMessage'),
        variant: 'info',
      });
    } catch {
      setShareDialogError(
        locale === 'zh' ? '复制失败，请手动复制链接' : 'Copy failed, please copy the link manually'
      );
    }
  }, [shareDialogLink, pushToast, t, locale]);

  const handleDisableShare = useCallback(
    async (conversationId: string) => {
      const conversation = conversationsById.get(conversationId);
      if (!conversation) return;
      const owner = resolveConversationOwner(conversation);
      if (!owner) {
        pushToast({
          title: t('sidebar.menu.unshare'),
          message:
            locale === 'zh'
              ? '当前会话缺少归属信息，无法取消共享'
              : 'Conversation owner context is missing',
          variant: 'warning',
        });
        return;
      }
      try {
        await clearConversationShare(owner, conversationId);
        setConversationShareState(conversationId, {
          isShared: false,
          shareToken: undefined,
          sharedAt: undefined,
          shareExpiresAt: undefined,
        });
        setShareDialogLink(null);
        setShareDialogCopied(false);
        pushToast({
          title: t('sidebar.menu.unshare'),
          message: t('sidebar.share.disabled'),
          variant: 'info',
        });
      } catch (error) {
        pushToast({
          title: t('sidebar.menu.unshare'),
          message:
            error instanceof Error && error.message
              ? error.message
              : locale === 'zh'
                ? '取消共享失败，请稍后重试'
                : 'Failed to disable sharing. Please try again.',
          variant: 'warning',
        });
      }
    },
    [conversationsById, resolveConversationOwner, pushToast, setConversationShareState, t, locale]
  );

  useEffect(() => {
    return () => {
      if (shareCopyTimerRef.current) {
        clearTimeout(shareCopyTimerRef.current);
      }
    };
  }, []);

  const sharedReadingTitle = useMemo(() => {
    if (!shareToken) return null;
    if (sharedViewConversation?.token === shareToken && sharedViewConversation.title) {
      return sharedViewConversation.title;
    }
    return locale === 'zh' ? '共享会话' : 'Shared conversation';
  }, [shareToken, sharedViewConversation, locale]);

  const shareDialogConversation = useMemo(
    () =>
      shareDialogConversationId
        ? conversationsById.get(shareDialogConversationId)
        : undefined,
    [shareDialogConversationId, conversationsById]
  );
  const shareDialogExpiryLabel = useMemo(
    () => formatShareExpiry(shareDialogConversation?.shareExpiresAt, locale),
    [shareDialogConversation?.shareExpiresAt, locale]
  );

  const normalizedConnectedWalletAddress = walletAddress?.toLowerCase() ?? null;
  const normalizedAuthenticatedAddress = authenticatedAddress?.toLowerCase() ?? null;
  const walletAndSessionMatch =
    Boolean(normalizedConnectedWalletAddress) &&
    normalizedConnectedWalletAddress === normalizedAuthenticatedAddress;

  return (
    <>
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-pointer bg-black/50 backdrop-blur-[1px] transition-opacity duration-200 motion-reduce:transition-none lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar overlay"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-72 flex-col border-r border-border bg-sidebar/92 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-[0_18px_40px_-28px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-transform duration-200 ease-in-out motion-reduce:transition-none lg:relative lg:w-72 lg:max-w-none lg:py-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Header */}
        <div className="shrink-0 px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            {searchOpen ? (
              <div className="flex min-w-0 flex-1 items-center gap-1.5 animate-search-expand">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" aria-hidden="true" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('sidebar.search')}
                    className="h-7 w-full rounded-md border border-border bg-muted pl-8 pr-2.5 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring/50 focus:bg-sidebar focus:ring-1 focus:ring-ring/30"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setSearchQuery('');
                        setSearchOpen(false);
                      }
                    }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
                      aria-label="Clear search"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
                  aria-label="Close search"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex size-6 items-center justify-center rounded-md bg-primary/12">
                    <Shield className="size-3.5 text-primary" aria-hidden="true" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">BNBrain</span>
                </div>
                <div className="ml-auto flex items-center gap-0.5">
                  <button
                    type="button"
                    className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    onClick={() => setSearchOpen(true)}
                    title={t('sidebar.search')}
                    aria-label={t('sidebar.search')}
                  >
                    <Search className="size-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    onClick={handleNew}
                    title={t('new.chat')}
                    aria-label={t('new.chat')}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                    aria-label="Close conversation sidebar"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="sidebar-gradient-sep" />

        {/* Auth section */}
        <div className="shrink-0 px-3 py-1.5">
          {authenticatedAddress ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-accent/80"
                >
                  <div className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span className="min-w-0 flex-1 truncate text-xs font-mono text-muted-foreground">
                    {shortenAddress(authenticatedAddress)}
                  </span>
                  <ChevronDown className="size-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {locale === 'zh' ? '钱包会话' : 'Wallet Session'}
                </DropdownMenuLabel>
                {walletAddress ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    {t('sidebar.walletConnected')}: {shortenAddress(walletAddress)}
                  </div>
                ) : (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    {t('sidebar.walletDisconnectedSessionOnly')}
                  </div>
                )}
                {walletAddress && !walletAndSessionMatch ? (
                  <div className="px-2 py-1 text-xs text-amber-400">
                    {t('sidebar.walletSessionMismatch')}
                  </div>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleSignOut()}>
                  <LogOut className="size-3.5" aria-hidden="true" />
                  {t('sidebar.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : walletAddress ? (
            <button
              type="button"
              className="flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 text-xs text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleSignIn}
              disabled={isAuthenticating}
            >
              <LogIn className="size-3" aria-hidden="true" />
              {isAuthenticating
                ? locale === 'zh'
                  ? '签名中…'
                  : 'Signing…'
                : `${t('sidebar.signIn')} ${shortenAddress(walletAddress)}`}
            </button>
          ) : (
            <p className="py-0.5 text-center text-xs text-muted-foreground/60">
              {t('sidebar.connectWallet')}
            </p>
          )}
        </div>
        <div className="sidebar-gradient-sep" />

        {/* Tab switcher: Chats / Projects */}
        <div className="shrink-0 px-3 py-1.5">
          <div className="flex rounded-lg bg-muted/30 p-0.5">
            {([
              { key: 'chats' as SidebarTab, label: locale === 'zh' ? '对话' : 'Chats', icon: MessageSquare },
              { key: 'projects' as SidebarTab, label: locale === 'zh' ? '项目' : 'Projects', icon: FolderOpen },
            ]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSidebarTab(tab.key)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  sidebarTab === tab.key
                    ? 'bg-sidebar text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <tab.icon className="size-3" aria-hidden="true" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sidebar-gradient-sep" />

        {/* Content list: Chats or Projects */}
        <div className="min-h-0 flex-1">
          {sidebarTab === 'chats' ? (
            <>
              {shareToken ? (
                <div className="px-2 pb-1 pt-2">
                  <div className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-ring/35 bg-primary/10 px-2.5 py-1.5">
                    <MessageSquare className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {sharedReadingTitle}
                    </p>
                    <span className="rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-xs font-medium text-violet-400">
                      {t('sidebar.fromShared')}
                    </span>
                  </div>
                </div>
              ) : null}
              {visibleConversations.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-2 py-12 text-center">
                    <MessageSquare className="size-8 text-muted-foreground/60" aria-hidden="true" />
                    <p className="text-xs text-muted-foreground">
                    {t('sidebar.noConversations')}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                      className="cursor-pointer border-border bg-sidebar text-xs text-foreground transition-colors duration-200 motion-reduce:transition-none hover:bg-accent"
                    onClick={handleNew}
                  >
                    <Plus className="size-3 mr-1.5" aria-hidden="true" />
                    {t('sidebar.startNew')}
                  </Button>
                </div>
              ) : (
                <VList
                  data={sidebarItems}
                  itemSize={64}
                  bufferSize={800}
                  className="h-full overflow-y-auto overscroll-contain px-2 py-2"
                >
                  {(item) =>
                    item.type === 'header' ? (
                      <div
                        key={item.key}
                        className="px-2.5 pt-3 pb-1 text-xs uppercase tracking-widest text-muted-foreground/60 select-none"
                      >
                        {item.label}
                      </div>
                    ) : (
                      <div key={item.key} className="py-0.5">
                        <ConversationItem
                          conversation={item.conversation}
                          t={t}
                          isActive={item.conversation.id === activeConversationId}
                          onSelect={handleSelect}
                          onWarm={handleWarmConversation}
                          onDelete={handleDelete}
                          onRename={handleRename}
                          onToggleStar={handleToggleStar}
                          onOpenShareDialog={handleOpenShareDialog}
                          onDisableShare={handleDisableShare}
                        />
                      </div>
                    )
                  }
                </VList>
              )}
            </>
          ) : (
            /* Projects tab */
            <div className="h-full overflow-y-auto px-2 py-2">
              {projectsLoading && projects.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : projects.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-2 py-12 text-center">
                  <FolderOpen className="size-8 text-muted-foreground/60" aria-hidden="true" />
                  <p className="text-xs text-muted-foreground">
                    {locale === 'zh' ? '暂无项目' : 'No projects yet'}
                  </p>
                  <p className="max-w-[200px] text-xs text-muted-foreground/60">
                    {locale === 'zh'
                      ? '在对话中使用 AI 创建你的第一个项目'
                      : 'Create your first project through AI chat'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {projects.map((project) => {
                    const meta = PROJECT_TYPE_META[project.projectType];
                    const statusMeta = STATUS_META[project.status];
                    const Icon = meta.icon;
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => handleSelectProject(project.id)}
                        className="group flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors duration-200 hover:border-border hover:bg-accent/80"
                      >
                        <div className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg border', meta.bgColor)}>
                          <Icon className={cn('size-3.5', meta.color)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                              {project.name}
                            </p>
                            <span className={cn('size-1.5 shrink-0 rounded-full', statusMeta.dotColor)} />
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                            {project.fileCount !== undefined && (
                              <span className="flex items-center gap-0.5">
                                <FileText className="size-2.5" /> {project.fileCount}
                              </span>
                            )}
                            {project.conversationCount !== undefined && (
                              <span className="flex items-center gap-0.5">
                                <MessageSquare className="size-2.5" /> {project.conversationCount}
                              </span>
                            )}
                            <span className="font-mono text-primary/60">/x/{project.shortId}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sidebar-gradient-sep" />
        <div className="shrink-0 flex items-center gap-1 px-2.5 py-2">
          {/* Language toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
                aria-label={locale === 'en' ? 'Switch language to Chinese' : 'Switch language to English'}
              >
                <Globe className="size-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {locale === 'en' ? '切换中文' : 'English'}
            </TooltipContent>
          </Tooltip>

          {/* Debug toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors',
                  debugEnabled
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
                onClick={toggleDebug}
                aria-label={debugEnabled ? t('debug.off') : t('debug.on')}
              >
                <Bug className="size-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {debugEnabled ? t('debug.off') : t('debug.on')}
            </TooltipContent>
          </Tooltip>

          {/* Export dropdown */}
          {activeConversationId && activeConversation?.messages.length ? (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      aria-label={t('sidebar.export')}
                    >
                      <Download className="size-3.5" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {t('sidebar.export')}
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" className="w-36">
                <DropdownMenuItem onSelect={() => handleExport('md')}>
                  Markdown
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleExport('json')}>
                  JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {/* Stats */}
          <span className="ml-auto text-xs text-muted-foreground/40">
            {sidebarTab === 'chats'
              ? `${visibleConversations.length} chats`
              : `${projects.length} projects`}
          </span>
        </div>
      </aside>

      <Dialog
        open={shareDialogOpen}
        onOpenChange={(open) => {
          setShareDialogOpen(open);
          if (!open) {
            setShareDialogSubmitting(false);
            setShareDialogError(null);
            setShareDialogCopied(false);
            if (shareCopyTimerRef.current) {
              clearTimeout(shareCopyTimerRef.current);
              shareCopyTimerRef.current = null;
            }
          }
        }}
      >
        <DialogContent className="w-[min(92vw,34rem)]">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle>
              {locale === 'zh' ? '共享会话' : 'Share conversation'}
            </DialogTitle>
            <DialogDescription>
              {shareDialogConversation
                ? shareDialogConversation.title
                : locale === 'zh'
                  ? '选择共享设置并生成链接'
                  : 'Choose sharing settings and generate a link'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {locale === 'zh' ? '链接有效期' : 'Link expiry'}
              </label>
              <select
                value={shareDialogExpiresPreset}
                onChange={(event) =>
                  setShareDialogExpiresPreset(event.target.value as ShareExpiryPreset)
                }
                className="h-9 w-full rounded-lg border border-border bg-sidebar px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={shareDialogSubmitting}
              >
                <option value="24h">{locale === 'zh' ? '24 小时' : '24 hours'}</option>
                <option value="7d">{locale === 'zh' ? '7 天' : '7 days'}</option>
                <option value="30d">{locale === 'zh' ? '30 天' : '30 days'}</option>
                <option value="never">{locale === 'zh' ? '永不过期' : 'Never'}</option>
              </select>
            </div>

            {shareDialogLink ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/80 p-3">
                <p className="text-xs text-muted-foreground">
                  {locale === 'zh' ? '共享链接' : 'Share link'}
                </p>
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate rounded-md border border-border bg-sidebar px-2.5 py-1.5 text-xs text-foreground">
                    {shareDialogLink}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-8 cursor-pointer transition-all duration-200',
                      shareDialogCopied
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15'
                        : ''
                    )}
                    onClick={handleCopyShareLink}
                  >
                    {shareDialogCopied ? (
                      <Check className="mr-1 size-3.5 animate-in zoom-in-75 duration-200" aria-hidden="true" />
                    ) : (
                      <Copy className="mr-1 size-3.5" aria-hidden="true" />
                    )}
                    {shareDialogCopied
                      ? locale === 'zh'
                        ? '已复制'
                        : 'Copied'
                      : locale === 'zh'
                        ? '复制'
                        : 'Copy'}
                  </Button>
                </div>
                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="size-3" aria-hidden="true" />
                  {locale === 'zh' ? `到期时间：${shareDialogExpiryLabel}` : `Expires: ${shareDialogExpiryLabel}`}
                </p>
              </div>
            ) : null}

            {shareDialogError ? (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                {shareDialogError}
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {shareDialogConversation?.isShared ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 cursor-pointer text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  onClick={() =>
                    shareDialogConversationId
                      ? handleDisableShare(shareDialogConversationId)
                      : undefined
                  }
                  disabled={shareDialogSubmitting || !shareDialogConversationId}
                >
                  <Link2Off className="mr-1 size-3.5" aria-hidden="true" />
                  {t('sidebar.menu.unshare')}
                </Button>
              ) : null}
            </div>
            <Button
              type="button"
              className="h-8 cursor-pointer bg-primary text-white hover:brightness-105"
              onClick={handleSubmitShareDialog}
              disabled={shareDialogSubmitting || !shareDialogConversationId}
            >
              {shareDialogSubmitting ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Share2 className="mr-1 size-3.5" aria-hidden="true" />
              )}
              {shareDialogConversation?.isShared
                ? locale === 'zh'
                  ? '更新共享'
                  : 'Update share'
                : locale === 'zh'
                  ? '生成共享链接'
                  : 'Create share link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const ConversationItem = memo(function ConversationItem({
  conversation,
  t,
  isActive,
  onSelect,
  onWarm,
  onDelete,
  onRename,
  onToggleStar,
  onOpenShareDialog,
  onDisableShare,
}: {
  conversation: Conversation;
  t: (key: string) => string;
  isActive: boolean;
  onSelect: (id: string) => void;
  onWarm: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onToggleStar: (id: string) => void;
  onOpenShareDialog: (id: string) => void;
  onDisableShare: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== conversation.title) {
      onRename(conversation.id, trimmed);
    }
    setEditing(false);
  };

  const startEdit = () => {
    setDraft(conversation.title);
    setEditing(true);
  };

  const cancelRename = () => {
    setDraft(conversation.title);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        'group flex min-h-10 w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-colors duration-200 motion-reduce:transition-none [content-visibility:auto] [contain-intrinsic-size:56px]',
        isActive
          ? 'border-ring/35 bg-primary/10'
          : 'border-transparent hover:border-border hover:bg-accent/80'
      )}
    >
      {editing ? (
        <div className="flex min-w-0 flex-1 items-center">
          <div className="flex-1 min-w-0">
            <input
              ref={inputRef}
              name={`conversation-title-${conversation.id}`}
              autoComplete="off"
              aria-label="Edit conversation title"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') cancelRename();
              }}
              className="w-full border-b border-ring/50 bg-transparent text-sm leading-5 font-medium text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center rounded-sm text-left transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onMouseEnter={() => onWarm(conversation.id)}
          onFocus={() => onWarm(conversation.id)}
          onPointerDown={() => onWarm(conversation.id)}
          onClick={() => onSelect(conversation.id)}
          aria-label={`Open conversation ${conversation.title}`}
          aria-current={isActive ? 'page' : undefined}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="min-w-0 flex-1 truncate text-sm font-medium leading-5 text-foreground">
                {conversation.title}
              </p>
              {conversation.isStarred ? (
                <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-400">
                  {t('sidebar.pinned')}
                </span>
              ) : null}
              {conversation.isShared ? (
                <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium text-emerald-400">
                  {t('sidebar.shared')}
                </span>
              ) : null}
              {conversation.forkedFromShareToken ? (
                <span className="rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-xs font-medium text-violet-400">
                  {t('sidebar.fromShared')}
                </span>
              ) : null}
            </div>
          </div>
        </button>
      )}
      <div className="flex items-center gap-0.5 shrink-0">
        {editing ? (
          <>
            <button
              type="button"
              className="cursor-pointer rounded p-1 text-primary transition-colors duration-200 motion-reduce:transition-none hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={commitRename}
              title="Save"
              aria-label="Save conversation title"
            >
              <Check className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="cursor-pointer rounded p-1 text-muted-foreground transition-colors duration-200 motion-reduce:transition-none hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={cancelRename}
              title="Cancel"
              aria-label="Cancel renaming conversation"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="cursor-pointer rounded p-1 text-muted-foreground opacity-100 transition-colors duration-200 motion-reduce:transition-none hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100"
                aria-label={t('sidebar.menu.more')}
              >
                <MoreHorizontal className="size-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  startEdit();
                }}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                {t('sidebar.menu.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  onToggleStar(conversation.id);
                }}
              >
                {conversation.isStarred ? (
                  <StarOff className="size-3.5" aria-hidden="true" />
                ) : (
                  <Star className="size-3.5" aria-hidden="true" />
                )}
                {conversation.isStarred ? t('sidebar.menu.unstar') : t('sidebar.menu.star')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  onOpenShareDialog(conversation.id);
                }}
              >
                <Share2 className="size-3.5" aria-hidden="true" />
                {conversation.isShared
                  ? t('sidebar.menu.shareSettings')
                  : t('sidebar.menu.share')}
              </DropdownMenuItem>
              {conversation.isShared ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    onDisableShare(conversation.id);
                  }}
                >
                  <Link2Off className="size-3.5" aria-hidden="true" />
                  {t('sidebar.menu.unshare')}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  onDelete(conversation.id);
                }}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                {t('sidebar.menu.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  return (
    prev.conversation === next.conversation &&
    prev.isActive === next.isActive
  );
});
