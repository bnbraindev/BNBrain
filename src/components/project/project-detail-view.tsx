'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ArrowLeft, MessageSquare, FileText, FileCode, Code,
  Loader2, FolderOpen, Send,
} from 'lucide-react';
import { useProjectStore } from '@/lib/stores/project-store';
import { useChatStore } from '@/lib/stores/chat-store';
import {
  PROJECT_TYPE_META, StatusBadge, TypeBadge,
} from '@/components/project/ui';
import { FileViewerModal } from '@/components/project/file-viewer-modal';
import { getProjectFile } from '@/lib/services/project-api';
import type { ProjectFile } from '@/components/project/types';
import { useI18n } from '@/lib/i18n/context';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const { locale } = useI18n();
  const {
    activeProjectDetail,
    activeProjectLoading,
    navigateToProjectsGrid,
    navigateToChat,
  } = useProjectStore(
    useShallow((s) => ({
      activeProjectDetail: s.activeProjectDetail,
      activeProjectLoading: s.activeProjectLoading,
      navigateToProjectsGrid: s.navigateToProjectsGrid,
      navigateToChat: s.navigateToChat,
    }))
  );

  const { setActiveConversation, startDraftConversation, authenticatedAddress } = useChatStore(
    useShallow((s) => ({
      setActiveConversation: s.setActiveConversation,
      startDraftConversation: s.startDraftConversation,
      authenticatedAddress: s.authenticatedAddress,
    }))
  );

  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // File viewer modal state
  const [viewerFile, setViewerFile] = useState<ProjectFile | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  // Reset when project changes
  useEffect(() => {
    setInputValue('');
    setViewerFile(null);
  }, [projectId]);

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      setActiveConversation(conversationId);
      navigateToChat();
    },
    [setActiveConversation, navigateToChat]
  );

  const handleSubmitMessage = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;
    // Store the pending message, set project context, navigate to chat
    useProjectStore.getState().setActiveProject(projectId);
    useProjectStore.setState({ pendingProjectMessage: text });
    startDraftConversation(authenticatedAddress ?? undefined);
    navigateToChat();
  }, [inputValue, projectId, startDraftConversation, authenticatedAddress, navigateToChat]);

  const handleOpenFile = useCallback(
    async (path: string) => {
      setViewerLoading(true);
      try {
        const apiFile = await getProjectFile(projectId, path);
        // Convert ApiProjectFile → ProjectFile shape for FileViewerModal
        const pf: ProjectFile = {
          id: apiFile.id,
          projectId: apiFile.projectId,
          path: apiFile.path,
          content: apiFile.content ?? '',
          contentType: apiFile.contentType,
          language: apiFile.contentType === 'application/json'
            ? 'json'
            : apiFile.path.endsWith('.sol')
              ? 'solidity'
              : apiFile.path.endsWith('.md')
                ? 'markdown'
                : undefined,
          updatedBy: apiFile.updatedBy,
          version: apiFile.version,
          sizeBytes: apiFile.sizeBytes,
          createdAt: apiFile.createdAt ? new Date(apiFile.createdAt).toISOString() : undefined,
          updatedAt: apiFile.updatedAt ? new Date(apiFile.updatedAt).toISOString() : undefined,
        };
        setViewerFile(pf);
      } catch {
        // Silently fail
      } finally {
        setViewerLoading(false);
      }
    },
    [projectId]
  );

  function formatRelativeTime(epochMs: number): string {
    const diff = Date.now() - epochMs;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return locale === 'zh' ? '刚刚' : 'Just now';
    if (mins < 60) return locale === 'zh' ? `${mins} 分钟前` : `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return locale === 'zh' ? `${hrs} 小时前` : `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return locale === 'zh' ? `${days} 天前` : `${days}d ago`;
    return new Date(epochMs).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US');
  }

  // Loading
  if (activeProjectLoading && !activeProjectDetail) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeProjectDetail) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <FolderOpen className="size-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          {locale === 'zh' ? '项目未找到' : 'Project not found'}
        </p>
        <button
          onClick={navigateToProjectsGrid}
          className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
        >
          {locale === 'zh' ? '返回项目列表' : 'Back to projects'}
        </button>
      </div>
    );
  }

  const { project, files, conversations } = activeProjectDetail;
  const meta = PROJECT_TYPE_META[project.projectType];
  const Icon = meta.icon;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 px-6 pt-14 pb-4 sm:px-8 sm:pt-16">
        <div className="mx-auto max-w-5xl">
          <button
            onClick={navigateToProjectsGrid}
            className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {locale === 'zh' ? '所有项目' : 'All projects'}
          </button>

          <div className="flex items-center gap-3">
            <div className={cn('flex size-10 items-center justify-center rounded-xl border', meta.bgColor)}>
              <Icon className={cn('size-5', meta.color)} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-foreground">{project.name}</h1>
                <StatusBadge status={project.status} />
                <TypeBadge type={project.projectType} />
              </div>
              {project.description && (
                <p className="mt-0.5 text-xs text-muted-foreground">{project.description}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-8">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column: input + conversations (2/3) */}
          <div className="lg:col-span-2">
            {/* New chat input */}
            <div className="mb-5">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-4 py-3 transition-colors focus-within:border-primary/40 focus-within:bg-card/80">
                <MessageSquare className="size-4 shrink-0 text-muted-foreground/60" />
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmitMessage();
                    }
                  }}
                  placeholder={locale === 'zh' ? '开始新对话...' : 'Start a new conversation...'}
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
                />
                <button
                  type="button"
                  onClick={handleSubmitMessage}
                  disabled={!inputValue.trim()}
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:brightness-105 disabled:opacity-30 disabled:hover:brightness-100"
                >
                  <Send className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Conversations */}
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageSquare className="size-3.5" />
              {locale === 'zh' ? '对话' : 'Conversations'}
              {conversations.length > 0 && (
                <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {conversations.length}
                </span>
              )}
            </h2>

            {conversations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <MessageSquare className="size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {locale === 'zh' ? '暂无对话' : 'No conversations yet'}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  {locale === 'zh' ? '在上方输入开始你的第一个对话' : 'Type above to start your first conversation'}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {conversations.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectConversation(c.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border/50 bg-card/30 px-4 py-3 text-left transition-all hover:border-border hover:bg-card/60"
                  >
                    <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{c.title}</p>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatRelativeTime(c.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right column: files card (1/3) */}
          <div className="lg:col-span-1">
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileText className="size-3.5" />
                {locale === 'zh' ? '文件' : 'Files'}
                {files.length > 0 && (
                  <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {files.length}
                  </span>
                )}
              </h2>

              {files.length === 0 ? (
                <div className="py-6 text-center">
                  <FileText className="mx-auto mb-2 size-6 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">
                    {locale === 'zh' ? '暂无文件' : 'No files yet'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {files.map((f) => {
                    const FileIcon = f.contentType === 'application/json' ? Code : f.path.endsWith('.sol') ? FileCode : FileText;
                    return (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => handleOpenFile(f.path)}
                        disabled={viewerLoading}
                        className="flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left transition-all hover:border-border/50 hover:bg-accent/60"
                      >
                        <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">{f.path}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>v{f.version}</span>
                            <span>{formatBytes(f.sizeBytes)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* File viewer modal */}
      {viewerFile && (
        <FileViewerModal
          file={viewerFile}
          onClose={() => setViewerFile(null)}
          onSave={() => {}}
          onDelete={() => {}}
        />
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
