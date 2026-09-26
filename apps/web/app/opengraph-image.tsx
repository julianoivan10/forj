import { ImageResponse } from 'next/og';

export const alt = 'Forj — Work, forged in trust.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Social card for every page that doesn't define its own. Rendered at
 * build time with system fonts only — no network fetch in the build.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#f3f1ec',
          color: '#16150f',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 700 }}>
          <div style={{ width: 18, height: 18, background: '#1f3fd1' }} />
          Forj
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 108, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>Work,</div>
          <div style={{ display: 'flex', fontSize: 108, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>
            <span style={{ color: '#1f3fd1' }}>forged</span>
            <span>&nbsp;in trust.</span>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '2px solid #16150f',
            paddingTop: 24,
            fontSize: 24,
            color: '#4a4841',
          }}
        >
          <span>Freelance work with USDC escrow on Base</span>
          <span>forj</span>
        </div>
      </div>
    ),
    size,
  );
}
