import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, Calendar } from 'lucide-react';
import { createCaller, createTRPCContext } from '@forj/api';
import { Badge, UserAvatar } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Notes from the Forj team on building a Web3 freelance marketplace — engineering, design, security, and the on-chain reputation thesis.',
};

/**
 * Public blog index. Renders the first page of published articles
 * via an RSC server-call to tRPC's caller (no client-side fetch +
 * no flash of loading state). Subsequent pages (when we implement
 * "Load more") will come from a client component using the same
 * `article.list` query with the cursor.
 *
 * Why RSC over a client useQuery: SEO. The article list is a public
 * marketing page that benefits from full HTML pre-rendering. Search
 * crawlers and OpenGraph scrapers see the content directly without
 * waiting for React to hydrate.
 */
export default async function BlogIndexPage() {
  const ctx = await createTRPCContext({
    headers: new Headers(),
    // Public route — no user, no auth required.
    user: null,
  });
  const caller = createCaller(ctx);
  const { items } = await caller.article.list({ limit: 12 });

  return (
    <article className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <header className="text-center">
        <div className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--color-border-brand)] bg-[var(--color-glow-brand)] px-3 py-1 text-xs font-medium text-[var(--color-brand-primary)]">
          <BookOpen className="size-3.5" /> Blog
        </div>
        <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
          Notes from the team
        </h1>
        <p className="mt-3 max-w-2xl text-base text-[var(--color-text-secondary)] sm:mx-auto">
          Engineering decisions, design rationale, security audits, and the
          on-chain reputation thesis — all the thinking behind Forj, written
          longform.
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((post) => (
            <ArticleCard key={post.id} post={post} />
          ))}
        </section>
      )}
    </article>
  );
}

type ListItem = Awaited<
  ReturnType<ReturnType<typeof createCaller>['article']['list']>
>['items'][number];

function ArticleCard({ post }: { post: ListItem }) {
  const date = post.publishedAt ? new Date(post.publishedAt) : null;
  const authorName =
    post.author?.displayName ?? post.author?.username ?? 'Forj team';
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-border-brand)]"
    >
      {/* Cover. Falls back to a neutral gradient so cards without an
          image still feel intentional rather than empty. */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[var(--color-glow-brand)]">
        {post.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImageUrl}
            alt=""
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <BookOpen className="size-8 text-[var(--color-text-tertiary)]" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <h2 className="line-clamp-2 font-display text-base font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-brand-primary)] sm:text-lg">
          {post.title}
        </h2>
        {post.excerpt ? (
          <p className="line-clamp-3 text-sm text-[var(--color-text-secondary)]">
            {post.excerpt}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] pt-3 text-xs text-[var(--color-text-tertiary)]">
          <div className="flex min-w-0 items-center gap-2">
            <UserAvatar
              name={authorName}
              imageUrl={post.author?.avatarUrl ?? null}
              size="sm"
            />
            <span className="truncate">{authorName}</span>
          </div>
          {date ? (
            <span className="inline-flex items-center gap-1 shrink-0">
              <Calendar className="size-3" />
              {date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="mt-16 flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40 px-6 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-background-tertiary)]">
        <BookOpen className="size-6 text-[var(--color-text-tertiary)]" />
      </div>
      <h3 className="font-display text-lg font-semibold text-[var(--color-text-primary)]">
        Nothing published yet
      </h3>
      <p className="max-w-md text-sm text-[var(--color-text-secondary)]">
        We&apos;re writing the first few pieces. Check back in a few days, or
        watch the GitHub repo for design-doc updates in the meantime.
      </p>
      <Link
        href="/how-it-works"
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-brand-primary)] hover:underline"
      >
        How Forj works <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
