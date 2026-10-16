/**
 * Vendors module — edge-to-edge (cancel main padding) for every /vendors/*
 * route. The navbar itself lives one level down: the (chrome) route group's
 * own layout for every sub-page, or vendors/page.tsx directly for the bare
 * index (which switches between Vendor's own navbar and Party's via ?from=).
 */
export default function VendorsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-3 -mt-3 -mb-3 flex h-full min-h-0 w-[calc(100%+1.5rem)] max-w-none flex-1 flex-col max-md:mb-0 lg:-mx-4 lg:-mt-4 lg:-mb-4 lg:w-[calc(100%+2rem)]">
      {children}
    </div>
  );
}
