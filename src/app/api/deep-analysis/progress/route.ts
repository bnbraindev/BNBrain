import { NextRequest, NextResponse } from 'next/server';
import { getAnalysisProgress } from '@/lib/server/analysis-progress';
import { ensureDatabaseSchema, getDbPool } from '@/lib/server/db';

/**
 * Lightweight owner check: verify the requesting owner has an active run
 * for this chatId. Uses the chat_runs table which is already indexed.
 * Returns true only when the owner matches exactly.
 */
async function verifyRunOwner(
  chatId: string,
  ownerType: string | null,
  ownerId: string | null,
): Promise<boolean> {
  if (!ownerType || !ownerId) return false;
  try {
    await ensureDatabaseSchema();
    const { rows } = await getDbPool().query(
      `SELECT 1 FROM chat_runs
       WHERE chat_id = $1 AND owner_type = $2 AND owner_id = $3
       LIMIT 1`,
      [chatId, ownerType, ownerType === 'wallet' ? ownerId.toLowerCase() : ownerId],
    );
    return rows.length > 0;
  } catch {
    // Fail closed on verification errors.
    return false;
  }
}

export async function GET(request: NextRequest) {
  const chatId = request.nextUrl.searchParams.get('chatId');
  if (!chatId) {
    return NextResponse.json({ error: 'Missing chatId' }, { status: 400 });
  }

  // Owner validation
  const ownerType = request.headers.get('x-bnb-owner-type');
  const ownerId = request.headers.get('x-bnb-owner-id');
  const isOwner = await verifyRunOwner(chatId, ownerType, ownerId);
  if (!isOwner) {
    return NextResponse.json({ active: false });
  }

  const progress = await getAnalysisProgress(chatId);
  if (!progress) {
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    active: !progress.finished,
    ...progress,
  });
}
