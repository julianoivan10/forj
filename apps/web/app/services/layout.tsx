import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

/**
 * Public-facing layout for the service marketplace pages.
 *
 * Mirrors `/jobs` and `/u/[username]` so all three public surfaces share
 * the same navbar + footer treatment. Without this, `/services` was
 * rendering bare (no nav, no escape hatch back to home), which felt
 * like a leak from the dashboard into the public site.
 */
export default function ServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main id="main-content" className="pt-24 pb-20">
        {children}
      </main>
      <Footer />
    </>
  );
}
