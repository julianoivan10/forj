/**
 * WorkChain Design Tokens
 * Shared across apps — consumed by Tailwind v4 CSS-first config via theme.css
 */

export const colors = {
  background: {
    DEFAULT: '#07091A',
    secondary: '#0D1130',
    tertiary: '#111540',
    elevated: '#161B45',
  },
  brand: {
    primary: '#00D4FF',
    secondary: '#7C3AED',
    accent: '#00FF94',
  },
  text: {
    primary: '#F0F6FF',
    secondary: 'rgba(240, 246, 255, 0.65)',
    tertiary: 'rgba(240, 246, 255, 0.35)',
    disabled: 'rgba(240, 246, 255, 0.2)',
  },
  border: {
    subtle: 'rgba(240, 246, 255, 0.06)',
    default: 'rgba(240, 246, 255, 0.1)',
    strong: 'rgba(240, 246, 255, 0.2)',
    brand: 'rgba(0, 212, 255, 0.25)',
  },
  semantic: {
    success: '#00FF94',
    warning: '#FFB800',
    error: '#FF4D6D',
    info: '#00D4FF',
  },
  glow: {
    brand: 'rgba(0, 212, 255, 0.15)',
    brandStrong: 'rgba(0, 212, 255, 0.35)',
    violet: 'rgba(124, 58, 237, 0.2)',
  },
} as const;

export const radius = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  xl: '24px',
  full: '9999px',
} as const;

export const fonts = {
  display: 'var(--font-geist)',
  body: 'var(--font-inter)',
  mono: 'var(--font-geist-mono)',
} as const;

export type WorkChainColors = typeof colors;
export type WorkChainRadius = typeof radius;
