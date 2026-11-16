import * as React from "react";
import { MarApi, errorText } from "./api";
import { combine, dayKey, fmtTime, timeInputValue } from "./dates";
import { StaffPicker } from "./StaffPicker";
import { DoseRow, HCG_RESULTS, LOW_BG, SheetInfo, Staff, VitalsLayout } from "./types";

/**
 * Vital Signs, CIWA/COWS, Urine/Blood Testing Results Record. One ruled row per set of readings:
 * DATE / TIME / BP / HR / RESP. RATE / O2 SAT / TEMP / COWS / CIWA / HCG / B.G. / DRUG TEST / INITIALS.
 * Each row is a cp_medicationadministration (cp_vs_* columns, plus the shared cp_bp / cp_hr /
 * cp_ii_bglevel). The first row is the admission's own intake readings, read from the admission.
 */
interface Props {
  api: MarApi;
  sheet: SheetInfo;
  layout: VitalsLayout;
  doses: DoseRow[];
  me?: Staff;
  readOnly: boolean;
  reload: () => Promise<void>;
}

const COLS = 13;
const FUTURE_SLACK_MS = 5 * 60 * 1000;
const toNum = (s: string): number | undefined => {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};
const numStr = (n?: number) => (n === undefined ? "" : String(n));
const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const hcgLabel = (v?: number) => HCG_RESULTS.find((h) => h.value === v)?.label ?? "";
const POSITIVE = 121570001;

export const VitalsSheet: React.FC<Props> = (p) => {
  const { sheet, doses } = p;
  const [editing, setEditing] = React.useState<string | null>(null); // row id, or "new"
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const canAdd = !p.readOnly && sheet.status === "Active";
  const rows = [...doses].sort((a, b) => a.at.getTime() - b.at.getTime());
  const intake = sheet.intake;
  const hasIntake = !!intake && [intake.bp, intake.hr, intake.temp, intake.o2, intake.ciwa, intake.cows].some((v) => v !== undefined);
  const blanks = Math.max(0, p.layout.minRows - rows.length - (hasIntake ? 1 : 0) - (editing === "new" ? 1 : 0));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      setEditing(null);
      await p.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const editor = (row?: DoseRow) => (
    <VitalsEditor key={row?.id ?? "new"} api={p.api} me={p.me} row={row} busy={busy}
      onCancel={() => setEditing(null)} onSave={(v) => void run(() => p.api.saveDose(sheet, v))} />
  );

  return (
    <div className="mar-vs">
      <div className="mar-prn-bar">
        <span className="mar-small">Tap + Add reading to chart a new set of readings, or tap a row to correct it.</span>
        {canAdd && (
          <button type="button" className="mar-btn mar-btn-primary" disabled={busy || editing !== null} onClick={() => setEditing("new")}>
            + Add reading
          </button>
        )}
      </div>
      {error && <div className="mar-banner mar-banner-error">{error}</div>}
      <div className="mar-vs-scroll">
        <table className="mar-table mar-vs-table">
          <thead>
            <tr>
              <th className="mar-vs-date">DATE<span>(Month, Day, Year)</span></th>
              <th>TIME</th>
              <th className="mar-vs-shade">Blood Pressure</th>
              <th className="mar-vs-shade">Heart Rate</th>
              <th className="mar-vs-shade">Respiratory Rate</th>
              <th className="mar-vs-shade">Oxygen Saturation</th>
              <th className="mar-vs-shade">Temp</th>
              <th>COWS Score</th>
              <th>CIWA Score</th>
              <th>HCG Test Result</th>
              <th>Blood Glucose Level</th>
              <th className="mar-vs-drug">Drug Test Result<span>(Indicate Positive Results Only)</span></th>
              <th>Nurse Initials</th>
            </tr>
          </thead>
          <tbody>
            {hasIntake && intake && (
              <tr className="mar-vs-intake" title="Readings taken on admission — edit them on the admission's Medical1 tab (CIWA / COWS on the Withdrawal tab).">
                <td>{intake.at ? fmtDate(intake.at) : ""}<span className="mar-tag">Admission</span></td>
                <td>{intake.at ? fmtTime(intake.at) : ""}</td>
                <td className="mar-vs-shade">{intake.bp ?? ""}</td>
                <td className="mar-vs-shade">{intake.hr ?? ""}</td>
                <td className="mar-vs-shade" />
                <td className="mar-vs-shade">{intake.o2 ?? ""}</td>
                <td className="mar-vs-shade">{intake.temp ?? ""}</td>
                <td>{numStr(intake.cows)}</td>
                <td>{numStr(intake.ciwa)}</td>
                <td />
                <td />
                <td />
                <td>{intake.staff?.initials ?? ""}</td>
              </tr>
            )}
            {rows.map((r) =>
              editing === r.id ? (
                <React.Fragment key={r.id}>{editor(r)}</React.Fragment>
              ) : (
                <tr key={r.id} className={p.readOnly ? "" : "mar-row-click"} title={r.staff?.name}
                  onClick={() => !p.readOnly && !busy && editing === null && setEditing(r.id)}>
                  <td>{fmtDate(r.at)}</td>
                  <td>{fmtTime(r.at)}</td>
                  <td className="mar-vs-shade">{r.bp ?? ""}</td>
                  <td className="mar-vs-shade">{numStr(r.hr)}</td>
                  <td className="mar-vs-shade">{numStr(r.rr)}</td>
                  <td className="mar-vs-shade">{r.o2 !== undefined ? `${r.o2}%` : ""}</td>
                  <td className="mar-vs-shade">{numStr(r.temp)}</td>
                  <td>{numStr(r.cows)}</td>
                  <td>{numStr(r.ciwa)}</td>
                  <td className={r.hcg === POSITIVE ? "mar-vs-flag" : ""}>{hcgLabel(r.hcg)}</td>
                  <td className={r.bg !== undefined && r.bg < LOW_BG ? "mar-vs-flag" : ""}
                    title={r.bg !== undefined && r.bg < LOW_BG ? `Low B.G. (< ${LOW_BG} mmol/L)` : undefined}>{numStr(r.bg)}</td>
                  <td className="mar-vs-drug">{r.drugTest ?? ""}</td>
                  <td>{r.staff?.initials ?? ""}</td>
                </tr>
              )
            )}
            {editing === "new" && editor()}
            {Array.from({ length: blanks }, (_, i) => (
              <tr key={`blank${i}`} className="mar-row-blank">
                {Array.from({ length: COLS }, (__, c) => (
                  <td key={c} className={c >= 2 && c <= 6 ? "mar-vs-shade" : ""}>&nbsp;</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ editor row
interface EditorProps {
  api: MarApi;
  me?: Staff;
  row?: DoseRow;
  busy: boolean;
  onCancel: () => void;
  onSave: (v: Parameters<MarApi["saveDose"]>[1]) => void;
}

/** [label, state key, min, max, hint] for the numeric readings. */
const NUMS: [string, "hr" | "rr" | "o2" | "temp" | "cows" | "ciwa" | "bg", number, number, string][] = [
  ["HEART RATE", "hr", 20, 250, "bpm"],
  ["RESP. RATE", "rr", 4, 60, "/min"],
  ["O2 SAT (%)", "o2", 50, 100, "%"],
  ["TEMP (°C)", "temp", 30, 43, "°C"],
  ["COWS SCORE", "cows", 0, 48, "0-48"],
  ["CIWA SCORE", "ciwa", 0, 67, "0-67"],
  ["B.G. (mmol/L)", "bg", 0.5, 50, "mmol/L"],
];

const VitalsEditor: React.FC<EditorProps> = ({ api, me, row, busy, onCancel, onSave }) => {
  const now = new Date();
  const [day, setDay] = React.useState(dayKey(row?.at ?? now));
  const [time, setTime] = React.useState(timeInputValue(row?.at ?? now));
  const [bp, setBp] = React.useState(row?.bp ?? "");
  const [vals, setVals] = React.useState<Record<string, string>>({
    hr: numStr(row?.hr), rr: numStr(row?.rr), o2: numStr(row?.o2), temp: numStr(row?.temp),
    cows: numStr(row?.cows), ciwa: numStr(row?.ciwa), bg: numStr(row?.bg),
  });
  const [hcg, setHcg] = React.useState(row?.hcg !== undefined ? String(row.hcg) : "");
  const [drug, setDrug] = React.useState(row?.drugTest ?? "");
  const [staff, setStaff] = React.useState<Staff | undefined>(row?.staff ?? me);
  const [msg, setMsg] = React.useState<string>();

  const save = () => {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) : undefined;
    const at = d && combine(d, time);
    if (!at) return setMsg("Enter the date and time.");
    if (at.getTime() > Date.now() + FUTURE_SLACK_MS) return setMsg("That time is in the future.");
    const bpT = bp.trim();
    if (bpT && !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(bpT)) return setMsg("Blood pressure should look like 120/80.");
    const out: Record<string, number | undefined> = {};
    for (const [label, key, min, max] of NUMS) {
      const s = vals[key] ?? "";
      const n = toNum(s);
      if (s.trim() && n === undefined) return setMsg(`${label} must be a number.`);
      if (n !== undefined && (n < min || n > max)) return setMsg(`Check ${label}: expected ${min}–${max}.`);
      out[key] = n;
    }
    const hcgN = hcg ? Number(hcg) : undefined;
    const drugT = drug.trim() || undefined;
    if (!bpT && Object.values(out).every((v) => v === undefined) && hcgN === undefined && !drugT) {
      return setMsg("Enter at least one reading or result.");
    }
    if (!staff) return setMsg("Pick your name for Nurse Initials.");
    onSave({
      id: row?.id, at, staff,
      bp: bpT ? bpT.replace(/\s/g, "") : undefined,
      hr: out.hr, rr: out.rr, o2: out.o2, temp: out.temp, cows: out.cows, ciwa: out.ciwa, bg: out.bg,
      hcg: hcgN, drugTest: drugT,
    });
  };

  return (
    <tr className="mar-row-edit">
      <td colSpan={COLS}>
        <div className="mar-editor">
          <div className="mar-field"><span className="mar-field-label">DATE</span>
            <input className="mar-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></div>
          <div className="mar-field"><span className="mar-field-label">TIME</span>
            <input className="mar-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          <div className="mar-field"><span className="mar-field-label">BLOOD PRESSURE</span>
            <input className="mar-input" placeholder="120/80" value={bp} onChange={(e) => setBp(e.target.value)} /></div>
          {NUMS.map(([label, key, , , hint]) => (
            <div key={key} className="mar-field"><span className="mar-field-label">{label}</span>
              <input className="mar-input" inputMode="decimal" placeholder={hint} value={vals[key]}
                onChange={(e) => setVals({ ...vals, [key]: e.target.value })} /></div>
          ))}
          <div className="mar-field"><span className="mar-field-label">HCG TEST RESULT</span>
            <select className="mar-input" value={hcg} onChange={(e) => setHcg(e.target.value)}>
              <option value="">Not done</option>
              {HCG_RESULTS.map((h) => <option key={h.value} value={String(h.value)}>{h.label}</option>)}
            </select></div>
          <div className="mar-field mar-field-wide"><span className="mar-field-label">DRUG TEST RESULT (POSITIVE RESULTS ONLY)</span>
            <input className="mar-input" placeholder="e.g. THC, fentanyl" value={drug} onChange={(e) => setDrug(e.target.value)} /></div>
          <div className="mar-field"><span className="mar-field-label">NURSE INITIALS</span>
            <StaffPicker api={api} value={staff} onChange={setStaff} placeholder="ID" /></div>
        </div>
        <div className="mar-instr-actions">
          {msg && <span className="mar-msg">{msg}</span>}
          <button type="button" className="mar-btn" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className="mar-btn mar-btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </td>
    </tr>
  );
};
