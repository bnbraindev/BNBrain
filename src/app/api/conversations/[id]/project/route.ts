import { z } from 'zod';
import {
  updateConversationProject,
  type ConversationOwner,
} from '@/lib/server/conversation-store';
import { getProject, type OwnerIdentity } from '@/lib/server/project-store';
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
  projectId: z.string().max(120).nullable(),
});

function normalizeOwner(owner: ConversationOwner): ConversationOwner {
  return {
    ownerType: owner.ownerType,
    ownerId: owner.ownerType === 'wallet' ? owner.ownerId.toLowerCase() : owner.ownerId,
  };
}

async function assertWalletOwnerAuthorized(
  req: Request,
  owner: ConversationOwner
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `conv:project:ip:${ip}`, limit: 20, windowMs: 60_000 });
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

  const { projectId } = parsed.data;

  // If associating to a project, verify the project exists and belongs to the same owner
  if (projectId) {
    const project = await getProject(projectId);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }
    const projectOwner: OwnerIdentity = { ownerType: project.ownerType, ownerId: project.ownerId };
    if (projectOwner.ownerType !== owner.ownerType || projectOwner.ownerId !== owner.ownerId) {
      return Response.json({ error: 'Project does not belong to this owner' }, { status: 403 });
    }
  }

  try {
    const updated = await updateConversationProject(owner, conversationId, projectId);
    if (!updated) {
      return Response.json({ error: 'Conversation not found or not owned by you' }, { status: 404 });
    }
    return Response.json({ ok: true, projectId });
  } catch (error) {
    console.error('[conversations/[id]/project PATCH]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
