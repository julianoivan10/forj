export const APP_NAME = 'Forj';

/**
 * Canonical public origin, without a trailing slash. Vercel env values are
 * often pasted with one, which produced `https://host//sitemap.xml`.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://forj-pi.vercel.app').replace(
  /\/+$/,
  '',
);
export const APP_TAGLINE = 'Work, forged in trust.';
export const APP_DESCRIPTION =
  'A freelance platform built on Base. Smart-contract escrow, on-chain reputation, and frictionless payouts — without the Web3 jargon.';

export const AUTO_RELEASE_DAYS = 7;

export const JOB_CATEGORIES = [
  { value: 'development', label: 'Development', icon: 'Code2' },
  { value: 'design', label: 'Design', icon: 'Palette' },
  { value: 'writing', label: 'Writing', icon: 'PenLine' },
  { value: 'marketing', label: 'Marketing', icon: 'Megaphone' },
  { value: 'video', label: 'Video', icon: 'Video' },
  { value: 'audio', label: 'Audio', icon: 'Mic' },
  { value: 'data', label: 'Data', icon: 'Database' },
  { value: 'other', label: 'Other', icon: 'Sparkles' },
] as const;

export const DURATION_LABELS = {
  less_than_week: 'Less than a week',
  one_to_four_weeks: '1–4 weeks',
  one_to_three_months: '1–3 months',
  more_than_three_months: '3+ months',
} as const;

export const EXPERIENCE_LABELS = {
  entry: 'Entry level',
  intermediate: 'Intermediate',
  expert: 'Expert',
} as const;

export const BADGE_TIER_META = {
  none: { label: 'Newcomer', color: '#A0A7C4' },
  bronze: { label: 'Bronze', color: '#CD7F32' },
  silver: { label: 'Silver', color: '#C0C0C0' },
  gold: { label: 'Gold', color: '#FFD700' },
  diamond: { label: 'Diamond', color: '#00D4FF' },
} as const;
