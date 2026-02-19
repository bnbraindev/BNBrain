import { isSetupCompleted } from '@/lib/server/setup-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AUTO_CONFIG_URL = process.env.AUTO_CONFIG_URL || 'https://install.bnbrain.dev/config.json';
const FETCH_TIMEOUT_MS = 5000;

export async function GET() {
  // Only available before setup is completed
  const completed = await isSetupCompleted();
  if (completed) {
    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(AUTO_CONFIG_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return Response.json(
        { error: 'Config not available', status: res.status },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const data = await res.json();
    return Response.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json(
      { error: 'Failed to fetch auto-config' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
