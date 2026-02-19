'use client';

import { useState } from 'react';
import { X, Pencil, Save, Trash2, FileCode, Code, FileText } from 'lucide-react';
import type { ProjectFile } from './types';
import { UpdatedByBadge, CopyBtn, useToast } from './ui';

/**
 * Modal for viewing/editing a project file.
 * Click a file in the right panel → this opens.
 * Clean design: header (filename + meta), content, action bar.
 */
export function FileViewerModal({
  file,
  memoryContent,
  onClose,
  onSave,
  onDelete,
}: {
  file: ProjectFile;
  memoryContent?: string;
  onClose: () => void;
  onSave: (content: string) => void;
  onDelete: () => void;
}) {
  const { push } = useToast();
  const content = file.path === 'memory.md' && memoryContent ? memoryContent : file.content;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const isProtected = file.path === 'memory.md';

  const Icon = file.language === 'solidity' ? FileCode : file.language === 'json' ? Code : FileText;
  const iconColor = file.language === 'solidity' ? 'text-blue-400' : file.language === 'json' ? 'text-amber-400' : 'text-muted-foreground';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="animate-message-in flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Icon className={`size-4 ${iconColor}`} />
            <span className="text-sm font-medium text-foreground">{file.path}</span>
            <UpdatedByBadge by={file.updatedBy} />
            <span className="text-[10px] text-muted-foreground">v{file.version} · {file.sizeBytes.toLocaleString()} bytes</span>
          </div>
          <div className="flex items-center gap-1">
            <CopyBtn text={content} />
            <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-full min-h-[300px] w-full resize-none bg-transparent p-5 font-mono text-xs leading-relaxed text-foreground outline-none"
            />
          ) : (
            <pre className="whitespace-pre-wrap p-5 font-mono text-xs leading-relaxed text-foreground/90">
              {content}
            </pre>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center justify-between border-t border-border/50 px-5 py-3">
          <div>
            {!isProtected && !editing && (
              <button
                onClick={() => {
                  onDelete();
                  push({ title: `${file.path} deleted`, variant: 'success' });
                }}
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10"
              >
                <Trash2 className="size-3" /> Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => { setDraft(content); setEditing(false); }}
                  className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onSave(draft);
                    setEditing(false);
                    push({ title: 'File saved', variant: 'success' });
                  }}
                  className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                >
                  <Save className="size-3" /> Save
                </button>
              </>
            ) : (
              <button
                onClick={() => { setDraft(content); setEditing(true); }}
                className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Pencil className="size-3" /> Edit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
