import * as React from "react";
import { Breakdown, TurnawayRow } from "./types";
import {
  distinctMonths,
  groupedByMonth,
  last12Months,
  makeColorMap,
  monthKey,
  monthLabel,
  seriesKeys,
  spreadBySubcategory,
} from "./aggregate";
import { BarChart } from "./BarChart";

export interface TurnawayAppProps {
  rows: TurnawayRow[];
  loading: boolean;
  setupMessage?: string;
  height: number;
}

const ALL = "ALL";

const BREAKDOWNS: { value: Breakdown; label: string }[] = [
  { value: "gender", label: "Gender" },
  { value: "method", label: "Assessment Method" },
  { value: "both", label: "Gender × Method" },
];

function useWidth(ref: React.RefObject<HTMLElement>): number {
  const [w, setW] = React.useState(720);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cw = e.contentRect.width;
        if (cw > 0) setW(cw);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export const TurnawayApp: React.FC<TurnawayAppProps> = ({ rows, loading, setupMessage, height }) => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const width = useWidth(rootRef);

  const months = React.useMemo(() => distinctMonths(rows), [rows]);
  const monthOptions = React.useMemo(() => last12Months(rows), [rows]);

  const [month, setMonth] = React.useState<string>(ALL);
  const [breakdown, setBreakdown] = React.useState<Breakdown>("gender");
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());

  // Default to the most recent month once data arrives, so the "spread" view shows first.
  const initialised = React.useRef(false);
  React.useEffect(() => {
    if (!initialised.current && monthOptions.length) {
      initialised.current = true;
      setMonth(monthOptions[monthOptions.length - 1]);
    }
  }, [monthOptions]);

  // Reset the month if the underlying data no longer contains it.
  React.useEffect(() => {
    if (month !== ALL && !months.includes(month)) setMonth(ALL);
  }, [months, month]);

  // Reset hidden series when the breakdown dimension changes.
  React.useEffect(() => setHidden(new Set()), [breakdown]);

  const monthRows = React.useMemo(
    () => (month === ALL ? rows : rows.filter((r) => r.date && monthKey(r.date) === month)),
    [rows, month]
  );

  const allKeys = React.useMemo(() => seriesKeys(rows, breakdown), [rows, breakdown]);
  const colorMap = React.useMemo(() => makeColorMap(allKeys), [allKeys]);
  const visibleKeys = React.useMemo(() => allKeys.filter((k) => !hidden.has(k)), [allKeys, hidden]);
  const chartMonths = React.useMemo(() => months.slice(-12), [months]);

  const groups = React.useMemo(() => {
    if (month === ALL) return groupedByMonth(rows, chartMonths, visibleKeys, breakdown);
    const present = seriesKeys(monthRows, breakdown).filter((k) => !hidden.has(k));
    return spreadBySubcategory(monthRows, present, breakdown);
  }, [month, rows, chartMonths, visibleKeys, breakdown, monthRows, hidden]);

  const toggle = (k: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const chartHeight = Math.max(height - 168, 240);
  const total = monthRows.length;

  let body: React.ReactNode;
  if (setupMessage) {
    body = <div className="ta-msg ta-msg-warn">{setupMessage}</div>;
  } else if (loading) {
    body = <div className="ta-msg">Loading turnaways…</div>;
  } else if (rows.length === 0) {
    body = <div className="ta-msg">No turnaway records in this view.</div>;
  } else {
    body = (
      <>
        <BarChart
          groups={groups}
          colorFor={(k) => colorMap[k] ?? "#888"}
          width={width}
          height={chartHeight}
          showValues={month !== ALL}
        />
        <div className="ta-legend">
          {allKeys.map((k) => (
            <button
              key={k}
              type="button"
              className={"ta-chip" + (hidden.has(k) ? " ta-chip-off" : "")}
              onClick={() => toggle(k)}
              title={hidden.has(k) ? "Show" : "Hide"}
            >
              <span className="ta-dot" style={{ background: colorMap[k] }} />
              {k}
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <div ref={rootRef} className="ta-root" style={{ height }}>
      <div className="ta-inner">
        <div className="ta-toolbar">
          <div className="ta-field">
            <label className="ta-label" htmlFor="ta-month">
              Month
            </label>
            <select
              id="ta-month"
              className="ta-select"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              <option value={ALL}>All months (last 12)</option>
              {[...monthOptions].reverse().map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </div>

          <div className="ta-field">
            <span className="ta-label">Break down by</span>
            <div className="ta-seg" role="tablist">
              {BREAKDOWNS.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  role="tab"
                  aria-selected={breakdown === b.value}
                  className={"ta-seg-btn" + (breakdown === b.value ? " ta-seg-on" : "")}
                  onClick={() => setBreakdown(b.value)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ta-spacer" />
          <div className="ta-total">
            <b>{total}</b> turnaway{total === 1 ? "" : "s"}
            {month === ALL ? "" : ` · ${monthLabel(month)}`}
          </div>
        </div>
        {body}
      </div>
    </div>
  );
};
