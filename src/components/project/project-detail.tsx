'use client';

import { useState } from 'react';
import {
  Plus, MoreHorizontal, FileText, MessageSquare, Clock,
  BookOpen, FolderOpen, Save, Pencil, FileCode, Code,
  ExternalLink, CheckCircle, Download, Archive,
} from 'lucide-react';
import type { Project, DetailTab, ProjectFile } from './types';
import {
  StatusBadge, TypeBadge, ChainBadge, ShortUrl, TruncatedAddress,
  TimeAgo, UpdatedByBadge, CopyBtn, useToast,
} from './ui';

/**
 * Project detail view with tabs: Overview, Memory, Files, Conversations.
 *
 * Spec ref: §4.1 GET /api/projects/[id] — full project detail
 * Spec ref: §7.1 — status lifecycle display
 */
export function ProjectDetail({
  project,
  onStartChat,
  onUpdateMemory,
  onOpenContract,
}: {
  project: Project;
  onStartChat: () => void;
  onUpdateMemory: (memory: string) => void;
  onOpenContract: () => void;
}) {
  const { push } = useToast();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [editingMemory, setEditingMemory] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState(project.memory);
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);

  const tabs: { key: DetailTab; label: string; icon: typeof BookOpen; count?: number }[] = [
    { key: 'overview', label: 'Overview', icon: BookOpen },
    { key: 'memory', label: 'Memory', icon: BookOpen },
    { key: 'files', label: 'Files', icon: FolderOpen, count: project.files.length },
    { key: 'chats', label: 'Conversations', icon: MessageSquare, count: project.conversations.length },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
              <StatusBadge status={project.status} />
              <TypeBadge type={project.projectType} />
              {project.primaryChainId && <ChainBadge chainId={project.primaryChainId} />}
            </div>
            <p className="max-w-xl text-sm text-muted-foreground">{project.description}</p>
            {/* Short URL + contract address */}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <ShortUrl shortId={project.shortId} onClick={onOpenContract} />
              {project.primaryContractAddress && (
                <TruncatedAddress address={project.primaryContractAddress} />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onStartChat}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-all hover:brightness-105 active:scale-[0.98]"
            >
              <Plus className="size-3.5" /> New Chat
            </button>
            <button
              onClick={() => push({ title: 'ZIP export coming soon', variant: 'info' })}
              className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Export project"
            >
              <Download className="size-4" />
            </button>
            <button
              onClick={() => push({ title: 'Archive coming soon', variant: 'info' })}
              className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Archive project"
            >
              <Archive className="size-4" />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-3 flex gap-4">
          {[
            { label: 'Files', value: project.files.length, icon: FileText },
            { label: 'Conversations', value: project.conversations.length, icon: MessageSquare },
            { label: 'Contracts', value: project.contracts.length, icon: FileCode },
            { label: 'Updated', value: '', icon: Clock, extra: <TimeAgo date={project.updatedAt} /> },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <s.icon className="size-3" />
              {s.value !== '' && <span className="font-medium text-foreground">{s.value}</span>}
              <span>{s.label}</span>
              {s.extra}
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
                tab === t.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <t.icon className="size-3.5" />
              {t.label}
              {t.count !== undefined && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${tab === t.key ? 'bg-primary/20' : 'bg-muted/50'}`}>
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
            {/* Contracts section */}
            {project.contracts.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-foreground">Deployed Contracts</h3>
                <div className="space-y-2">
                  {project.contracts.map((c) => (
                    <div key={c.address} className="flex items-center gap-3 rounded-xl border border-border bg-card/40 p-4">
                      <div className="flex size-9 items-center justify-center rounded-full bg-accent/50">
                        <FileCode className="size-4 text-foreground/60" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{c.name}</span>
                          <span className="rounded-full bg-muted/30 px-1.5 py-0.5 text-[9px] text-muted-foreground">{c.role}</span>
                          {c.verified && (
                            <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
                              <CheckCircle className="size-3" /> Verified
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-3">
                          <TruncatedAddress address={c.address} chars={6} />
                          <ChainBadge chainId={c.chainId} />
                          <TimeAgo date={c.deployedAt} />
                        </div>
                      </div>
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); push({ title: 'Would open BscScan', variant: 'info' }); }}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title="View on BscScan"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No contracts — draft state */}
            {project.contracts.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-card/20 p-6 text-center">
                <FileCode className="mx-auto mb-2 size-8 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">No contracts deployed yet</p>
                <p className="mt-1 text-xs text-muted-foreground/60">Start a conversation to deploy your first contract</p>
                <button
                  onClick={onStartChat}
                  className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:brightness-105"
                >
                  Start Building
                </button>
              </div>
            )}

            {/* Quick memory preview */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Project Memory</h3>
                <button onClick={() => setTab('memory')} className="text-[10px] text-primary/70 hover:text-primary">
                  View full →
                </button>
              </div>
              <div className="rounded-xl border border-border bg-card/40 p-4">
                <pre className="line-clamp-[8] whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/70">
                  {project.memory}
                </pre>
              </div>
            </div>

            {/* Recent conversations */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Recent Conversations</h3>
              {project.conversations.slice(0, 3).map((c) => (
                <div key={c.id} className="mb-1.5 flex items-center gap-3 rounded-lg border border-border/50 bg-card/30 px-4 py-2.5">
                  <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{c.title}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{c.lastMessage}</p>
                  </div>
                  <TimeAgo date={c.updatedAt} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Memory Tab ── */}
        {tab === 'memory' && (
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">memory.md</span>
                <span className="text-[10px] text-muted-foreground">
                  v{project.files.find((f) => f.path === 'memory.md')?.version ?? 1} · Shared across all conversations
                </span>
              </div>
              {editingMemory ? (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      onUpdateMemory(memoryDraft);
                      setEditingMemory(false);
                      push({ title: 'Memory saved', variant: 'success' });
                    }}
                    className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                  >
                    <Save className="size-3" /> Save
                  </button>
                  <button
                    onClick={() => { setMemoryDraft(project.memory); setEditingMemory(false); }}
                    className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setMemoryDraft(project.memory); setEditingMemory(true); }}
                  className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="size-3" /> Edit
                </button>
              )}
            </div>

            {/* Token budget indicator */}
            {(() => {
              const tokenEstimate = Math.round(project.memory.length / 4);
              const budget = 4000;
              const pct = Math.min(100, Math.round((tokenEstimate / budget) * 100));
              return (
                <div className="mb-3 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>~{tokenEstimate.toLocaleString()} / {budget.toLocaleString()} tokens</span>
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

            {editingMemory ? (
              <textarea
                value={memoryDraft}
                onChange={(e) => setMemoryDraft(e.target.value)}
                className="w-full rounded-xl border border-primary/30 bg-background/60 p-4 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary/50"
                style={{ minHeight: '400px' }}
              />
            ) : (
              <div className="rounded-xl border border-border bg-card/40 p-5">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/90">
                  {project.memory}
                </pre>
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
                  <button className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                    <Plus className="size-3" />
                  </button>
                </div>
                {project.files.map((f) => {
                  const isActive = activeFile?.path === f.path;
                  const Icon = f.language === 'solidity' ? FileCode : f.language === 'json' ? Code : FileText;
                  const iconColor = f.language === 'solidity' ? 'text-blue-400' : f.language === 'json' ? 'text-amber-400' : 'text-muted-foreground';
                  return (
                    <button
                      key={f.path}
                      onClick={() => setActiveFile(f)}
                      className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                        isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      <Icon className={`size-3.5 shrink-0 ${iconColor}`} />
                      <span className="min-w-0 flex-1 truncate">{f.path}</span>
                      <UpdatedByBadge by={f.updatedBy} />
                    </button>
                  );
                })}
              </div>

              {/* File viewer */}
              <div className="min-w-0 flex-1 rounded-xl border border-border bg-card/40">
                {activeFile ? (
                  <>
                    <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <FileCode className="size-3.5 text-primary" />
                        <span className="text-xs font-medium text-foreground">{activeFile.path}</span>
                        <span className="rounded-full bg-muted/30 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                          {activeFile.language}
                        </span>
                        <UpdatedByBadge by={activeFile.updatedBy} />
                        <span className="text-[9px] text-muted-foreground">v{activeFile.version}</span>
                      </div>
                      <CopyBtn text={activeFile.content || project.memory} />
                    </div>
                    <pre className="max-h-[500px] overflow-auto p-4 font-mono text-[11px] leading-relaxed text-foreground/90">
                      {activeFile.path === 'memory.md' ? project.memory : activeFile.content}
                    </pre>
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
            <button
              onClick={onStartChat}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border p-4 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            >
              <div className="flex size-9 items-center justify-center rounded-full bg-primary/10">
                <Plus className="size-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">Start a new conversation</p>
                <p className="text-xs text-muted-foreground">Project memory will be injected automatically</p>
              </div>
            </button>
            {project.conversations.map((c) => (
              <div
                key={c.id}
                onClick={onStartChat}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card/40 p-4 transition-colors hover:bg-card/60"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onStartChat(); }}
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/50">
                  <MessageSquare className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{c.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.lastMessage}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <TimeAgo date={c.updatedAt} />
                  <span className="text-[10px] text-muted-foreground">{c.messageCount} msgs</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
