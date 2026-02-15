'use client';

import { useState } from 'react';
import { FileCode2, CheckCircle, XCircle, Download, ChevronRight, FolderOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { sanitizeUrl } from '@/lib/utils/format';

export interface ContractInfoCardData {
  address: string;
  isVerified: boolean;
  contractName?: string | null;
  compilerVersion?: string | null;
  optimizationUsed?: boolean;
  runs?: string | null;
  evmVersion?: string | null;
  licenseType?: string | null;
  isProxy?: boolean;
  implementation?: string | null;
  sourceCodeLength?: number;
  message?: string;
  // New fields from cache integration
  downloadUrl?: string | null;
  files?: string[] | null;
  isMultiFile?: boolean;
  totalSourceChars?: number;
  tokenEstimate?: number;
  mainSourceFile?: string | null;
  mainSourceCode?: string | null;
}

function shortenAddr(addr: string) {
  if (addr.length <= 14) return addr;
  return addr.slice(0, 8) + '…' + addr.slice(-4);
}

function formatSize(chars: number): string {
  if (chars < 1000) return `${chars}`;
  if (chars < 1_000_000) return `${(chars / 1000).toFixed(1)}K`;
  return `${(chars / 1_000_000).toFixed(1)}M`;
}

/** Show top N files with sizes, plus "N more" */
function FileList({ files }: { files: string[] }) {
  const MAX_SHOW = 5;
  const shown = files.filter(f => !f.startsWith('@')).slice(0, MAX_SHOW);
  const remaining = files.length - shown.length;

  return (
    <div className="space-y-0.5 text-xs font-mono text-muted-foreground">
      {shown.map(f => (
        <div key={f} className="truncate pl-3">
          {f}
        </div>
      ))}
      {remaining > 0 && (
        <div className="pl-3 text-muted-foreground/60">
          … {remaining} more files
        </div>
      )}
    </div>
  );
}

/** Collapsible source code preview */
function SourcePreview({ filePath, code }: { filePath: string; code: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = code.split('\n');
  const lineCount = lines.length;
  const preview = expanded ? code : lines.slice(0, 12).join('\n') + (lineCount > 12 ? '\n// …' : '');

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <FileCode2 className="size-3 shrink-0" />
        <span className="font-medium font-mono">{filePath}</span>
        <span className="text-muted-foreground/60">({lineCount} lines)</span>
        <ChevronRight className={`ml-auto size-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      <pre className="mt-1.5 max-h-[320px] overflow-auto rounded-md bg-muted/70 p-2.5 text-xs leading-relaxed text-muted-foreground/80 scrollbar-thin">
        <code>{preview}</code>
      </pre>
    </div>
  );
}

export function ContractInfoCard({ data }: { data: ContractInfoCardData }) {
  const hasSource = Boolean(data.downloadUrl || data.mainSourceCode || data.files?.length);

  return (
    <Card className={data.isVerified ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileCode2 className="size-4 text-primary" />
          Contract: {data.contractName || shortenAddr(data.address)}
          <Badge variant="outline" className={`ml-auto text-xs ${data.isVerified ? 'border-emerald-500/30 text-emerald-500' : 'border-amber-500/30 text-amber-400'}`}>
            {data.isVerified ? 'Verified' : 'Not Verified'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          {data.isVerified
            ? <CheckCircle className="size-4 text-emerald-500 shrink-0" />
            : <XCircle className="size-4 text-amber-500 shrink-0" />}
          <span>{data.isVerified ? 'Source code is verified and publicly visible.' : (data.message || 'Source code is not verified on the explorer.')}</span>
        </div>

        {data.isVerified && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {data.compilerVersion && (
              <div className="rounded-lg border px-2.5 py-2">
                <p className="text-muted-foreground text-xs">Compiler</p>
                <p className="font-mono truncate">{data.compilerVersion}</p>
              </div>
            )}
            {data.evmVersion && (
              <div className="rounded-lg border px-2.5 py-2">
                <p className="text-muted-foreground text-xs">EVM</p>
                <p className="font-mono">{data.evmVersion}</p>
              </div>
            )}
            {data.optimizationUsed !== undefined && (
              <div className="rounded-lg border px-2.5 py-2">
                <p className="text-muted-foreground text-xs">Optimization</p>
                <p>{data.optimizationUsed ? `Yes (${data.runs} runs)` : 'No'}</p>
              </div>
            )}
            {data.licenseType && (
              <div className="rounded-lg border px-2.5 py-2">
                <p className="text-muted-foreground text-xs">License</p>
                <p>{data.licenseType}</p>
              </div>
            )}
          </div>
        )}

        {data.isProxy && (
          <div className="text-xs">
            <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-500">Proxy Contract</Badge>
            {data.implementation && (
              <span className="ml-2 font-mono text-muted-foreground">→ {shortenAddr(data.implementation)}</span>
            )}
          </div>
        )}

        {/* Source code section */}
        {hasSource && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <FolderOpen className="size-3.5 text-primary shrink-0" />
              <span className="font-medium">Source Code</span>
              {data.files && data.files.length > 1 && (
                <span className="text-muted-foreground">{data.files.length} files</span>
              )}
              {data.totalSourceChars != null && data.totalSourceChars > 0 && (
                <span className="text-muted-foreground/60">· {formatSize(data.totalSourceChars)} chars</span>
              )}
              {data.downloadUrl && (
                <a
                  href={sanitizeUrl(data.downloadUrl)}
                  download
                  className="ml-auto flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <Download className="size-3" />
                  ZIP
                </a>
              )}
            </div>

            {data.files && data.files.length > 1 && (
              <FileList files={data.files} />
            )}

            {data.mainSourceCode && data.mainSourceFile && (
              <SourcePreview filePath={data.mainSourceFile} code={data.mainSourceCode} />
            )}
          </div>
        )}

        <p className="font-mono text-xs text-muted-foreground break-all">{data.address}</p>
      </CardContent>
    </Card>
  );
}
