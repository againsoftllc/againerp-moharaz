export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Sales price ↔ Margin(%) — margin is markup over cost price, same formula
 * used for the PO line margin calculator in po-form-drawer.tsx. */
export function sellingFromMargin(cost: number, marginPct: number) {
  return round2(cost * (1 + marginPct / 100));
}

export function marginFromSelling(cost: number, selling: number) {
  if (cost <= 0) return 0;
  return round2(((selling - cost) / cost) * 100);
}
