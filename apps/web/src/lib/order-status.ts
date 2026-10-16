/** Shared order status badge styling — keep out of nav to avoid heavy client imports on detail pages. */
export function statusBadgeVariant(
  status: string,
): "success" | "outline" | "warning" | "muted" {
  switch (status) {
    case "completed":
    case "delivered":
      return "success";
    case "pending":
    case "processing":
    case "packed":
    case "confirmed":
      return "outline";
    case "cancelled":
    case "failed":
    case "returned":
    case "refunded":
      return "warning";
    default:
      return "muted";
  }
}

/**
 * Variant + tone classes for a status badge. The Badge component has no
 * destructive/info variants, so cancelled/failed (red) and confirmed (blue)
 * ride on `outline` with explicit colours; everything else keeps its variant.
 */
export function statusBadgeProps(status: string): {
  variant: ReturnType<typeof statusBadgeVariant>;
  className?: string;
} {
  switch (status) {
    case "cancelled":
    case "failed":
      return {
        variant: "outline",
        className: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
      };
    case "confirmed":
      return {
        variant: "outline",
        className: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
      };
    default:
      return { variant: statusBadgeVariant(status) };
  }
}
