/** Prefill fields when creating a customer from a free-text search query. */
export type CustomerCreateDraft = {
  name?: string;
  email?: string;
  phone?: string;
};

/**
 * Detect whether a search query is an email, phone number, or person/company name.
 * Used so "Create …" opens the partner form with the right field prefilled.
 */
export function detectCustomerCreateDraft(raw: string): CustomerCreateDraft {
  const q = raw.trim();
  if (!q) return {};

  // Email: simple local@domain.tld
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q)) {
    return { email: q };
  }

  const digits = q.replace(/\D/g, "");
  const letters = (q.match(/[A-Za-z\u0980-\u09FF]/g) || []).length;

  // Phone: 7+ digits and no letters (allows +, spaces, dashes, parentheses).
  if (digits.length >= 7 && letters === 0) {
    return { phone: q };
  }

  return { name: q };
}
