import type { MetadataRoute } from 'next';
import { createCaller, createTRPCContext } from '@forj/api';

/**
 * Auto-generated sitemap. Includes:
 *   - Static marketing pages (homepage, /how-it-works, /blog, etc.)
 *   - Every published article (one entry per blog post)
 *
 * Dynamic listings (jobs, services, profiles) are intentionally
 * NOT included — they change too fast for a static sitemap to keep
 * up, and search engines discover them via internal navigation
 * anyway. If we later add server-rendered job pages with strong
 * inbound SEO intent, we can extend this to include them.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://forj.app';

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/how-it-works`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/about`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/blog`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/help/disputes-and-recovery`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // Fetch published articles via the public tRPC caller. Wrapped in
  // try/catch so a DB hiccup at build time doesn't kill the sitemap
  // — the static pages still render and search engines try again
  // next crawl.
  let articleEntries: MetadataRoute.Sitemap = [];
  try {
    const ctx = await createTRPCContext({
      headers: new Headers(),
      user: null,
    });
    const caller = createCaller(ctx);
    // Pull up to 100 most-recent published articles. If we ever
    // grow past this, paginate the sitemap (Next.js supports
    // sitemap.xml/[id].ts for that).
    const { items } = await caller.article.list({ limit: 24 });
    articleEntries = items.map((a) => ({
      url: `${baseUrl}/blog/${a.slug}`,
      lastModified: a.publishedAt ?? undefined,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));
  } catch (err) {
    // Sentry would go here once wired. For now, console so the
    // build log surfaces the issue.
    console.error('[sitemap] failed to fetch articles:', err);
  }

  return [...staticPages, ...articleEntries];
}
