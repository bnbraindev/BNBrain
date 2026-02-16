import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts?: Array<{ type: string; [key: string]: unknown }>;
  createdAt?: number;
}

export type ConversationScope = 'guest' | 'wallet';
export type ContextInjectionStatus = 'not_injected' | 'pending' | 'injected' | 'stale';

export interface Conversation {
  id: string;
  title: string;
  messages: StoredMessage[];
  walletAddress?: string;
  isStarred: boolean;
  isShared: boolean;
  sharedAt?: number;
  shareToken?: string;
  shareExpiresAt?: number;
  forkedFromShareToken?: string;
  scope: ConversationScope;
  contextInjectionStatus: ContextInjectionStatus;
  contextFingerprint?: string;
  contextInjectedAt?: number;
  createdAt: number;
  updatedAt: number;
}

const messagePartsSignatureCache = new WeakMap<object, string>();

function messagePartsToSignature(
  parts?: Array<{ type: string; [key: string]: unknown }>
): string {
  if (!parts || parts.length === 0) return '';
  const cacheKey = parts as unknown as object;
  const cached = messagePartsSignatureCache.get(cacheKey);
  if (cached !== undefined) return cached;
  let signature = '';
  try {
    signature = JSON.stringify(parts);
  } catch {
    signature = '';
  }
  messagePartsSignatureCache.set(cacheKey, signature);
  return signature;
}

function areStoredMessagesEqual(a: StoredMessage[], b: StoredMessage[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (left === right) continue;
    if (left.id !== right.id) return false;
    if (left.role !== right.role) return false;
    if (left.content !== right.content) return false;
    if (left.parts === right.parts) continue;
    if (!left.parts || !right.parts) return false;
    if (messagePartsToSignature(left.parts) !== messagePartsToSignature(right.parts)) {
      return false;
    }
  }
  return true;
}

function updateConversationById(
  conversations: Conversation[],
  id: string,
  updater: (current: Conversation) => Conversation
): { conversations: Conversation[]; changed: boolean } {
  const index = conversations.findIndex((c) => c.id === id);
  if (index < 0) {
    return { conversations, changed: false };
  }
  const current = conversations[index];
  const next = updater(current);
  if (next === current) {
    return { conversations, changed: false };
  }
  const nextConversations = conversations.slice();
  nextConversations[index] = next;
  return { conversations: nextConversations, changed: true };
}

function parseOwnerKey(
  ownerKey: string
): { ownerType: 'wallet' | 'guest'; ownerId: string } | null {
  const [ownerType, ...rest] = ownerKey.split(':');
  const ownerId = rest.join(':');
  if (!ownerId) return null;
  if (ownerType !== 'wallet' && ownerType !== 'guest') return null;
  return { ownerType, ownerId: ownerType === 'wallet' ? ownerId.toLowerCase() : ownerId };
}

function isConversationOwnedBy(
  conversation: Conversation,
  owner: { ownerType: 'wallet' | 'guest'; ownerId: string }
): boolean {
  if (owner.ownerType === 'wallet') {
    return (
      conversation.scope === 'wallet' &&
      conversation.walletAddress?.toLowerCase() === owner.ownerId
    );
  }
  return conversation.scope === 'guest';
}

const PERSIST_WRITE_DEBOUNCE_MS = 180;
const pendingStorageWrites = new Map<string, string>();
const storageFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const ACTIVE_CONVERSATION_SESSION_KEY = 'bnbrain-active-conversation-id';

function readActiveConversationIdFromSession(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(ACTIVE_CONVERSATION_SESSION_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

function writeActiveConversationIdToSession(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (id && id.trim()) {
      window.sessionStorage.setItem(ACTIVE_CONVERSATION_SESSION_KEY, id);
      return;
    }
    window.sessionStorage.removeItem(ACTIVE_CONVERSATION_SESSION_KEY);
  } catch {
    // Ignore sessionStorage failures; this only affects refresh restore.
  }
}

function schedulePersistFlush(name: string): void {
  const existingTimer = storageFlushTimers.get(name);
  if (existingTimer) clearTimeout(existingTimer);
  const timer = setTimeout(() => {
    const value = pendingStorageWrites.get(name);
    if (value !== undefined && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(name, value);
      } catch {
        // Ignore QuotaExceededError and other storage failures to avoid
        // breaking the chat runtime. Data will be retried on next flush.
      }
    }
    pendingStorageWrites.delete(name);
    storageFlushTimers.delete(name);
  }, PERSIST_WRITE_DEBOUNCE_MS);
  storageFlushTimers.set(name, timer);
}

function getPersistStorage(): StateStorage {
  return {
    getItem: (name) => {
      if (typeof window === 'undefined') return null;
      const pending = pendingStorageWrites.get(name);
      if (pending !== undefined) return pending;
      return window.localStorage.getItem(name);
    },
    setItem: (name, value) => {
      pendingStorageWrites.set(name, value);
      schedulePersistFlush(name);
    },
    removeItem: (name) => {
      const timer = storageFlushTimers.get(name);
      if (timer) clearTimeout(timer);
      storageFlushTimers.delete(name);
      pendingStorageWrites.delete(name);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(name);
      }
    },
  };
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  draftConversation: { walletAddress?: string; draftId: string } | null;
  sidebarOpen: boolean;
  selectedModelId: string | null;
  guestId: string;
  hydratedOwnerKey: string | null;
  hasHydrated: boolean;
  sharedViewConversation: { token: string; title: string } | null;
  searchOpen: boolean;

  // Auth
  authenticatedAddress: string | null;
  setHasHydrated: (hydrated: boolean) => void;
  setAuthenticatedAddress: (address: string | null) => void;
  clearWalletConversations: (walletAddress?: string | null) => void;

  // Sidebar
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;

  // Conversations
  startDraftConversation: (walletAddress?: string) => void;
  createConversation: (
    walletAddress?: string,
    preferredId?: string,
    initialTitle?: string
  ) => string;
  setActiveConversation: (id: string | null) => void;
  deleteConversation: (id: string) => void;
  updateConversationTitle: (id: string, title: string) => void;
  toggleConversationStarred: (id: string) => void;
  toggleConversationShared: (id: string) => void;
  setConversationShareState: (
    id: string,
    share: {
      isShared: boolean;
      shareToken?: string;
      sharedAt?: number;
      shareExpiresAt?: number;
    }
  ) => void;
  setConversationForkSource: (id: string, shareToken?: string) => void;
  updateConversationMessages: (id: string, messages: StoredMessage[]) => void;
  updateConversationContextStatus: (
    id: string,
    status: ContextInjectionStatus,
    fingerprint?: string
  ) => void;
  ensureWalletConversation: (walletAddress: string) => string;
  hydrateFromRemote: (ownerKey: string, remoteConversations: Conversation[]) => void;
  markHydratedOwner: (ownerKey: string) => void;
  setSharedViewConversation: (
    view: { token: string; title: string } | null
  ) => void;

  // Helpers
  getActiveConversation: () => Conversation | undefined;
  getConversationsForWallet: (address?: string) => Conversation[];
  setSelectedModelId: (modelId: string | null) => void;
}

type PersistedChatState = Pick<
  ChatState,
  | 'conversations'
  | 'authenticatedAddress'
  | 'guestId'
  | 'hydratedOwnerKey'
  | 'selectedModelId'
>;

const chatPersistStorage = createJSONStorage<PersistedChatState>(getPersistStorage);

function generateId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto);
  }

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toTitleSnippet(text: string): string {
  const compact = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return 'New conversation';
  return compact.length > 56 ? `${compact.slice(0, 56).trim()}…` : compact;
}

function normalizeGreeting(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[!！。,.?？\s]/g, '');
}

function isGenericGreeting(value: string): boolean {
  const normalized = normalizeGreeting(value);
  if (!normalized) return false;
  return (
    normalized === 'hi' ||
    normalized === 'hello' ||
    normalized === 'hey' ||
    normalized === 'yo' ||
    normalized === 'gm' ||
    normalized === 'gn' ||
    normalized === '你好' ||
    normalized === '您好' ||
    normalized === '嗨' ||
    normalized === '哈喽'
  );
}

function generateTitle(messages: StoredMessage[]): string {
  const firstUserMsg = messages.find((m) => m.role === 'user');
  const userText = firstUserMsg?.content ?? '';
  if (userText && !isGenericGreeting(userText)) {
    return toTitleSnippet(userText);
  }
  return 'New conversation';
}

function generateGuestId(): string {
  return `guest_${generateId()}`;
}

export const useChatStore = create<ChatState>()(
  persist<ChatState, [], [], PersistedChatState>(
    (set, get) => ({
      conversations: [],
      activeConversationId: readActiveConversationIdFromSession(),
      draftConversation: null,
      sidebarOpen: false,
      searchOpen: false,
      selectedModelId: null,
      guestId: generateGuestId(),
      hydratedOwnerKey: null,
      hasHydrated: false,
            sharedViewConversation: null,
      authenticatedAddress: null,

      setHasHydrated: (hydrated) =>
        set((s) => (s.hasHydrated === hydrated ? s : { hasHydrated: hydrated })),

      setAuthenticatedAddress: (address) =>
        set((s) =>
          s.authenticatedAddress === address ? s : { authenticatedAddress: address }
        ),

      clearWalletConversations: (walletAddress) =>
        set((s) => {
          const normalizedAddress = walletAddress?.toLowerCase() ?? null;
          const nextConversations = s.conversations.filter((conversation) => {
            if (conversation.scope !== 'wallet') return true;
            if (!normalizedAddress) return false;
            return conversation.walletAddress?.toLowerCase() !== normalizedAddress;
          });
          if (nextConversations.length === s.conversations.length) return s;

          const hasActiveConversation =
            s.activeConversationId !== null &&
            nextConversations.some((conversation) => conversation.id === s.activeConversationId);
          const nextActiveConversationId = hasActiveConversation ? s.activeConversationId : null;
          const shouldResetHydratedOwner =
            normalizedAddress !== null
              ? s.hydratedOwnerKey === `wallet:${normalizedAddress}`
              : Boolean(s.hydratedOwnerKey?.startsWith('wallet:'));
          const currentDraftWalletAddress =
            s.draftConversation?.walletAddress?.toLowerCase();
          const shouldClearDraftWallet =
            !!currentDraftWalletAddress &&
            (!normalizedAddress || currentDraftWalletAddress === normalizedAddress);
          const nextDraftConversation = shouldClearDraftWallet
            ? { draftId: generateId() }
            : s.draftConversation;

          return {
            conversations: nextConversations,
            activeConversationId: nextActiveConversationId,
            draftConversation: hasActiveConversation
              ? nextDraftConversation
              : (nextDraftConversation ?? { draftId: generateId() }),
            hydratedOwnerKey: shouldResetHydratedOwner ? null : s.hydratedOwnerKey,
          };
        }),

      toggleSidebar: () =>
        set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      setSidebarOpen: (open) =>
        set((s) => (s.sidebarOpen === open ? s : { sidebarOpen: open })),

      setSearchOpen: (open) =>
        set((s) => (s.searchOpen === open ? s : { searchOpen: open })),

      setSelectedModelId: (modelId) =>
        set((state) => {
          const normalized = modelId?.trim() ? modelId.trim() : null;
          if (state.selectedModelId === normalized) return state;
          return {
            selectedModelId: normalized,
          };
        }),

      startDraftConversation: (walletAddress) =>
        set(() => {
          const normalizedWalletAddress = walletAddress?.trim() ? walletAddress : undefined;
          return {
            activeConversationId: null,
            draftConversation: {
              walletAddress: normalizedWalletAddress,
              draftId: generateId(),
            },
          };
        }),

      createConversation: (walletAddress, preferredId, initialTitle) => {
        const id = preferredId?.trim() ? preferredId : generateId();
        const existing = get().conversations.find((conversation) => conversation.id === id);
        if (existing) {
          set((s) => {
            if (s.activeConversationId === id && s.draftConversation === null) return s;
            return {
              activeConversationId: id,
              draftConversation: null,
            };
          });
          return id;
        }
        const now = Date.now();
        const scope: ConversationScope = walletAddress ? 'wallet' : 'guest';
        const conversation: Conversation = {
          id,
          title: initialTitle?.trim() ? toTitleSnippet(initialTitle) : 'New conversation',
          messages: [],
          walletAddress,
          isStarred: false,
          isShared: false,
          sharedAt: undefined,
          shareToken: undefined,
          shareExpiresAt: undefined,
          forkedFromShareToken: undefined,
          scope,
          contextInjectionStatus: scope === 'wallet' ? 'pending' : 'not_injected',
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({
          conversations: [conversation, ...s.conversations],
          activeConversationId: id,
          draftConversation: null,
        }));
        return id;
      },

      setActiveConversation: (id) =>
        set((s) => {
          const unchanged =
            s.activeConversationId === id && s.draftConversation === null;
          if (unchanged) return s;
          return { activeConversationId: id, draftConversation: null };
        }),

      deleteConversation: (id) =>
        set((s) => {
          const filtered = s.conversations.filter((c) => c.id !== id);
          if (s.activeConversationId !== id) {
            return { conversations: filtered };
          }
          const draftWalletAddress = s.authenticatedAddress ?? undefined;
          return {
            conversations: filtered,
            activeConversationId: null,
            draftConversation:
              s.draftConversation ?? {
                walletAddress: draftWalletAddress,
                draftId: generateId(),
              },
          };
        }),

      updateConversationTitle: (id, title) =>
        set((s) => {
          const result = updateConversationById(s.conversations, id, (current) => {
            if (current.title === title) return current;
            return { ...current, title };
          });
          return result.changed ? { conversations: result.conversations } : s;
        }),

      toggleConversationStarred: (id) =>
        set((s) => {
          const now = Date.now();
          const result = updateConversationById(s.conversations, id, (current) => ({
            ...current,
            isStarred: !current.isStarred,
            updatedAt: now,
          }));
          return result.changed ? { conversations: result.conversations } : s;
        }),

      toggleConversationShared: (id) =>
        set((s) => {
          const now = Date.now();
          const result = updateConversationById(s.conversations, id, (current) => {
            const nextShared = !current.isShared;
            return {
              ...current,
              isShared: nextShared,
              sharedAt: nextShared ? now : undefined,
              shareToken: nextShared ? current.shareToken ?? generateId() : undefined,
              shareExpiresAt: nextShared ? current.shareExpiresAt : undefined,
              updatedAt: now,
            };
          });
          return result.changed ? { conversations: result.conversations } : s;
        }),

      setConversationShareState: (id, share) =>
        set((s) => {
          const now = Date.now();
          const result = updateConversationById(s.conversations, id, (current) => {
            const nextToken = share.shareToken?.trim() || undefined;
            const nextSharedAt =
              typeof share.sharedAt === 'number' && Number.isFinite(share.sharedAt)
                ? share.sharedAt
                : share.isShared
                  ? current.sharedAt ?? now
                  : undefined;
            const nextShareExpiresAt =
              typeof share.shareExpiresAt === 'number' &&
              Number.isFinite(share.shareExpiresAt)
                ? share.shareExpiresAt
                : undefined;
            const unchanged =
              current.isShared === share.isShared &&
              current.shareToken === nextToken &&
              current.sharedAt === nextSharedAt &&
              current.shareExpiresAt === nextShareExpiresAt;
            if (unchanged) return current;
            return {
              ...current,
              isShared: share.isShared,
              shareToken: nextToken,
              sharedAt: nextSharedAt,
              shareExpiresAt: nextShareExpiresAt,
              updatedAt: now,
            };
          });
          return result.changed ? { conversations: result.conversations } : s;
        }),

      setConversationForkSource: (id, shareToken) =>
        set((s) => {
          const normalizedToken = shareToken?.trim() || undefined;
          const result = updateConversationById(s.conversations, id, (current) => {
            if (current.forkedFromShareToken === normalizedToken) return current;
            return {
              ...current,
              forkedFromShareToken: normalizedToken,
            };
          });
          return result.changed ? { conversations: result.conversations } : s;
        }),

      updateConversationMessages: (id, messages) =>
        set((s) => {
          const now = Date.now();
          const result = updateConversationById(s.conversations, id, (current) => {
            if (areStoredMessagesEqual(current.messages, messages)) {
              return current;
            }
            const generatedTitle = generateTitle(messages);
            const shouldAutoUpdateTitle =
              messages.length > 0 &&
              (current.title === 'New conversation' || isGenericGreeting(current.title));
            const title = shouldAutoUpdateTitle ? generatedTitle : current.title;
            return { ...current, messages, title, updatedAt: now };
          });
          return result.changed ? { conversations: result.conversations } : s;
        }),

      updateConversationContextStatus: (id, status, fingerprint) =>
        set((s) => {
          const now = Date.now();
          const result = updateConversationById(s.conversations, id, (current) => {
            const nextFingerprint = fingerprint ?? current.contextFingerprint;
            const unchanged =
              current.contextInjectionStatus === status &&
              current.contextFingerprint === nextFingerprint;
            if (unchanged) return current;
            return {
              ...current,
              contextInjectionStatus: status,
              contextFingerprint: nextFingerprint,
              contextInjectedAt: status === 'injected' ? now : current.contextInjectedAt,
              updatedAt: now,
            };
          });
          return result.changed ? { conversations: result.conversations } : s;
        }),

      ensureWalletConversation: (walletAddress) => {
        const { conversations } = get();
        const normalized = walletAddress.toLowerCase();
        let existing: Conversation | undefined;
        for (const conversation of conversations) {
          if (
            conversation.scope === 'wallet' &&
            conversation.walletAddress?.toLowerCase() === normalized &&
            (!existing || conversation.updatedAt > existing.updatedAt)
          ) {
            existing = conversation;
          }
        }

        if (existing) {
          set((s) => {
            const result = updateConversationById(s.conversations, existing.id, (current) => {
              const nextStatus =
                current.contextInjectionStatus === 'injected'
                  ? 'stale'
                  : current.contextInjectionStatus === 'not_injected'
                    ? 'pending'
                    : current.contextInjectionStatus;
              if (nextStatus === current.contextInjectionStatus) return current;
              return {
                ...current,
                contextInjectionStatus: nextStatus,
              };
            });
            if (!result.changed && s.activeConversationId === existing.id) {
              return s;
            }
            return {
              conversations: result.conversations,
              activeConversationId: existing.id,
              draftConversation: null,
            };
          });
          return existing.id;
        }

        return get().createConversation(walletAddress);
      },

      hydrateFromRemote: (ownerKey, remoteConversations) =>
        set((s) => {
          const owner = parseOwnerKey(ownerKey);
          if (!owner) {
            return {
              hydratedOwnerKey: ownerKey,
            };
          }
          const retained: Conversation[] = [];
          const localOwned: Conversation[] = [];
          for (const conversation of s.conversations) {
            if (isConversationOwnedBy(conversation, owner)) {
              localOwned.push(conversation);
            } else {
              retained.push(conversation);
            }
          }
          const remoteMap = new Map(remoteConversations.map((c) => [c.id, c]));
          for (const local of localOwned) {
            const remote = remoteMap.get(local.id);
            if (!remote || local.updatedAt > remote.updatedAt) {
              remoteMap.set(local.id, local);
            }
          }
          const ownerConversations = Array.from(remoteMap.values()).sort(
            (a, b) => b.updatedAt - a.updatedAt
          );
          const merged = [...ownerConversations, ...retained].sort(
            (a, b) => b.updatedAt - a.updatedAt
          );
          const ownerConversationIds = new Set(ownerConversations.map((c) => c.id));
          const shouldKeepActive =
            !!s.activeConversationId &&
            (ownerConversationIds.has(s.activeConversationId) ||
              retained.some((conversation) => conversation.id === s.activeConversationId));
          const nextActive = shouldKeepActive ? s.activeConversationId : null;
          const desiredDraftWalletAddress =
            owner.ownerType === 'wallet' ? owner.ownerId : undefined;
          const currentDraftWalletAddress = s.draftConversation?.walletAddress?.toLowerCase();
          const shouldKeepDraft =
            !!s.draftConversation &&
            currentDraftWalletAddress === desiredDraftWalletAddress;
          return {
            conversations: merged,
            activeConversationId: nextActive,
            draftConversation:
              nextActive !== null
                ? null
                : shouldKeepDraft
                  ? s.draftConversation
                  : {
                      walletAddress: desiredDraftWalletAddress,
                      draftId: generateId(),
                    },
            hydratedOwnerKey: ownerKey,
          };
        }),

      markHydratedOwner: (ownerKey) => set({ hydratedOwnerKey: ownerKey }),

      setSharedViewConversation: (view) =>
        set((state) => {
          const normalized =
            view && view.token.trim() && view.title.trim()
              ? { token: view.token.trim(), title: view.title.trim() }
              : null;
          const unchanged =
            state.sharedViewConversation?.token === normalized?.token &&
            state.sharedViewConversation?.title === normalized?.title;
          if (unchanged) return state;
          return {
            sharedViewConversation: normalized,
          };
        }),

      getActiveConversation: () => {
        const { conversations, activeConversationId } = get();
        return conversations.find((c) => c.id === activeConversationId);
      },

      getConversationsForWallet: (address) => {
        const { conversations } = get();
        if (!address) return conversations;
        return conversations.filter(
          (c) => !c.walletAddress || c.walletAddress.toLowerCase() === address.toLowerCase()
        );
      },
    }),
    {
      name: 'bnbrain-chats',
      storage: chatPersistStorage,
      version: 8,
      migrate: (persistedState: unknown, _version: number): PersistedChatState => {
        void _version;
        if (!persistedState || typeof persistedState !== 'object') {
          return {} as PersistedChatState;
        }
        const stateObj = persistedState as Record<string, unknown>;
        const rawConversations = Array.isArray(stateObj.conversations)
          ? stateObj.conversations
          : [];
        const conversations = rawConversations.map((raw) => {
              const c =
                raw && typeof raw === 'object'
                  ? (raw as Record<string, unknown>)
                  : ({} as Record<string, unknown>);
              const scope: ConversationScope =
                (c.scope as ConversationScope | undefined) ??
                (c.walletAddress ? 'wallet' : 'guest');
              const contextInjectionStatus: ContextInjectionStatus =
                (c.contextInjectionStatus as ContextInjectionStatus | undefined) ??
                (scope === 'wallet' ? 'pending' : 'not_injected');
              return {
                ...c,
                isStarred: Boolean(c.isStarred),
                isShared: Boolean(c.isShared),
                sharedAt:
                  typeof c.sharedAt === 'number' && Number.isFinite(c.sharedAt)
                    ? c.sharedAt
                    : undefined,
                shareToken:
                  typeof c.shareToken === 'string' && c.shareToken.trim()
                    ? c.shareToken
                    : undefined,
                shareExpiresAt:
                  typeof c.shareExpiresAt === 'number' &&
                  Number.isFinite(c.shareExpiresAt)
                    ? c.shareExpiresAt
                    : undefined,
                forkedFromShareToken:
                  typeof c.forkedFromShareToken === 'string' &&
                  c.forkedFromShareToken.trim()
                    ? c.forkedFromShareToken
                    : undefined,
                scope,
                contextInjectionStatus,
              };
            });
        return {
          ...stateObj,
          conversations: conversations as unknown as Conversation[],
          authenticatedAddress:
            typeof stateObj.authenticatedAddress === 'string'
              ? stateObj.authenticatedAddress
              : null,
          guestId:
            typeof stateObj.guestId === 'string' && stateObj.guestId
              ? stateObj.guestId
              : generateGuestId(),
          hydratedOwnerKey:
            typeof stateObj.hydratedOwnerKey === 'string'
              ? stateObj.hydratedOwnerKey
              : null,
          selectedModelId:
            typeof stateObj.selectedModelId === 'string' &&
            stateObj.selectedModelId.trim()
              ? stateObj.selectedModelId.trim()
              : null,
        } as PersistedChatState;
      },
      partialize: (state) => ({
        conversations: state.conversations,
        authenticatedAddress: state.authenticatedAddress,
        guestId: state.guestId,
        hydratedOwnerKey: state.hydratedOwnerKey,
        selectedModelId: state.selectedModelId,
      }),
      onRehydrateStorage: () => (state, error) => {
        void error;
        if (state) {
          // Validate that the session-restored activeConversationId still exists
          const sessionId = state.activeConversationId;
          if (sessionId && !state.conversations.some((c) => c.id === sessionId)) {
            state.activeConversationId = null;
          }
          state.setHasHydrated(true);
          return;
        }
        useChatStore.setState({ hasHydrated: true });
      },
    }
  )
);

let lastSyncedActiveConversationId = readActiveConversationIdFromSession();
if (typeof window !== 'undefined') {
  useChatStore.subscribe((state) => {
    if (state.activeConversationId === lastSyncedActiveConversationId) return;
    lastSyncedActiveConversationId = state.activeConversationId;
    writeActiveConversationIdToSession(state.activeConversationId);
  });
}
