import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PreviewScreen } from './preview-screens';
import { PREVIEW_SCREENS, type PreviewScreenName } from './screens';

export const metadata: Metadata = {
  title: 'UI preview',
  robots: { index: false, follow: false },
};

/**
 * Fixture-driven previews of authenticated screens, for visual and
 * responsive checks without a wallet login.
 *
 * The routes only exist in development, or in a production build made with
 * FORJ_UI_PREVIEW=1. Every other build generates no params and, with
 * `dynamicParams = false`, answers a real 404 without rendering anything.
 */
const enabled = process.env.NODE_ENV !== 'production' || process.env.FORJ_UI_PREVIEW === '1';

export const dynamicParams = false;

export function generateStaticParams() {
  return enabled ? PREVIEW_SCREENS.map((screen) => ({ screen })) : [];
}

export default async function PreviewPage({ params }: { params: Promise<{ screen: string }> }) {
  if (!enabled) notFound();
  const { screen } = await params;
  if (!PREVIEW_SCREENS.includes(screen as PreviewScreenName)) notFound();
  return <PreviewScreen screen={screen as PreviewScreenName} />;
}
