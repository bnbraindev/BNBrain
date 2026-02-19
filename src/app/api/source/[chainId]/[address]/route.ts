/**
 * GET /api/source/[chainId]/[address]
 *
 * Serve cached contract source code.
 *   - No query param  → download pre-built zip
 *   - ?file=path.sol  → return individual source file
 *   - ?meta=1         → return metadata JSON
 *
 * If not yet cached, fetches from BscScan, caches, then serves.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import {
  isCached,
  getCachedZipBuffer,
  getCachedFileContent,
  getCachedMetadata,
  saveContractSource,
} from '@/lib/server/contract-source-cache';
import { getContractSourceCode } from '@/lib/services/bscscan';
import { checkRateLimit, getRequestIpAddress } from '@/lib/server/rate-limit';

interface RouteParams {
  params: Promise<{ chainId: string; address: string }>;
}

async function ensureCached(chainId: number, address: string): Promise<boolean> {
  if (isCached(chainId, address)) return true;

  const source = await getContractSourceCode(address, chainId);
  if (!source || !source.sourceCode) return false;

  await saveContractSource(chainId, address, source);
  return true;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const ip = getRequestIpAddress(request);
  const rl = await checkRateLimit({ key: `source:ip:${ip}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const { chainId: chainIdStr, address } = await params;
  const chainId = parseInt(chainIdStr, 10);

  if (isNaN(chainId) || !isAddress(address)) {
    return NextResponse.json({ error: 'Invalid chainId or address' }, { status: 400 });
  }

  const addr = address.toLowerCase();

  // Ensure source is cached
  const cached = await ensureCached(chainId, addr);
  if (!cached) {
    return NextResponse.json(
      { error: 'Contract source not found. It may not be verified on the explorer.' },
      { status: 404 }
    );
  }

  const { searchParams } = request.nextUrl;

  // ?meta=1 → return metadata
  if (searchParams.has('meta')) {
    const meta = getCachedMetadata(chainId, addr);
    return NextResponse.json(meta);
  }

  // ?file=path/to/File.sol → return individual file
  const filePath = searchParams.get('file');
  if (filePath) {
    const content = getCachedFileContent(chainId, addr, filePath);
    if (!content) {
      return NextResponse.json({ error: `File not found: ${filePath}` }, { status: 404 });
    }
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `inline; filename="${filePath.split('/').pop()}"`,
      },
    });
  }

  // Default → serve zip
  const zipBuffer = getCachedZipBuffer(chainId, addr);
  if (!zipBuffer) {
    return NextResponse.json({ error: 'Zip file not available' }, { status: 500 });
  }

  const filename = `${addr}.zip`;
  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(zipBuffer.length),
    },
  });
}
