import { randomBytes, randomUUID } from 'crypto';
import { ensureDatabaseSchema, getDbPool } from '@/lib/server/db';

// ── Types ──

export interface OwnerIdentity {
  ownerType: 'wallet' | 'guest';
  ownerId: string;
}

export interface Project {
  id: string;
  shortId: string;
  ownerType: 'wallet' | 'guest';
  ownerId: string;
  name: string;
  description: string | null;
  projectType: 'token' | 'nft' | 'defi' | 'custom';
  status: 'draft' | 'active' | 'archived';
  primaryChainId: number | null;
  primaryContractAddress: string | null;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  // Aggregated counts (populated by listProjects)
  conversationCount?: number;
  fileCount?: number;
}

export interface CreateProjectParams {
  owner: OwnerIdentity;
  name: string;
  description?: string;
  projectType?: 'token' | 'nft' | 'defi' | 'custom';
  primaryChainId?: number;
  metadata?: Record<string, unknown>;
}

export interface ProjectFilter {
  status?: 'draft' | 'active' | 'archived';
}

export interface ProjectFile {
  id: string;
  projectId: string;
  path: string;
  content: string;
  contentType: string;
  sizeBytes: number;
  updatedBy: 'ai' | 'user' | 'system';
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectFileMeta {
  id: string;
  projectId: string;
  path: string;
  contentType: string;
  sizeBytes: number;
  updatedBy: 'ai' | 'user' | 'system';
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertFileParams {
  path: string;
  content: string;
  contentType?: string;
  updatedBy?: 'ai' | 'user' | 'system';
  expectedVersion?: number; // for optimistic lock on update; omit for new files
}

export class ProjectFileConflictError extends Error {
  constructor(path: string, expected: number, actual: number) {
    super(`Version conflict for "${path}": expected ${expected}, got ${actual}`);
    this.name = 'ProjectFileConflictError';
  }
}

// ── Helpers ──

function normalizeOwner(owner: OwnerIdentity): OwnerIdentity {
  return {
    ownerType: owner.ownerType,
    ownerId: owner.ownerType === 'wallet' ? owner.ownerId.toLowerCase() : owner.ownerId,
  };
}

function parseProjectRow(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    shortId: String(row.short_id),
    ownerType: row.owner_type as 'wallet' | 'guest',
    ownerId: String(row.owner_id),
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    projectType: row.project_type as Project['projectType'],
    status: row.status as Project['status'],
    primaryChainId: row.primary_chain_id != null ? Number(row.primary_chain_id) : null,
    primaryContractAddress: row.primary_contract_address != null
      ? String(row.primary_contract_address)
      : null,
    metadata: (typeof row.metadata === 'object' && row.metadata !== null
      ? row.metadata
      : {}) as Record<string, unknown>,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    conversationCount: row.conversation_count != null ? Number(row.conversation_count) : undefined,
    fileCount: row.file_count != null ? Number(row.file_count) : undefined,
  };
}

function parseFileRow(row: Record<string, unknown>): ProjectFile {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    path: String(row.path),
    content: String(row.content),
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes),
    updatedBy: row.updated_by as ProjectFile['updatedBy'],
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function parseFileMetaRow(row: Record<string, unknown>): ProjectFileMeta {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    path: String(row.path),
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes),
    updatedBy: row.updated_by as ProjectFileMeta['updatedBy'],
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function inferContentType(path: string): string {
  if (path.endsWith('.md')) return 'text/markdown';
  if (path.endsWith('.sol')) return 'text/x-solidity';
  if (path.endsWith('.json')) return 'application/json';
  return 'text/plain';
}

function buildInitialMemory(name: string, projectType: string, description?: string): string {
  const date = new Date().toISOString().split('T')[0];
  if (projectType === 'token') {
    return `# ${name} — Project Memory

> Auto-maintained by BNB Shield AI. Last updated: ${date}.

## Contract

- Chain: BNB Smart Chain (56)
- Address: (not deployed yet)
- Status: Draft

## History

- ${date} — Project created

## TODO

- [ ] Deploy contract
- [ ] Verify on explorer
- [ ] Add liquidity
- [ ] Lock LP tokens
`;
  }

  // nft, defi, custom all use the generic template
  const descLine = description || 'New project.';
  return `# ${name} — Project Memory

> Auto-maintained by BNB Shield AI. Last updated: ${date}.

## Overview

${descLine}

## History

- ${date} — Project created

## TODO

- [ ] Define project requirements
`;
}

// ── Short ID Generation ──

export async function generateShortId(): Promise<string> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';

  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = randomBytes(6);
    const id = Array.from(bytes).map(b => chars[b % 36]).join('');
    const { rowCount } = await pool.query(
      'SELECT 1 FROM projects WHERE short_id = $1',
      [id]
    );
    if (rowCount === 0) return id;
  }
  throw new Error('Failed to generate unique short_id after 10 attempts');
}

// ── Project CRUD ──

export async function getProject(id: string): Promise<Project | null> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    'SELECT * FROM projects WHERE id = $1 LIMIT 1',
    [id]
  );
  if (rows.length === 0) return null;
  return parseProjectRow(rows[0] as Record<string, unknown>);
}

export async function getProjectByShortId(shortId: string): Promise<Project | null> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    'SELECT * FROM projects WHERE short_id = $1 LIMIT 1',
    [shortId]
  );
  if (rows.length === 0) return null;
  return parseProjectRow(rows[0] as Record<string, unknown>);
}

export async function createProject(params: CreateProjectParams): Promise<Project> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const owner = normalizeOwner(params.owner);

  const id = randomUUID();
  const shortId = await generateShortId();
  const now = Date.now();
  const projectType = params.projectType ?? 'custom';
  const metadata = params.metadata ?? {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO projects (
        id, short_id, owner_type, owner_id, name, description,
        project_type, status, primary_chain_id, metadata,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11)`,
      [
        id,
        shortId,
        owner.ownerType,
        owner.ownerId,
        params.name,
        params.description ?? null,
        projectType,
        params.primaryChainId ?? null,
        JSON.stringify(metadata),
        now,
        now,
      ]
    );

    // Initialize memory.md
    const memoryContent = buildInitialMemory(params.name, projectType, params.description);
    const memoryFileId = randomUUID();
    await client.query(
      `INSERT INTO project_files (
        id, project_id, path, content, content_type,
        size_bytes, updated_by, version, created_at, updated_at
      ) VALUES ($1,$2,'memory.md',$3,'text/markdown',$4,'system',1,$5,$6)`,
      [
        memoryFileId,
        id,
        memoryContent,
        Buffer.byteLength(memoryContent, 'utf8'),
        now,
        now,
      ]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // Return the newly created project
  const project = await getProject(id);
  return project!;
}

export async function updateProject(
  id: string,
  updates: Partial<Pick<Project, 'name' | 'description' | 'status' | 'primaryChainId' | 'primaryContractAddress' | 'metadata'>>
): Promise<void> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const now = Date.now();

  const setClauses: string[] = ['updated_at = $2'];
  const values: unknown[] = [id, now];
  let idx = 3;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${idx}`);
    values.push(updates.name);
    idx++;
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${idx}`);
    values.push(updates.description);
    idx++;
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${idx}`);
    values.push(updates.status);
    idx++;
  }
  if (updates.primaryChainId !== undefined) {
    setClauses.push(`primary_chain_id = $${idx}`);
    values.push(updates.primaryChainId);
    idx++;
  }
  if (updates.primaryContractAddress !== undefined) {
    setClauses.push(`primary_contract_address = $${idx}`);
    values.push(updates.primaryContractAddress);
    idx++;
  }
  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${idx}`);
    values.push(JSON.stringify(updates.metadata));
    idx++;
  }

  await pool.query(
    `UPDATE projects SET ${setClauses.join(', ')} WHERE id = $1`,
    values
  );
}

export async function deleteProject(id: string): Promise<void> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  // project_files CASCADE; conversations.project_id SET NULL (handled by FK)
  await pool.query('DELETE FROM projects WHERE id = $1', [id]);
}

export async function listProjects(
  ownerInput: OwnerIdentity,
  filter?: ProjectFilter
): Promise<Project[]> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const owner = normalizeOwner(ownerInput);

  const conditions = ['p.owner_type = $1', 'p.owner_id = $2'];
  const values: unknown[] = [owner.ownerType, owner.ownerId];
  let idx = 3;

  if (filter?.status) {
    conditions.push(`p.status = $${idx}`);
    values.push(filter.status);
    idx++;
  }

  const { rows } = await pool.query(
    `SELECT p.*,
       COALESCE(fc.file_count, 0) AS file_count,
       COALESCE(cc.conversation_count, 0) AS conversation_count
     FROM projects p
     LEFT JOIN (
       SELECT project_id, COUNT(*) AS file_count
       FROM project_files
       GROUP BY project_id
     ) fc ON fc.project_id = p.id
     LEFT JOIN (
       SELECT project_id, COUNT(*) AS conversation_count
       FROM conversations
       WHERE project_id IS NOT NULL
       GROUP BY project_id
     ) cc ON cc.project_id = p.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.updated_at DESC`,
    values
  );

  return rows.map((row) => parseProjectRow(row as Record<string, unknown>));
}

// ── File Operations ──

export async function getProjectFile(
  projectId: string,
  path: string
): Promise<ProjectFile | null> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    'SELECT * FROM project_files WHERE project_id = $1 AND path = $2 LIMIT 1',
    [projectId, path]
  );
  if (rows.length === 0) return null;
  return parseFileRow(rows[0] as Record<string, unknown>);
}

export async function upsertProjectFile(
  projectId: string,
  file: UpsertFileParams
): Promise<ProjectFile> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const now = Date.now();
  const contentType = file.contentType ?? inferContentType(file.path);
  const updatedBy = file.updatedBy ?? 'system';
  const sizeBytes = Buffer.byteLength(file.content, 'utf8');

  // Check if file exists
  const existing = await pool.query(
    'SELECT id, version FROM project_files WHERE project_id = $1 AND path = $2',
    [projectId, file.path]
  );

  if (existing.rows.length > 0) {
    // Update existing file with optimistic lock
    const currentVersion = Number(existing.rows[0].version);
    if (file.expectedVersion !== undefined && file.expectedVersion !== currentVersion) {
      throw new ProjectFileConflictError(file.path, file.expectedVersion, currentVersion);
    }

    const newVersion = currentVersion + 1;
    const { rows } = await pool.query(
      `UPDATE project_files
       SET content = $3, content_type = $4, size_bytes = $5,
           updated_by = $6, version = $7, updated_at = $8
       WHERE project_id = $1 AND path = $2 AND version = $9
       RETURNING *`,
      [projectId, file.path, file.content, contentType, sizeBytes, updatedBy, newVersion, now, currentVersion]
    );
    if (rows.length === 0) {
      // Version changed between our check and update — concurrent modification
      throw new ProjectFileConflictError(file.path, currentVersion, -1);
    }
    return parseFileRow(rows[0] as Record<string, unknown>);
  }

  // Insert new file
  const fileId = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO project_files (
      id, project_id, path, content, content_type,
      size_bytes, updated_by, version, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,$9)
    RETURNING *`,
    [fileId, projectId, file.path, file.content, contentType, sizeBytes, updatedBy, now, now]
  );
  return parseFileRow(rows[0] as Record<string, unknown>);
}

export async function deleteProjectFile(
  projectId: string,
  path: string
): Promise<void> {
  // Protect memory.md from deletion
  if (path === 'memory.md') {
    throw new Error('Cannot delete memory.md — it is a protected project file');
  }

  await ensureDatabaseSchema();
  const pool = getDbPool();
  await pool.query(
    'DELETE FROM project_files WHERE project_id = $1 AND path = $2',
    [projectId, path]
  );
}

export async function listProjectFiles(
  projectId: string
): Promise<ProjectFileMeta[]> {
  await ensureDatabaseSchema();
  const pool = getDbPool();
  const { rows } = await pool.query(
    `SELECT id, project_id, path, content_type, size_bytes,
            updated_by, version, created_at, updated_at
     FROM project_files
     WHERE project_id = $1
     ORDER BY path ASC`,
    [projectId]
  );
  return rows.map((row) => parseFileMetaRow(row as Record<string, unknown>));
}

// ── Memory Helpers ──

export async function updateProjectMemorySection(
  projectId: string,
  section: string,
  data: Record<string, unknown>
): Promise<void> {
  await ensureDatabaseSchema();

  const file = await getProjectFile(projectId, 'memory.md');
  if (!file) throw new Error(`memory.md not found for project ${projectId}`);

  let content = file.content;
  const date = new Date().toISOString().split('T')[0];

  // Update "Last updated" line
  content = content.replace(
    /Last updated: \d{4}-\d{2}-\d{2}/,
    `Last updated: ${date}`
  );

  // Find the section header and replace its content
  const sectionHeader = `## ${section}`;
  const sectionIdx = content.indexOf(sectionHeader);

  if (sectionIdx === -1) {
    // Section doesn't exist — append before History or at end
    const historyIdx = content.indexOf('## History');
    const insertPoint = historyIdx !== -1 ? historyIdx : content.length;
    const sectionContent = Object.entries(data)
      .map(([k, v]) => `- ${k}: ${String(v)}`)
      .join('\n');
    content =
      content.slice(0, insertPoint) +
      `${sectionHeader}\n\n${sectionContent}\n\n` +
      content.slice(insertPoint);
  } else {
    // Find the next section header
    const afterHeader = sectionIdx + sectionHeader.length;
    const nextSectionMatch = content.slice(afterHeader).search(/^## /m);
    const endIdx = nextSectionMatch !== -1
      ? afterHeader + nextSectionMatch
      : content.length;

    const sectionContent = Object.entries(data)
      .map(([k, v]) => `- ${k}: ${String(v)}`)
      .join('\n');
    content =
      content.slice(0, sectionIdx) +
      `${sectionHeader}\n\n${sectionContent}\n\n` +
      content.slice(endIdx);
  }

  await upsertProjectFile(projectId, {
    path: 'memory.md',
    content,
    contentType: 'text/markdown',
    updatedBy: 'ai',
    expectedVersion: file.version,
  });
}

export async function appendProjectMemoryHistory(
  projectId: string,
  entry: string
): Promise<void> {
  await ensureDatabaseSchema();

  const file = await getProjectFile(projectId, 'memory.md');
  if (!file) throw new Error(`memory.md not found for project ${projectId}`);

  let content = file.content;
  const date = new Date().toISOString().split('T')[0];

  // Update "Last updated" line
  content = content.replace(
    /Last updated: \d{4}-\d{2}-\d{2}/,
    `Last updated: ${date}`
  );

  // Find the History section and append at the end of it
  const historyHeader = '## History';
  const historyIdx = content.indexOf(historyHeader);

  if (historyIdx === -1) {
    // No History section — append one
    content += `\n${historyHeader}\n\n- ${date} — ${entry}\n`;
  } else {
    const afterHeader = historyIdx + historyHeader.length;
    const nextSectionMatch = content.slice(afterHeader).search(/^## /m);
    const endIdx = nextSectionMatch !== -1
      ? afterHeader + nextSectionMatch
      : content.length;

    // Insert before the next section (or at end)
    const historyContent = content.slice(historyIdx, endIdx).trimEnd();
    content =
      content.slice(0, historyIdx) +
      historyContent +
      `\n- ${date} — ${entry}\n\n` +
      content.slice(endIdx);
  }

  await upsertProjectFile(projectId, {
    path: 'memory.md',
    content,
    contentType: 'text/markdown',
    updatedBy: 'ai',
    expectedVersion: file.version,
  });
}
