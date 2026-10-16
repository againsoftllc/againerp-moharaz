export type DateFormatId = "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd" | "dd-mmm-yyyy";
export type TimeFormatId = "24h" | "24h-ss" | "12h" | "12h-ss";
export type NumberGroupingId = "international" | "indian" | "none";

export type CompanyFormatSettings = {
  dateFormat: DateFormatId;
  timeFormat: TimeFormatId;
  decimalPlaces: number;
  numberGrouping: NumberGroupingId;
  currencyCode: string;
  timezone: string;
  languageCode: string;
  fiscalYearStartMonth: number;
};

export const DEFAULT_COMPANY_FORMAT: CompanyFormatSettings = {
  dateFormat: "dd/mm/yyyy",
  timeFormat: "12h",
  decimalPlaces: 2,
  numberGrouping: "indian",
  currencyCode: "BDT",
  timezone: "Asia/Dhaka",
  languageCode: "en",
  fiscalYearStartMonth: 7,
};

export const DATE_FORMAT_OPTIONS: { value: DateFormatId; label: string }[] = [
  { value: "dd/mm/yyyy", label: "08/09/2026 (DD/MM/YYYY)" },
  { value: "mm/dd/yyyy", label: "09/08/2026 (MM/DD/YYYY)" },
  { value: "yyyy-mm-dd", label: "2026-09-08 (YYYY-MM-DD)" },
  { value: "dd-mmm-yyyy", label: "08-Sep-2026" },
];

export const TIME_FORMAT_OPTIONS: { value: TimeFormatId; label: string }[] = [
  { value: "12h", label: "2:30 PM (12-hour)" },
  { value: "12h-ss", label: "2:30:45 PM (12-hour + seconds)" },
  { value: "24h", label: "14:30 (24-hour)" },
  { value: "24h-ss", label: "14:30:45 (24-hour + seconds)" },
];

export const NUMBER_GROUPING_OPTIONS: { value: NumberGroupingId; label: string }[] = [
  { value: "international", label: "1,000,000 (million)" },
  { value: "indian", label: "10,00,000 (lakh)" },
  { value: "none", label: "1000000 (no comma)" },
];

export const DECIMAL_PLACE_OPTIONS = [0, 1, 2, 3, 4] as const;

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/;

function asDateFormat(value: unknown): DateFormatId {
  const v = String(value ?? "").trim();
  if (v === "mm/dd/yyyy" || v === "yyyy-mm-dd" || v === "dd-mmm-yyyy" || v === "dd/mm/yyyy") return v;
  return DEFAULT_COMPANY_FORMAT.dateFormat;
}

function asTimeFormat(value: unknown): TimeFormatId {
  const v = String(value ?? "").trim();
  if (v === "24h" || v === "24h-ss" || v === "12h" || v === "12h-ss") return v;
  return DEFAULT_COMPANY_FORMAT.timeFormat;
}

function asGrouping(value: unknown): NumberGroupingId {
  const v = String(value ?? "").trim();
  if (v === "international" || v === "indian" || v === "none") return v;
  return DEFAULT_COMPANY_FORMAT.numberGrouping;
}

function asPlaces(value: unknown): number {
  if (value == null || value === "") return DEFAULT_COMPANY_FORMAT.decimalPlaces;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_COMPANY_FORMAT.decimalPlaces;
  return Math.min(4, Math.max(0, Math.round(n)));
}

function asText(value: unknown, fallback: string): string {
  const v = String(value ?? "").trim();
  return v || fallback;
}

function asMonth(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_COMPANY_FORMAT.fiscalYearStartMonth;
  return Math.min(12, Math.max(1, Math.round(n)));
}

export function normalizeCompanyFormat(row?: unknown): CompanyFormatSettings {
  const src = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
  return {
    dateFormat: asDateFormat(src.date_format ?? src.dateFormat),
    timeFormat: asTimeFormat(src.time_format ?? src.timeFormat),
    decimalPlaces: asPlaces(src.decimal_places ?? src.decimalPlaces),
    numberGrouping: asGrouping(src.number_grouping ?? src.numberGrouping),
    currencyCode: asText(src.currency_code ?? src.currencyCode, DEFAULT_COMPANY_FORMAT.currencyCode).toUpperCase(),
    timezone: asText(src.timezone, DEFAULT_COMPANY_FORMAT.timezone),
    languageCode: asText(src.language_code ?? src.languageCode, DEFAULT_COMPANY_FORMAT.languageCode).toLowerCase(),
    fiscalYearStartMonth: asMonth(src.fiscal_year_start_month ?? src.fiscalYearStartMonth),
  };
}

function groupInteger(intPart: string, grouping: NumberGroupingId): string {
  const digits = intPart.replace(/^0+(?=\d)/, "") || "0";
  if (grouping === "none") return digits;
  if (grouping === "international") {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  if (!rest) return last3;
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
}

export function formatGroupedNumber(
  amount: number,
  settings: CompanyFormatSettings = DEFAULT_COMPANY_FORMAT,
): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const neg = n < 0;
  const places = settings.decimalPlaces;
  const [intPart, fracPart] = Math.abs(n).toFixed(places).split(".");
  const grouped = groupInteger(intPart, settings.numberGrouping);
  const body = places > 0 ? `${grouped}.${fracPart}` : grouped;
  return neg ? `−${body}` : body;
}

/**
 * Counts (stock, alert qty) follow company digit grouping but not the money
 * decimal places — 1500 pcs reads "1,500", never "1,500.00". Fractional
 * quantities keep as many decimals as the company allows, trailing zeros cut.
 */
export function formatGroupedQuantity(
  amount: number,
  settings: CompanyFormatSettings = DEFAULT_COMPANY_FORMAT,
): string {
  const n = Number.isFinite(amount) ? amount : 0;
  if (Number.isInteger(n)) return formatGroupedNumber(n, { ...settings, decimalPlaces: 0 });
  const places = Math.max(settings.decimalPlaces, 1);
  return formatGroupedNumber(n, { ...settings, decimalPlaces: places })
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

function dateParts(iso: string): { y: number; m: number; d: number } | null {
  const day = iso.trim().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match) return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return { y: parsed.getFullYear(), m: parsed.getMonth() + 1, d: parsed.getDate() };
}

type ZonedParts = { y: number; m: number; d: number; hours: number; minutes: number; seconds: number };

function zonedParts(iso: string, timeZone: string): ZonedParts | null {
  const parsed = iso.trim().length <= 10 ? new Date(`${iso.trim()}T12:00:00`) : new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone || DEFAULT_COMPANY_FORMAT.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const bag = Object.fromEntries(fmt.formatToParts(parsed).map((p) => [p.type, p.value]));
    return {
      y: Number(bag.year),
      m: Number(bag.month),
      d: Number(bag.day),
      hours: Number(bag.hour),
      minutes: Number(bag.minute),
      seconds: Number(bag.second),
    };
  } catch {
    return {
      y: parsed.getFullYear(),
      m: parsed.getMonth() + 1,
      d: parsed.getDate(),
      hours: parsed.getHours(),
      minutes: parsed.getMinutes(),
      seconds: parsed.getSeconds(),
    };
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date / ISO string / datetime → ISO date or datetime for company formatters. */
export function coerceCompanyDateInput(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = pad2(value.getUTCMonth() + 1);
    const d = pad2(value.getUTCDate());
    if (value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0) {
      return `${y}-${m}-${d}`;
    }
    return value.toISOString();
  }
  const text = String(value).trim();
  return text || null;
}

function monthLabel(month: number, languageCode: string): string {
  if (languageCode === "bn") {
    try {
      return new Intl.DateTimeFormat("bn-BD", { month: "short" }).format(new Date(2026, month - 1, 1));
    } catch {
      /* fall through */
    }
  }
  return MONTH_SHORT[month - 1] ?? pad2(month);
}

function formatYmd(
  y: number,
  m: number,
  d: number,
  settings: CompanyFormatSettings,
): string {
  switch (settings.dateFormat) {
    case "mm/dd/yyyy":
      return `${pad2(m)}/${pad2(d)}/${y}`;
    case "yyyy-mm-dd":
      return `${y}-${pad2(m)}-${pad2(d)}`;
    case "dd-mmm-yyyy":
      return `${pad2(d)}-${monthLabel(m, settings.languageCode)}-${y}`;
    default:
      return `${pad2(d)}/${pad2(m)}/${y}`;
  }
}

function formatHms(
  hours: number,
  minutes: number,
  seconds: number,
  settings: CompanyFormatSettings,
): string {
  const twelve = settings.timeFormat === "12h" || settings.timeFormat === "12h-ss";
  const withSeconds = settings.timeFormat === "12h-ss" || settings.timeFormat === "24h-ss";
  const mins = pad2(minutes);
  const secs = pad2(seconds);
  if (twelve) {
    const ampm = hours >= 12 ? "PM" : "AM";
    const h = hours % 12 || 12;
    return withSeconds ? `${h}:${mins}:${secs} ${ampm}` : `${h}:${mins} ${ampm}`;
  }
  return withSeconds ? `${pad2(hours)}:${mins}:${secs}` : `${pad2(hours)}:${mins}`;
}

export function formatCompanyDate(
  value: unknown,
  settings: CompanyFormatSettings = DEFAULT_COMPANY_FORMAT,
): string {
  const iso = coerceCompanyDateInput(value);
  if (!iso) return "—";
  if (iso.length <= 10) {
    const parts = dateParts(iso);
    if (!parts) return iso.slice(0, 10);
    return formatYmd(parts.y, parts.m, parts.d, settings);
  }
  const zoned = zonedParts(iso, settings.timezone);
  if (!zoned) return iso.slice(0, 10);
  return formatYmd(zoned.y, zoned.m, zoned.d, settings);
}

export function formatCompanyTime(
  value: unknown,
  settings: CompanyFormatSettings = DEFAULT_COMPANY_FORMAT,
): string {
  const iso = coerceCompanyDateInput(value);
  if (!iso) return "—";
  const zoned = zonedParts(iso, settings.timezone);
  if (!zoned) return "—";
  return formatHms(zoned.hours, zoned.minutes, zoned.seconds, settings);
}

export function formatCompanyDateTime(
  value: unknown,
  settings: CompanyFormatSettings = DEFAULT_COMPANY_FORMAT,
): string {
  const iso = coerceCompanyDateInput(value);
  if (!iso) return "—";
  const date = formatCompanyDate(iso, settings);
  if (date === "—" || iso.length <= 10) return date;
  return `${date} ${formatCompanyTime(iso, settings)}`;
}

export function formatCompanyIsoCell(
  value: unknown,
  settings: CompanyFormatSettings = DEFAULT_COMPANY_FORMAT,
): unknown {
  if (value == null || value === "") return value;
  if (value instanceof Date) return formatCompanyDate(value, settings);
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!ISO_DATE_RE.test(trimmed)) return value;
  return trimmed.length > 10 ? formatCompanyDateTime(trimmed, settings) : formatCompanyDate(trimmed, settings);
}

export function zonedTodayIso(settings: CompanyFormatSettings = DEFAULT_COMPANY_FORMAT): string {
  const zoned = zonedParts(new Date().toISOString(), settings.timezone);
  if (!zoned) return new Date().toISOString().slice(0, 10);
  return `${zoned.y}-${pad2(zoned.m)}-${pad2(zoned.d)}`;
}

export function fiscalYearStartIso(
  settings: CompanyFormatSettings = DEFAULT_COMPANY_FORMAT,
  today = zonedTodayIso(settings),
): string {
  const parts = dateParts(today);
  if (!parts) return `${new Date().getFullYear()}-${pad2(settings.fiscalYearStartMonth)}-01`;
  let year = parts.y;
  if (parts.m < settings.fiscalYearStartMonth) year -= 1;
  return `${year}-${pad2(settings.fiscalYearStartMonth)}-01`;
}

export function companyFormatPreview(
  settings: CompanyFormatSettings,
  sample = 1_000_000,
  sampleDate = "2026-09-08T14:30:45+06:00",
): { date: string; time: string; number: string } {
  return {
    date: formatCompanyDate(sampleDate, settings),
    time: formatCompanyTime(sampleDate, settings),
    number: formatGroupedNumber(sample, settings),
  };
}
