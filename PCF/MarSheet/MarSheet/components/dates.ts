// Local-time date helpers. Doses are stored as UTC (UserLocal columns); everything the
// nurse sees and types is in the device's local time, grouped by local calendar day.

const pad = (n: number) => String(n).padStart(2, "0");

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const diffDays = (a: Date, b: Date) =>
  Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);

/** "2026-11-16" (Dataverse DateOnly) -> local midnight. */
export function parseDateOnly(s?: string): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

export const fmtBoxDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export const fmtShortDate = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

export const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const timeInputValue = (d: Date) => fmtTime(d);

export const dateInputValue = (d: Date) => dayKey(d);

/** Combine a local day with an "HH:MM" string from <input type="time">. */
export function combine(day: Date, hhmm: string): Date | undefined {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return undefined;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(m[1]), Number(m[2]));
}

/** Show a DateOnly value as written on paper. */
export function fmtDateOnly(s?: string): string {
  const d = parseDateOnly(s);
  return d ? d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "";
}
