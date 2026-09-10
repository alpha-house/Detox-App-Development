import { Breakdown, ChartGroup, NOT_SPECIFIED, PALETTE, NEUTRAL, TurnawayRow } from "./types";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS_SHORT[Number(m) - 1]} ${y}`;
}

/** Sorted list of YYYY-MM keys present in the data (ascending). */
export function distinctMonths(rows: TurnawayRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) if (r.date) set.add(monthKey(r.date));
  return Array.from(set).sort();
}

/** Only the trailing 12 calendar months that actually contain data. */
export function last12Months(rows: TurnawayRow[]): string[] {
  return distinctMonths(rows).slice(-12);
}

export function subcatOf(row: TurnawayRow, breakdown: Breakdown): string {
  const g = row.gender || NOT_SPECIFIED;
  const m = row.method || NOT_SPECIFIED;
  if (breakdown === "gender") return g;
  if (breakdown === "method") return m;
  return `${g} · ${m}`;
}

/** Distinct series keys across the given rows, ordered by total count desc. */
export function seriesKeys(rows: TurnawayRow[], breakdown: Breakdown): string[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const k = subcatOf(r, breakdown);
    totals.set(k, (totals.get(k) ?? 0) + 1);
  }
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map((e) => e[0]);
}

export function makeColorMap(keys: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  let i = 0;
  for (const k of keys) {
    if (k === NOT_SPECIFIED || k.includes(NOT_SPECIFIED)) {
      map[k] = NEUTRAL;
    } else {
      map[k] = PALETTE[i % PALETTE.length];
      i++;
    }
  }
  return map;
}

/** X = month, one bar per visible series key. */
export function groupedByMonth(
  rows: TurnawayRow[],
  months: string[],
  visibleKeys: string[],
  breakdown: Breakdown
): ChartGroup[] {
  const counts = new Map<string, number>(); // `${month}|${key}` -> n
  for (const r of rows) {
    if (!r.date) continue;
    const mk = monthKey(r.date);
    const key = `${mk}|${subcatOf(r, breakdown)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return months.map((m) => ({
    label: monthLabel(m),
    bars: visibleKeys.map((k) => ({ key: k, value: counts.get(`${m}|${k}`) ?? 0 })),
  }));
}

/** X = series key, one bar each (used when a single month is selected). */
export function spreadBySubcategory(
  rows: TurnawayRow[],
  visibleKeys: string[],
  breakdown: Breakdown
): ChartGroup[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = subcatOf(r, breakdown);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return visibleKeys.map((k) => ({ label: k, bars: [{ key: k, value: counts.get(k) ?? 0 }] }));
}

export function niceCeil(max: number): number {
  if (max <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}
