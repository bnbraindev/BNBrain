'use client';

import {
  Shield, PanelLeftClose, PanelLeft, SquarePen,
  MessageSquare, FolderGit2,
  Star, Clock, Settings,
} from 'lucide-react';
import type { StandaloneChat } from './types';

type NavItem = 'chats' | 'projects';

/**
 * Claude-style app sidebar.
 *
 * - Top: BNBrain logo + collapse toggle
 * - New Chat button
 * - Nav: Chats / Projects
 * - Starred section (clickable)
 * - Recents section (clickable)
 * - Bottom: wallet
 */
export function AppSidebar({
  activeNav,
  onNavChange,
  onNewChat,
  recentChats,
  starredItems,
  collapsed,
  onToggleCollapse,
  activeItemId,
  onSelectStarred,
  onSelectRecent,
}: {
  activeNav: NavItem;
  onNavChange: (nav: NavItem) => void;
  onNewChat: () => void;
  recentChats: StandaloneChat[];
  starredItems: { id: string; title: string; type: 'chat' | 'project' }[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeItemId?: string | null;
  onSelectStarred?: (id: string, type: 'chat' | 'project') => void;
  onSelectRecent?: (id: string) => void;
}) {
  return (
    <div
      className={`flex h-full shrink-0 flex-col border-r border-border/50 bg-sidebar/80 backdrop-blur-sm transition-all duration-200 ${
        collapsed ? 'w-[52px]' : 'w-[260px]'
      }`}
    >
      {/* ─── Header: Logo + Collapse ─── */}
      <div className={`flex shrink-0 items-center border-b border-border/40 ${collapsed ? 'justify-center px-0 py-3' : 'justify-between px-3 py-3'}`}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/15">
              <Shield className="size-4 text-primary" />
            </div>
            <span className="text-sm font-bold text-foreground">BNBrain</span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      {/* ─── New Chat Button ─── */}
      <div className={`shrink-0 ${collapsed ? 'px-1.5 py-2' : 'px-3 py-2'}`}>
        <button
          onClick={onNewChat}
          className={`flex w-full items-center rounded-lg border border-border/60 text-sm font-medium text-foreground transition-all hover:bg-accent active:scale-[0.98] ${
            collapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2'
          }`}
          title="New chat"
        >
          <SquarePen className="size-4 shrink-0" />
          {!collapsed && <span>New chat</span>}
        </button>
      </div>

      {/* ─── Navigation ─── */}
      <div className={`shrink-0 ${collapsed ? 'px-1.5' : 'px-3'} pb-1`}>
        {([
          { key: 'chats' as NavItem, icon: MessageSquare, label: 'Chats' },
          { key: 'projects' as NavItem, icon: FolderGit2, label: 'Projects' },
        ]).map((item) => (
          <button
            key={item.key}
            onClick={() => onNavChange(item.key)}
            className={`flex w-full items-center rounded-lg text-sm transition-colors ${
              collapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-1.5'
            } ${
              activeNav === item.key
                ? 'bg-accent font-medium text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
            title={item.label}
          >
            <item.icon className="size-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </div>

      {/* ─── Scrollable: Starred + Recents ─── */}
      <div className="flex-1 overflow-y-auto">
        {/* Starred */}
        {starredItems.length > 0 && (
          <div className={`${collapsed ? 'px-1.5' : 'px-3'} pb-2 pt-3`}>
            {!collapsed && (
              <div className="mb-1.5 flex items-center gap-1.5 px-2">
                <Star className="size-3 text-amber-400/70" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Starred</span>
              </div>
            )}
            {collapsed && (
              <div className="mb-1 flex justify-center">
                <Star className="size-3 text-amber-400/60" />
              </div>
            )}
            {starredItems.map((item) => {
              const isActive = activeItemId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectStarred?.(item.id, item.type)}
                  className={`flex w-full items-center rounded-md text-left transition-colors ${
                    collapsed ? 'justify-center p-1.5' : 'gap-2 px-2 py-1.5'
                  } ${isActive ? 'bg-accent text-foreground' : 'hover:bg-accent/50'}`}
                  title={item.title}
                >
                  {item.type === 'project' ? (
                    <FolderGit2 className={`size-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  ) : (
                    <MessageSquare className={`size-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  )}
                  {!collapsed && (
                    <span className={`truncate text-xs ${isActive ? 'font-medium text-foreground' : 'text-foreground/80'}`}>{item.title}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Recents */}
        {recentChats.length > 0 && (
          <div className={`${collapsed ? 'px-1.5' : 'px-3'} pb-2 pt-1`}>
            {!collapsed && (
              <div className="mb-1.5 flex items-center gap-1.5 px-2">
                <Clock className="size-3 text-muted-foreground/50" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Recents</span>
              </div>
            )}
            {collapsed && (
              <div className="mb-1 flex justify-center">
                <Clock className="size-3 text-muted-foreground/50" />
              </div>
            )}
            {recentChats.map((chat) => {
              const isActive = activeItemId === chat.id;
              return (
                <button
                  key={chat.id}
                  onClick={() => onSelectRecent?.(chat.id)}
                  className={`flex w-full items-center rounded-md text-left transition-colors ${
                    collapsed ? 'justify-center p-1.5' : 'gap-2 px-2 py-1.5'
                  } ${isActive ? 'bg-accent text-foreground' : 'hover:bg-accent/50'}`}
                  title={chat.title}
                >
                  <MessageSquare className={`size-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground/60'}`} />
                  {!collapsed && (
                    <span className={`truncate text-xs ${isActive ? 'font-medium text-foreground' : 'text-foreground/70'}`}>{chat.title}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Footer: Wallet ─── */}
      <div className={`shrink-0 border-t border-border/40 ${collapsed ? 'px-1.5 py-2.5' : 'px-3 py-2.5'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2'}`}>
          <div className="size-6 shrink-0 rounded-full bg-gradient-to-br from-primary/30 to-primary/10" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[11px] font-medium text-foreground">0x742d...4E28</p>
              <p className="text-[9px] text-muted-foreground">BSC Mainnet</p>
            </div>
          )}
          {!collapsed && (
            <button className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground">
              <Settings className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
