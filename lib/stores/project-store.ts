'use client';

import { create } from 'zustand';
import type { SidebarTab } from '@/components/project/types';
import {
  listProjects,
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  getProject as apiGetProject,
  type ApiProject,
  type ApiProjectFile,
  type ApiConversationRef,
  type OwnerIdentity,
} from '@/lib/services/project-api';

export interface ProjectDetail {
  project: ApiProject;
  files: ApiProjectFile[];
  conversations: ApiConversationRef[];
}

interface ProjectState {
  // Sidebar tab
  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;

  // Project list
  projects: ApiProject[];
  projectsLoading: boolean;
  projectsError: string | null;
  fetchProjects: (owner?: OwnerIdentity) => Promise<void>;

  // Active project detail
  activeProjectId: string | null;
  activeProjectDetail: ProjectDetail | null;
  activeProjectLoading: boolean;
  setActiveProject: (id: string | null) => void;
  fetchProjectDetail: (id: string, owner?: OwnerIdentity) => Promise<void>;

  // Create / delete
  createProject: (params: {
    name: string;
    description?: string;
    projectType?: 'token' | 'nft' | 'defi' | 'custom';
  }) => Promise<ApiProject>;
  deleteProject: (id: string) => Promise<void>;

  // Reset
  reset: () => void;
}

// Helpers for persisting activeProjectId across page reloads (sessionStorage)
const SESSION_KEY = 'bnb-active-project-id';

function readSessionProjectId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSessionProjectId(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (id) sessionStorage.setItem(SESSION_KEY, id);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* noop */ }
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  sidebarTab: 'chats',
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  projects: [],
  projectsLoading: false,
  projectsError: null,
  fetchProjects: async (owner) => {
    set({ projectsLoading: true, projectsError: null });
    try {
      const projects = await listProjects(owner);
      set({ projects, projectsLoading: false });
    } catch (err) {
      set({
        projectsError: err instanceof Error ? err.message : 'Failed to load projects',
        projectsLoading: false,
      });
    }
  },

  activeProjectId: readSessionProjectId(),
  activeProjectDetail: null,
  activeProjectLoading: false,
  setActiveProject: (id) => {
    const current = get().activeProjectId;
    if (current === id) return;
    writeSessionProjectId(id);
    set({ activeProjectId: id, activeProjectDetail: id ? get().activeProjectDetail : null });
    if (id) {
      void get().fetchProjectDetail(id);
    }
  },
  fetchProjectDetail: async (id, owner) => {
    set({ activeProjectLoading: true });
    try {
      const detail = await apiGetProject(id, owner);
      // Only set if still active
      if (get().activeProjectId === id) {
        set({ activeProjectDetail: detail, activeProjectLoading: false });
      }
    } catch {
      set({ activeProjectLoading: false });
    }
  },

  createProject: async (params) => {
    const project = await apiCreateProject(params);
    set((s) => ({ projects: [project, ...s.projects] }));
    return project;
  },
  deleteProject: async (id) => {
    await apiDeleteProject(id);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
      activeProjectDetail: s.activeProjectId === id ? null : s.activeProjectDetail,
    }));
  },

  reset: () => {
    writeSessionProjectId(null);
    set({
      sidebarTab: 'chats',
      projects: [],
      projectsLoading: false,
      projectsError: null,
      activeProjectId: null,
      activeProjectDetail: null,
      activeProjectLoading: false,
    });
  },
}));
