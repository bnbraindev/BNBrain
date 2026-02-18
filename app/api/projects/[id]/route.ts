import { z } from 'zod';
import {
  getProject,
  updateProject,
  deleteProject,
  listProjectFiles,
  type OwnerIdentity,
} from '@/lib/server/project-store';
import { listConversationsByOwner } from '@/lib/server/conversation-store';
import { getWalletAuthSessionFromRequest } from '@/lib/server/siwe-auth';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';

const OwnerSchema = z.object({
  ownerType: z.enum(['wallet', 'guest']),
  ownerId: z.string().min(1).max(120),
}).refine(
  (o) => {
    if (o.ownerType === 'wallet') return /^0x[0-9a-fA-F]{40}$/.test(o.ownerId);
    return o.ownerId.length >= 6;
  },
  { message: 'Invalid ownerId format for the given ownerType' }
);

const UpdateProjectBodySchema = z.object({
  owner: OwnerSchema,
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullish(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const DeleteProjectBodySchema = z.object({
  owner: OwnerSchema,
});

function normalizeOwner(owner: OwnerIdentity): OwnerIdentity {
  return {
    ownerType: owner.ownerType,
    ownerId: owner.ownerType === 'wallet' ? owner.ownerId.toLowerCase() : owner.ownerId,
  };
}

async function assertWalletOwnerAuthorized(
  req: Request,
  owner: OwnerIdentity
): Promise<Response | null> {
  if (owner.ownerType !== 'wallet') return null;
  const session = await getWalletAuthSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Wallet session required' }, { status: 401 });
  }
  if (session.address !== owner.ownerId.toLowerCase()) {
    return Response.json({ error: 'Wallet session does not match owner' }, { status: 403 });
  }
  return null;
}

function assertProjectOwnership(
  project: { ownerType: string; ownerId: string },
  owner: OwnerIdentity
): Response | null {
  if (project.ownerType !== owner.ownerType || project.ownerId !== owner.ownerId) {
    return Response.json({ error: 'Not authorized to access this project' }, { status: 403 });
  }
  return null;
}

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `projects:detail:ip:${ip}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const ownerType = searchParams.get('ownerType');
  const ownerId = searchParams.get('ownerId');
  if (!ownerType || !ownerId) {
    return Response.json({ error: 'ownerType and ownerId are required' }, { status: 400 });
  }

  const parsedOwner = OwnerSchema.safeParse({ ownerType, ownerId });
  if (!parsedOwner.success) {
    return Response.json(
      { error: 'Invalid owner info', details: parsedOwner.error.flatten() },
      { status: 400 }
    );
  }

  const owner = normalizeOwner(parsedOwner.data);
  const authError = await assertWalletOwnerAuthorized(req, owner);
  if (authError) return authError;

  try {
    const project = await getProject(id);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const ownershipError = assertProjectOwnership(project, owner);
    if (ownershipError) return ownershipError;

    // Fetch file metadata and conversations for this project
    const [files, projectConversations] = await Promise.all([
      listProjectFiles(id),
      listConversationsByOwner(owner, { projectId: id }),
    ]);

    const conversations = projectConversations.map(c => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
    }));

    return Response.json({
      project,
      files: files.map(f => ({
        id: f.id,
        path: f.path,
        contentType: f.contentType,
        sizeBytes: f.sizeBytes,
        updatedBy: f.updatedBy,
        version: f.version,
        updatedAt: f.updatedAt,
      })),
      conversations,
    });
  } catch (error) {
    console.error('[projects/[id] GET]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `projects:patch:ip:${ip}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = UpdateProjectBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const owner = normalizeOwner(parsed.data.owner);
  const authError = await assertWalletOwnerAuthorized(req, owner);
  if (authError) return authError;

  try {
    const project = await getProject(id);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const ownershipError = assertProjectOwnership(project, owner);
    if (ownershipError) return ownershipError;

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.metadata !== undefined) updates.metadata = parsed.data.metadata;

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 });
    }

    await updateProject(id, updates);
    const updated = await getProject(id);
    return Response.json({ project: updated });
  } catch (error) {
    console.error('[projects/[id] PATCH]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `projects:del:ip:${ip}`, limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = DeleteProjectBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const owner = normalizeOwner(parsed.data.owner);
  const authError = await assertWalletOwnerAuthorized(req, owner);
  if (authError) return authError;

  try {
    const project = await getProject(id);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const ownershipError = assertProjectOwnership(project, owner);
    if (ownershipError) return ownershipError;

    await deleteProject(id);
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[projects/[id] DELETE]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
