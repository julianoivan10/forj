import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/constants';

/**
 * Robots policy.
 *
 * Default: allow indexing of everything (we want jobs / services /
 * profile pages in Google).
 *
 * Disallowed:
 *   - `/admin/*` — internal admin tooling. The `admin/layout.tsx`
 *     already emits `<meta name="robots" content="noindex,nofollow">`;
 *     this is the disk-level defense-in-depth.
 *   - `/api/*` — tRPC + auth endpoints. Nothing here is HTML for a
 *     bot to render anyway, but disallowing keeps the crawl budget
 *     focused on real content.
 *   - `/dashboard/*` — authed user dashboard. Indexing personal
 *     dashboards leaks 401 redirect targets into search results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/dashboard/', '/preview/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
