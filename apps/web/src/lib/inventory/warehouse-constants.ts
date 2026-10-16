// Suggested warehouse types — presets for the picker, not an enforced enum.
// Mirrors WAREHOUSE_TYPE_PRESETS in apps/api/app/services/inventory/constants.py.
export const WAREHOUSE_TYPE_PRESETS = [
  "Location",
  "Main warehouse",
  "Retail store",
  "Service center",
  "Consignment",
  "Ecommerce FC",
  "Returns / Damaged",
];

export const WAREHOUSE_INVOICE_LAYOUTS = [
  "Default",
  "Classic",
  "Compact",
  "Detailed",
  "Thermal 80mm",
  "Thermal 58mm",
];

export const WAREHOUSE_PAYMENT_OPTIONS = [
  "Cash",
  "Card",
  "Bank",
  "Mobile Banking",
  "Cheque",
];
