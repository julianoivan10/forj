import 'server-only';
import { cookies } from 'next/headers';
import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { UploadThingError } from 'uploadthing/server';
import { db, eq, users } from '@forj/db';
import { getUserFromToken } from '@/lib/privy/server';
import { logger } from '@/lib/logger';

/**
 * UploadThing file router.
 *
 * Auth model:
 *   We identify the uploader via the same Privy token + DB lookup that the
 *   tRPC layer uses. UploadThing's own auth callback runs inside Next.js
 *   middleware, so we have access to cookies but not to the tRPC context.
 *
 *   Each endpoint:
 *     1. Reads the Privy access token from cookies
 *     2. Verifies it + resolves the DB user
 *     3. Throws UploadThingError on failure (UploadThing maps to a 401)
 *     4. Returns `{ userId }` so the post-upload callback knows whose
 *        record to update
 *
 *   This keeps avatar uploads tied to the *authenticated user only* — even
 *   if someone scrapes the upload URL, they can't upload as someone else.
 *
 * Storage shape:
 *   - `avatar`: 1 file, ≤ 4MB, image/* only. The post-upload callback
 *     persists the resulting public URL onto `users.avatarUrl` so it
 *     surfaces immediately on the next refetch of `user.me`.
 */

const f = createUploadthing();

async function authedUserId(): Promise<string> {
  const cookieStore = await cookies();
  const token =
    cookieStore.get('privy-token')?.value ?? cookieStore.get('privy-id-token')?.value;
  if (!token) throw new UploadThingError('Sign in required');
  const user = await getUserFromToken(token);
  if (!user) throw new UploadThingError('Sign in required');
  return user.id;
}

export const uploadRouter = {
  avatar: f({
    image: {
      maxFileSize: '4MB',
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      const userId = await authedUserId();
      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      try {
        await db
          .update(users)
          .set({ avatarUrl: file.ufsUrl })
          .where(eq(users.id, metadata.userId));
      } catch (err) {
        // Don't throw — UploadThing already stored the file. Log so we can
        // reconcile later (the URL is recoverable from the UploadThing
        // dashboard or the file key).
        logger.error('uploadthing/avatar', 'failed to persist avatarUrl', err, {
          userId: metadata.userId,
          fileKey: file.key,
        });
      }
      return { url: file.ufsUrl };
    }),

  /**
   * Work submission attachments (screenshots, design files, deliverable
   * archives). The submitter attaches up to 5 files; the URLs are kept
   * client-side until the user submits the form, at which point they get
   * passed as `files: string[]` to the `contract.submitWork` mutation
   * which persists them onto `contracts.submissionFiles`.
   *
   * Why we DON'T persist directly to `contracts.submissionFiles` here
   * (unlike avatar): the user might upload a file but cancel the modal
   * without submitting. Writing to the contract row in the
   * `onUploadComplete` callback would leave dangling URLs on contracts
   * the freelancer never actually submitted on. So we treat upload as
   * a no-side-effect operation and let the form decide.
   */
  submission: f({
    image: { maxFileSize: '8MB', maxFileCount: 5 },
    pdf: { maxFileSize: '16MB', maxFileCount: 5 },
    'application/zip': { maxFileSize: '32MB', maxFileCount: 3 },
    text: { maxFileSize: '4MB', maxFileCount: 5 },
  })
    .middleware(async () => {
      const userId = await authedUserId();
      return { userId };
    })
    .onUploadComplete(({ file }) => {
      // No DB write — see comment above. Just echo the URL back so the
      // client can stash it in form state until submit-time.
      return { url: file.ufsUrl, name: file.name, size: file.size };
    }),

  /**
   * Cover image for a job listing OR a service. Uploaded eagerly from the
   * post form; the resulting URL is forwarded into the `job.create` /
   * `service.create` mutation as `coverImageUrl`. Single image, max 4MB
   * — bigger and we start eating bandwidth on every listing-grid render.
   */
  cover: f({
    image: { maxFileSize: '4MB', maxFileCount: 1 },
  })
    .middleware(async () => {
      const userId = await authedUserId();
      return { userId };
    })
    .onUploadComplete(({ file }) => {
      // No DB write — see comment above. Just echo the URL back so the
      // client can stash it in form state until submit-time.
      return { url: file.ufsUrl, name: file.name, size: file.size };
    }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
