'use client';

import { useState } from 'react';
import { FileCode2, CheckCircle, XCircle, Download, Code2, FolderOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { sanitizeUrl } from '@/lib/utils/format';
import { CodeViewerModal } from '@/components/ui/code-viewer-modal';

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
function FileList({ files, locale = 'en' }: { files: string[]; locale?: string }) {
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
          … {locale === 'zh' ? `还有 ${remaining} 个文件` : `${remaining} more files`}
        </div>
      )}
    </div>
  );
}

/** Button + modal source code preview */
function SourcePreview({ filePath, code, locale = 'en' }: { filePath: string; code: string; locale?: string }) {
  const [open, setOpen] = useState(false);
  const lineCount = code.split('\n').length;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors"
      >
        <Code2 className="size-3 shrink-0 text-primary" />
        <span className="font-medium font-mono truncate">{filePath}</span>
        <span className="text-muted-foreground/60">({lineCount} {locale === 'zh' ? '行' : 'lines'})</span>
        <span className="ml-auto text-primary text-[10px] font-medium shrink-0">
          {locale === 'zh' ? '查看源码' : 'View Source'}
        </span>
      </button>
      <CodeViewerModal
        open={open}
        onOpenChange={setOpen}
        code={code}
        fileName={filePath}
        locale={locale}
      />
    </div>
  );
}

export function ContractInfoCard({ data, locale = 'en' }: { data: ContractInfoCardData; locale?: string }) {
  const zh = locale === 'zh';
  const hasSource = Boolean(data.downloadUrl || data.mainSourceCode || data.files?.length);

  return (
    <Card className={data.isVerified ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileCode2 className="size-4 text-primary" />
          {zh ? '合约' : 'Contract'}: {data.contractName || shortenAddr(data.address)}
          <Badge variant="outline" className={`ml-auto text-xs ${data.isVerified ? 'border-emerald-500/30 text-emerald-500' : 'border-amber-500/30 text-amber-400'}`}>
            {data.isVerified ? (zh ? '已验证' : 'Verified') : (zh ? '未验证' : 'Not Verified')}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          {data.isVerified
            ? <CheckCircle className="size-4 text-emerald-500 shrink-0" />
            : <XCircle className="size-4 text-amber-500 shrink-0" />}
          <span>{data.isVerified
            ? (zh ? '源码已验证，可公开查看。' : 'Source code is verified and publicly visible.')
            : (data.message || (zh ? '源码未在浏览器上验证。' : 'Source code is not verified on the explorer.'))}</span>
        </div>

        {data.isVerified && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {data.compilerVersion && (
              <div className="rounded-lg border px-2.5 py-2">
                <p className="text-muted-foreground text-xs">{zh ? '编译器' : 'Compiler'}</p>
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
                <p className="text-muted-foreground text-xs">{zh ? '优化' : 'Optimization'}</p>
                <p>{data.optimizationUsed ? (zh ? `是 (${data.runs} 次)` : `Yes (${data.runs} runs)`) : (zh ? '否' : 'No')}</p>
              </div>
            )}
            {data.licenseType && (
              <div className="rounded-lg border px-2.5 py-2">
                <p className="text-muted-foreground text-xs">{zh ? '许可证' : 'License'}</p>
                <p>{data.licenseType}</p>
              </div>
            )}
          </div>
        )}

        {data.isProxy && (
          <div className="text-xs">
            <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-500">{zh ? '代理合约' : 'Proxy Contract'}</Badge>
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
              <span className="font-medium">{zh ? '源代码' : 'Source Code'}</span>
              {data.files && data.files.length > 1 && (
                <span className="text-muted-foreground">{data.files.length} {zh ? '个文件' : 'files'}</span>
              )}
              {data.totalSourceChars != null && data.totalSourceChars > 0 && (
                <span className="text-muted-foreground/60">· {formatSize(data.totalSourceChars)} {zh ? '字符' : 'chars'}</span>
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
              <FileList files={data.files} locale={locale} />
            )}

            {data.mainSourceCode && data.mainSourceFile && (
              <SourcePreview filePath={data.mainSourceFile} code={data.mainSourceCode} locale={locale} />
            )}
          </div>
        )}

        <p className="font-mono text-xs text-muted-foreground break-all">{data.address}</p>
      </CardContent>
    </Card>
  );
}
