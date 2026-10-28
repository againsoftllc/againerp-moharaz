export type LocalisationResourceId =
  | "store-locations"
  | "languages"
  | "currencies"
  | "stock-statuses"
  | "order-statuses"
  | "countries"
  | "regions"
  | "zones"
  | "geo-zones";

export type LocalisationColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  mono?: boolean;
};

export type LocalisationResourceDef = {
  id: LocalisationResourceId;
  title: string;
  description: string;
  addLabel: string;
  searchPlaceholder: string;
  columns: LocalisationColumn[];
};

export const LOCALISATION_RESOURCES: LocalisationResourceDef[] = [
  {
    id: "store-locations",
    title: "Store Locations",
    description: "Physical stores, warehouses, and pickup points used for inventory and fulfilment.",
    addLabel: "Add location",
    searchPlaceholder: "Search location name or code…",
    columns: [
      { key: "name", label: "Location" },
      { key: "code", label: "Code", mono: true },
      { key: "city", label: "City" },
      { key: "type", label: "Type" },
      { key: "status", label: "Status" },
      { key: "isDefault", label: "Default", align: "center" },
    ],
  },
  {
    id: "languages",
    title: "Languages",
    description: "Storefront and admin interface languages with locale codes.",
    addLabel: "Add language",
    searchPlaceholder: "Search language or locale…",
    columns: [
      { key: "name", label: "Language" },
      { key: "code", label: "Code", mono: true },
      { key: "locale", label: "Locale", mono: true },
      { key: "direction", label: "Direction" },
      { key: "status", label: "Status" },
      { key: "isDefault", label: "Default", align: "center" },
    ],
  },
  {
    id: "currencies",
    title: "Currencies",
    description: "Accepted currencies, symbols, and exchange rates for multi-currency display.",
    addLabel: "Add currency",
    searchPlaceholder: "Search currency name or code…",
    columns: [
      { key: "name", label: "Currency" },
      { key: "code", label: "Code", mono: true },
      { key: "symbol", label: "Symbol", align: "center" },
      { key: "rate", label: "Rate", align: "right" },
      { key: "status", label: "Status" },
      { key: "isDefault", label: "Default", align: "center" },
    ],
  },
  {
    id: "stock-statuses",
    title: "Stock Statuses",
    description: "Inventory availability labels shown on product and storefront pages.",
    addLabel: "Add stock status",
    searchPlaceholder: "Search stock status…",
    columns: [
      { key: "name", label: "Status" },
      { key: "color", label: "Color" },
      { key: "notify", label: "Notify admin" },
      { key: "showOnStorefront", label: "Storefront" },
      { key: "sortOrder", label: "Sort", align: "right" },
    ],
  },
  {
    id: "order-statuses",
    title: "Order Statuses",
    description: "Order workflow statuses for admin, customer emails, and fulfilment rules.",
    addLabel: "Add order status",
    searchPlaceholder: "Search order status…",
    columns: [
      { key: "name", label: "Status" },
      { key: "color", label: "Color" },
      { key: "sendEmail", label: "Customer email" },
      { key: "fulfillment", label: "Fulfilment" },
      { key: "sortOrder", label: "Sort", align: "right" },
    ],
  },
  {
    id: "countries",
    title: "Countries",
    description: "Country master data for addresses, tax, and shipping rules.",
    addLabel: "Add country",
    searchPlaceholder: "Search country or ISO code…",
    columns: [
      { key: "name", label: "Country" },
      { key: "iso2", label: "ISO-2", mono: true },
      { key: "iso3", label: "ISO-3", mono: true },
      { key: "phoneCode", label: "Phone" },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "regions",
    title: "Regions",
    description: "States, divisions, and provinces within a country.",
    addLabel: "Add region",
    searchPlaceholder: "Search region or country…",
    columns: [
      { key: "name", label: "Region" },
      { key: "code", label: "Code", mono: true },
      { key: "country", label: "Country" },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "zones",
    title: "Zones",
    description: "Cities and districts used for address forms and local tax mapping.",
    addLabel: "Add zone",
    searchPlaceholder: "Search zone or region…",
    columns: [
      { key: "name", label: "Zone" },
      { key: "code", label: "Code", mono: true },
      { key: "region", label: "Region" },
      { key: "country", label: "Country" },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "geo-zones",
    title: "Geo Zones",
    description: "Grouped countries and regions for shipping, tax, and payment rules.",
    addLabel: "Add geo zone",
    searchPlaceholder: "Search geo zone…",
    columns: [
      { key: "name", label: "Geo zone" },
      { key: "description", label: "Description" },
      { key: "zoneCount", label: "Zones", align: "right" },
      { key: "status", label: "Status" },
    ],
  },
];

export const LOCALISATION_PRIMARY_TABS: LocalisationResourceId[] = [
  "store-locations",
  "languages",
  "currencies",
];

export const LOCALISATION_MORE_TABS: LocalisationResourceId[] = [
  "stock-statuses",
  "order-statuses",
  "countries",
  "regions",
  "zones",
  "geo-zones",
];

export function getLocalisationResource(id: string): LocalisationResourceDef | undefined {
  return LOCALISATION_RESOURCES.find((r) => r.id === id);
}

/** The storefront lists (languages, currencies, countries …) are not offered in Configuration any more: currency, timezone and formats are on Company › Localization. */
export function getLocalisationHref(_id?: LocalisationResourceId) {
  return "/workspace/setup?tab=localization";
}
