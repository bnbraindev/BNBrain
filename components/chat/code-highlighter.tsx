'use client';

import { useMemo, memo, useCallback, useState, useRef, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

/**
 * Lightweight syntax highlighter — no external dependencies.
 * Covers Solidity, JSON, JavaScript/TypeScript, and generic fallback.
 * Uses a simple regex tokenizer with CSS classes for theming.
 */

type Token = { type: string; value: string };

// ─── Tokenizer rules per language ──────────────────────────

const COMMENT_LINE = /\/\/[^\n]*/;
const COMMENT_BLOCK = /\/\*[\s\S]*?\*\//;
const STRING_DQ = /"(?:[^"\\]|\\.)*"/;
const STRING_SQ = /'(?:[^'\\]|\\.)*'/;
const STRING_BT = /`(?:[^`\\]|\\.)*`/;
const NUMBER = /\b(?:0x[\da-fA-F]+|0b[01]+|0o[0-7]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/;

const SOLIDITY_KEYWORDS =
  /\b(?:pragma|solidity|contract|interface|library|abstract|function|modifier|event|error|struct|enum|mapping|constructor|fallback|receive|returns|return|if|else|for|while|do|break|continue|emit|require|assert|revert|new|delete|try|catch|using|is|import|from|as)\b/;
const SOLIDITY_TYPES =
  /\b(?:uint(?:8|16|32|64|128|256)?|int(?:8|16|32|64|128|256)?|bool|address|string|bytes(?:\d{1,2})?|mapping|payable)\b/;
const SOLIDITY_VISIBILITY = /\b(?:public|private|internal|external|view|pure|memory|storage|calldata|constant|immutable|indexed|virtual|override)\b/;
const SOLIDITY_BUILTIN = /\b(?:msg|block|tx|abi|this|super|type|keccak256|sha256|ecrecover|selfdestruct)\b/;

const JS_KEYWORDS =
  /\b(?:const|let|var|function|return|if|else|for|while|do|break|continue|switch|case|default|throw|try|catch|finally|new|delete|typeof|instanceof|void|in|of|class|extends|super|import|export|from|as|async|await|yield|this|true|false|null|undefined)\b/;
const JS_TYPES =
  /\b(?:string|number|boolean|object|any|void|never|unknown|bigint|symbol|interface|type|enum)\b/;

function tokenize(code: string, lang: string): Token[] {
  const tokens: Token[] = [];
  let remaining = code;

  const langLower = lang.toLowerCase();
  const isSol = langLower === 'solidity' || langLower === 'sol';
  const isJson = langLower === 'json' || langLower === 'jsonc';
  const isJs =
    langLower === 'javascript' ||
    langLower === 'js' ||
    langLower === 'typescript' ||
    langLower === 'ts' ||
    langLower === 'jsx' ||
    langLower === 'tsx';

  // Build combined regex based on language
  const patterns: [RegExp, string][] = [];

  if (!isJson) {
    patterns.push([COMMENT_BLOCK, 'comment']);
    patterns.push([COMMENT_LINE, 'comment']);
  }
  patterns.push([STRING_DQ, 'string']);
  patterns.push([STRING_SQ, 'string']);
  if (!isJson) {
    patterns.push([STRING_BT, 'string']);
  }
  patterns.push([NUMBER, 'number']);

  if (isSol) {
    patterns.push([SOLIDITY_KEYWORDS, 'keyword']);
    patterns.push([SOLIDITY_TYPES, 'type']);
    patterns.push([SOLIDITY_VISIBILITY, 'modifier']);
    patterns.push([SOLIDITY_BUILTIN, 'builtin']);
  } else if (isJs) {
    patterns.push([JS_KEYWORDS, 'keyword']);
    patterns.push([JS_TYPES, 'type']);
  } else if (isJson) {
    // JSON keys are handled via strings
    patterns.push([/\b(?:true|false|null)\b/, 'keyword']);
  }

  while (remaining.length > 0) {
    let bestMatch: { index: number; length: number; type: string; value: string } | null = null;

    for (const [pattern, type] of patterns) {
      const re = new RegExp(pattern.source, 'g');
      re.lastIndex = 0;
      const match = re.exec(remaining);
      if (match && match.index === 0) {
        if (!bestMatch || match[0].length > bestMatch.length) {
          bestMatch = {
            index: 0,
            length: match[0].length,
            type,
            value: match[0],
          };
        }
      }
    }

    if (bestMatch) {
      tokens.push({ type: bestMatch.type, value: bestMatch.value });
      remaining = remaining.slice(bestMatch.length);
    } else {
      // Find next token start
      let nextTokenAt = remaining.length;
      for (const [pattern] of patterns) {
        const re = new RegExp(pattern.source, 'g');
        re.lastIndex = 1; // skip first char
        const match = re.exec(remaining);
        if (match && match.index < nextTokenAt) {
          nextTokenAt = match.index;
        }
      }
      tokens.push({ type: 'plain', value: remaining.slice(0, nextTokenAt) });
      remaining = remaining.slice(nextTokenAt);
    }
  }

  return tokens;
}

// ─── Token to styled span ──────────────────────────────────

const TOKEN_CLASSES: Record<string, string> = {
  keyword: 'text-violet-400',
  type: 'text-cyan-400',
  string: 'text-emerald-400',
  number: 'text-amber-400',
  comment: 'text-muted-foreground/50 italic',
  modifier: 'text-sky-400',
  builtin: 'text-orange-400',
  plain: '',
};

function TokenSpan({ token }: { token: Token }) {
  const className = TOKEN_CLASSES[token.type] ?? '';
  if (!className) return <>{token.value}</>;
  return <span className={className}>{token.value}</span>;
}

// ─── Public component ──────────────────────────────────────

interface CodeHighlighterProps {
  code: string;
  lang?: string;
}

export const CodeHighlighter = memo(function CodeHighlighter({
  code,
  lang = '',
}: CodeHighlighterProps) {
  const [copied, setCopied] = useState(false);
  const { pushToast } = useToast();
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

  const tokens = useMemo(() => {
    if (!lang) return null;
    return tokenize(code, lang);
  }, [code, lang]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
      pushToast({ title: 'Copied', variant: 'success', durationMs: 1500 });
    }).catch(() => {});
  }, [code, pushToast]);

  return (
    <div className="group/code relative my-3">
      {/* Header bar with language + copy */}
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-white/[0.08] bg-white/[0.04] px-3.5 py-1.5">
        <span className="text-xs font-mono text-muted-foreground/70">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground/60 transition-colors hover:bg-white/[0.06] hover:text-muted-foreground"
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? (
            <Check className="size-3 text-emerald-500" />
          ) : (
            <Copy className="size-3" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="rounded-b-lg rounded-t-none border border-t-0 border-white/[0.08] bg-[oklch(0.11_0.015_260)] p-3.5 text-[13.5px] overflow-x-auto font-mono leading-[1.65]">
        <code>
          {tokens
            ? tokens.map((token, i) => <TokenSpan key={i} token={token} />)
            : code}
        </code>
      </pre>
    </div>
  );
});
