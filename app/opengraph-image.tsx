import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Confluence Trading — Your disciplined trading command center';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#0d1117',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Ambient glow */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '800px',
            height: '400px',
            background: 'radial-gradient(ellipse, rgba(249,115,22,0.15) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />

        {/* Logo mark */}
        <svg
          viewBox="0 0 100 100"
          width="96"
          height="96"
          style={{ marginBottom: '28px' }}
        >
          <circle cx="50" cy="50" r="50" fill="#161b22" />
          <line x1="14" y1="28" x2="50" y2="50" stroke="white" strokeWidth="5.5" strokeLinecap="round" />
          <line x1="14" y1="72" x2="50" y2="50" stroke="white" strokeWidth="5.5" strokeLinecap="round" />
          <line x1="50" y1="50" x2="86" y2="50" stroke="white" strokeWidth="5.5" strokeLinecap="round" />
          <circle cx="50" cy="50" r="4.5" fill="white" />
        </svg>

        {/* Title */}
        <div
          style={{
            fontSize: '72px',
            fontWeight: '800',
            color: 'white',
            letterSpacing: '-2px',
            marginBottom: '16px',
            display: 'flex',
            gap: '0px',
          }}
        >
          <span>Confluence </span>
          <span style={{ color: '#F97316' }}>Trading</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '28px',
            color: '#8b949e',
            fontWeight: '400',
            letterSpacing: '0.5px',
          }}
        >
          Your disciplined trading command center
        </div>

        {/* Bottom border accent */}
        <div
          style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            right: '0',
            height: '3px',
            background: 'linear-gradient(to right, transparent, #F97316, transparent)',
          }}
        />
      </div>
    ),
    { ...size }
  );
}
