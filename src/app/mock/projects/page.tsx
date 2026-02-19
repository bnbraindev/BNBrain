// @ts-nocheck — mock UI 探索页面，不参与类型检查
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Shield, Plus, FolderGit2, Sparkles, Loader2,
} from 'lucide-react';
import type { Project, ProjectType, ProjectFile, ContractInfo } from '@/components/project/types';
import { MOCK_PROJECTS, MOCK_CHATS } from '@/components/project/mock-data';
import { ToastProvider, useToast, StreamingText } from '@/components/project/ui';
import { AppSidebar } from '@/components/project/app-sidebar';
import { ProjectsList } from '@/components/project/projects-list';
import { CreateProjectDialog } from '@/components/project/create-project-dialog';
import { ProjectWorkspace } from '@/components/project/project-workspace';
import { ContractPage } from '@/components/project/contract-page';

// ============================================================================
// Regular Chat — full mock with streaming, tool hints, suggestions
// ============================================================================

type SimpleView = 'list' | 'workspace' | 'contract-page' | 'regular-chat';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming: boolean;
  toolHints?: string[];
  suggestions?: string[];
  upgradePrompt?: boolean;
}

function RegularChatView({ onUpgradeToProject }: {
  onUpgradeToProject: (name: string, type: ProjectType) => void;
}) {
  const { push } = useToast();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const [sessionDeployed, setSessionDeployed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    const userText = input.trim();
    setInput('');
    const assistantId = `msg-${Date.now() + 1}`;

    setMessages((prev) => [...prev, { id: `msg-${Date.now()}`, role: 'user', text: userText, streaming: false }]);
    setIsStreaming(true);

    setTimeout(() => {
      const lc = userText.toLowerCase();
      let aiText = '';
      let toolHints: string[] = [];
      let suggestions: string[] = [];
      let upgradePrompt = false;

      // ── Deploy ──
      if (lc.includes('deploy') || lc.includes('部署') || lc.includes('token') || lc.includes('代币')) {
        toolHints = ['Compiling contract', 'Estimating gas', 'Deploying to BSC'];
        aiText = `Compiling and deploying your token to BSC...\n\n✅ **Deployment Successful!**\n\n- Contract: \`0x7a8B9c0D1e2F3a4B5c6D7e8F9eF01a2B3c4D5e6F\`\n- TX: \`0x123abc456def...\`\n- Gas: 1,892,401 (0.0057 BNB)\n- Block: #38,291,047\n\n🎉 Your token is live! I recommend creating a **Project** to manage this contract with persistent memory.`;
        suggestions = ['Verify on BscScan', 'Add liquidity', 'Run security audit'];
        upgradePrompt = true;
        setSessionDeployed(true);

      // ── Verify ──
      } else if (lc.includes('verify') || lc.includes('验证')) {
        toolHints = ['Flattening source', 'Submitting to BscScan'];
        aiText = sessionDeployed
          ? `Verifying source code on BscScan...\n\n✅ **Verified!**\n\n- Compiler: solc 0.8.19\n- Optimization: 200 runs\n- License: MIT\n\nContract is now publicly verified.`
          : `No deployed contract found. Try **deploying a token** first.`;
        suggestions = sessionDeployed ? ['Add liquidity', 'Run security audit'] : ['Deploy a token'];

      // ── Security Audit ──
      } else if (lc.includes('audit') || lc.includes('security') || lc.includes('安全') || lc.includes('check')) {
        toolHints = ['Scanning GoPlus API', 'Checking token security'];
        aiText = `Running security audit...\n\n📊 **Score: 92/100** ✅\n\n- Mintable: ❌ No (Safe)\n- Proxy: ❌ No (Safe)\n- Anti-whale: ✅ Yes\n- Buy/Sell Tax: 3%/3%\n- Owner: ⚠️ Not renounced`;
        suggestions = sessionDeployed ? ['Add liquidity', 'Renounce ownership'] : ['Deploy a token'];

      // ── Liquidity ──
      } else if (lc.includes('liquidity') || lc.includes('流动性')) {
        toolHints = ['Connecting PancakeSwap', 'Adding liquidity'];
        aiText = sessionDeployed
          ? `Adding liquidity on PancakeSwap V3...\n\n✅ **Liquidity Added!**\n\n- Pool: Token/BNB\n- LP Token: \`0x8765...4321\`\n\nNext: **Lock LP tokens** to build trust.`
          : `You need to deploy a contract first.`;
        suggestions = sessionDeployed ? ['Lock LP tokens', 'Run audit'] : ['Deploy a token'];

      // ── Swap ──
      } else if (lc.includes('swap') || lc.includes('交换') || lc.includes('buy') || lc.includes('sell')) {
        toolHints = ['Fetching best route', 'Simulating swap'];
        aiText = `Finding best swap route...\n\n📊 **Swap Analysis**\n\n- Best DEX: PancakeSwap V3\n- Price Impact: 0.12%\n- Slippage: 3% (includes tax)\n- Gas: ~0.0008 BNB`;
        suggestions = ['Execute swap', 'Check other DEXes'];

      // ── Default ──
      } else {
        suggestions = ['Deploy a token', 'Run security audit', 'Swap tokens'];
        aiText = `I can help with that! This is a regular chat without project context.\n\nHere's what I can do:\n- **Deploy** a token or NFT\n- **Security audit** any contract\n- **Swap** tokens on DEXes\n- And much more!\n\n💡 Tip: After deploying, I'll offer to create a **Project** for persistent memory.`;
      }

      setMessages((prev) => [...prev, {
        id: assistantId, role: 'assistant', text: aiText,
        streaming: true, toolHints, suggestions, upgradePrompt,
      }]);
    }, 600);
  }, [input, isStreaming, sessionDeployed]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-5 py-3">
        <span className="text-sm font-medium text-foreground">New Chat</span>
        <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">No project</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-2xl space-y-5">
          {messages.length === 0 && (
            <div className="py-20 text-center">
              <Shield className="mx-auto mb-3 size-8 text-primary/20" />
              <h3 className="mb-1 text-lg font-semibold text-foreground">BNBrain</h3>
              <p className="mb-4 text-sm text-muted-foreground">How can I help you today?</p>
              <div className="flex flex-wrap justify-center gap-2">
                {['Deploy a token', 'Security audit', 'Swap tokens', 'Check contract'].map((s) => (
                  <button key={s} onClick={() => setInput(s)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className="animate-message-in">
              {msg.role === 'user' ? (
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">{msg.text}</div>
                </div>
              ) : (
                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <div className="flex size-5 items-center justify-center rounded-full bg-primary/10">
                      <Shield className="size-3 text-primary" />
                    </div>
                    <span className="text-xs font-semibold text-foreground">BNBrain</span>
                    {msg.streaming && msg.toolHints?.map((h) => (
                      <span key={h} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] text-primary">
                        <Loader2 className="size-2.5 animate-spin" /> {h}
                      </span>
                    ))}
                  </div>
                  <div className="pl-[26px]">
                    <div className="text-sm leading-relaxed text-foreground/90">
                      {msg.streaming ? (
                        <StreamingText text={msg.text} speed={8} onDone={() => {
                          setIsStreaming(false);
                          setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, streaming: false } : m));
                        }} />
                      ) : (
                        <pre className="whitespace-pre-wrap font-sans">{msg.text}</pre>
                      )}
                    </div>

                    {/* Suggestions */}
                    {!msg.streaming && msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {msg.suggestions.map((s) => (
                          <button key={s} onClick={() => setInput(s)}
                            className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                            {s}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Upgrade prompt */}
                    {msg.upgradePrompt && !msg.streaming && !upgraded && (
                      <div className="mt-3 animate-message-in rounded-xl border border-primary/25 bg-primary/[0.06] p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <FolderGit2 className="size-4 text-primary" />
                          <span className="text-xs font-semibold text-foreground">Create a Project?</span>
                        </div>
                        <p className="mb-3 text-xs text-muted-foreground">
                          Upgrade to a Project for persistent memory, file storage, and cross-conversation context.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setUpgraded(true);
                              onUpgradeToProject('TestCoin', 'token');
                              push({ title: 'Project created!', description: 'Redirecting to project...', variant: 'success' });
                            }}
                            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:brightness-105"
                          >
                            <Plus className="size-3" /> Create Project
                          </button>
                          <button
                            onClick={() => {
                              setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, upgradePrompt: false } : m));
                            }}
                            className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
                          >
                            Not now
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 px-5 pb-4 pt-2">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl border border-border bg-card/80 p-2 shadow-sm backdrop-blur-sm">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask anything..."
              className="min-h-[40px] max-h-[120px] w-full resize-none border-0 bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none"
              rows={1}
            />
            <div className="flex items-center justify-end">
              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className="flex size-7 items-center justify-center rounded-lg bg-primary transition-all hover:brightness-105 active:scale-95 disabled:opacity-40"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="#fff" viewBox="0 0 256 256">
                  <path d="M208.49,120.49a12,12,0,0,1-17,0L140,69V216a12,12,0,0,1-24,0V69L64.49,120.49a12,12,0,0,1-17-17l72-72a12,12,0,0,1,17,0l72,72A12,12,0,0,1,208.49,120.49Z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Orchestrator — Sidebar + Content
// ============================================================================

function MockProjectsInner() {
  const { push } = useToast();
  const [view, setView] = useState<SimpleView>('list');
  const [sidebarNav, setSidebarNav] = useState<'chats' | 'projects'>('projects');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS);
  const [createOpen, setCreateOpen] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  // Starred items (mock)
  const starredItems = [
    { id: 'proj-1', title: 'BabyDoge Token', type: 'project' as const },
    { id: 'chat-1', title: 'Check 0xDead token safety', type: 'chat' as const },
  ];

  // ─── Navigation handlers ───

  const handleNavChange = useCallback((nav: 'chats' | 'projects') => {
    setSidebarNav(nav);
    if (nav === 'projects') {
      setView('list');
      setActiveProjectId(null);
      setActiveItemId(null);
    } else {
      setView('regular-chat');
      setActiveProjectId(null);
      setActiveItemId(null);
    }
  }, []);

  const handleNewChat = useCallback(() => {
    setSidebarNav('chats');
    setView('regular-chat');
    setActiveProjectId(null);
    setActiveItemId(null);
  }, []);

  const handleSelectProject = useCallback((id: string) => {
    setActiveProjectId(id);
    setActiveItemId(id);
    setView('workspace');
    setSidebarNav('projects');
  }, []);

  const handleBackToList = useCallback(() => {
    setView('list');
    setActiveProjectId(null);
    setActiveItemId(null);
  }, []);

  const handleSelectStarred = useCallback((id: string, type: 'chat' | 'project') => {
    setActiveItemId(id);
    if (type === 'project') {
      setActiveProjectId(id);
      setView('workspace');
      setSidebarNav('projects');
    } else {
      setSidebarNav('chats');
      setView('regular-chat');
      setActiveProjectId(null);
    }
  }, []);

  const handleSelectRecent = useCallback((id: string) => {
    setActiveItemId(id);
    setSidebarNav('chats');
    setView('regular-chat');
    setActiveProjectId(null);
  }, []);

  // ─── Project CRUD ───

  const handleCreateProject = useCallback((name: string, description: string, type: ProjectType) => {
    const shortId = Math.random().toString(36).slice(2, 8);
    const newProject: Project = {
      id: `proj-${Date.now()}`,
      shortId,
      name,
      description,
      projectType: type,
      status: 'draft',
      memory: `# ${name} — Project Memory\n\n> Auto-maintained by BNB Shield AI. Last updated: 2026-02-18.\n\n## Contract\n\n- Chain: BSC (56)\n- Address: (not deployed yet)\n- Status: Draft\n\n## History\n\n- 2026-02-18 — Project created\n\n## TODO\n\n- [ ] Deploy contract\n- [ ] Verify on explorer`,
      files: [
        { path: 'memory.md', content: '', language: 'markdown', contentType: 'text/markdown', updatedBy: 'system', version: 1, sizeBytes: 320 },
      ],
      conversations: [],
      contracts: [],
      createdAt: '2026-02-18',
      updatedAt: '2026-02-18',
    };
    setProjects((prev) => [...prev, newProject]);
    setActiveProjectId(newProject.id);
    setActiveItemId(newProject.id);
    setView('workspace');
    setSidebarNav('projects');
    push({ title: `Project "${name}" created`, description: `/x/${shortId}`, variant: 'success' });
  }, [push]);

  const handleUpdateMemory = useCallback((memory: string) => {
    if (!activeProjectId) return;
    setProjects((prev) => prev.map((p) =>
      p.id === activeProjectId ? { ...p, memory, updatedAt: '2026-02-18' } : p
    ));
  }, [activeProjectId]);

  const handleUpdateFile = useCallback((path: string, content: string) => {
    if (!activeProjectId) return;
    setProjects((prev) => prev.map((p) =>
      p.id === activeProjectId
        ? { ...p, files: p.files.map((f) => f.path === path ? { ...f, content, version: f.version + 1, updatedBy: 'user' as const } : f), updatedAt: '2026-02-18' }
        : p
    ));
  }, [activeProjectId]);

  const handleDeleteFile = useCallback((path: string) => {
    if (!activeProjectId) return;
    setProjects((prev) => prev.map((p) =>
      p.id === activeProjectId
        ? { ...p, files: p.files.filter((f) => f.path !== path), updatedAt: '2026-02-18' }
        : p
    ));
    push({ title: `${path} deleted`, variant: 'success' });
  }, [activeProjectId, push]);

  const handleAddContract = useCallback((contract: ContractInfo) => {
    if (!activeProjectId) return;
    setProjects((prev) => prev.map((p) =>
      p.id === activeProjectId
        ? { ...p, contracts: [...p.contracts, contract], status: 'active', updatedAt: '2026-02-18' }
        : p
    ));
  }, [activeProjectId]);

  const handleAddFile = useCallback((file: ProjectFile) => {
    if (!activeProjectId) return;
    setProjects((prev) => prev.map((p) => {
      if (p.id !== activeProjectId) return p;
      const exists = p.files.some((f) => f.path === file.path);
      return {
        ...p,
        files: exists ? p.files.map((f) => f.path === file.path ? file : f) : [...p.files, file],
        updatedAt: '2026-02-18',
      };
    }));
  }, [activeProjectId]);

  const handleSetPrimaryContract = useCallback((address: string) => {
    if (!activeProjectId) return;
    setProjects((prev) => prev.map((p) =>
      p.id === activeProjectId ? { ...p, primaryContractAddress: address } : p
    ));
  }, [activeProjectId]);

  const handleDeleteProject = useCallback(() => {
    if (!activeProjectId) return;
    setProjects((prev) => prev.filter((p) => p.id !== activeProjectId));
    setActiveProjectId(null);
    setActiveItemId(null);
    setView('list');
    push({ title: 'Project deleted', variant: 'info' });
  }, [activeProjectId, push]);

  const handleArchiveProject = useCallback(() => {
    if (!activeProjectId) return;
    setProjects((prev) => prev.map((p) =>
      p.id === activeProjectId ? { ...p, status: 'archived' } : p
    ));
    push({ title: 'Project archived', variant: 'info' });
  }, [activeProjectId, push]);

  const handleUpgradeToProject = useCallback((name: string, type: ProjectType) => {
    handleCreateProject(name, 'Created from chat upgrade', type);
  }, [handleCreateProject]);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,oklch(0.78_0.16_85/0.10),transparent_44%),radial-gradient(circle_at_100%_100%,oklch(0.78_0.16_85/0.06),transparent_42%)]" />

      <div className="relative z-10 flex min-h-0 w-full">
        {/* ─── Sidebar ─── */}
        <AppSidebar
          activeNav={sidebarNav}
          onNavChange={handleNavChange}
          onNewChat={handleNewChat}
          recentChats={MOCK_CHATS}
          starredItems={starredItems}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          activeItemId={activeItemId}
          onSelectStarred={handleSelectStarred}
          onSelectRecent={handleSelectRecent}
        />

        {/* ─── Content ─── */}
        <div className="min-h-0 min-w-0 flex-1">
          {/* Projects List */}
          {view === 'list' && (
            <div className="flex h-full flex-col overflow-y-auto">
              <ProjectsList
                projects={projects}
                onSelect={handleSelectProject}
                onNew={() => setCreateOpen(true)}
              />

              {/* Chat → Project upgrade demo */}
              <div className="mx-auto w-full max-w-3xl px-6 pb-8">
                <div className="border-t border-border/30 pt-6">
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles className="size-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">Chat → Project Upgrade</h2>
                  </div>
                  <button
                    onClick={() => { setView('regular-chat'); setSidebarNav('chats'); setActiveItemId(null); }}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card/40 p-3.5 text-left transition-all hover:bg-card/60 hover:shadow-sm"
                  >
                    <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-card/50">
                      <Sparkles className="size-4 text-primary/60" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Try the upgrade flow</p>
                      <p className="text-[11px] text-muted-foreground">
                        Say &quot;deploy a token called TestCoin&quot; in a regular chat
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Project Workspace */}
          {view === 'workspace' && activeProject && (
            <ProjectWorkspace
              project={activeProject}
              onBack={handleBackToList}
              onUpdateMemory={handleUpdateMemory}
              onUpdateFile={handleUpdateFile}
              onDeleteFile={handleDeleteFile}
              onAddContract={handleAddContract}
              onAddFile={handleAddFile}
              onSetPrimaryContract={handleSetPrimaryContract}
              onDelete={handleDeleteProject}
              onArchive={handleArchiveProject}
              onOpenContract={() => setView('contract-page')}
            />
          )}

          {/* Contract Page */}
          {view === 'contract-page' && activeProject && (
            <ContractPage
              project={activeProject}
              onBack={() => setView('workspace')}
              onStartChat={() => setView('workspace')}
            />
          )}

          {/* Regular Chat */}
          {view === 'regular-chat' && (
            <RegularChatView
              onUpgradeToProject={handleUpgradeToProject}
            />
          )}
        </div>
      </div>

      <CreateProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateProject}
      />
    </div>
  );
}

export default function MockProjectsPage() {
  return (
    <ToastProvider>
      <MockProjectsInner />
    </ToastProvider>
  );
}
