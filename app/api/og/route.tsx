import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1a1a1a',
          backgroundImage: 'radial-gradient(circle at 25% 25%, #F0B90B10 0%, transparent 50%), radial-gradient(circle at 75% 75%, #F0B90B08 0%, transparent 50%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '20px',
              backgroundColor: '#F0B90B20',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '40px',
            }}
          >
            🛡️
          </div>
          <div
            style={{
              fontSize: '56px',
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-2px',
            }}
          >
            BNBrain
          </div>
        </div>
        <div
          style={{
            fontSize: '24px',
            color: '#F0B90B',
            fontWeight: 600,
            marginBottom: '12px',
          }}
        >
          AI-Powered Security Agent for BNB Chain
        </div>
        <div
          style={{
            fontSize: '16px',
            color: '#888',
            maxWidth: '500px',
            textAlign: 'center',
          }}
        >
          Token scanning • Wallet health • Smart swap • On-chain proof
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '30px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            color: '#666',
          }}
        >
          #VibingOnBNB • OpenClaw Hackathon
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
