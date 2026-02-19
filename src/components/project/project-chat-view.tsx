'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Shield, ArrowLeft, BookOpen, ChevronDown, Loader2, Bot,
  User, CheckCircle, FolderGit2, Plus,
} from 'lucide-react';
import type { Project, ProjectChatMsg, MemoryUpdate, ProjectChatCard } from './types';
import { TypeBadge, StreamingText, useToast, TruncatedAddress, CopyBtn } from './ui';
import { MemoryUpdateCard } from './memory-update-card';

/**
 * Split-layout chat within a project.
 * Left: conversation messages + memory update proposals.
 * Right: contextual cards (deploy results, contract info, etc.)
 *
 * Spec ref: §5.1 — system prompt injects project context
 * Spec ref: §7.2 — project creation flow from chat
 * Spec ref: §7.4 — cross-conversation context recovery
 */
export function ProjectChatView({
  project,
  onBack,
  onUpdateMemory,
  isNewConversation,
}: {
  project: Project;
  onBack: () => void;
  onUpdateMemory: (memory: string) => void;
  isNewConversation?: boolean;
}) {
  const { push } = useToast();
  const [messages, setMessages] = useState<ProjectChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [memoryExpanded, setMemoryExpanded] = useState(false);
  const [cards, setCards] = useState<ProjectChatCard[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cardsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    cardsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [cards]);

  // Cross-conversation demo: new conversation auto-greets with context
  useEffect(() => {
    if (!isNewConversation) return;
    const timer = setTimeout(() => {
      const hasContract = !!project.primaryContractAddress;
      const text = hasContract
        ? `Welcome back to **${project.name}**! I have full context from the project memory.\n\nCurrent status:\n- Contract deployed at \`${project.primaryContractAddress?.slice(0, 10)}...${project.primaryContractAddress?.slice(-8)}\`\n- Status: **${project.status}**\n- ${project.contracts.length} contract(s) tracked\n\nWhat would you like to do next? I can help with verification, adding liquidity, or any other operations.`
        : `Welcome to **${project.name}**! I have the project context loaded.\n\nThe project is currently in **draft** status. Would you like to start by deploying a contract?`;

      setMessages([{
        id: `msg-${Date.now()}`,
        role: 'assistant',
        text,
        streaming: true,
        toolHints: ['Loading project context', 'Reading memory.md'],
      }]);
      setIsStreaming(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [isNewConversation, project]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    const userText = input.trim();
    setInput('');

    const userId = `msg-${Date.now()}`;
    const assistantId = `msg-${Date.now() + 1}`;

    setMessages((prev) => [...prev, { id: userId, role: 'user', text: userText, streaming: false }]);
    setIsStreaming(true);

    setTimeout(() => {
      let aiText = '';
      let memoryUpdate: MemoryUpdate | undefined;
      let newCards: ProjectChatCard[] = [];
      let toolHints: string[] = [];
      let suggestions: string[] = [];

      const lc = userText.toLowerCase();
      if (lc.includes('deploy') || lc.includes('部署')) {
        toolHints = ['Compiling contract', 'Preparing deployment tx'];
        suggestions = ['Verify on BscScan', 'Add liquidity', 'Check security'];
        aiText = `I'll deploy the **${project.name}** contract to BSC.\n\n✅ **Deployment successful!**\n\n- **Contract**: \`0x5E3a7B8c9D0e1F2a3B4C5D6E7F8a9B0c1D2e3F4a\`\n- **TX Hash**: \`0xdef789abc123456...\`\n- **Gas Used**: 2,145,302 (0.0064 BNB)\n- **Block**: #38,291,047\n\nThe contract is now live. Would you like me to verify the source code on BscScan?`;
        memoryUpdate = {
          additions: [
            '## Contract (Updated)',
            '- Address: `0x5E3a7B8c9D0e1F2a3B4C5D6E7F8a9B0c1D2e3F4a`',
            '- Deploy TX: `0xdef789abc123456...`',
            '- Gas: 2,145,302 (0.0064 BNB)',
            '- Deployed: 2026-02-18',
            '',
            '## History (Appended)',
            '- 2026-02-18 — Deployed on BSC Mainnet (tx: 0xdef789ab...)',
          ],
          applied: false,
        };
        newCards = [{
          id: `card-${Date.now()}`,
          type: 'deploy-result',
          title: 'Deployment Result',
          loading: false,
          data: {
            contractAddress: '0x5E3a7B8c9D0e1F2a3B4C5D6E7F8a9B0c1D2e3F4a',
            txHash: '0xdef789abc123456...',
            gasUsed: '2,145,302',
            blockNumber: 38291047,
            status: 'success',
          },
        }];
      } else if (lc.includes('verify') || lc.includes('验证')) {
        toolHints = ['Submitting source to BscScan', 'Verifying bytecode match'];
        suggestions = ['Add liquidity', 'Run security audit', 'Check holders'];
        aiText = `I'll verify the contract source code on BscScan.\n\n✅ **Verification successful!**\n\n- **Status**: Verified ✓\n- **Compiler**: solc 0.8.19\n- **Optimization**: 200 runs\n- **License**: MIT\n\nThe contract is now publicly verified. Anyone can read the source code on BscScan.`;
        memoryUpdate = {
          additions: [
            '## Contract (Updated)',
            '- Verified: Yes (BscScan)',
            '',
            '## History (Appended)',
            '- 2026-02-18 — Source verified on BscScan',
            '',
            '## TODO (Updated)',
            '- [x] Verify on explorer',
          ],
          applied: false,
        };
        newCards = [{
          id: `card-${Date.now()}`,
          type: 'verification',
          title: 'Verification Result',
          loading: false,
          data: { status: 'verified', compiler: 'solc 0.8.19', optimization: '200 runs', license: 'MIT' },
        }];
      } else if (lc.includes('security') || lc.includes('audit') || lc.includes('安全')) {
        toolHints = ['Scanning GoPlus', 'Checking Honeypot.is'];
        suggestions = ['Deploy another contract', 'Add liquidity', 'View on BscScan'];
        aiText = `Running security audit on **${project.name}**...\n\n📊 **Audit Results:**\n- GoPlus Score: **94/100** ✅\n- No mint function: ✅\n- Anti-whale: ✅ (2% max tx)\n- Tax: 3%/3% ✅ (below 10%)\n- Owner privileges: ⚠️ Can modify tax rates\n\n**Recommendation:** Consider renouncing ownership to increase trust score.`;
        memoryUpdate = {
          additions: [
            '## Audit (Added)',
            '- GoPlus Score: 94/100',
            '- No critical issues',
            '- Recommendation: Renounce ownership',
            '',
            '## History (Appended)',
            '- 2026-02-18 — Security audit completed (94/100)',
          ],
          applied: false,
        };
        newCards = [{
          id: `card-${Date.now()}`,
          type: 'security',
          title: 'Security Report',
          loading: false,
          data: { score: 94, level: 'safe', isHoneypot: false, isMintable: false, buyTax: '3%', sellTax: '3%', ownerCanModify: true },
        }];
      } else {
        suggestions = ['Deploy to BSC', 'Run security audit', 'Check status'];
        aiText = `I have full context for **${project.name}** from the project memory.\n\nHere's what I can help with:\n- 📦 **Deploy** contracts to BSC\n- 🔍 **Verify** source code on BscScan\n- 🛡️ **Audit** security with GoPlus\n- 💧 **Add liquidity** on PancakeSwap\n\nWhat would you like to do?`;
      }

      if (newCards.length > 0) {
        setCards((prev) => [...prev, ...newCards]);
      }

      setMessages((prev) => [...prev, {
        id: assistantId,
        role: 'assistant',
        text: aiText,
        streaming: true,
        memoryUpdate,
        toolHints,
        suggestions,
      }]);
    }, 800);
  }, [input, isStreaming, project]);

  const handleApplyMemory = useCallback((msgId: string) => {
    setMessages((prev) => prev.map((m) => {
      if (m.id === msgId && m.memoryUpdate) {
        const addition = '\n\n' + m.memoryUpdate.additions.join('\n');
        onUpdateMemory(project.memory + addition);
        push({ title: 'Memory updated', description: 'Project memory has been updated', variant: 'success' });
        return { ...m, memoryUpdate: { ...m.memoryUpdate, applied: true } };
      }
      return m;
    }));
  }, [onUpdateMemory, project.memory, push]);

  const handleSkipMemory = useCallback((msgId: string) => {
    setMessages((prev) => prev.map((m) =>
      m.id === msgId ? { ...m, memoryUpdate: undefined } : m
    ));
  }, []);

  const hasCards = cards.length > 0;

  return (
    <div className="flex h-full">
      {/* LEFT: Conversation */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Topbar with project context */}
        <div className="shrink-0 border-b border-border/50">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <button onClick={onBack} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="size-4" />
              </button>
              <div className="h-4 w-px bg-border/50" />
              <Shield className="size-4 text-primary" />
              <span className="text-sm font-medium text-foreground">{project.name}</span>
              <TypeBadge type={project.projectType} />
            </div>
          </div>
          {/* Collapsible memory context */}
          <div className="border-t border-border/30 bg-primary/[0.03]">
            <button
              onClick={() => setMemoryExpanded(!memoryExpanded)}
              className="flex w-full items-center gap-2 px-4 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <BookOpen className="size-3 text-primary/60" />
              <span>Project memory injected</span>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">
                {project.memory.split('\n').length} lines
              </span>
              <ChevronDown className={`ml-auto size-3 transition-transform ${memoryExpanded ? 'rotate-180' : ''}`} />
            </button>
            {memoryExpanded && (
              <div className="max-h-[200px] overflow-y-auto border-t border-border/30 px-4 py-2">
                <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {project.memory}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.length === 0 && !isNewConversation && (
              <div className="py-16 text-center">
                <div className="mb-4 flex justify-center">
                  <div className="flex size-14 items-center justify-center rounded-2xl border border-ring/20 bg-primary/10">
                    <Bot className="size-7 text-primary" />
                  </div>
                </div>
                <h3 className="mb-1.5 text-lg font-semibold text-foreground">Chat with Project Context</h3>
                <p className="mb-1 text-sm text-muted-foreground">
                  Full context from <span className="font-medium text-foreground">{project.name}</span> loaded.
                </p>
                <p className="mb-6 text-xs text-muted-foreground/60">
                  Try: &quot;Deploy to BSC&quot; · &quot;Run security audit&quot; · &quot;Verify contract&quot;
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {['Deploy to BSC', 'Run security audit', 'Verify contract'].map((s) => (
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
                    <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <div className="flex size-5 items-center justify-center rounded-full bg-primary/10">
                        <Shield className="size-3 text-primary" />
                      </div>
                      <span className="text-xs font-semibold text-foreground">BNBrain</span>
                      {msg.streaming && msg.toolHints && msg.toolHints.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          {msg.toolHints.map((h) => (
                            <span key={h} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] text-primary">
                              <Loader2 className="size-2.5 animate-spin" /> {h}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="pl-[26px]">
                      <div className="text-sm leading-relaxed text-foreground/90">
                        {msg.streaming ? (
                          <StreamingText text={msg.text} speed={10} onDone={() => {
                            setIsStreaming(false);
                            setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, streaming: false } : m));
                          }} />
                        ) : (
                          <pre className="whitespace-pre-wrap font-sans">{msg.text}</pre>
                        )}
                      </div>

                      {/* Suggestions after streaming */}
                      {!msg.streaming && msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {msg.suggestions.map((s) => (
                            <button key={s} onClick={() => setInput(s)}
                              className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                              {s}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Memory update proposal */}
                      {msg.memoryUpdate && !msg.streaming && (
                        <MemoryUpdateCard
                          update={msg.memoryUpdate}
                          onApply={() => handleApplyMemory(msg.id)}
                          onSkip={() => handleSkipMemory(msg.id)}
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
        <div className="shrink-0 px-3 pb-4 pt-2 sm:px-4">
          <div className="relative mx-auto w-full max-w-3xl rounded-2xl border border-border bg-card/92 p-2 shadow-[0_18px_34px_-24px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-2.5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={`Ask about ${project.name}...`}
              className="min-h-[44px] max-h-[160px] w-full resize-none border-0 bg-transparent px-2 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none"
              rows={1}
            />
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <BookOpen className="size-3 text-primary/50" />
                <span>memory.md loaded</span>
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className="flex size-8 items-center justify-center rounded-lg bg-primary shadow-lg transition-all hover:brightness-105 active:scale-95 disabled:opacity-50"
              >
                {isStreaming ? <Loader2 className="size-3.5 animate-spin text-white" /> : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#fff" viewBox="0 0 256 256">
                    <path d="M208.49,120.49a12,12,0,0,1-17,0L140,69V216a12,12,0,0,1-24,0V69L64.49,120.49a12,12,0,0,1-17-17l72-72a12,12,0,0,1,17,0l72,72A12,12,0,0,1,208.49,120.49Z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Cards panel */}
      {hasCards && (
        <div className="w-[380px] shrink-0 border-l border-border/50 bg-background/80 backdrop-blur-sm">
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <FolderGit2 className="size-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Results</span>
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">{cards.length}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {cards.map((card) => (
                <ChatCard key={card.id} card={card} />
              ))}
              <div ref={cardsEndRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Chat Card (right panel) ──

function ChatCard({ card }: { card: ProjectChatCard }) {
  const d = card.data;
  if (card.type === 'deploy-result') {
    return (
      <div className="animate-message-in rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="mb-2 flex items-center gap-2">
          <CheckCircle className="size-4 text-emerald-400" />
          <span className="text-xs font-semibold text-foreground">{card.title}</span>
        </div>
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Contract</span>
            <TruncatedAddress address={d.contractAddress as string} chars={6} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">TX Hash</span>
            <span className="flex items-center gap-1 font-mono text-foreground/80">
              {(d.txHash as string).slice(0, 14)}...
              <CopyBtn text={d.txHash as string} />
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Gas Used</span>
            <span className="text-foreground/80">{d.gasUsed as string}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Block</span>
            <span className="text-foreground/80">#{(d.blockNumber as number).toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  }

  if (card.type === 'verification') {
    return (
      <div className="animate-message-in rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="mb-2 flex items-center gap-2">
          <CheckCircle className="size-4 text-emerald-400" />
          <span className="text-xs font-semibold text-foreground">{card.title}</span>
        </div>
        <div className="space-y-1.5 text-[11px]">
          {Object.entries(d).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between">
              <span className="text-muted-foreground capitalize">{k}</span>
              <span className="text-foreground/80">{String(v)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (card.type === 'security') {
    const score = d.score as number;
    const color = score >= 80 ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : score >= 50 ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' : 'text-red-400 border-red-500/20 bg-red-500/5';
    return (
      <div className={`animate-message-in rounded-xl border p-4 ${color}`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">{card.title}</span>
          <span className="text-lg font-bold">{score}/100</span>
        </div>
        <div className="space-y-1 text-[11px]">
          {Object.entries(d).filter(([k]) => k !== 'score' && k !== 'level').map(([k, v]) => (
            <div key={k} className="flex items-center justify-between">
              <span className="text-muted-foreground">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
              <span>{typeof v === 'boolean' ? (v ? '✅' : '❌') : String(v)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-message-in rounded-xl border border-border bg-card/40 p-4">
      <span className="text-xs font-medium text-foreground">{card.title}</span>
    </div>
  );
}
