import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

/**
 * Public proof pages share the marketing site chrome — visitors arriving
 * via shared portfolio links should be one click away from "browse jobs"
 * or "post a job", which are the conversion CTAs on the navbar/footer.
 */
export default function ProofLayout({
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
