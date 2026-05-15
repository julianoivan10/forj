'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { useUploadThing } from '@/lib/uploadthing/client';
import { UserAvatar } from '@/components/ui';
import { api } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

/**
 * Avatar uploader for the settings → profile tab.
 *
 * Why a custom button instead of UploadThing's `<UploadButton>`:
 *   - Branded UI (matches our cyan/dark aesthetic).
 *   - We can show the *current* avatar inline + replace gesture,
 *     not just an empty upload box.
 *
 * Flow:
 *   1. User clicks the avatar → `<input type=file>` opens.
 *   2. File selected → `useUploadThing("avatar")` POSTs to /api/uploadthing.
 *   3. Server middleware verifies Privy auth, accepts the file, stores it,
 *      writes the URL onto `users.avatarUrl`.
 *   4. We invalidate `user.me` so the new URL flows back through tRPC.
 *
 * If UploadThing isn't configured (UPLOADTHING_TOKEN env missing), the
 * upload call returns a server error. We surface a friendly message but
 * don't break the page — users can still edit other profile fields.
 */
export function AvatarUpload({
  name,
  currentUrl,
  onUploaded,
}: {
  name: string;
  currentUrl: string | null;
  onUploaded?: () => void;
}) {
  const utils = api.useUtils();
  const [hovering, setHovering] = useState(false);

  const removeMut = api.user.updateProfile.useMutation({
    onSuccess: () => {
      toast.success('Avatar removed');
      utils.user.me.invalidate();
      onUploaded?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const { startUpload, isUploading } = useUploadThing('avatar', {
    onClientUploadComplete: () => {
      toast.success('Avatar updated');
      utils.user.me.invalidate();
      onUploaded?.();
    },
    onUploadError: (err) => {
      // err.code === 'BAD_REQUEST' typically when env not configured
      const friendly =
        err.message?.includes('UPLOADTHING') || err.code === 'BAD_REQUEST'
          ? 'Image upload is not configured yet — check back soon.'
          : err.message;
      toast.error(friendly);
    },
  });

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error('Image must be 4 MB or smaller');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files allowed');
      return;
    }
    startUpload([file]);
    // Reset the input so picking the same file twice still triggers onChange.
    e.target.value = '';
  };

  return (
    <div className="flex items-center gap-4">
      <label
        className="group relative cursor-pointer"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <UserAvatar name={name} imageUrl={currentUrl} size="xl" />
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition-opacity',
            hovering || isUploading ? 'opacity-100' : 'opacity-0',
          )}
          aria-hidden
        >
          {isUploading ? (
            <Loader2 className="size-6 animate-spin text-white" />
          ) : (
            <Camera className="size-6 text-white" />
          )}
        </div>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handlePick}
          disabled={isUploading || removeMut.isPending}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-[var(--color-text-secondary)]">
          {currentUrl
            ? 'Click your avatar to replace it.'
            : 'Click the circle to upload your photo.'}
        </p>
        <p className="text-[11px] text-[var(--color-text-tertiary)]">
          Square images work best. PNG, JPG, or WEBP. Max 4 MB.
        </p>
        {currentUrl ? (
          <button
            type="button"
            onClick={() => removeMut.mutate({ avatarUrl: '' })}
            disabled={isUploading || removeMut.isPending}
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[var(--color-error)] transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            <Trash2 className="size-3" />
            Remove avatar
          </button>
        ) : null}
      </div>
    </div>
  );
}
