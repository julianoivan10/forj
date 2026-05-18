import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar } from 'lucide-react';
import { TRPCError } from '@trpc/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createCaller, createTRPCContext } from '@forj/api';
import { UserAvatar } from '@/components/ui';

type Props = {
  params: Promise<{ slug: string }>;
};

async function fetchArticle(slug: string) {
  const ctx = await createTRPCContext({
    headers: new Headers(),
    user: null,
  });
  const caller = createCaller(ctx);
  try {
    return await caller.article.getBySlug({ slug });
  } catch (err) {
    if (err instanceof TRPCError && err.code === 'NOT_FOUND') {
      return null;
    }
    throw err;
  }
}

/**
 * Per-article metadata for OpenGraph + Twitter cards. Build at
 * request time so we use the article's own title / excerpt /
 * cover image in the share preview, not the site-wide default.
 *
 * Next.js calls this in parallel with the page component; both
 * end up calling `caller.article.getBySlug`. React's request-level
 * dedupe on createCaller means we don't actually hit Postgres
 * twice — Next.js handles the memoization.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await fetchArticle(slug);
  if (!article) return { title: 'Not found' };

  const description =
    article.excerpt ??
    article.content.replace(/[#>*_`-]/g, '').slice(0, 200).trim();
  const ogImage = article.coverImageUrl ?? undefined;

  return {
    title: article.title,
    description,
    openGraph: {
      title: article.title,
      description,
      type: 'article',
      publishedTime: article.publishedAt?.toISOString(),
      authors: article.author?.displayName
        ? [article.author.displayName]
        : undefined,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: article.title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await fetchArticle(slug);
  if (!article) notFound();

  const authorName =
    article.author?.displayName ?? article.author?.username ?? 'Forj team';
  const publishedDate = article.publishedAt
    ? new Date(article.publishedAt)
    : null;

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-brand-primary)]"
      >
        <ArrowLeft className="size-4" /> All posts
      </Link>

      <header className="mt-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
          {article.title}
        </h1>
        {article.excerpt ? (
          <p className="mt-3 text-base text-[var(--color-text-secondary)] sm:text-lg">
            {article.excerpt}
          </p>
        ) : null}

        <div className="mt-6 flex items-center gap-3 border-b border-[var(--color-border-default)] pb-6">
          <UserAvatar
            name={authorName}
            imageUrl={article.author?.avatarUrl ?? null}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
              {authorName}
            </p>
            {publishedDate ? (
              <p className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
                <Calendar className="size-3" />
                {publishedDate.toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {article.coverImageUrl ? (
        <div className="mt-8 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.coverImageUrl}
            alt=""
            className="w-full"
            loading="eager"
          />
        </div>
      ) : null}

      {/* Markdown body. The prose-* classes give us readable
          long-form typography without pulling in @tailwindcss/typography
          (would add ~80kB to the bundle). Manual styling on the
          common elements gets us 90% of the way there.
          remark-gfm enables tables, strikethrough, autolinks. */}
      <div className="markdown-body mt-10 text-base leading-relaxed text-[var(--color-text-primary)]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {article.content}
        </ReactMarkdown>
      </div>

      {article.author?.bio ? (
        <footer className="mt-12 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-5">
          <div className="flex items-start gap-3">
            <UserAvatar
              name={authorName}
              imageUrl={article.author.avatarUrl ?? null}
              size="md"
            />
            <div>
              <p className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
                {authorName}
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {article.author.bio}
              </p>
              {article.author.username ? (
                <Link
                  href={`/u/${article.author.username}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-brand-primary)] hover:underline"
                >
                  See profile →
                </Link>
              ) : null}
            </div>
          </div>
        </footer>
      ) : null}
    </article>
  );
}
