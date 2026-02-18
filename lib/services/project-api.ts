/**
 * Client-side project API service.
 * Thin fetch wrappers for project CRUD + file operations.
 */

import { useChatStore } from '@/lib/stores/chat-store';
import type { ProjectType } from '@/components/project/types';

// ── Owner helpers ──

export interface OwnerIdentity {
  ownerType: 'wallet' | 'guest';
  ownerId: string;
}

export function getOwner(): OwnerIdentity {
  const { authenticatedAddress, guestId } = useChatStore.getState();
  return authenticatedAddress
    ? { ownerType: 'wallet', ownerId: authenticatedAddress.toLowerCase() }
    : { ownerType: 'guest', ownerId: guestId };
}

function ownerParams(owner: OwnerIdentity): string {
  return `ownerType=${encodeURIComponent(owner.ownerType)}&ownerId=${encodeURIComponent(owner.ownerId)}`;
}

// ── Types (API response shapes) ──

export interface ApiProject {
  id: string;
  shortId: string;
  ownerType: string;
  ownerId: string;
  name: string;
  description: string | null;
  projectType: ProjectType;
  status: 'draft' | 'active' | 'archived';
  primaryChainId: number | null;
  primaryContractAddress: string | null;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  conversationCount?: number;
  fileCount?: number;
}

export interface ApiProjectFile {
  id: string;
  projectId: string;
  path: string;
  content?: string;
  contentType: string;
  sizeBytes: number;
  updatedBy: 'ai' | 'user' | 'system';
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface ApiConversationRef {
  id: string;
  title: string;
  updatedAt: number;
}

// ── Project CRUD ──

export async function listProjects(
  owner?: OwnerIdentity
): Promise<ApiProject[]> {
  const o = owner ?? getOwner();
  const res = await fetch(`/api/projects?${ownerParams(o)}`);
  if (!res.ok) throw new Error(`listProjects failed: ${res.status}`);
  const data = await res.json();
  return data.projects;
}

export async function getProject(
  id: string,
  owner?: OwnerIdentity
): Promise<{
  project: ApiProject;
  files: ApiProjectFile[];
  conversations: ApiConversationRef[];
}> {
  const o = owner ?? getOwner();
  const res = await fetch(`/api/projects/${id}?${ownerParams(o)}`);
  if (!res.ok) throw new Error(`getProject failed: ${res.status}`);
  return res.json();
}

export async function createProject(params: {
  name: string;
  description?: string;
  projectType?: ProjectType;
  chainId?: number;
}): Promise<ApiProject> {
  const owner = getOwner();
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, ...params }),
  });
  if (!res.ok) throw new Error(`createProject failed: ${res.status}`);
  const data = await res.json();
  return data.project;
}

export async function updateProject(
  id: string,
  updates: { name?: string; description?: string; status?: string; metadata?: Record<string, unknown> }
): Promise<ApiProject> {
  const owner = getOwner();
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, ...updates }),
  });
  if (!res.ok) throw new Error(`updateProject failed: ${res.status}`);
  const data = await res.json();
  return data.project;
}

export async function deleteProject(id: string): Promise<void> {
  const owner = getOwner();
  const res = await fetch(`/api/projects/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner }),
  });
  if (!res.ok) throw new Error(`deleteProject failed: ${res.status}`);
}

// ── File operations ──

export async function getProjectFile(
  projectId: string,
  path: string,
  owner?: OwnerIdentity
): Promise<ApiProjectFile> {
  const o = owner ?? getOwner();
  const res = await fetch(
    `/api/projects/${projectId}/files/${encodeURIComponent(path)}?${ownerParams(o)}`
  );
  if (!res.ok) throw new Error(`getProjectFile failed: ${res.status}`);
  const data = await res.json();
  return data.file;
}

export async function upsertProjectFile(
  projectId: string,
  path: string,
  content: string,
  options?: { contentType?: string; updatedBy?: string; expectedVersion?: number }
): Promise<ApiProjectFile> {
  const owner = getOwner();
  const res = await fetch(
    `/api/projects/${projectId}/files/${encodeURIComponent(path)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, content, ...options }),
    }
  );
  if (res.status === 409) {
    const data = await res.json();
    throw Object.assign(new Error('Version conflict'), { currentVersion: data.currentVersion });
  }
  if (!res.ok) throw new Error(`upsertProjectFile failed: ${res.status}`);
  const data = await res.json();
  return data.file;
}

export async function listProjectFiles(
  projectId: string,
  owner?: OwnerIdentity
): Promise<ApiProjectFile[]> {
  const o = owner ?? getOwner();
  const res = await fetch(`/api/projects/${projectId}/files?${ownerParams(o)}`);
  if (!res.ok) throw new Error(`listProjectFiles failed: ${res.status}`);
  const data = await res.json();
  return data.files;
}

// ── Conversation association ──

export async function associateConversationToProject(
  conversationId: string,
  projectId: string | null
): Promise<void> {
  const owner = getOwner();
  const res = await fetch(`/api/conversations/${conversationId}/project`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, projectId }),
  });
  if (!res.ok) throw new Error(`associateConversation failed: ${res.status}`);
}
