export const PREVIEW_SCREENS = ['console', 'contracts', 'contract', 'contract-pending', 'profile', 'network', 'status'] as const;
export type PreviewScreenName = (typeof PREVIEW_SCREENS)[number];
