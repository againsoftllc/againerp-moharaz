/**
 * Supplier portal shell — completely separate from the admin (admin) group.
 * No admin navigation, no admin auth store, no admin data.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
