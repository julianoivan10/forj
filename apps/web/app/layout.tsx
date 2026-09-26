import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Instrument_Sans } from 'next/font/google';
import { Providers } from './providers';
import { ThemeScript } from '@/components/theme/theme-provider';
import { SITE_URL } from '@/lib/constants';
import './globals.css';

/**
 * Two families, self-hosted by next/font (no third-party stylesheet on the
 * critical path):
 *   - Instrument Sans: display and UI. A contemporary grotesk with enough
 *     character for oversized editorial type, calm at body sizes.
 *   - IBM Plex Mono: technical metadata (addresses, hashes, block numbers,
 *     mono labels). Reads as documentation, not as a code editor.
 */
const instrument = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-plex-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: {
    default: 'Forj — Work, forged in trust.',
    template: '%s | Forj',
  },
  description:
    'A freelance platform built on Base. Smart-contract escrow, on-chain reputation, and frictionless payouts — without the Web3 jargon.',
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: 'Forj — Work, forged in trust.',
    description:
      'A freelance platform built on Base. Smart-contract escrow, on-chain reputation, and frictionless payouts — without the Web3 jargon.',
    siteName: 'Forj',
    url: '/',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Forj — Work, forged in trust.',
    description:
      'Smart-contract escrow, on-chain reputation, frictionless payouts.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  // Browser chrome matches the page surface in each theme.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f1ec' },
    { media: '(prefers-color-scheme: dark)', color: '#121211' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${instrument.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Anti-FOUC: applies the persisted / system theme synchronously
            BEFORE first paint. Must stay above any CSS-using markup. */}
        <ThemeScript />
      </head>
      <body>
        {/* Accessibility: skip to main content */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-[var(--radius-md)] focus:bg-[var(--color-brand-primary)] focus:px-4 focus:py-2 focus:text-[var(--color-on-brand)] focus:font-semibold"
        >
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
