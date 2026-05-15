/**
 * Shared shell for legal / long-form prose pages (Terms, Privacy, etc.).
 *
 * Centralises the prose styling here so we only declare the typographic
 * rhythm in one place — every legal page renders with consistent
 * spacing, heading scale, and link colour. Pages just supply the
 * `<h2>` / `<p>` content as children.
 *
 * Visual intent: editorial, paper-feel — the cream warm background +
 * General Sans display + slightly looser line-height makes a long ToS
 * actually pleasant to read instead of feeling like fine-print.
 */
export function LegalShell({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <header className="mb-12 border-b border-[var(--color-border-default)] pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-primary)]">
          Forj · Legal
        </p>
        <h1 className="mt-3 font-display text-[clamp(2rem,4.5vw,3rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--color-text-primary)]">
          {title}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">
          Last updated: {updatedAt}
        </p>
      </header>

      <article className="legal-prose">{children}</article>
    </div>
  );
}
