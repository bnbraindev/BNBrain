import {
  getProjectByShortId,
  listProjectFiles,
} from '@/lib/server/project-store';
import { listConversationsByOwner } from '@/lib/server/conversation-store';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

/**
 * GET /api/projects/by-short-id/[shortId]
 * Public read: returns project info, file metadata, and conversations.
 * Does NOT require ownership — /x/ pages are read-only for non-owners.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ shortId: string }> }
) {
  const { shortId } = await params;
  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({ key: `projects:shortid:ip:${ip}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const project = await getProjectByShortId(shortId);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Determine ownership from query params
    const url = new URL(req.url);
    const reqOwnerType = url.searchParams.get('ownerType');
    const reqOwnerId = url.searchParams.get('ownerId');
    const isOwner =
      !!reqOwnerType && !!reqOwnerId &&
      project.ownerType === reqOwnerType &&
      project.ownerId.toLowerCase() === reqOwnerId.toLowerCase();

    // Fetch file metadata and conversations
    const owner = { ownerType: project.ownerType as 'wallet' | 'guest', ownerId: project.ownerId };
    const [files, projectConversations] = await Promise.all([
      listProjectFiles(project.id),
      listConversationsByOwner(owner, { projectId: project.id }),
    ]);

    const conversations = projectConversations.map(c => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
    }));

    // Strip ownerId/ownerType from public response; return isOwner flag instead
    const { ownerId: _oid, ownerType: _ot, ...publicProject } = project;

    return Response.json({
      project: publicProject,
      isOwner,
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
    console.error('[projects/by-short-id GET]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
