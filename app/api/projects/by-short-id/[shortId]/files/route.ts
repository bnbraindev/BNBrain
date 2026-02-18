import {
  getProjectByShortId,
  listProjectFiles,
  getProjectFile,
} from '@/lib/server/project-store';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

/** Patterns that indicate a sensitive file path. */
const SENSITIVE_PATH_PATTERNS = ['.env', '.secret', 'credentials'];

/** Patterns in file content that indicate sensitive data. */
const SENSITIVE_CONTENT_PATTERNS = [
  /privateKey/i,
  /secretKey/i,
  /mnemonic/i,
  /PRIVATE_KEY/,
  /SECRET_KEY/,
  /-----BEGIN.*PRIVATE KEY-----/,
];

function isSensitivePath(path: string): boolean {
  const lower = path.toLowerCase();
  return SENSITIVE_PATH_PATTERNS.some((p) => lower.includes(p));
}

function hasSensitiveContent(content: string): boolean {
  return SENSITIVE_CONTENT_PATTERNS.some((p) => p.test(content));
}

/**
 * GET /api/projects/by-short-id/[shortId]/files
 * Public read: returns non-sensitive file list with content.
 * Does NOT require ownership — /x/ pages are read-only for visitors.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ shortId: string }> }
) {
  const { shortId } = await params;
  const ip = getRequestIpAddress(req);
  const rl = await checkRateLimit({
    key: `projects:shortid:files:ip:${ip}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const project = await getProjectByShortId(shortId);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const fileMetas = await listProjectFiles(project.id);

    // Filter out sensitive paths first
    const safeMetas = fileMetas.filter((f) => !isSensitivePath(f.path));

    // Fetch content for each safe file and filter out sensitive content
    const files: Array<{
      id: string;
      path: string;
      content: string;
      contentType: string;
      sizeBytes: number;
      updatedBy: string;
      version: number;
      updatedAt: number;
    }> = [];

    for (const meta of safeMetas) {
      const file = await getProjectFile(project.id, meta.path);
      if (!file) continue;

      // Skip files with sensitive content
      if (hasSensitiveContent(file.content)) continue;

      files.push({
        id: file.id,
        path: file.path,
        content: file.content,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        updatedBy: file.updatedBy,
        version: file.version,
        updatedAt: file.updatedAt,
      });
    }

    return Response.json({ files });
  } catch (error) {
    console.error('[projects/by-short-id/files GET]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
