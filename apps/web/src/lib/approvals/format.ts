import { formatDateTime } from "@/lib/utils";

/** The API sends naive UTC timestamps; without a designator the browser would read them as local time (6 h off in Dhaka). */
export function apiDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(/(?:Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function approvalDateTime(value: string | null | undefined): string {
  const date = apiDate(value);
  return date ? formatDateTime(date) : "—";
}

/** "3 min", "5 h", "2 d": how long a request has been waiting. */
export function waitingFor(value: string | null | undefined, now = Date.now()): string {
  const date = apiDate(value);
  if (!date) return "—";
  const minutes = Math.max(0, Math.floor((now - date.getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}
