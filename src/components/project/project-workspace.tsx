'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ArrowLeft, Star, MoreHorizontal, Shield, Loader2,
  FileCode, Code, FileText, Plus, Pencil, Trash2, Archive,
  ExternalLink, ChevronRight, X, Save,
} from 'lucide-react';
import type { Project, ProjectFile, ProjectChatMsg, MemoryUpdate, ProjectChatCard, ContractInfo } from './types';
import {
  StatusBadge, StreamingText, useToast, CopyBtn,
} from './ui';
import { MemoryUpdateCard } from './memory-update-card';
import { FileViewerModal } from './file-viewer-modal';

/**
 * Project workspace — Claude-style chat-first design.
 *
 * Layout:
 * - Header: back + name + star + menu
 * - Center: chat messages (with streaming, tool hints, suggestions, memory cards)
 * - Bottom: input + conversation pills
 * - Right panel: custom instructions + project files
 */
export function ProjectWorkspace({
  project,
  onBack,
  onUpdateMemory,
  onUpdateFile,
  onDeleteFile,
  onAddContract,
  onAddFile,
  onSetPrimaryContract,
  onStar,
  onDelete,
  onArchive,
  onOpenContract,
}: {
  project: Project;
  onBack: () => void;
  onUpdateMemory: (memory: string) => void;
  onUpdateFile: (path: string, content: string) => void;
  onDeleteFile: (path: string) => void;
  onAddContract?: (contract: ContractInfo) => void;
  onAddFile?: (file: ProjectFile) => void;
  onSetPrimaryContract?: (address: string) => void;
  onStar?: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
  onOpenContract?: () => void;
}) {
  const { push } = useToast();

  // Chat state
  const [messages, setMessages] = useState<ProjectChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Right panel state
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState(project.memory);
  const [viewingFile, setViewingFile] = useState<ProjectFile | null>(null);

  // Menu state
  const [menuOpen, setMenuOpen] = useState(false);

  // Sync instructions draft when memory changes externally (e.g. via Apply Memory)
  useEffect(() => {
    if (!editingInstructions) {
      setInstructionsDraft(project.memory);
    }
  }, [project.memory, editingInstructions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Track deployed state for this session
  const [sessionDeployed, setSessionDeployed] = useState(!!project.primaryContractAddress);
  const [sessionVerified, setSessionVerified] = useState(
    project.contracts.some((c) => c.verified)
  );

  // Load context greeting for new conversations
  const startNewConversation = useCallback(() => {
    setActiveConvId(null);
    setMessages([]);
    setIsStreaming(true);
    setTimeout(() => {
      const hasContract = sessionDeployed || !!project.primaryContractAddress;
      const text = hasContract
        ? `I have the full context for **${project.name}**.\n\n- Contract: \`${project.primaryContractAddress?.slice(0, 10) ?? '0x5E3a7B8c'}...\`\n- Status: **${project.status}**\n- ${project.contracts.length} contract(s)\n\nHow can I help?`
        : `Welcome to **${project.name}**. The project is in **${project.status}** status.\n\nI've loaded your project memory and files. What would you like to do?`;
      setMessages([{
        id: `msg-${Date.now()}`,
        role: 'assistant',
        text,
        streaming: true,
        toolHints: ['Reading memory.md'],
        suggestions: hasContract
          ? ['Run security audit', 'Check holders', 'Verify contract']
          : ['Deploy to BSC', 'Run security audit', 'Review code'],
      }]);
    }, 300);
  }, [project, sessionDeployed]);

  // Switch to an existing conversation
  const switchConversation = useCallback((convId: string) => {
    setActiveConvId(convId);
    const conv = project.conversations.find((c) => c.id === convId);
    if (!conv) return;
    setMessages([
      { id: `hist-1`, role: 'assistant', text: `*(Loaded conversation: "${conv.title}")*\n\n${conv.lastMessage}`, streaming: false },
    ]);
    setIsStreaming(false);
  }, [project.conversations]);

  // ─── Chat command router ───
  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    const userText = input.trim();
    setInput('');
    const assistantId = `msg-${Date.now() + 1}`;

    setMessages((prev) => [...prev, { id: `msg-${Date.now()}`, role: 'user', text: userText, streaming: false }]);
    setIsStreaming(true);

    setTimeout(() => {
      let aiText = '';
      let memoryUpdate: MemoryUpdate | undefined;
      let suggestions: string[] = [];
      let toolHints: string[] = [];

      const lc = userText.toLowerCase();

      // ── Deploy ──
      if (lc.includes('deploy') || lc.includes('部署')) {
        toolHints = ['Compiling contract', 'Estimating gas', 'Deploying to BSC'];
        aiText = `Compiling and deploying **${project.name}** to BSC Mainnet...\n\n✅ **Deployment Successful!**\n\n- Contract: \`0x5E3a7B8c9D0e1F2a3B4C5D6E7F8a9B0c1D2e3F4a\`\n- TX: \`0xabc123def456789012345678...\`\n- Gas Used: 2,145,302 (0.0064 BNB)\n- Block: #38,291,047\n\nThe contract is now live on BSC. Next steps: **verify on BscScan**, then **add liquidity**.`;
        suggestions = ['Verify on BscScan', 'Add liquidity', 'Run security audit'];
        memoryUpdate = {
          additions: [
            '- Address: `0x5E3a7B8c9D0e1F2a3B4C5D6E7F8a9B0c1D2e3F4a`',
            '- Deployed: 2026-02-18, Block #38,291,047',
            '- Gas: 2,145,302 (0.0064 BNB)',
            '- Status: Active (deployed)',
          ],
          applied: false,
        };
        // Update project state
        const newContract: ContractInfo = {
          role: 'token', chainId: 56, name: project.name,
          address: '0x5E3a7B8c9D0e1F2a3B4C5D6E7F8a9B0c1D2e3F4a',
          deployedAt: '2026-02-18', verified: false,
          deployTxHash: '0xabc123def456789012345678',
        };
        onAddContract?.(newContract);
        onSetPrimaryContract?.('0x5E3a7B8c9D0e1F2a3B4C5D6E7F8a9B0c1D2e3F4a');
        onAddFile?.({
          path: `contracts/${project.name.replace(/\s+/g, '')}.sol`,
          content: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.19;\n// ... compiled source`,
          language: 'solidity', contentType: 'text/x-solidity',
          updatedBy: 'ai', version: 1, sizeBytes: 1420,
        });
        onAddFile?.({
          path: `artifacts/${project.name.replace(/\s+/g, '')}.abi.json`,
          content: `[{"type":"function","name":"name",...}]`,
          language: 'json', contentType: 'application/json',
          updatedBy: 'ai', version: 1, sizeBytes: 2840,
        });
        setSessionDeployed(true);

      // ── Verify ──
      } else if (lc.includes('verify') || lc.includes('验证')) {
        toolHints = ['Flattening source', 'Submitting to BscScan API'];
        aiText = sessionDeployed || project.primaryContractAddress
          ? `Verifying source code on BscScan...\n\n✅ **Verification Successful!**\n\n- Compiler: solc 0.8.19\n- Optimization: 200 runs\n- License: MIT\n- Match: **Exact Match** ✅\n\nYour contract is now publicly verified. Anyone can read the source code on BscScan.`
          : `No deployed contract found. Please **deploy** first before verifying.`;
        suggestions = sessionDeployed ? ['Add liquidity', 'Run security audit', 'Check on BscScan'] : ['Deploy to BSC'];
        if (sessionDeployed || project.primaryContractAddress) {
          memoryUpdate = { additions: ['- Verified: Yes (BscScan, solc 0.8.19, 2026-02-18)'], applied: false };
          setSessionVerified(true);
        }

      // ── Security Audit ──
      } else if (lc.includes('audit') || lc.includes('security') || lc.includes('安全') || lc.includes('check')) {
        toolHints = ['Scanning GoPlus API', 'Checking token security', 'Analyzing ownership'];
        aiText = `Running comprehensive security audit...\n\n📊 **Security Score: 94/100** ✅\n\n| Check | Result |\n|-------|--------|\n| Mintable | ❌ No (Safe) |\n| Proxy | ❌ No (Safe) |\n| Anti-whale | ✅ Max 2% per tx |\n| Buy Tax | 3% |\n| Sell Tax | 3% |\n| LP Locked | ${sessionDeployed ? '⚠️ Not yet' : '✅ Yes (6 months)'} |\n| Owner | ⚠️ Not renounced |\n\n**Recommendation**: ${sessionDeployed ? 'Add liquidity and lock LP tokens, then consider renouncing ownership.' : 'Consider renouncing ownership for maximum trust.'}`;
        suggestions = sessionDeployed
          ? ['Add liquidity', 'Lock LP tokens', 'Renounce ownership']
          : ['Renounce ownership', 'Check holders', 'View on BscScan'];
        memoryUpdate = { additions: ['- Security Audit: 94/100 (GoPlus, 2026-02-18)', '- Flags: owner not renounced, LP lock pending'], applied: false };

      // ── Add Liquidity ──
      } else if (lc.includes('liquidity') || lc.includes('流动性')) {
        toolHints = ['Connecting PancakeSwap V3', 'Approving token', 'Adding liquidity'];
        aiText = `Adding liquidity on PancakeSwap V3...\n\n✅ **Liquidity Added!**\n\n- Pool: ${project.name} / BNB\n- Amount: 500,000,000 tokens + 10 BNB\n- LP Token: \`0x8765...4321\`\n- Price: 1 ${project.name.slice(0, 4)} = 0.00000002 BNB\n\nNext: **Lock LP tokens** to build investor trust.`;
        suggestions = ['Lock LP tokens', 'Check LP on DexScreener', 'Run audit'];
        memoryUpdate = {
          additions: [
            '- Liquidity: PancakeSwap V3, 500M tokens + 10 BNB',
            '- LP Token: `0x8765...4321`',
            '- Added: 2026-02-18',
          ],
          applied: false,
        };

      // ── Lock LP ──
      } else if (lc.includes('lock') || lc.includes('锁')) {
        toolHints = ['Connecting PinkLock', 'Approving LP token', 'Locking for 6 months'];
        aiText = `Locking LP tokens via PinkLock...\n\n✅ **LP Locked!**\n\n- Lock Contract: \`0x9eF0a1B2...012345\`\n- Duration: 6 months (until 2026-08-18)\n- LP Amount: 100%\n- Unlock Date: 2026-08-18\n\nYour liquidity is now locked. This significantly increases investor confidence.`;
        suggestions = ['Renounce ownership', 'Submit to CoinGecko', 'Run security audit'];
        memoryUpdate = {
          additions: [
            '- LP Locked: Yes, PinkLock until 2026-08-18',
            '- Lock Contract: `0x9eF0a1B2...012345`',
          ],
          applied: false,
        };

      // ── Renounce Ownership ──
      } else if (lc.includes('renounce') || lc.includes('放弃') || lc.includes('ownership')) {
        toolHints = ['Calling renounceOwnership()', 'Confirming tx'];
        aiText = `Renouncing contract ownership...\n\n✅ **Ownership Renounced!**\n\n- TX: \`0xdef789...\`\n- New Owner: \`0x000...000\` (zero address)\n\n⚠️ **This is irreversible.** No one can modify the contract parameters (tax, max tx, etc.) anymore.\n\nYour token is now fully decentralized.`;
        suggestions = ['Run security audit', 'Submit to CoinGecko', 'Check holders'];
        memoryUpdate = { additions: ['- Ownership: Renounced (2026-02-18, tx: 0xdef789...)'], applied: false };

      // ── Swap ──
      } else if (lc.includes('swap') || lc.includes('buy') || lc.includes('sell') || lc.includes('交易')) {
        toolHints = ['Fetching best route', 'Simulating swap'];
        aiText = `Finding best swap route...\n\n📊 **Swap Route Analysis**\n\n- Best DEX: PancakeSwap V3\n- Price Impact: 0.12%\n- Estimated Output: 49,750,000 tokens\n- Slippage: 3% (includes tax)\n- Gas: ~0.0008 BNB\n\nWould you like me to execute this swap?`;
        suggestions = ['Execute swap', 'Check other DEXes', 'Set limit order'];

      // ── Holders ──
      } else if (lc.includes('holder') || lc.includes('持有')) {
        toolHints = ['Querying BSC API', 'Analyzing distribution'];
        aiText = `Analyzing token holders...\n\n📊 **Holder Distribution**\n\n| Rank | Address | Balance | % |\n|------|---------|---------|---|\n| 1 | \`0x742d...4E28\` (Owner) | 500M | 50% |\n| 2 | \`0x8765...4321\` (LP) | 500M | 50% |\n| 3 | PancakeSwap Router | 0 | 0% |\n\n- Total Holders: 2\n- Top 10 hold: 100%\n\n*Note: Distribution will improve as more users buy.*`;
        suggestions = ['Marketing campaign', 'Submit to CoinGecko', 'Check price'];

      // ── Mint (NFT) ──
      } else if (lc.includes('mint') || lc.includes('铸造')) {
        toolHints = ['Preparing metadata', 'Uploading to IPFS', 'Minting NFT'];
        aiText = `Minting NFT...\n\n✅ **Minted!**\n\n- Token ID: #1\n- Metadata: ipfs://QmXyz...\n- TX: \`0x456abc...\`\n\nNFT successfully minted and metadata stored on IPFS.`;
        suggestions = ['Mint another', 'List on marketplace', 'View collection'];
        memoryUpdate = { additions: ['- NFT #1 minted (2026-02-18)', '- Metadata: ipfs://QmXyz...'], applied: false };

      // ── Default ──
      } else {
        const cmds = sessionDeployed
          ? ['Verify on BscScan', 'Add liquidity', 'Lock LP tokens', 'Run security audit', 'Renounce ownership', 'Check holders']
          : ['Deploy to BSC', 'Run security audit', 'Review code'];
        suggestions = cmds.slice(0, 3);
        aiText = `I can help with **${project.name}**. Here's what I can do:\n\n${cmds.map((c) => `- **${c}**`).join('\n')}\n\nJust tell me what you'd like to do!`;
      }

      setMessages((prev) => [...prev, {
        id: assistantId, role: 'assistant', text: aiText,
        streaming: true, memoryUpdate, toolHints, suggestions,
      }]);
    }, 600);
  }, [input, isStreaming, project, sessionDeployed, onAddContract, onAddFile, onSetPrimaryContract]);

  const handleApplyMemory = useCallback((msgId: string) => {
    setMessages((prev) => prev.map((m) => {
      if (m.id === msgId && m.memoryUpdate) {
        onUpdateMemory(project.memory + '\n' + m.memoryUpdate.additions.join('\n'));
        push({ title: 'Memory updated', variant: 'success' });
        return { ...m, memoryUpdate: { ...m.memoryUpdate, applied: true } };
      }
      return m;
    }));
  }, [onUpdateMemory, project.memory, push]);

  // Check if contract page is accessible
  const hasContract = sessionDeployed || !!project.primaryContractAddress;

  return (
    <>
      <div className="flex h-full">
        {/* ─── Center: Chat ─── */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-5 py-3">
            <div className="flex items-center gap-3">
              <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                <ArrowLeft className="size-4" /> All Projects
              </button>
              <div className="h-4 w-px bg-border/50" />
              <span className="text-sm font-semibold text-foreground">{project.name}</span>
              <StatusBadge status={project.status} />
              {hasContract && (
                <button onClick={onOpenContract} className="font-mono text-[10px] text-primary/60 transition-colors hover:text-primary">
                  /x/{project.shortId}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={onStar} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-amber-400" title="Star">
                <Star className="size-4" />
              </button>
              <div className="relative">
                <button onClick={() => setMenuOpen(!menuOpen)} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground">
                  <MoreHorizontal className="size-4" />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-border bg-card py-1 shadow-xl">
                      <button onClick={() => { setMenuOpen(false); push({ title: 'Edit details coming soon', variant: 'info' }); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent">
                        <Pencil className="size-3.5" /> Edit details
                      </button>
                      {hasContract && (
                        <button onClick={() => { setMenuOpen(false); onOpenContract?.(); }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent">
                          <ExternalLink className="size-3.5" /> Contract page
                        </button>
                      )}
                      <button onClick={() => { setMenuOpen(false); onArchive?.(); push({ title: 'Archived', variant: 'info' }); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent">
                        <Archive className="size-3.5" /> Archive
                      </button>
                      <div className="my-1 h-px bg-border/50" />
                      <button onClick={() => { setMenuOpen(false); onDelete?.(); push({ title: 'Deleted', variant: 'info' }); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10">
                        <Trash2 className="size-3.5" /> Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-6">
            <div className="mx-auto max-w-2xl space-y-4">
              {messages.length === 0 && (
                <div className="py-20 text-center">
                  <Shield className="mx-auto mb-3 size-8 text-primary/20" />
                  <p className="mb-1 text-sm text-muted-foreground">Start a conversation with project context</p>
                  <p className="mb-4 text-[11px] text-muted-foreground/60">memory.md loaded · {project.files.length} files available</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {(hasContract
                      ? ['Run security audit', 'Check holders', 'Add liquidity']
                      : ['Deploy to BSC', 'Run security audit', 'Review code']
                    ).map((s) => (
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
                        {msg.memoryUpdate && !msg.streaming && (
                          <MemoryUpdateCard
                            update={msg.memoryUpdate}
                            onApply={() => handleApplyMemory(msg.id)}
                            onSkip={() => setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, memoryUpdate: undefined } : m))}
                          />
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
          <div className="shrink-0 border-t border-border/30 px-5 pb-3 pt-3">
            <div className="mx-auto max-w-2xl">
              <div className="rounded-xl border border-border bg-card/80 p-2 shadow-sm backdrop-blur-sm">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={`Message ${project.name}...`}
                  className="min-h-[40px] max-h-[120px] w-full resize-none border-0 bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none"
                  rows={1}
                />
                <div className="flex items-center justify-end">
                  <button onClick={handleSend} disabled={!input.trim() || isStreaming}
                    className="flex size-7 items-center justify-center rounded-lg bg-primary transition-all hover:brightness-105 active:scale-95 disabled:opacity-40">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="#fff" viewBox="0 0 256 256">
                      <path d="M208.49,120.49a12,12,0,0,1-17,0L140,69V216a12,12,0,0,1-24,0V69L64.49,120.49a12,12,0,0,1-17-17l72-72a12,12,0,0,1,17,0l72,72A12,12,0,0,1,208.49,120.49Z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Conversation pills */}
              <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <button
                  onClick={startNewConversation}
                  className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                    activeConvId === null ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  + New
                </button>
                {project.conversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => switchConversation(c.id)}
                    className={`shrink-0 truncate rounded-full px-3 py-1 text-[11px] transition-colors ${
                      activeConvId === c.id ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-accent'
                    }`}
                    style={{ maxWidth: '160px' }}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Right Panel: Instructions + Files ─── */}
        <div className="hidden w-[300px] shrink-0 flex-col border-l border-border/50 bg-background/60 lg:flex">
          <div className="flex-1 overflow-y-auto">
            {/* Custom Instructions */}
            <div className="border-b border-border/50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Custom instructions</span>
                {editingInstructions ? (
                  <div className="flex gap-1">
                    <button onClick={() => { onUpdateMemory(instructionsDraft); setEditingInstructions(false); push({ title: 'Saved', variant: 'success' }); }}
                      className="rounded p-1 text-primary hover:bg-primary/10"><Save className="size-3" /></button>
                    <button onClick={() => { setInstructionsDraft(project.memory); setEditingInstructions(false); }}
                      className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="size-3" /></button>
                  </div>
                ) : (
                  <button onClick={() => { setInstructionsDraft(project.memory); setEditingInstructions(true); }}
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground">
                    <Pencil className="size-3" />
                  </button>
                )}
              </div>
              {editingInstructions ? (
                <textarea
                  value={instructionsDraft}
                  onChange={(e) => setInstructionsDraft(e.target.value)}
                  className="w-full rounded-lg border border-primary/30 bg-background/60 p-2.5 font-mono text-[10px] leading-relaxed text-foreground outline-none focus:border-primary/50"
                  style={{ minHeight: '200px' }}
                />
              ) : project.memory.trim() ? (
                <div
                  className="cursor-pointer rounded-lg bg-card/40 p-2.5 transition-colors hover:bg-card/60"
                  onClick={() => { setInstructionsDraft(project.memory); setEditingInstructions(true); }}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setInstructionsDraft(project.memory); setEditingInstructions(true); } }}
                >
                  <pre className="line-clamp-[12] whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-muted-foreground">
                    {project.memory}
                  </pre>
                </div>
              ) : (
                <button
                  onClick={() => { setInstructionsDraft(''); setEditingInstructions(true); }}
                  className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                >
                  <Plus className="size-3" /> Add instructions
                </button>
              )}
            </div>

            {/* Project Files */}
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Project files</span>
                <button onClick={() => push({ title: 'Upload coming soon', variant: 'info' })}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground">
                  <Plus className="size-3" />
                </button>
              </div>
              <div className="space-y-1">
                {project.files.filter((f) => f.path !== 'memory.md').map((f) => {
                  const Icon = f.language === 'solidity' ? FileCode : f.language === 'json' ? Code : FileText;
                  const iconColor = f.language === 'solidity' ? 'text-blue-400' : f.language === 'json' ? 'text-amber-400' : 'text-muted-foreground';
                  return (
                    <button
                      key={f.path}
                      onClick={() => setViewingFile(f)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <Icon className={`size-4 shrink-0 ${iconColor}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-foreground">{f.path}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {(f.sizeBytes / 1024).toFixed(1)} KB · <span className="capitalize">{f.updatedBy}</span>
                        </p>
                      </div>
                      <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />
                    </button>
                  );
                })}
              </div>
              {project.files.filter((f) => f.path !== 'memory.md').length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground/60">No files yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* File viewer modal */}
      {viewingFile && (
        <FileViewerModal
          file={viewingFile}
          memoryContent={viewingFile.path === 'memory.md' ? project.memory : undefined}
          onClose={() => setViewingFile(null)}
          onSave={(content) => { onUpdateFile(viewingFile.path, content); setViewingFile(null); }}
          onDelete={() => { onDeleteFile(viewingFile.path); setViewingFile(null); }}
        />
      )}
    </>
  );
}
