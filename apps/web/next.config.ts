import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@forj/api', '@forj/db', '@forj/email'],
  typedRoutes: true,
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion', '@radix-ui/react-dialog'],
  },
  // SWC compiler tweaks. Strips ALL `console.*` calls in production bundles
  // EXCEPT `error` and `warn` — kills the noise from third-party libs
  // (ethers, Privy, Coinbase wallet, walletconnect) that log network info,
  // deprecation notices, and rate-limit warnings on every page load.
  // We keep error+warn so legit issues still surface in user devtools.
  compiler: isProd
    ? { removeConsole: { exclude: ['error', 'warn'] } }
    : undefined,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'utfs.io' },
      // UploadThing v7.4+ returns per-app `<appId>.ufs.sh` URLs.
      { protocol: 'https', hostname: '*.ufs.sh' },
      { protocol: 'https', hostname: 'gateway.pinata.cloud' },
      { protocol: 'https', hostname: '*.mypinata.cloud' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  async headers() {
    // Defense-in-depth: HTTP security headers applied to every route. The
    // CSP is intentionally NOT here — Privy + WalletConnect inject inline
    // styles + remote scripts that a strict CSP would block, and getting
    // it right requires per-provider testing. Revisit when we ship a
    // hardened production build.
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Force HTTPS for one year (incl. subdomains). Skipped in dev so
          // localhost works.
          ...(isProd
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains',
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
