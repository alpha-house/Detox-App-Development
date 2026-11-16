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

/** START/STOP as the paper legend asks: DAY/MONTH/TIME, e.g. "16/Nov 08:00". */
export const fmtDayMonthTime = (d: Date) =>
  `${d.getDate()}/${d.toLocaleDateString(undefined, { month: "short" })} ${fmtTime(d)}`;

/** Value for <input type="datetime-local"> in local time. */
export const dateTimeInputValue = (d: Date) => `${dayKey(d)}T${fmtTime(d)}`;

/** Parse an <input type="datetime-local"> value as local time. */
export function parseDateTimeInput(s: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) : undefined;
}

const DAY_WORDS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE"];
/** 0-based day index -> "ONE", "TWO", … (falls back to the number). */
export const dayWord = (i: number) => DAY_WORDS[i] ?? String(i + 1);

/** Show a DateOnly value as written on paper. */
export function fmtDateOnly(s?: string): string {
  const d = parseDateOnly(s);
  return d ? d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "";
}
