import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import type { Metadata } from 'next';

// Without this, /jobs inherited the homepage's default title.
export const metadata: Metadata = {
  title: 'Browse jobs',
  description: 'Open freelance jobs paid through USDC escrow on Base.',
};

export default function JobsLayout({ children }: { children: React.ReactNode }) {
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
