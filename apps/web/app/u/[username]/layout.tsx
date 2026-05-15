import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

export default function UserProfileLayout({ children }: { children: React.ReactNode }) {
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
