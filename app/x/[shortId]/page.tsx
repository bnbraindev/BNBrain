'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, ExternalLink, FileCode, BookOpen, MessageSquare,
  FileText, Plus, Loader2, AlertTriangle, Code,
} from 'lucide-react';
import {
  StatusBadge, TypeBadge, ChainBadge, TruncatedAddress,
  CopyBtn, PROJECT_TYPE_META,
} from '@/components/project/ui';
import type { DetailTab } from '@/components/project/types';
import {
  getProjectFile,
  type ApiProject,
  type ApiProjectFile,
  type ApiConversationRef,
  type OwnerIdentity,
} from '@/lib/services/project-api';
import { useChatStore } from '@/lib/stores/chat-store';
import { useProjectStore } from '@/lib/stores/project-store';

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; project: ApiProject; files: ApiProjectFile[]; conversations: ApiConversationRef[]; isOwner: boolean };

export default function ProjectManagementPage() {
  const params = useParams<{ shortId: string }>();
  const shortId = params.shortId;
  const [state, setState] = useState<PageState>({ status: 'loading' });
  const [tab, setTab] = useState<DetailTab>('overview');
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [memoryContent, setMemoryContent] = useState<string | null>(null);

  const authenticatedAddress = useChatStore((s) => s.authenticatedAddress);
  const guestId = useChatStore((s) => s.guestId);

  // Fetch project by shortId — uses server-side lookup
  useEffect(() => {
    if (!shortId) return;
    let cancelled = false;

    async function load() {
      try {
        // Try with auth first, then without (public access for read-only)
        const owner: OwnerIdentity = authenticatedAddress
          ? { ownerType: 'wallet', ownerId: authenticatedAddress.toLowerCase() }
          : { ownerType: 'guest', ownerId: guestId };

        const res = await fetch(
          `/api/projects/by-short-id/${encodeURIComponent(shortId)}?ownerType=${encodeURIComponent(owner.ownerType)}&ownerId=${encodeURIComponent(owner.ownerId)}`
        );

        if (!res.ok) {
          if (res.status === 404) {
            setState({ status: 'error', message: 'Project not found' });
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (cancelled) return;

        setState({
          status: 'ready',
          project: data.project,
          files: data.files ?? [],
          conversations: data.conversations ?? [],
          isOwner: !!data.isOwner,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to load project',
        });
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [shortId, authenticatedAddress, guestId]);

  // Load memory.md content
  const readyProjectId = state.status === 'ready' ? state.project.id : null;
  useEffect(() => {
    if (!readyProjectId) return;
    let cancelled = false;

    async function loadMemory() {
      try {
        const file = await getProjectFile(readyProjectId!, 'memory.md');
        if (!cancelled) setMemoryContent(file.content ?? '');
      } catch {
        if (!cancelled) setMemoryContent(null);
      }
    }

    void loadMemory();
    return () => { cancelled = true; };
  }, [readyProjectId]);

  // Load a file's content
  const handleSelectFile = useCallback(
    async (path: string) => {
      if (state.status !== 'ready') return;
      setActiveFilePath(path);
      if (path === 'memory.md' && memoryContent !== null) {
        setFileContent(memoryContent);
        return;
      }
      setFileLoading(true);
      try {
        const file = await getProjectFile(state.project.id, path);
        setFileContent(file.content ?? '');
      } catch {
        setFileContent('// Failed to load file content');
      } finally {
        setFileLoading(false);
      }
    },
    [state, memoryContent]
  );

  const handleStartChat = useCallback(() => {
    if (state.status !== 'ready') return;
    // Set activeProjectId so the new conversation picks up the project context
    useProjectStore.getState().setActiveProject(state.project.id);
    window.location.href = '/';
  }, [state]);

  // ── Loading state ──
  if (state.status === 'loading') {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Error state ──
  if (state.status === 'error') {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-background">
        <AlertTriangle className="size-10 text-amber-400" />
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <a
          href="/"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:brightness-105"
        >
          Back to home
        </a>
      </div>
    );
  }

  // ── Ready state ──
  const { project, files, conversations, isOwner } = state;
  const meta = PROJECT_TYPE_META[project.projectType];
  const Icon = meta.icon;

  const tabs: { key: DetailTab; label: string; icon: typeof BookOpen; count?: number }[] = [
    { key: 'overview', label: 'Overview', icon: BookOpen },
    { key: 'memory', label: 'Memory', icon: BookOpen },
    { key: 'files', label: 'Files', icon: FileText, count: files.length },
    { key: 'chats', label: 'Conversations', icon: MessageSquare, count: conversations.length },
  ];

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 px-6 py-5">
        <div className="mb-3 flex items-center gap-2">
          <a href="/" className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
          </a>
          <div className="h-4 w-px bg-border/50" />
          <span className="font-mono text-xs text-primary/70">/x/{shortId}</span>
          {!isOwner && (
            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              Read Only
            </span>
          )}
        </div>

        <div className="flex items-start justify-between">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
              <div className={`flex size-9 items-center justify-center rounded-xl border ${meta.bgColor}`}>
                <Icon className={`size-5 ${meta.color}`} />
              </div>
              <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
              <StatusBadge status={project.status} />
              <TypeBadge type={project.projectType} />
              {project.primaryChainId && <ChainBadge chainId={project.primaryChainId} />}
            </div>
            {project.description && (
              <p className="max-w-xl text-sm text-muted-foreground">{project.description}</p>
            )}
            {project.primaryContractAddress && (
              <div className="mt-2 flex items-center gap-3">
                <TruncatedAddress address={project.primaryContractAddress} chars={8} />
                <a
                  href={`https://bscscan.com/address/${project.primaryContractAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-primary/70 transition-colors hover:text-primary"
                >
                  <ExternalLink className="size-3" /> BscScan
                </a>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleStartChat}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-all hover:brightness-105 active:scale-[0.98]"
            >
              <Plus className="size-3.5" /> New Chat
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-3 flex gap-4">
          {[
            { label: 'Files', value: files.length, icon: FileText },
            { label: 'Conversations', value: conversations.length, icon: MessageSquare },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <s.icon className="size-3" />
              <span className="font-medium text-foreground">{s.value}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <t.icon className="size-3.5" />
              {t.label}
              {t.count !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                    tab === t.key ? 'bg-primary/20' : 'bg-muted/50'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* ── Overview Tab ── */}
        {tab === 'overview' && (
          <div className="mx-auto max-w-4xl space-y-5">
            {/* Contract info if deployed */}
            {project.primaryContractAddress ? (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-foreground">Contract</h3>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card/40 p-4">
                  <div className="flex size-9 items-center justify-center rounded-full bg-accent/50">
                    <FileCode className="size-4 text-foreground/60" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{project.name}</span>
                      <StatusBadge status={project.status} />
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <TruncatedAddress address={project.primaryContractAddress} chars={6} />
                      {project.primaryChainId && <ChainBadge chainId={project.primaryChainId} />}
                    </div>
                  </div>
                  <a
                    href={`https://bscscan.com/address/${project.primaryContractAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>

                {/* ABI panels coming soon */}
                <div className="mt-3 rounded-xl border border-dashed border-border bg-card/20 p-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    Read/Write Contract panels — coming soon
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card/20 p-6 text-center">
                <FileCode className="mx-auto mb-2 size-8 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">No contracts deployed yet</p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Start a conversation to deploy your first contract
                </p>
                <button
                  onClick={handleStartChat}
                  className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:brightness-105"
                >
                  Start Building
                </button>
              </div>
            )}

            {/* Memory preview */}
            {memoryContent && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Project Memory</h3>
                  <button
                    onClick={() => setTab('memory')}
                    className="text-[10px] text-primary/70 hover:text-primary"
                  >
                    View full →
                  </button>
                </div>
                <div className="rounded-xl border border-border bg-card/40 p-4">
                  <pre className="line-clamp-[8] whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/70">
                    {memoryContent}
                  </pre>
                </div>
              </div>
            )}

            {/* Recent conversations */}
            {conversations.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Recent Conversations</h3>
                {conversations.slice(0, 3).map((c) => (
                  <div
                    key={c.id}
                    className="mb-1.5 flex items-center gap-3 rounded-lg border border-border/50 bg-card/30 px-4 py-2.5"
                  >
                    <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{c.title}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Memory Tab ── */}
        {tab === 'memory' && (
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen className="size-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">memory.md</span>
              <span className="text-[10px] text-muted-foreground">
                Shared across all conversations
              </span>
            </div>

            {memoryContent !== null ? (
              <>
                {(() => {
                  const tokenEstimate = Math.round(memoryContent.length / 4);
                  const budget = 4000;
                  const pct = Math.min(100, Math.round((tokenEstimate / budget) * 100));
                  return (
                    <div className="mb-3 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>
                        ~{tokenEstimate.toLocaleString()} / {budget.toLocaleString()} tokens
                      </span>
                      <div className="h-1 w-24 rounded-full bg-muted/30">
                        <div
                          className={`h-1 rounded-full transition-all ${pct > 80 ? 'bg-amber-400' : 'bg-primary/60'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {pct > 80 && <span className="text-amber-400">Approaching limit</span>}
                    </div>
                  );
                })()}
                <div className="rounded-xl border border-border bg-card/40 p-5">
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/90">
                    {memoryContent}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        )}

        {/* ── Files Tab ── */}
        {tab === 'files' && (
          <div className="mx-auto max-w-4xl">
            <div className="flex gap-4">
              {/* File tree */}
              <div className="w-[260px] shrink-0 rounded-xl border border-border bg-card/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Files</span>
                </div>
                {files.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">No files yet</p>
                ) : (
                  files.map((f) => {
                    const isActive = activeFilePath === f.path;
                    const FileIcon =
                      f.contentType === 'application/json' ? Code : FileText;
                    return (
                      <button
                        key={f.path}
                        onClick={() => handleSelectFile(f.path)}
                        className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                          isActive
                            ? 'bg-primary/10 text-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}
                      >
                        <FileIcon className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{f.path}</span>
                        <span className="rounded-full border border-muted/20 bg-muted/10 px-1 py-0.5 text-[8px]">
                          v{f.version}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {/* File viewer */}
              <div className="min-w-0 flex-1 rounded-xl border border-border bg-card/40">
                {activeFilePath ? (
                  <>
                    <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <FileCode className="size-3.5 text-primary" />
                        <span className="text-xs font-medium text-foreground">
                          {activeFilePath}
                        </span>
                      </div>
                      {fileContent && <CopyBtn text={fileContent} />}
                    </div>
                    {fileLoading ? (
                      <div className="flex h-[300px] items-center justify-center">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <pre className="max-h-[500px] overflow-auto p-4 font-mono text-[11px] leading-relaxed text-foreground/90">
                        {fileContent}
                      </pre>
                    )}
                  </>
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                    Select a file to view
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Conversations Tab ── */}
        {tab === 'chats' && (
          <div className="mx-auto max-w-2xl space-y-2">
            {isOwner && (
              <button
                onClick={handleStartChat}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border p-4 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
              >
                <div className="flex size-9 items-center justify-center rounded-full bg-primary/10">
                  <Plus className="size-4 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Start a new conversation</p>
                  <p className="text-xs text-muted-foreground">
                    Project memory will be injected automatically
                  </p>
                </div>
              </button>
            )}
            {conversations.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No conversations yet
              </div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card/40 p-4"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/50">
                    <MessageSquare className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{c.title}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
