'use client';

import { useState, useCallback } from 'react';
import {
  ArrowLeft, ExternalLink, FileCode, Shield, Copy, Check,
  ChevronDown, ChevronRight, Loader2, BookOpen, MessageSquare,
} from 'lucide-react';
import type { Project, AbiFunction } from './types';
import { MOCK_ABI, MOCK_READ_RESULTS } from './mock-data';
import {
  StatusBadge, ChainBadge, VerifiedBadge, TruncatedAddress,
  CopyBtn, useToast,
} from './ui';

type ContractTab = 'read' | 'write';

/**
 * Contract management page — the /x/[short_id] view.
 * Shows contract info, ABI Read/Write panels, project file links.
 *
 * Spec ref: §4.4 /x/[short_id] — contract management page
 * Spec ref: §4.5 — auth rules (owner = full, others = read-only)
 */
export function ContractPage({
  project,
  onBack,
  onStartChat,
}: {
  project: Project;
  onBack: () => void;
  onStartChat: () => void;
}) {
  const { push } = useToast();
  const [tab, setTab] = useState<ContractTab>('read');
  const mainContract = project.contracts.find((c) => c.role === 'token') ?? project.contracts[0];

  if (!mainContract) return null;

  const readFns = MOCK_ABI.filter((f) => f.stateMutability === 'view' || f.stateMutability === 'pure');
  const writeFns = MOCK_ABI.filter((f) => f.stateMutability === 'nonpayable' || f.stateMutability === 'payable');

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 px-6 py-5">
        <div className="mb-3 flex items-center gap-2">
          <button onClick={onBack} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
          </button>
          <div className="h-4 w-px bg-border/50" />
          <span className="font-mono text-xs text-primary/70">/x/{project.shortId}</span>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                <FileCode className="size-5 text-primary" />
              </div>
              <h1 className="text-xl font-bold text-foreground">{mainContract.name}</h1>
              <StatusBadge status={project.status} />
              <ChainBadge chainId={mainContract.chainId} />
              <VerifiedBadge verified={mainContract.verified} />
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <TruncatedAddress address={mainContract.address} chars={8} />
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); push({ title: 'Would open BscScan', variant: 'info' }); }}
                className="flex items-center gap-1 text-[11px] text-primary/70 transition-colors hover:text-primary"
              >
                <ExternalLink className="size-3" /> BscScan
              </a>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onStartChat}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MessageSquare className="size-3.5" /> Chat
            </button>
            <button
              onClick={() => push({ title: 'Would open project detail', variant: 'info' })}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <BookOpen className="size-3.5" /> Files
            </button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          {[
            { label: 'Balance', value: '0 BNB' },
            { label: 'Txns', value: '24' },
            { label: 'Holders', value: '156' },
            { label: 'Token Price', value: '$0.0042' },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border/50 bg-card/30 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
              <p className="text-sm font-semibold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Multi-contract list */}
        {project.contracts.length > 1 && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Related contracts:</span>
            {project.contracts.filter((c) => c.address !== mainContract.address).map((c) => (
              <span key={c.address} className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-card/30 px-2 py-0.5 text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground">{c.name}</span>
                <span className="font-mono">{c.address.slice(0, 6)}...{c.address.slice(-4)}</span>
                {c.verified && <Check className="size-2.5 text-emerald-400" />}
              </span>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="mt-4 flex gap-1">
          {([
            { key: 'read' as const, label: `Read Contract (${readFns.length})` },
            { key: 'write' as const, label: `Write Contract (${writeFns.length})` },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-2">
          {tab === 'read' && readFns.map((fn) => (
            <ReadFunctionRow key={fn.name} fn={fn} />
          ))}
          {tab === 'write' && writeFns.map((fn) => (
            <WriteFunctionRow key={fn.name} fn={fn} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Read Function Row ──

function ReadFunctionRow({ fn }: { fn: AbiFunction }) {
  const [expanded, setExpanded] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const handleQuery = useCallback(() => {
    setQuerying(true);
    setTimeout(() => {
      const mockResult = MOCK_READ_RESULTS[fn.name];
      if (mockResult) {
        setResult(mockResult);
      } else {
        setResult('0');
      }
      setQuerying(false);
    }, 800);
  }, [fn.name]);

  return (
    <div className="rounded-xl border border-border bg-card/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {expanded ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronRight className="size-3 text-muted-foreground" />}
        <span className="font-mono text-xs font-medium text-foreground">{fn.name}</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          ({fn.inputs.map((i) => i.type).join(', ')})
        </span>
        <span className="ml-1 font-mono text-[10px] text-primary/60">
          → {fn.outputs.map((o) => o.type).join(', ') || 'void'}
        </span>
        {result !== null && (
          <span className="ml-auto font-mono text-[10px] text-emerald-400/80">{formatResult(fn.name, result)}</span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/30 px-4 py-3">
          {fn.inputs.length > 0 && (
            <div className="mb-3 space-y-2">
              {fn.inputs.map((input) => (
                <div key={input.name} className="flex items-center gap-2">
                  <label className="w-24 text-[10px] text-muted-foreground">
                    {input.name} <span className="text-primary/40">({input.type})</span>
                  </label>
                  <input
                    value={inputs[input.name] ?? ''}
                    onChange={(e) => setInputs((p) => ({ ...p, [input.name]: e.target.value }))}
                    className="flex-1 rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-primary/50"
                    placeholder={input.type === 'address' ? '0x...' : '0'}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleQuery}
              disabled={querying}
              className="rounded-md bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              {querying ? <Loader2 className="size-3 animate-spin" /> : 'Query'}
            </button>
            {result !== null && (
              <div className="flex items-center gap-1.5 font-mono text-xs text-foreground">
                <span className="text-emerald-400">→</span>
                <span>{formatResult(fn.name, result)}</span>
                <CopyBtn text={result} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Write Function Row ──

function WriteFunctionRow({ fn }: { fn: AbiFunction }) {
  const { push } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [executing, setExecuting] = useState(false);

  const handleExecute = useCallback(() => {
    setExecuting(true);
    setTimeout(() => {
      setExecuting(false);
      push({ title: `${fn.name}() simulated`, description: 'Would prompt wallet signature in production', variant: 'success' });
    }, 1200);
  }, [fn.name, push]);

  return (
    <div className="rounded-xl border border-border bg-card/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {expanded ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronRight className="size-3 text-muted-foreground" />}
        <span className="font-mono text-xs font-medium text-amber-300">{fn.name}</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          ({fn.inputs.map((i) => `${i.type} ${i.name}`).join(', ')})
        </span>
        {fn.stateMutability === 'payable' && (
          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-400">payable</span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/30 px-4 py-3">
          {fn.inputs.length > 0 ? (
            <div className="mb-3 space-y-2">
              {fn.inputs.map((input) => (
                <div key={input.name} className="flex items-center gap-2">
                  <label className="w-24 text-[10px] text-muted-foreground">
                    {input.name} <span className="text-primary/40">({input.type})</span>
                  </label>
                  <input
                    value={inputs[input.name] ?? ''}
                    onChange={(e) => setInputs((p) => ({ ...p, [input.name]: e.target.value }))}
                    className="flex-1 rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-primary/50"
                    placeholder={input.type === 'address' ? '0x...' : input.type === 'uint256' ? '0' : ''}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-3 text-[10px] text-muted-foreground">No parameters required</p>
          )}
          <button
            onClick={handleExecute}
            disabled={executing}
            className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
          >
            {executing ? <Loader2 className="size-3 animate-spin" /> : <Shield className="size-3" />}
            Execute
          </button>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──

function formatResult(fnName: string, raw: string): string {
  if (fnName === 'totalSupply' || fnName === 'maxTxAmount' || fnName === 'balanceOf' || fnName === 'allowance') {
    const n = BigInt(raw);
    const decimals = BigInt(10 ** 18);
    return `${(Number(n / decimals)).toLocaleString()} (${raw})`;
  }
  if (fnName === 'buyTax' || fnName === 'sellTax') {
    return `${Number(raw) / 100}% (${raw} bps)`;
  }
  return raw;
}
