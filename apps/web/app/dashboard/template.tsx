/**
 * Re-mounts on every dashboard navigation, so each screen enters with the
 * same short reveal (disabled under prefers-reduced-motion).
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
