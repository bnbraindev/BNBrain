'use client';

import React, { useMemo, memo } from 'react';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/utils/format';
import { CodeHighlighter } from './code-highlighter';

/**
 * Lightweight Markdown renderer — no heavy dependencies.
 * Supports: headers, bold, italic, code, code blocks, links, lists, tables, hr, blockquotes.
 */

// ─── Block-level parsing ─────────────────────────────────────

interface Block {
  type: string;
  content: string;
  children?: Block[];
  lang?: string;
  rows?: string[][];
  header?: string[];
  level?: number;
  ordered?: boolean;
}

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'code_block', content: codeLines.join('\n'), lang });
      continue;
    }

    // Table (detect |---|)
    if (i + 1 < lines.length && /^\|(.+\|)+$/.test(line.trim()) && /^\|[\s-:|]+\|$/.test(lines[i + 1].trim())) {
      const header = line.trim().split('|').filter(Boolean).map(s => s.trim());
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim().split('|').filter(Boolean).map(s => s.trim()));
        i++;
      }
      blocks.push({ type: 'table', content: '', header, rows });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, content: headingMatch[2] });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: 'hr', content: '' });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: 'blockquote', content: quoteLines.join('\n') });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: Block[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push({ type: 'li', content: lines[i].replace(/^\d+\.\s/, '') });
        i++;
      }
      blocks.push({ type: 'list', content: '', children: items, ordered: true });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: Block[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push({ type: 'li', content: lines[i].replace(/^[-*+]\s/, '') });
        i++;
      }
      blocks.push({ type: 'list', content: '', children: items, ordered: false });
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — collect until empty line or special block
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('> ') &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !(lines[i].trim().startsWith('|') && i + 1 < lines.length && /^\|[\s-:|]+\|$/.test(lines[i + 1]?.trim() ?? ''))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', content: paraLines.join('\n') });
  }

  return blocks;
}

// ─── Inline parsing ──────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  // Split on: **bold**, *italic*, `code`, [link](url)
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={key++} className="font-semibold text-foreground">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={key++} className="rounded-md border border-white/[0.06] bg-white/[0.08] px-1.5 py-0.5 text-[13.5px] font-mono text-foreground">
          {token.slice(1, -1)}
        </code>
      );
    } else if (match[2] && match[3]) {
      parts.push(
        <a
          key={key++}
          href={sanitizeUrl(match[3])}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary/60"
        >
          {match[2]}
        </a>
      );
    }

    lastIdx = regex.lastIndex;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ─── Block renderer ──────────────────────────────────────────

function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4';
      return (
        <Tag
          className={cn(
            'font-semibold tracking-tight text-foreground',
            block.level === 1 && 'text-[17px] mt-5 mb-2.5',
            block.level === 2 && 'text-[16px] mt-4 mb-2',
            block.level === 3 && 'text-[15px] mt-3 mb-1.5',
            block.level === 4 && 'text-[15px] mt-3 mb-1.5 text-muted-foreground',
          )}
        >
          {renderInline(block.content)}
        </Tag>
      );
    }

    case 'paragraph':
      return (
        <p className="leading-[1.7] [&:not(:first-child)]:mt-3">
          {renderInline(block.content)}
        </p>
      );

    case 'code_block':
      return <CodeHighlighter code={block.content} lang={block.lang} />;

    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag
          className={cn(
            'my-2 space-y-1 pl-5',
            block.ordered ? 'list-decimal' : 'list-disc',
            '[&>li]:marker:text-muted-foreground/50'
          )}
        >
          {block.children?.map((item, i) => (
            <li key={i} className="leading-[1.7] pl-0.5">
              {renderInline(item.content)}
            </li>
          ))}
        </Tag>
      );
    }

    case 'table':
      return (
        <div className="my-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-border bg-white/[0.04]">
                {block.header?.map((cell, i) => (
                  <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows?.map((row, ri) => (
                <tr key={ri} className="border-b border-border last:border-0">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'blockquote':
      return (
        <blockquote className="my-3 border-l-2 border-primary/30 pl-4 text-muted-foreground italic leading-[1.7]">
          {renderInline(block.content)}
        </blockquote>
      );

    case 'hr':
      return <hr className="my-4 border-border" />;

    default:
      return <p className="leading-[1.7]">{renderInline(block.content)}</p>;
  }
}

// ─── Public component ────────────────────────────────────────

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className="text-[15px] leading-[1.7] text-foreground/90">
      {blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}
    </div>
  );
});
