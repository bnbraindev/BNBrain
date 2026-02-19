import { z } from 'zod';
import {
  getProject,
  getProjectFile,
  upsertProjectFile,
  deleteProjectFile,
  ProjectFileConflictError,
  type OwnerIdentity,
} from '@/lib/server/project-store';
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

const PutFileBodySchema = z.object({
  owner: OwnerSchema,
  content: z.string().max(500_000),
  contentType: z.string().max(50).optional(),
  updatedBy: z.enum(['ai', 'user', 'system']).optional(),
  expectedVersion: z.number().int().positive().optional(),
});

const DeleteFileBodySchema = z.object({
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

function resolveFilePath(pathSegments: string[]): string {
  return pathSegments.join('/');
}

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  const { id, path: pathSegments } = await params;
  const filePath = resolveFilePath(pathSegments);

  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `project-files:read:ip:${ip}`, limit: 60, windowMs: 60_000 });
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

    if (project.ownerType !== owner.ownerType || project.ownerId !== owner.ownerId) {
      return Response.json({ error: 'Not authorized to access this project' }, { status: 403 });
    }

    const file = await getProjectFile(id, filePath);
    if (!file) {
      return Response.json({ error: 'File not found' }, { status: 404 });
    }

    return Response.json({
      file: {
        id: file.id,
        path: file.path,
        content: file.content,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        updatedBy: file.updatedBy,
        version: file.version,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      },
    });
  } catch (error) {
    console.error('[projects/[id]/files/[...path] GET]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  const { id, path: pathSegments } = await params;
  const filePath = resolveFilePath(pathSegments);

  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `project-files:write:ip:${ip}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PutFileBodySchema.safeParse(body);
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

    if (project.ownerType !== owner.ownerType || project.ownerId !== owner.ownerId) {
      return Response.json({ error: 'Not authorized to access this project' }, { status: 403 });
    }

    const file = await upsertProjectFile(id, {
      path: filePath,
      content: parsed.data.content,
      contentType: parsed.data.contentType,
      updatedBy: parsed.data.updatedBy,
      expectedVersion: parsed.data.expectedVersion,
    });

    return Response.json({
      file: {
        id: file.id,
        path: file.path,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        updatedBy: file.updatedBy,
        version: file.version,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof ProjectFileConflictError) {
      // Extract current version from the error message for the client
      const match = error.message.match(/got (\d+|-\d+)/);
      const currentVersion = match ? parseInt(match[1], 10) : undefined;
      return Response.json(
        {
          error: 'Version conflict',
          message: error.message,
          currentVersion: currentVersion !== -1 ? currentVersion : undefined,
        },
        { status: 409 }
      );
    }
    console.error('[projects/[id]/files/[...path] PUT]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  const { id, path: pathSegments } = await params;
  const filePath = resolveFilePath(pathSegments);

  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `project-files:del:ip:${ip}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = DeleteFileBodySchema.safeParse(body);
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

    if (project.ownerType !== owner.ownerType || project.ownerId !== owner.ownerId) {
      return Response.json({ error: 'Not authorized to access this project' }, { status: 403 });
    }

    // Check if file exists before trying to delete
    const existing = await getProjectFile(id, filePath);
    if (!existing) {
      return Response.json({ error: 'File not found' }, { status: 404 });
    }

    await deleteProjectFile(id, filePath);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot delete memory.md')) {
      return Response.json(
        { error: 'Cannot delete memory.md — it is a protected project file' },
        { status: 403 }
      );
    }
    console.error('[projects/[id]/files/[...path] DELETE]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
