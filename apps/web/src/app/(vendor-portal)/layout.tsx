/**
 * Vendor portal shell — completely separate from the admin (admin) group
 * and the supplier (portal) group. No admin navigation, no admin auth
 * store, no admin data.
 */
export default function VendorPortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
