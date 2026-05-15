import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import { ThemeScript } from '@/components/theme/theme-provider';
import './globals.css';

/**
 * Fonts:
 *   - Display: Geist (kept as fallback) + General Sans loaded via @import
 *     in globals.css. The CSS variable `--font-general-sans` is set on
 *     :root so the `--font-display` token in theme.css picks it up.
 *   - Body: Inter — universal & free, paired well with General Sans.
 *   - Mono: JetBrains Mono (primary) + Geist Mono (fallback). Used for
 *     0x addresses, code, monospace UI bits.
 */
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  openGraph: {
    title: 'Forj — Work, forged in trust.',
    description:
      'A freelance platform built on Base. Smart-contract escrow, on-chain reputation, and frictionless payouts — without the Web3 jargon.',
    siteName: 'Forj',
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
  // Match the new Bauhaus dark background so the browser chrome (Safari
  // status bar, Android nav) blends in instead of flashing a stale colour.
  themeColor: '#14130E',
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
      className={`${geist.variable} ${geistMono.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* General Sans display font from Fontshare. Loaded async; falls
            back to Geist (declared in `--font-display`) until ready. */}
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=general-sans@500,600,700&display=swap"
        />
        {/* Anti-FOUC: applies the persisted / system theme synchronously
            BEFORE first paint. Must stay above any CSS-using markup. */}
        <ThemeScript />
      </head>
      <body>
        {/* Accessibility: skip to main content */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-[var(--radius-md)] focus:bg-[var(--color-brand-primary)] focus:px-4 focus:py-2 focus:text-[#14130E] focus:font-semibold"
        >
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
