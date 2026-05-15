'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  X,
} from 'lucide-react';
import { useUploadThing } from '@/lib/uploadthing/client';
import { cn } from '@/lib/utils';

/**
 * Multi-file picker for the "Submit work" modal.
 *
 * Users drag-and-drop or pick files; we upload immediately to UploadThing
 * (so the form-submit step is fast — no waiting for upload). The returned
 * URLs are surfaced via `onChange` so the parent can include them in the
 * `contract.submitWork` mutation payload.
 *
 * Why we upload eagerly (not on form submit):
 *   - Better progress feedback (spinner per file).
 *   - The form's submit button can disable itself while files are still
 *     uploading without us building our own queue manager.
 *   - If the user cancels the modal mid-upload, we leak a few orphan
 *     files on UploadThing — acceptable, those auto-prune after a TTL
 *     and the cost is negligible.
 *
 * UploadThing endpoint: `submission` — accepts images (8MB), PDFs (16MB),
 * ZIPs (32MB) and text/code files (4MB). Up to 5 attachments per submit.
 */

export interface AttachedFile {
  url: string;
  name: string;
  size: number;
}

const MAX_FILES = 5;

export function SubmissionFilePicker({
  files,
  onChange,
  disabled,
}: {
  files: AttachedFile[];
  onChange: (next: AttachedFile[]) => void;
  disabled?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);

  const { startUpload, isUploading } = useUploadThing('submission', {
    onClientUploadComplete: (results) => {
      const next = [
        ...files,
        ...results.map((r) => ({
          url: r.serverData.url,
          name: r.serverData.name,
          size: r.serverData.size,
        })),
      ];
      onChange(next);
    },
    onUploadError: (err) => {
      const friendly =
        err.message?.includes('UPLOADTHING') || err.code === 'BAD_REQUEST'
          ? 'File upload not configured yet — submit your message without attachments for now.'
          : err.message;
      toast.error(friendly);
    },
  });

  const handlePick = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    if (!arr.length) return;
    const remaining = MAX_FILES - files.length;
    if (remaining <= 0) {
      toast.error(`Max ${MAX_FILES} files per submission.`);
      return;
    }
    const slice = arr.slice(0, remaining);
    if (arr.length > remaining) {
      toast.warning(`Only the first ${remaining} files were taken — limit is ${MAX_FILES} total.`);
    }
    startUpload(slice);
  };

  const remove = (idx: number) => {
    onChange(files.filter((_, i) => i !== idx));
  };

  return (
    <div>
      {/* Drop zone */}
      <label
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed px-4 py-6 text-sm transition-colors',
          dragOver
            ? 'border-[var(--color-brand-primary)] bg-[var(--color-glow-brand)]/40'
            : 'border-[var(--color-border-default)] bg-[var(--color-background-tertiary)]/30',
          disabled || isUploading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-[var(--color-border-strong)]',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled || isUploading) return;
          handlePick(e.dataTransfer.files);
        }}
      >
        {isUploading ? (
          <>
            <Loader2 className="size-5 animate-spin text-[var(--color-brand-primary)]" />
            <span className="text-[var(--color-text-secondary)]">Uploading…</span>
          </>
        ) : (
          <>
            <Paperclip className="size-5 text-[var(--color-text-tertiary)]" />
            <span className="text-[var(--color-text-secondary)]">
              <span className="font-medium text-[var(--color-text-primary)]">Click</span> or drag
              &amp; drop attachments
            </span>
            <span className="text-[11px] text-[var(--color-text-tertiary)]">
              Images, PDF, ZIP, code &middot; up to {MAX_FILES} files
            </span>
          </>
        )}
        <input
          type="file"
          multiple
          className="sr-only"
          disabled={disabled || isUploading || files.length >= MAX_FILES}
          onChange={(e) => {
            if (e.target.files) handlePick(e.target.files);
            e.target.value = '';
          }}
        />
      </label>

      {/* Chips */}
      {files.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {files.map((f, i) => (
            <li
              key={`${f.url}-${i}`}
              className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-3 py-2 text-sm"
            >
              {isImage(f.name) ? (
                <ImageIcon className="size-4 shrink-0 text-[var(--color-brand-primary)]" />
              ) : (
                <FileText className="size-4 shrink-0 text-[var(--color-text-secondary)]" />
              )}
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-[var(--color-text-primary)] hover:underline"
              >
                {f.name}
              </a>
              <span className="shrink-0 text-xs text-[var(--color-text-tertiary)]">
                {humanSize(f.size)}
              </span>
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="rounded p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-text-primary)]/[0.04] hover:text-[var(--color-text-secondary)]"
                aria-label="Open"
              >
                <ExternalLink className="size-3.5" />
              </a>
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                className="rounded p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] disabled:opacity-40"
                aria-label="Remove attachment"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function isImage(name: string) {
  return /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(name);
}

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
