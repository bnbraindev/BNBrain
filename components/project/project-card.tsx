'use client';

import { FileText, MessageSquare, BookOpen } from 'lucide-react';
import type { Project } from './types';
import { PROJECT_TYPE_META, StatusBadge, TypeBadge, ShortUrl, TruncatedAddress, TimeAgo } from './ui';

/**
 * Project card for the home grid view.
 * Shows project type, status, contract address (if deployed), short URL, and stats.
 */
export function ProjectCard({
  project,
  onSelect,
  onOpenContract,
}: {
  project: Project;
  onSelect: () => void;
  onOpenContract?: () => void;
}) {
  const meta = PROJECT_TYPE_META[project.projectType];
  const Icon = meta.icon;

  return (
    <div
      onClick={onSelect}
      className="card-hover-lift cursor-pointer rounded-2xl border border-border bg-card/60 p-5 shadow-[0_8px_22px_-20px_rgba(0,0,0,0.45)] transition-all hover:bg-card/80"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(); }}
    >
      {/* Header: icon + badges */}
      <div className="mb-3 flex items-start justify-between">
        <div className={`flex size-10 items-center justify-center rounded-xl border ${meta.bgColor}`}>
          <Icon className={`size-5 ${meta.color}`} />
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={project.status} />
          <TypeBadge type={project.projectType} />
        </div>
      </div>

      {/* Name + description */}
      <h3 className="mb-1 text-sm font-semibold text-foreground">{project.name}</h3>
      <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{project.description}</p>

      {/* Contract address (if deployed) */}
      {project.primaryContractAddress && (
        <div className="mb-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
          <div className="flex items-center justify-between">
            <TruncatedAddress address={project.primaryContractAddress} chars={4} />
            {onOpenContract && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenContract(); }}
                className="text-[10px] text-primary/70 transition-colors hover:text-primary"
              >
                /x/{project.shortId}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-3 border-t border-border/50 pt-3">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <FileText className="size-3" />
          <span>{project.files.length} files</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <MessageSquare className="size-3" />
          <span>{project.conversations.length} chats</span>
        </div>
        <div className="ml-auto">
          <TimeAgo date={project.updatedAt} />
        </div>
      </div>

      {/* Memory indicator */}
      <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary/5 px-2 py-1">
        <BookOpen className="size-3 text-primary/60" />
        <span className="text-[10px] text-primary/70">
          memory.md · {project.memory.split('\n').length} lines
        </span>
      </div>

      {/* Short URL */}
      <div className="mt-2 flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
        <ShortUrl shortId={project.shortId} onClick={onOpenContract} />
      </div>
    </div>
  );
}
