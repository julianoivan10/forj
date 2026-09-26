/**
 * Allowed hostnames for any user-supplied URL that ends up rendered
 * as an `<img>` source, `<a href>` target, or background-image in
 * the app.
 *
 * Sole upload paths today are UploadThing (`utfs.io`, `<appId>.ufs.sh`) and Pinata's
 * public IPFS gateway (`gateway.pinata.cloud`) — same set as
 * `next.config.ts` remotePatterns + the message attachment
 * whitelist. Anything else gets rejected to prevent attackers from
 * pasting phishing / malware / `javascript:` URLs as "avatars" /
 * "cover images" / "portfolio attachments" that the UI surfaces.
 *
 * Why the dedicated module: the same whitelist is now consumed by
 * the message router (file attachments), user router (avatar +
 * portfolio), job router (cover image + attachments), and service
 * router (cover image + gallery). Single source of truth so adding
 * a new approved host is one diff, not five.
 *
 * Add a new domain here ONLY after vetting it. `z.string().url()`
 * is permissive — it accepts `javascript:`, `data:`, `ftp:`,
 * arbitrary hosts — so a free-form URL field is not safe by default.
 */
export const ALLOWED_FILE_HOSTS: ReadonlySet<string> = new Set([
  'utfs.io',
  'gateway.pinata.cloud',
]);

/**
 * UploadThing v7.4+ serves files from a per-app subdomain
 * (`<appId>.ufs.sh`) and returns that as `file.ufsUrl`, which is what our
 * upload routes hand back to the browser. Only single-label subdomains of
 * `ufs.sh` match, so `evil.com.ufs.sh.attacker.io` does not.
 */
const ALLOWED_FILE_HOST_SUFFIXES: readonly string[] = ['.ufs.sh'];

/**
 * Returns true when `raw` is an https URL with a hostname in the
 * allow-list. Rejects:
 *   - Anything that doesn't parse as URL (`undefined`, raw strings).
 *   - Non-https protocols: `http:`, `javascript:`, `data:`, `ftp:`.
 *     Yes — even plain `http:` is rejected. We never want a mixed-
 *     content image embedded in an https page.
 *   - URLs whose hostname is not in `ALLOWED_FILE_HOSTS`.
 *
 * Caller is responsible for deciding how to react (zod refine,
 * tRPC throw, or pre-emptive UI block).
 */
export function isAllowedFileUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (ALLOWED_FILE_HOSTS.has(url.hostname)) return true;
  return ALLOWED_FILE_HOST_SUFFIXES.some((suffix) => {
    if (!url.hostname.endsWith(suffix)) return false;
    const label = url.hostname.slice(0, -suffix.length);
    return /^[a-z0-9-]+$/i.test(label);
  });
}

/**
 * Zod refinement helper. Use as:
 *
 *   z.string().url().refine(...allowedFileUrlRefinement)
 *
 * Empty string is accepted and treated as "clear this field" — the
 * caller handles the null conversion. Distinct from "missing" which
 * the optional/nullable modifier handles.
 */
export const allowedFileUrlRefinement = [
  (v: string) => v === '' || isAllowedFileUrl(v),
  {
    message:
      'URL must be https and point to an approved host (UploadThing or Pinata gateway).',
  },
] as const;
