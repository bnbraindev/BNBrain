'use client';

import { useState, useMemo } from 'react';
import { Plus, Search, ChevronDown, FileText, MessageSquare, Clock } from 'lucide-react';
import type { Project } from './types';
import { PROJECT_TYPE_META, StatusBadge, TimeAgo } from './ui';

type SortKey = 'updated' | 'name' | 'created';

/**
 * Projects list page — Claude-style grid with search + sort.
 * Clean, minimal. 2-column card grid.
 */
export function ProjectsList({
  projects,
  onSelect,
  onNew,
}: {
  projects: Project[];
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [sortOpen, setSortOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = projects;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'created') return b.createdAt.localeCompare(a.createdAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [projects, search, sort]);

  const sortLabels: Record<SortKey, string> = { updated: 'Last edited', name: 'Name', created: 'Created' };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Projects</h1>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow transition-all hover:brightness-105 active:scale-[0.98]"
        >
          <Plus className="size-4" /> New project
        </button>
      </div>

      {/* Search + Sort */}
      <div className="mb-5 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full rounded-lg border border-border bg-background/60 py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40"
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setSortOpen(!sortOpen)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {sortLabels[sort]}
            <ChevronDown className="size-3.5" />
          </button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 rounded-lg border border-border bg-card py-1 shadow-xl">
                {(Object.entries(sortLabels) as [SortKey, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { setSort(key); setSortOpen(false); }}
                    className={`block w-full px-4 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                      sort === key ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {search ? 'No projects match your search' : 'No projects yet'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((p) => {
            const meta = PROJECT_TYPE_META[p.type];
            const Icon = meta.icon;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="flex items-start gap-3 rounded-xl border border-border bg-card/50 p-4 text-left transition-all hover:border-border hover:bg-card/80 hover:shadow-sm"
              >
                <div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border ${meta.bgColor}`}>
                  <Icon className={`size-4 ${meta.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.description}</p>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <MessageSquare className="size-2.5" /> {p.conversations.length}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <FileText className="size-2.5" /> {p.files.length}
                    </span>
                    <TimeAgo date={p.updatedAt} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
