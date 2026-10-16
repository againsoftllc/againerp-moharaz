import type { Customer, CustomerAddress } from "@/lib/mock-data/customers";

export type PartnerAddress = {
  street: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export type SalesAddressOption = {
  id: string;
  primary: string;
  secondary: string;
  address: PartnerAddress;
  phone?: string;
  email?: string;
};

export type SalesAddressContact = {
  address: PartnerAddress | null;
  phone?: string;
  email?: string;
};

/** One line: street, street 2, city, state, postal code, country — blanks skipped, a part repeated (city = state)
 * read once. */
export function formatPostalAddress(a: {
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}): string {
  const seen = new Set<string>();
  return [a.street, a.street2, a.city, a.state, a.zip, a.country]
    .map((p) => (p || "").trim())
    .filter((p) => p && !seen.has(p.toLowerCase()) && !!seen.add(p.toLowerCase()))
    .join(", ");
}

export function makePartnerAddress(
  street: string,
  city: string,
  state = city,
  zip = "",
  country = "Bangladesh",
  street2?: string,
): PartnerAddress {
  return { street, street2, city, state, zip, country };
}

function customerAddressToPartner(
  addr: CustomerAddress,
  customer: Customer,
): PartnerAddress {
  return makePartnerAddress(
    addr.address ?? "",
    addr.city || customer.city || "",
    addr.region || customer.region || customer.city || "",
    addr.zip ?? "",
    addr.country || customer.country || "Bangladesh",
    addr.street2,
  );
}

function addressSummary(addr: CustomerAddress, customer: Customer): string {
  const parts = [
    addr.label && addr.label !== "Contact" ? addr.label : null,
    addr.address,
    addr.city || customer.city,
    addr.country || customer.country,
  ].filter(Boolean);
  return parts.join(", ") || customer.name;
}

export function buildCustomerAddressOptions(customer: Customer | null): SalesAddressOption[] {
  if (!customer) return [];

  if (!customer.addresses?.length) {
    return [
      {
        id: `customer_${customer.id}`,
        primary: customer.name,
        secondary: [customer.city, customer.country].filter(Boolean).join(", "),
        address: makePartnerAddress(
          "",
          customer.city,
          customer.region,
          "",
          customer.country,
        ),
        phone: customer.phone || undefined,
        email: customer.email || undefined,
      },
    ];
  }

  const seen = new Set<string>();
  const options: SalesAddressOption[] = [];

  for (const addr of customer.addresses) {
    const id = addr.id || `addr_${options.length}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const primary =
      addr.contactType === "related" && addr.name?.trim()
        ? addr.name.trim()
        : customer.name;

    options.push({
      id,
      primary,
      secondary: addressSummary(addr, customer),
      address: customerAddressToPartner(addr, customer),
      phone: addr.phone || addr.mobile || customer.phone || undefined,
      email: addr.email || customer.email || undefined,
    });
  }

  return options;
}

export function getCustomerPrimaryAddress(customer: Customer | null): PartnerAddress | null {
  return getCustomerPrimaryContact(customer).address;
}

export function getCustomerPrimaryContact(customer: Customer | null): SalesAddressContact {
  if (!customer) return { address: null };
  const options = buildCustomerAddressOptions(customer);
  if (!options.length) return { address: null };
  const primary = customer.addresses?.find(
    (a) => a.isDefault || a.contactType === "primary",
  );
  const option =
    (primary?.id ? options.find((o) => o.id === primary.id) : null) ?? options[0];
  return {
    address: option.address,
    phone: option.phone,
    email: option.email,
  };
}

export function matchAddressOptionId(
  options: SalesAddressOption[],
  address: PartnerAddress,
): string {
  const match = options.find(
    (o) =>
      o.address.street === address.street &&
      o.address.city === address.city &&
      o.address.state === address.state &&
      o.address.country === address.country,
  );
  return match?.id ?? options[0]?.id ?? "";
}

export function filterAddressOptions(
  options: SalesAddressOption[],
  query: string,
): SalesAddressOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (o) =>
      o.primary.toLowerCase().includes(q) ||
      o.secondary.toLowerCase().includes(q) ||
      o.address.street.toLowerCase().includes(q) ||
      o.address.city.toLowerCase().includes(q),
  );
}
