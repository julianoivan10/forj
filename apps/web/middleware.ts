import { NextResponse, type NextRequest } from 'next/server';

/**
 * Host-based routing for the admin surface.
 *
 * Two operating modes — chosen at deploy time via the `ADMIN_HOSTNAME`
 * env var:
 *
 *   • **Default (env unset)** — `/admin/*` is reachable on whatever
 *     host the request lands on. This is the local-dev mode and the
 *     mode the demo Vercel deploy runs in (we don't have a custom
 *     subdomain on `.vercel.app`). The server-side `adminProcedure`
 *     tRPC middleware is still the real gate.
 *
 *   • **Subdomain mode (env set to e.g. `admin.forj.app`)** —
 *     `/admin/*` is reachable ONLY when the request's host header
 *     matches `ADMIN_HOSTNAME` exactly. Requests to `/admin/*` on
 *     any other host get rewritten to the Next.js not-found page.
 *     Visiting the admin subdomain at `/` (root) gets rewritten to
 *     `/admin` so the hub renders without the user typing `/admin`.
 *
 *     This is the production-recommended mode: it removes the
 *     admin surface from the public domain entirely, so a leaked
 *     URL on the main site doesn't surface admin chrome (even if
 *     the chrome itself is harmless — it 401s every tRPC anyway).
 *
 * What this is NOT:
 *   - It's not authentication. `ADMIN_USER_IDS` + `adminProcedure`
 *     gate every admin tRPC procedure server-side. The middleware
 *     is purely about which hostname can SHOW the admin pages.
 *   - It's not a redirect on the main host. Hitting `forj.com/admin`
 *     gives a 404 (rewrite to /_not-found), NOT a redirect to
 *     `admin.forj.com/admin` — confirming the admin URL via redirect
 *     would leak it to drive-by scanners.
 *
 * Vercel per-environment configuration:
 *   - Production: `ADMIN_HOSTNAME=admin.forj.app`
 *   - Preview: leave unset (each preview gets a unique hostname; we
 *     don't want admin blocked on preview deploys)
 *   - Development: leave unset
 */
export function middleware(request: NextRequest) {
  const adminHost = process.env.ADMIN_HOSTNAME;
  // No env set → path mode. Pass everything through unchanged.
  if (!adminHost) return NextResponse.next();

  const url = request.nextUrl;
  // `request.headers.get('host')` includes the port in dev
  // (`localhost:3000`); production omits it. Compare strict equality
  // — partial matches would let `admin.attacker.com` impersonate.
  const requestHost = request.headers.get('host') ?? '';
  const isAdminHost = requestHost === adminHost;
  const isAdminPath = url.pathname.startsWith('/admin');

  // On the admin subdomain, requesting the bare root sends users to
  // the admin hub. Avoids the "blank page" UX of landing on the
  // subdomain with nothing to see.
  if (isAdminHost && url.pathname === '/') {
    const rewriteUrl = url.clone();
    rewriteUrl.pathname = '/admin';
    return NextResponse.rewrite(rewriteUrl);
  }

  // On the public (non-admin) host, `/admin/*` returns the framework
  // not-found page. We use rewrite-to-not-found (rather than a 404
  // status from a custom response) so the user gets the styled
  // Next.js not-found page instead of an unstyled error.
  if (isAdminPath && !isAdminHost) {
    const notFoundUrl = url.clone();
    notFoundUrl.pathname = '/_not-found';
    return NextResponse.rewrite(notFoundUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on every request EXCEPT Next.js internals + static assets.
    // The negative-lookahead keeps the middleware bundle's work
    // minimal. /api/* IS matched so future API-side host gating is
    // possible without a config change (currently no-op for it).
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
