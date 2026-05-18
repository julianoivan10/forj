'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Save,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Button,
  Input,
  Label,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

interface InitialValues {
  id?: string;
  title?: string;
  excerpt?: string | null;
  content?: string;
  coverImageUrl?: string | null;
  publishedAt?: Date | null;
}

/**
 * Shared editor for new + edit article flows. Same form, different
 * submit path:
 *   - new: `article.create` → redirect to /admin/articles/<id>/edit
 *     so the next save updates the existing draft instead of
 *     creating a duplicate
 *   - edit: `article.update`
 *
 * Live preview toggles between editor (textarea) and a markdown
 * render of the current content — useful for sanity-checking
 * formatting without leaving the page.
 */
export function ArticleEditor({
  mode,
  initial,
}: {
  mode: 'new' | 'edit';
  initial?: InitialValues;
}) {
  const router = useRouter();
  const utils = api.useUtils();

  const [title, setTitle] = useState(initial?.title ?? '');
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState(initial?.coverImageUrl ?? '');
  const [showPreview, setShowPreview] = useState(false);

  // Length sanity checks mirror the server zod so we surface
  // errors inline before the round-trip.
  const titleError =
    title.trim().length > 0 && title.trim().length < 4
      ? 'Title must be at least 4 characters.'
      : title.length > 180
        ? 'Title is over 180 characters.'
        : null;
  const excerptError = excerpt.length > 500 ? 'Excerpt is over 500 chars.' : null;
  const contentError =
    content.trim().length === 0 ? 'Content is required.' : null;
  const hasError = Boolean(titleError || excerptError || contentError);

  const createMut = api.article.create.useMutation({
    onSuccess: (created) => {
      toast.success('Draft saved');
      utils.article.listAll.invalidate();
      // Hop to the edit form so subsequent saves UPDATE this draft
      // rather than create new ones.
      router.replace(`/admin/articles/${created.id}/edit`);
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMut = api.article.update.useMutation({
    onSuccess: () => {
      toast.success('Saved');
      utils.article.listAll.invalidate();
      if (initial?.id) {
        utils.article.getById.invalidate({ id: initial.id });
      }
    },
    onError: (err) => toast.error(err.message),
  });
  const publishMut = api.article.publish.useMutation({
    onSuccess: () => {
      toast.success('Published');
      utils.article.listAll.invalidate();
      if (initial?.id) utils.article.getById.invalidate({ id: initial.id });
    },
    onError: (err) => toast.error(err.message),
  });
  const unpublishMut = api.article.unpublish.useMutation({
    onSuccess: () => {
      toast.success('Unpublished');
      utils.article.listAll.invalidate();
      if (initial?.id) utils.article.getById.invalidate({ id: initial.id });
    },
    onError: (err) => toast.error(err.message),
  });

  const isSaving = createMut.isPending || updateMut.isPending;
  const isPublished = initial?.publishedAt != null;

  const handleSave = () => {
    if (hasError) return;
    const payload = {
      title: title.trim(),
      excerpt: excerpt.trim() || undefined,
      content,
      coverImageUrl: coverImageUrl.trim() || undefined,
    };
    if (mode === 'new') {
      createMut.mutate(payload);
    } else if (initial?.id) {
      updateMut.mutate({ id: initial.id, ...payload });
    }
  };

  return (
    <div>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/admin/articles"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="size-4" /> All articles
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={showPreview ? <EyeOff /> : <Eye />}
            onClick={() => setShowPreview((v) => !v)}
          >
            {showPreview ? 'Edit' : 'Preview'}
          </Button>
          {mode === 'edit' && initial?.id ? (
            isPublished ? (
              <Button
                variant="ghost"
                size="sm"
                isLoading={unpublishMut.isPending}
                onClick={() => unpublishMut.mutate({ id: initial.id! })}
              >
                Unpublish
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                isLoading={publishMut.isPending}
                disabled={hasError}
                onClick={() => publishMut.mutate({ id: initial.id! })}
              >
                Publish
              </Button>
            )
          ) : null}
          <Button
            leftIcon={<Save />}
            isLoading={isSaving}
            disabled={hasError}
            onClick={handleSave}
          >
            {mode === 'new' ? 'Save draft' : 'Save'}
          </Button>
        </div>
      </header>

      {showPreview ? (
        <PreviewPane
          title={title || 'Untitled'}
          excerpt={excerpt}
          coverImageUrl={coverImageUrl}
          content={content}
        />
      ) : (
        <div className="mt-6 space-y-5">
          {/* Title */}
          <div>
            <Label htmlFor="article-title">Title</Label>
            <Input
              id="article-title"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 180))}
              placeholder="A compelling title — what's this article about?"
              className={cn(
                'mt-1.5 font-display text-base',
                titleError && 'border-[var(--color-error)]',
              )}
              aria-invalid={titleError ? true : undefined}
            />
            {titleError ? (
              <p className="mt-1 text-xs text-[var(--color-error)]">{titleError}</p>
            ) : null}
          </div>

          {/* Excerpt */}
          <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="article-excerpt">
                Excerpt{' '}
                <span className="font-normal text-[var(--color-text-tertiary)]">
                  (optional)
                </span>
              </Label>
              <span className="text-[10px] tabular-nums text-[var(--color-text-tertiary)]">
                {excerpt.length}/500
              </span>
            </div>
            <Textarea
              id="article-excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value.slice(0, 500))}
              placeholder="One- or two-sentence summary. Shows on the list page and as the OpenGraph description for shares."
              rows={2}
              className={cn(
                'mt-1.5',
                excerptError && 'border-[var(--color-error)]',
              )}
              aria-invalid={excerptError ? true : undefined}
            />
            {excerptError ? (
              <p className="mt-1 text-xs text-[var(--color-error)]">{excerptError}</p>
            ) : null}
          </div>

          {/* Cover image URL */}
          <div>
            <Label htmlFor="article-cover">
              Cover image URL{' '}
              <span className="font-normal text-[var(--color-text-tertiary)]">
                (optional)
              </span>
            </Label>
            <div className="relative mt-1.5">
              <ImageIcon
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]"
              />
              <Input
                id="article-cover"
                type="url"
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value.slice(0, 500))}
                placeholder="https://utfs.io/... or https://gateway.pinata.cloud/..."
                className="pl-8"
              />
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              Must be hosted on UploadThing or Pinata. Upload via the dashboard,
              then paste the URL here.
            </p>
          </div>

          {/* Content (markdown) */}
          <div>
            <Label htmlFor="article-content">
              Content{' '}
              <span className="font-normal text-[var(--color-text-tertiary)]">
                (Markdown)
              </span>
            </Label>
            <textarea
              id="article-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={20}
              placeholder={
                '# Heading\n\nMarkdown — supports **bold**, _italic_, ' +
                '`code`, [links](https://example.com), tables, lists, ' +
                'fenced code blocks, etc. Use the Preview button to ' +
                'sanity-check formatting before publishing.'
              }
              className={cn(
                'mt-1.5 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)]',
                'bg-[var(--color-background-elevated)] px-3 py-2.5',
                'font-mono text-sm leading-relaxed text-[var(--color-text-primary)]',
                'placeholder:text-[var(--color-text-tertiary)]',
                'focus:border-[var(--color-border-brand)] focus:outline-none',
                'resize-vertical',
                contentError && 'border-[var(--color-error)]',
              )}
              aria-invalid={contentError ? true : undefined}
            />
            {contentError ? (
              <p className="mt-1 text-xs text-[var(--color-error)]">{contentError}</p>
            ) : (
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                {content.length} chars
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewPane({
  title,
  excerpt,
  coverImageUrl,
  content,
}: {
  title: string;
  excerpt: string;
  coverImageUrl: string;
  content: string;
}) {
  return (
    <article className="mt-6 rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-background-secondary)] p-6 sm:p-8">
      <header className="border-b border-[var(--color-border-default)] pb-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
          {title}
        </h1>
        {excerpt ? (
          <p className="mt-3 text-base text-[var(--color-text-secondary)]">
            {excerpt}
          </p>
        ) : null}
      </header>
      {coverImageUrl ? (
        <div className="mt-6 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-default)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverImageUrl} alt="" className="w-full" />
        </div>
      ) : null}
      <div className="markdown-body mt-8">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content || '_Nothing to preview yet._'}
        </ReactMarkdown>
      </div>
    </article>
  );
}
