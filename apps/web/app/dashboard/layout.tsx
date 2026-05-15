import { AuthGate } from '@/components/auth/auth-gate';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { DashboardHeader } from '@/components/dashboard/header';
import { DashboardTour } from '@/components/onboarding/dashboard-tour';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate mode="onboarded">
      <DashboardSidebar />
      <div className="lg:pl-[260px]">
        <DashboardHeader />
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
      {/* First-time tour. No-op (returns null) once the user has dismissed
          or completed it — keyed per-user in localStorage so multiple
          accounts on the same browser each get their own walkthrough. */}
      <DashboardTour />
    </AuthGate>
  );
}
