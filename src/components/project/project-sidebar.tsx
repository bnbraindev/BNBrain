'use client';

import {
  Shield, Plus, FolderGit2, MessageSquare, ArrowLeft, BookOpen,
  Settings, FileText,
} from 'lucide-react';
import type { Project, StandaloneChat, SidebarTab, MockView } from './types';
import { PROJECT_TYPE_META, StatusBadge, TimeAgo, ShortUrl } from './ui';

/**
 * Enhanced sidebar with Projects / Chats tab toggle.
 * When inside a project, shows project navigation (overview, conversations, new chat).
 *
 * Spec ref: §2.1 — Projects vs Chats user entry points
 */
export function ProjectSidebar({
  tab,
  onTabChange,
  projects,
  chats,
  activeProjectId,
  view,
  onSelectProject,
  onNewProject,
  onSelectChat,
  onStartProjectChat,
  onBackToList,
  onOpenContract,
}: {
  tab: SidebarTab;
  onTabChange: (t: SidebarTab) => void;
  projects: Project[];
  chats: StandaloneChat[];
  activeProjectId: string | null;
  view: MockView;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onSelectChat: (id: string) => void;
  onStartProjectChat: () => void;
  onBackToList: () => void;
  onOpenContract: (id: string) => void;
}) {
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const insideProject = (view === 'detail' || view === 'project-chat' || view === 'contract-page') && activeProject;

  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-sidebar/80 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/15">
          <Shield className="size-4 text-primary" />
        </div>
        <span className="text-sm font-bold text-foreground">BNBrain</span>
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">PRO</span>
      </div>

      {/* Back button when inside a project */}
      {insideProject && (
        <button
          onClick={onBackToList}
          className="flex items-center gap-1.5 border-b border-border/50 px-4 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          All Projects
        </button>
      )}

      {/* Tab toggle (only on home view) */}
      {view === 'home' && (
        <div className="border-b border-border/50 px-3 py-2">
          <div className="flex rounded-lg bg-muted/30 p-0.5">
            {(['projects', 'chats'] as SidebarTab[]).map((t) => (
              <button
                key={t}
                onClick={() => onTabChange(t)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'projects' ? <FolderGit2 className="size-3.5" /> : <MessageSquare className="size-3.5" />}
                {t === 'projects' ? 'Projects' : 'Chats'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Home → Projects list */}
        {view === 'home' && tab === 'projects' && (
          <div className="p-2">
            <button
              onClick={onNewProject}
              className="mb-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            >
              <Plus className="size-3.5" /> New Project
            </button>
            {projects.map((p) => {
              const meta = PROJECT_TYPE_META[p.projectType];
              const Icon = meta.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => onSelectProject(p.id)}
                  className={`mb-1 flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent ${
                    activeProjectId === p.id ? 'bg-accent' : ''
                  }`}
                >
                  <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border ${meta.bgColor}`}>
                    <Icon className={`size-3.5 ${meta.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                      <StatusBadge status={p.status} />
                    </div>
                    <p className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <FileText className="size-2.5" />{p.files.length}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <MessageSquare className="size-2.5" />{p.conversations.length}
                      </span>
                      <TimeAgo date={p.updatedAt} />
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Home → Chats list */}
        {view === 'home' && tab === 'chats' && (
          <div className="p-2">
            {chats.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectChat(c.id)}
                className="mb-1 flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
              >
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card/50">
                  <MessageSquare className="size-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{c.title}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{c.preview}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Inside project: navigation */}
        {insideProject && activeProject && (
          <div className="p-2">
            <div className="mb-3 px-2">
              <p className="text-sm font-semibold text-foreground">{activeProject.name}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <StatusBadge status={activeProject.status} />
              </div>
              {activeProject.primaryContractAddress && (
                <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                  <ShortUrl shortId={activeProject.shortId} onClick={() => onOpenContract(activeProject.id)} />
                </div>
              )}
            </div>
            <div className="space-y-0.5">
              <button
                onClick={() => onSelectProject(activeProject.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors hover:bg-accent ${
                  view === 'detail' ? 'bg-accent text-foreground' : 'text-muted-foreground'
                }`}
              >
                <BookOpen className="size-3.5" /> Overview
              </button>
              {activeProject.primaryContractAddress && (
                <button
                  onClick={() => onOpenContract(activeProject.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors hover:bg-accent ${
                    view === 'contract-page' ? 'bg-accent text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <FolderGit2 className="size-3.5" /> Contract /x/{activeProject.shortId}
                </button>
              )}
              <div className="my-1.5 h-px bg-border/30" />
              <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Conversations</p>
              {activeProject.conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelectChat(c.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent"
                >
                  <MessageSquare className="size-3" />
                  <span className="truncate">{c.title}</span>
                </button>
              ))}
              <button
                onClick={onStartProjectChat}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-primary/70 transition-colors hover:bg-primary/5 hover:text-primary"
              >
                <Plus className="size-3" /> New Chat
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border/50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-full bg-primary/20" />
          <div className="flex-1">
            <p className="text-[11px] font-medium text-foreground">0x742d...4E28</p>
            <p className="text-[9px] text-muted-foreground">BSC Mainnet</p>
          </div>
          <Settings className="size-3.5 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
