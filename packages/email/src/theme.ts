export const emailTheme = {
  background: '#07091A',
  backgroundSecondary: '#0D1130',
  backgroundElevated: '#161B45',
  brandPrimary: '#00D4FF',
  brandSecondary: '#7C3AED',
  textPrimary: '#F0F6FF',
  textSecondary: 'rgba(240, 246, 255, 0.65)',
  textTertiary: 'rgba(240, 246, 255, 0.35)',
  borderSubtle: 'rgba(240, 246, 255, 0.1)',
  success: '#00FF94',
  warning: '#FFB800',
  error: '#FF4D6D',
} as const;

// Fallbacks must never point at a domain Forj doesn't control — links in
// emails would otherwise send users to whoever owns the old WorkChain domain.
export const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://forj-pi.vercel.app').replace(/\/+$/, '');
export const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
