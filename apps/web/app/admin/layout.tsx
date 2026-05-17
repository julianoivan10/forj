import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert, Gavel, Users, FileSearch, ArrowLeft } from 'lucide-react';

/**
 * Admin shell — wraps every `/admin/*` page.
 *
 * What this shell does:
 *
 *   1. **`X-Robots-Tag: noindex`** (via metadata.robots) so the admin
 *      surface never shows up in search engines. Defense-in-depth on
 *      top of the `ADMIN_USER_IDS` server-side gate — even if someone
 *      leaks the URL, Google won't index it.
 *
 *   2. **Visual chrome distinct from the user dashboard** — red top
 *      banner + warning copy. Reduces "wait, am I on the admin
 *      surface or the user surface?" confusion when an admin context-
 *      switches between accounts during support work.
 *
 *   3. **Cross-tool nav** in the banner so support can hop between
 *      Disputes / Users / Audit log without retyping URLs.
 *
 * What this shell does NOT do:
 *
 *   - Auth gating. The `adminProcedure` middleware in `packages/api`
 *     does that server-side via `ADMIN_USER_IDS` env. Hitting any
 *     admin tRPC from a non-admin user gets a clean 401; the page
 *     itself renders for everyone, it just shows empty queries. That's
 *     OK — there's no information disclosure (the empty state has no
 *     data), and gating the page client-side would leak the existence
 *     of admin functionality via dev-tools timing.
 *
 *   - Path-level access control. Vercel/Cloudflare config (separate
 *     concern, see `docs/OPERATIONS.md`) is where you'd add IP
 *     allowlist or Cloudflare Access for production hardening.
 */
export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s — Admin · Forj' },
  // Belt-and-braces: tell search engines not to index AND not to
  // follow links. The robots.txt has a Disallow rule too — either
  // alone would do it but both is cheap.
  robots: { index: false, follow: false, nocache: true },
};

const NAV = [
  { href: '/admin', label: 'Overview', icon: ShieldAlert },
  { href: '/admin/disputes', label: 'Disputes', icon: Gavel },
  { href: '/admin/users', label: 'User recovery', icon: Users },
  { href: '/admin/audit-log', label: 'Audit log', icon: FileSearch },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-background-primary)]">
      {/* Red banner — visually distinct from the user dashboard's
          backdrop-blurred neutral header. Drives the "you are inside
          the admin tool" signal home so a screenshot is unmistakable. */}
      <div className="border-b-2 border-[var(--color-error)]/40 bg-[var(--color-error)]/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="size-4 shrink-0 text-[var(--color-error)]" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-error)]">
              Admin — internal use only
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="size-3.5" /> Back to user dashboard
          </Link>
        </div>
      </div>

      {/* Sub-nav row */}
      <nav className="border-b border-[var(--color-border-default)] bg-[var(--color-background-secondary)]/40">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              // Server component can't use usePathname; we render all
              // links with the same style and let the page itself
              // surface its own "you are here" via the h1 below. That's
              // intentional — fewer client components, faster TTI.
              className="inline-flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-error)]/40 hover:text-[var(--color-text-primary)]"
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Page content */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
