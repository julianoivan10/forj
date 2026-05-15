import { createRouteHandler } from 'uploadthing/next';
import { uploadRouter } from '@/lib/uploadthing/server';

/**
 * UploadThing's Next.js route handler. Mounts at `/api/uploadthing`.
 *
 * The handler reads `UPLOADTHING_TOKEN` (or the legacy SECRET/APP_ID pair)
 * from env automatically. If those env vars are missing in dev, requests
 * to this endpoint will return a config error — that's expected, the
 * client UI handles it gracefully (`<AvatarUpload>` shows a "not
 * configured" message instead of crashing).
 */
export const { GET, POST } = createRouteHandler({ router: uploadRouter });
