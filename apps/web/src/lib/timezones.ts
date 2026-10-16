export type TimezoneOption = {
  value: string;
  label: string;
  region: string;
  offsetMinutes: number;
};

const REGION_ORDER = [
  "UTC",
  "Africa",
  "America",
  "Antarctica",
  "Arctic",
  "Asia",
  "Atlantic",
  "Australia",
  "Europe",
  "Indian",
  "Pacific",
  "Etc",
] as const;

function offsetMinutesForZone(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

function formatGmtOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  if (mins === 0) return `GMT${sign}${hours}`;
  return `GMT${sign}${hours}:${String(mins).padStart(2, "0")}`;
}

function regionOf(zone: string): string {
  if (zone === "UTC") return "UTC";
  const slash = zone.indexOf("/");
  if (slash < 0) return "Other";
  return zone.slice(0, slash);
}

export function listIanaTimezones(at: Date = new Date()): TimezoneOption[] {
  const names =
    typeof Intl !== "undefined" && "supportedValuesOf" in Intl
      ? Intl.supportedValuesOf("timeZone")
      : [];
  const zones = new Set(names);
  zones.add("UTC");

  const options: TimezoneOption[] = [];
  for (const value of zones) {
    try {
      const offsetMinutes = offsetMinutesForZone(value, at);
      options.push({
        value,
        label: `${value.replaceAll("_", " ")} (${formatGmtOffset(offsetMinutes)})`,
        region: regionOf(value),
        offsetMinutes,
      });
    } catch {
      // Skip zones the runtime cannot format.
    }
  }

  options.sort((a, b) => {
    if (a.offsetMinutes !== b.offsetMinutes) return a.offsetMinutes - b.offsetMinutes;
    return a.value.localeCompare(b.value);
  });
  return options;
}

export function groupTimezonesByRegion(zones: TimezoneOption[]): { region: string; items: TimezoneOption[] }[] {
  const buckets = new Map<string, TimezoneOption[]>();
  for (const zone of zones) {
    const list = buckets.get(zone.region) ?? [];
    list.push(zone);
    buckets.set(zone.region, list);
  }

  const known = REGION_ORDER.filter((region) => buckets.has(region)).map((region) => ({
    region,
    items: buckets.get(region) ?? [],
  }));
  const extra = [...buckets.keys()]
    .filter((region) => !REGION_ORDER.includes(region as (typeof REGION_ORDER)[number]))
    .sort()
    .map((region) => ({ region, items: buckets.get(region) ?? [] }));
  return [...known, ...extra];
}

let cached: TimezoneOption[] | null = null;

export function getIanaTimezones(): TimezoneOption[] {
  if (!cached) cached = listIanaTimezones();
  return cached;
}
