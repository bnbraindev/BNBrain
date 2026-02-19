import { NextRequest, NextResponse } from 'next/server';
import { getReportById } from '@/lib/server/report-store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || id.length < 10) {
    return NextResponse.json({ error: 'Invalid report ID' }, { status: 400 });
  }

  const report = await getReportById(id);
  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get('format') === 'json') {
    return NextResponse.json({
      id: report.id,
      tokenAddress: report.tokenAddress,
      tokenName: report.tokenName,
      tokenSymbol: report.tokenSymbol,
      chainId: report.chainId,
      summary: report.summary,
      riskScore: report.riskScore,
      steps: report.steps,
      createdAt: report.createdAt,
    });
  }

  return new NextResponse(report.html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; img-src https: data:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'none'",
    },
  });
}
