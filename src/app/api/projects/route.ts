import { z } from 'zod';
import {
  createProject,
  listProjects,
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

const CreateProjectBodySchema = z.object({
  owner: OwnerSchema,
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  projectType: z.enum(['token', 'nft', 'defi', 'custom']).optional(),
  chainId: z.number().int().positive().optional(),
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

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `projects:ip:${ip}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const ownerType = searchParams.get('ownerType');
  const ownerId = searchParams.get('ownerId');
  if (!ownerType || !ownerId) {
    return Response.json(
      { error: 'ownerType and ownerId are required' },
      { status: 400 }
    );
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

  // Optional status filter
  const statusParam = searchParams.get('status');
  const filter = statusParam ? { status: statusParam as 'draft' | 'active' | 'archived' } : undefined;

  try {
    const projects = await listProjects(owner, filter);
    return Response.json({ projects });
  } catch (error) {
    console.error('[projects GET]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `projects:post:ip:${ip}`, limit: 15, windowMs: 60_000 });
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateProjectBodySchema.safeParse(body);
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
    const project = await createProject({
      owner,
      name: parsed.data.name,
      description: parsed.data.description,
      projectType: parsed.data.projectType,
      primaryChainId: parsed.data.chainId,
    });
    return Response.json({ project });
  } catch (error) {
    console.error('[projects POST]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
