import { z } from 'zod';
import {
  getProject,
  listProjectFiles,
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

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `project-files:list:ip:${ip}`, limit: 30, windowMs: 60_000 });
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

    const files = await listProjectFiles(id);
    return Response.json({
      files: files.map(f => ({
        id: f.id,
        path: f.path,
        contentType: f.contentType,
        sizeBytes: f.sizeBytes,
        updatedBy: f.updatedBy,
        version: f.version,
        updatedAt: f.updatedAt,
      })),
    });
  } catch (error) {
    console.error('[projects/[id]/files GET]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
