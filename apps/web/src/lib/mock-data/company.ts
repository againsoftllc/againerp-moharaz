/** Mock company profile for order documents (invoice, packing slip). */
export const COMPANY_PROFILE = {
  name: "AgainERP",
  legalName: "Again Technologies Ltd.",
  addressLine1: "House 12, Road 5, Dhanmondi",
  city: "Dhaka 1205",
  country: "Bangladesh",
  phone: "+880 9612-345678",
  email: "sales@again.com.bd",
  website: "www.again.com.bd",
  taxId: "BIN-001234567",
  vatRegNo: "000123456-7890",
  tagline: "Modern ERP & Ecommerce for Bangladesh",
  bankName: "Dutch-Bangla Bank PLC",
  bankAccount: "123-4567890123",
  bankBranch: "Dhanmondi Branch",
  routingNo: "090270289",
} as const;

export function companyAddressBlock() {
  const c = COMPANY_PROFILE;
  return [c.addressLine1, c.city, c.country].filter(Boolean).join(", ");
}

export function invoiceNumberFromOrder(orderNumber: string) {
  const year = new Date().getFullYear();
  const seq = orderNumber.replace(/\D/g, "") || "0";
  return `INV/${year}/${seq.padStart(5, "0")}`;
}

/** Estimate VAT rate from order totals for display. */
export function estimateTaxRate(order: { subtotal: number; discountAmount: number; taxAmount: number }) {
  const taxable = Math.max(order.subtotal - order.discountAmount, 0);
  if (taxable <= 0 || order.taxAmount <= 0) return 0;
  return Math.round((order.taxAmount / taxable) * 100);
}
