import { AuthGate } from '@/components/auth/auth-gate';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { DashboardHeader, MobileTabBar } from '@/components/dashboard/header';
import { DashboardTour } from '@/components/onboarding/dashboard-tour';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate mode="onboarded">
      <DashboardSidebar />
      <div className="lg:pl-60">
        <DashboardHeader />
        {/* Bottom padding clears the mobile tab bar. */}
        <main id="main-content" className="px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-8">
          {children}
        </main>
      </div>
      <MobileTabBar />
      {/* First-time tour. No-op (returns null) once the user has dismissed
          or completed it — keyed per-user in localStorage so multiple
          accounts on the same browser each get their own walkthrough. */}
      <DashboardTour />
    </AuthGate>
  );
}
