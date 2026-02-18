'use client';

import { useState, useMemo, useCallback } from 'react';
import { Plus, Search, FolderOpen, FileText, MessageSquare, Loader2 } from 'lucide-react';
import { useProjectStore } from '@/lib/stores/project-store';
import { PROJECT_TYPE_META, STATUS_META } from '@/components/project/ui';
import { CreateProjectDialog } from '@/components/project/create-project-dialog';
import { useI18n } from '@/lib/i18n/context';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import type { ProjectType } from '@/components/project/types';

type SortKey = 'activity' | 'name' | 'created';

export function ProjectsGridView() {
  const { locale } = useI18n();
  const {
    projects,
    projectsLoading,
    navigateToProjectDetail,
    createProject,
  } = useProjectStore(
    useShallow((s) => ({
      projects: s.projects,
      projectsLoading: s.projectsLoading,
      navigateToProjectDetail: s.navigateToProjectDetail,
      createProject: s.createProject,
    }))
  );

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('activity');
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = projects;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.shortId.toLowerCase().includes(q)
      );
    }
    return list.slice().sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'created') return b.createdAt - a.createdAt;
      return b.updatedAt - a.updatedAt; // activity
    });
  }, [projects, search, sortBy]);

  const handleCreate = useCallback(
    async (name: string, description: string, type: ProjectType) => {
      const proj = await createProject({ name, description, projectType: type });
      navigateToProjectDetail(proj.id);
    },
    [createProject, navigateToProjectDetail]
  );

  function formatRelativeTime(epochMs: number): string {
    const diff = Date.now() - epochMs;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return locale === 'zh' ? '刚刚' : 'Just now';
    if (mins < 60) return locale === 'zh' ? `${mins} 分钟前` : `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return locale === 'zh' ? `${hrs} 小时前` : `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return locale === 'zh' ? `${days} 天前` : `${days}d ago`;
    return new Date(epochMs).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US');
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 px-6 pt-14 pb-4 sm:px-8 sm:pt-16">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-foreground">
              {locale === 'zh' ? '项目' : 'Projects'}
            </h1>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-all hover:brightness-105 active:scale-[0.98]"
            >
              <Plus className="size-3.5" />
              {locale === 'zh' ? '新建项目' : 'New project'}
            </button>
          </div>

          {/* Search + Sort */}
          <div className="mt-4 flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={locale === 'zh' ? '搜索项目...' : 'Search projects...'}
                className="h-9 w-full rounded-lg border border-border bg-card/60 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-ring/50 focus:ring-1 focus:ring-ring/30"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="h-9 rounded-lg border border-border bg-card/60 px-3 text-xs text-foreground outline-none"
            >
              <option value="activity">{locale === 'zh' ? '最近活动' : 'Activity'}</option>
              <option value="name">{locale === 'zh' ? '名称' : 'Name'}</option>
              <option value="created">{locale === 'zh' ? '创建时间' : 'Created'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 sm:px-8">
        <div className="mx-auto max-w-4xl">
          {projectsLoading && projects.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <FolderOpen className="size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {search.trim()
                  ? locale === 'zh'
                    ? '没有匹配的项目'
                    : 'No matching projects'
                  : locale === 'zh'
                    ? '还没有项目，创建第一个吧'
                    : 'No projects yet. Create your first one!'}
              </p>
              {!search.trim() && (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="mt-1 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
                >
                  <Plus className="mr-1.5 inline size-3.5" />
                  {locale === 'zh' ? '新建项目' : 'New project'}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filtered.map((project) => {
                const meta = PROJECT_TYPE_META[project.projectType];
                const statusMeta = STATUS_META[project.status];
                const Icon = meta.icon;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => navigateToProjectDetail(project.id)}
                    className="group flex items-start gap-3.5 rounded-xl border border-border bg-card/40 p-4 text-left transition-all duration-200 hover:border-primary/30 hover:bg-card/70 hover:shadow-md"
                  >
                    <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl border', meta.bgColor)}>
                      <Icon className={cn('size-5', meta.color)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                          {project.name}
                        </p>
                        <span className={cn('size-1.5 shrink-0 rounded-full', statusMeta.dotColor)} />
                      </div>
                      {project.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {project.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                        {project.fileCount !== undefined && (
                          <span className="flex items-center gap-0.5">
                            <FileText className="size-2.5" /> {project.fileCount}
                          </span>
                        )}
                        {project.conversationCount !== undefined && (
                          <span className="flex items-center gap-0.5">
                            <MessageSquare className="size-2.5" /> {project.conversationCount}
                          </span>
                        )}
                        <span className="ml-auto">
                          {formatRelativeTime(project.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CreateProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
