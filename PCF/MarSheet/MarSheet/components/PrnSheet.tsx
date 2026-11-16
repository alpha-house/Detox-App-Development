import * as React from "react";
import { MarApi, errorText } from "./api";
import { combine, dayKey, fmtBoxDate, fmtDateOnly, fmtTime, startOfDay, timeInputValue } from "./dates";
import { StaffPicker } from "./StaffPicker";
import { DoseRow, INJECTION_SITES, LOW_BG, Medication, PrnLayout, SheetInfo, Staff } from "./types";

/**
 * PRN (OTC) MAR: one block per medication (rows of cp_detoxmedication), each block a list of
 * DATE rows holding TIME / AMT / INITIAL entries plus NOTES / WHY NEEDED, as on the paper sheet.
 * Every entry is its own cp_medicationadministration linked to the medication (cp_DetoxMedication).
 */
interface Props {
  api: MarApi;
  sheet: SheetInfo;
  layout: PrnLayout;
  doses: DoseRow[];
  meds: Medication[];
  me?: Staff;
  readOnly: boolean;
  reload: () => Promise<void>;
  onAddMedication?: () => void;
}

type Editing = { medId: string; date: string; id?: string } | null;

const FUTURE_SLACK_MS = 5 * 60 * 1000;
const toNum = (s: string): number | undefined => {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};
const numStr = (n?: number) => (n === undefined ? "" : String(n));
const OTHER = "__other__";

/** What counts toward a medication's daily maximum for one entry. */
const usedBy = (m: Medication | undefined, d: { dose?: number; amount?: number }) =>
  m?.maxUnit === "mg" ? d.dose ?? 0 : m?.maxUnit === "tabs" ? d.amount ?? 0 : 0;

/** "10:55 · 400 mg · 2 tabs · D.Se" (PRN) or "08:00 · 1 tab · D.Se" (Home, unit from the sheet). */
const entryText = (d: DoseRow, amountUnit: string) =>
  [
    fmtTime(d.at),
    d.dose !== undefined ? `${d.dose} mg` : undefined,
    d.amount !== undefined ? `${d.amount}${amountUnit ? " " + (d.amount === 1 ? amountUnit.replace(/s$/, "") : amountUnit) : ""}` : undefined,
    d.staff?.initials,
  ]
    .filter(Boolean)
    .join(" · ");
const SHEET_BLOCK = "__sheet__";

/** Insulin log entry as written in the boxes: "08:00 · BG 7.2 · 6 u · Abd L · D.Se". */
const insulinText = (d: DoseRow) =>
  [
    fmtTime(d.at),
    d.bg !== undefined ? `BG ${d.bg}` : undefined,
    d.dose !== undefined ? `${d.dose} u` : undefined,
    INJECTION_SITES.find((s) => s.value === d.site)?.short,
    d.staff?.initials,
  ]
    .filter(Boolean)
    .join(" · ");

export const PrnSheet: React.FC<Props> = (p) => {
  const { sheet, meds, doses } = p;
  const today = startOfDay(new Date());
  const todayKey = dayKey(today);
  const [editing, setEditing] = React.useState<Editing>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const canAdd = !p.readOnly && sheet.status === "Active";
  const sheetMode = p.layout.source === "sheet";
  const insulin = p.layout.entry === "insulin";
  // Home MAR: AMT is in the sheet's own unit (tabs, mL…); PRN: always tabs.
  const amountUnit = sheetMode ? (sheet.doseUnit && sheet.doseUnit !== "mg" ? sheet.doseUnit : "") : "tabs";
  const endKey = sheet.endDate;

  // Blocks. PRN: every medication on the PRN list, plus any other medication already charted here.
  // Home MAR: a single block for the sheet's own medication.
  const medById = new Map(meds.map((m) => [m.id, m]));
  const blocks: { id: string; med?: Medication; name: string }[] = sheetMode
    ? [{ id: SHEET_BLOCK, name: sheet.medication ?? "Medication" }]
    : meds.filter((m) => m.prn).map((m) => ({ id: m.id, med: m, name: m.name }));
  if (!sheetMode) {
    for (const d of doses) {
      const id = d.medicationId ?? OTHER;
      if (!blocks.some((b) => b.id === id)) blocks.push({ id, med: medById.get(id), name: d.medicationName ?? "Medication not recorded" });
    }
  }
  const blockOf = (d: DoseRow) => (sheetMode ? SHEET_BLOCK : d.medicationId ?? OTHER);

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

  return (
    <div className="mar-prn">
      <div className="mar-prn-bar">
        <span className="mar-small">Tap + on a row to chart a dose, or tap an entry to correct it.</span>
        {!sheetMode && p.onAddMedication && !p.readOnly && (
          <button type="button" className="mar-btn" onClick={p.onAddMedication}>
            + Add a medication to the list
          </button>
        )}
      </div>
      {error && <div className="mar-banner mar-banner-error">{error}</div>}
      <table className="mar-table mar-prn-table">
        <thead>
          <tr>
            <th className="mar-prn-med">{insulin ? "TYPE OF INSULIN INJECTION AND PRESCRIPTION INSTRUCTIONS" : "MEDICATION"}</th>
            <th className="mar-prn-date">DATE</th>
            <th>{p.layout.entriesLabel ?? "TIME / AMT / INITIAL"}</th>
            <th className="mar-prn-notes">{insulin ? "NOTES" : "NOTES / WHY NEEDED"}</th>
          </tr>
        </thead>
        {blocks.map((b) => {
          const mine = doses.filter((d) => blockOf(d) === b.id);
          const chartable = canAdd && (sheetMode || !!b.med);
          const byDate = new Map<string, DoseRow[]>();
          for (const d of mine) {
            const k = dayKey(d.at);
            byDate.set(k, [...(byDate.get(k) ?? []), d]);
          }
          if (chartable) byDate.set(todayKey, byDate.get(todayKey) ?? []);
          const dates = [...byDate.keys()].sort();
          const usedToday = (byDate.get(todayKey) ?? []).reduce((s, d) => s + usedBy(b.med, d), 0);
          const over = !!b.med?.maxDaily && usedToday > b.med.maxDaily;
          const editorHere = editing?.medId === b.id;
          const rowSpan = Math.max(dates.length, 1) + (editorHere ? 1 : 0);
          return (
            <tbody key={b.id} className="mar-prn-block">
              {dates.length === 0 && (
                <tr>
                  <td rowSpan={rowSpan} className="mar-prn-med"><MedCell b={b} usedToday={0} over={false} sheet={sheetMode ? sheet : undefined} blockStyle={p.layout.blockStyle} /></td>
                  <td colSpan={3} className="mar-small">No doses charted.</td>
                </tr>
              )}
              {dates.map((k, i) => {
                const rows = byDate.get(k) ?? [];
                const notes = rows.map((r) => r.notes).filter(Boolean).join("; ");
                const isFuture = k > todayKey;
                return (
                  <React.Fragment key={k}>
                    <tr>
                      {i === 0 && (
                        <td rowSpan={rowSpan} className="mar-prn-med">
                          <MedCell b={b} usedToday={usedToday} over={over} sheet={sheetMode ? sheet : undefined} blockStyle={p.layout.blockStyle} />
                        </td>
                      )}
                      <td className="mar-prn-date">
                        {fmtBoxDate(new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10))))}
                        {k === todayKey && <span className="mar-tag">Today</span>}
                        {sheetMode && endKey && k > endKey && <span className="mar-tag mar-tag-warn">After end date</span>}
                      </td>
                      <td className="mar-prn-entries">
                        {rows.map((r) => (
                          <button key={r.id} type="button"
                            className={"mar-prn-entry" + (insulin && r.bg !== undefined && r.bg < LOW_BG ? " mar-prn-entry-low" : "")}
                            title={insulin && r.bg !== undefined && r.bg < LOW_BG ? `Low B.G. (< ${LOW_BG} mmol/L)` : r.staff?.name}
                            disabled={p.readOnly || busy} onClick={() => setEditing({ medId: b.id, date: k, id: r.id })}>
                            {insulin ? insulinText(r) : entryText(r, amountUnit)}
                          </button>
                        ))}
                        {chartable && !isFuture && (
                          <button type="button" className="mar-prn-add" disabled={busy} onClick={() => setEditing({ medId: b.id, date: k })}>
                            +
                          </button>
                        )}
                      </td>
                      <td className="mar-prn-notes">{notes}</td>
                    </tr>
                    {editorHere && editing?.date === k && (
                      <PrnEditor key={editing.id ?? "new"} {...p} busy={busy} blockMed={b.med} date={k} amountUnit={amountUnit}
                        row={editing.id ? rows.find((r) => r.id === editing.id) : undefined}
                        dosesForCheck={doses}
                        onCancel={() => setEditing(null)}
                        onSave={(v) => void run(() => p.api.saveDose(sheet, v))} />
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
};

const MedCell: React.FC<{
  b: { med?: Medication; name: string };
  usedToday: number;
  over: boolean;
  sheet?: SheetInfo;
  blockStyle?: "home" | "insulin";
}> = ({ b, usedToday, over, sheet, blockStyle }) => (
  <>
    <div className="mar-prn-name">{b.name}</div>
    {sheet && blockStyle === "insulin" ? (
      // Insulin log: the type of insulin and its prescription instructions live in this box
      <div className="mar-prn-sheetmed">
        {sheet.dose && <div>DOSE: <b>{sheet.dose}{sheet.doseUnit && !/[a-z]/i.test(sheet.dose) ? ` ${sheet.doseUnit}` : ""}</b></div>}
        {sheet.frequency && <div>FREQUENCY: <b>{sheet.frequency}</b></div>}
        {sheet.instructions && <div className="mar-instructions">{sheet.instructions}</div>}
      </div>
    ) : sheet && (
      // Home MAR block header, as on paper: DOSE / FREQUENCY / START DATE / END DATE
      <div className="mar-prn-sheetmed">
        <div>DOSE: <b>{sheet.dose ?? ""}{sheet.doseUnit && sheet.dose && !/[a-z]/i.test(sheet.dose) ? ` ${sheet.doseUnit}` : ""}</b></div>
        <div>FREQUENCY: <b>{sheet.frequency ?? ""}</b></div>
        <div>START DATE: <b>{fmtDateOnly(sheet.startDate)}</b></div>
        <div>END DATE: <b>{fmtDateOnly(sheet.endDate)}</b></div>
      </div>
    )}
    {b.med?.strength && <div>{b.med.strength}</div>}
    {b.med?.directions && <div className="mar-small">{b.med.directions}</div>}
    {b.med?.maxDaily !== undefined && b.med.maxUnit && (
      <div className={"mar-prn-today" + (over ? " mar-prn-over" : "")}>
        Today: {usedToday} / {b.med.maxDaily} {b.med.maxUnit}
      </div>
    )}
  </>
);

// ------------------------------------------------------------------ editor row
interface EditorProps extends Props {
  busy: boolean;
  blockMed?: Medication;
  date: string;
  amountUnit: string;
  row?: DoseRow;
  dosesForCheck: DoseRow[];
  onCancel: () => void;
  onSave: (v: Parameters<MarApi["saveDose"]>[1]) => void;
}

const PrnEditor: React.FC<EditorProps> = ({ api, layout, meds, me, busy, blockMed, date, amountUnit, row, dosesForCheck, onCancel, onSave }) => {
  const sheetMode = layout.source === "sheet";
  const amtLabel = amountUnit ? `AMT (${amountUnit})` : "AMT";
  const isToday = date === dayKey(new Date());
  const [medId, setMedId] = React.useState(row?.medicationId ?? blockMed?.id ?? "");
  const [day, setDay] = React.useState(date);
  const [time, setTime] = React.useState(row ? timeInputValue(row.at) : isToday ? timeInputValue(new Date()) : "");
  const [dose, setDose] = React.useState(numStr(row?.dose));
  const [amount, setAmount] = React.useState(numStr(row?.amount));
  const [bg, setBg] = React.useState(numStr(row?.bg));
  const [site, setSite] = React.useState(row?.site !== undefined ? String(row.site) : "");
  const insulin = layout.entry === "insulin";
  const [notes, setNotes] = React.useState(row?.notes ?? "");
  const [staff, setStaff] = React.useState<Staff | undefined>(row?.staff ?? me);
  const [msg, setMsg] = React.useState<string>();
  const med = meds.find((m) => m.id === medId);

  const save = () => {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) : undefined;
    const at = d && combine(d, time);
    if (!at) return setMsg("Enter the date and time.");
    if (at.getTime() > Date.now() + FUTURE_SLACK_MS) return setMsg("That time is in the future.");
    const doseN = toNum(dose);
    const amountN = toNum(amount);
    if (insulin) {
      // Insulin log: TIME / B.G. LEVEL / DOSE (units) / INJ. SITE / INITIALS. A held dose is 0 units + why.
      const bgN = toNum(bg);
      if (bgN === undefined) return setMsg("Enter the B.G. level (mmol/L).");
      if (bgN <= 0 || bgN > 50) return setMsg("Check the B.G. level - it should be in mmol/L (e.g. 7.2).");
      if (dose.trim() && doseN === undefined) return setMsg("Dose must be a number of units.");
      if (doseN === undefined) return setMsg("Enter the dose in units (0 if held).");
      if (doseN > 0 && !site) return setMsg("Choose the injection site.");
      if (doseN === 0 && !notes.trim()) return setMsg("Note why the dose was held.");
      if (!staff) return setMsg("Pick your name for INITIALS.");
      return onSave({
        id: row?.id, at, bg: bgN, dose: doseN, site: doseN > 0 && site ? Number(site) : undefined,
        notes: notes.trim() || undefined, staff,
      });
    }
    if (sheetMode) {
      // Home MAR: the medication is the sheet's own; chart TIME / AMT / INITIAL (+ optional notes)
      if (amount.trim() && amountN === undefined) return setMsg("Amount must be a number.");
      if (amountN === undefined) return setMsg("Enter the amount given.");
      if (layout.requireWhy && !notes.trim()) return setMsg("Chart why it was needed.");
      if (!staff) return setMsg("Pick your name for INITIAL.");
      return onSave({ id: row?.id, at, amount: amountN, notes: notes.trim() || undefined, staff });
    }
    if (!med) return setMsg("Choose the medication.");
    if (dose.trim() && doseN === undefined) return setMsg("Dose must be a number (mg).");
    if (amount.trim() && amountN === undefined) return setMsg("Amount must be a number (tabs).");
    if (doseN === undefined && amountN === undefined) return setMsg("Enter the dose (mg) and/or amount (tabs).");
    if (med.maxUnit === "mg" && doseN === undefined) return setMsg(`Enter the dose in mg (max ${med.maxDaily} mg/day).`);
    if (med.maxUnit === "tabs" && amountN === undefined) return setMsg(`Enter the number of tabs (max ${med.maxDaily} tabs/day).`);
    if (!notes.trim()) return setMsg("Chart why it was needed.");
    if (!staff) return setMsg("Pick your name for INITIAL.");
    if (med.maxDaily !== undefined && med.maxUnit) {
      const k = dayKey(at);
      const already = dosesForCheck
        .filter((x) => x.id !== row?.id && x.medicationId === med.id && dayKey(x.at) === k)
        .reduce((s, x) => s + usedBy(med, x), 0);
      const total = already + usedBy(med, { dose: doseN, amount: amountN });
      if (total > med.maxDaily) {
        return setMsg(`Over the daily maximum: ${already} ${med.maxUnit} already charted that day, ${med.maxDaily} ${med.maxUnit} max. Do not give - contact a clinician.`);
      }
    }
    onSave({ id: row?.id, at, dose: doseN, amount: amountN, notes: notes.trim(), staff, medicationId: med.id });
  };

  return (
    <tr className="mar-row-edit">
      <td colSpan={3}>
        <div className="mar-editor">
          {!sheetMode && (
            <div className="mar-field mar-field-wide">
              <span className="mar-field-label">MEDICATION</span>
              <select className="mar-input" value={medId} onChange={(e) => setMedId(e.target.value)}>
                <option value="">Choose…</option>
                {meds.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.strength ? ` – ${m.strength}` : ""}</option>
                ))}
              </select>
            </div>
          )}
          <div className="mar-field"><span className="mar-field-label">DATE</span>
            <input className="mar-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></div>
          <div className="mar-field"><span className="mar-field-label">TIME</span>
            <input className="mar-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          {insulin ? (
            <>
              <div className="mar-field"><span className="mar-field-label">B.G. LEVEL (mmol/L)</span>
                <input className="mar-input" inputMode="decimal" value={bg} onChange={(e) => setBg(e.target.value)} /></div>
              <div className="mar-field"><span className="mar-field-label">DOSE (units)</span>
                <input className="mar-input" inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} /></div>
              <div className="mar-field"><span className="mar-field-label">INJ. SITE</span>
                <select className="mar-input" value={site} onChange={(e) => setSite(e.target.value)}>
                  <option value="">Choose…</option>
                  {INJECTION_SITES.map((s) => (
                    <option key={s.value} value={String(s.value)}>{s.label}</option>
                  ))}
                </select></div>
            </>
          ) : (
            <>
              {layout.showDoseField && (
                <div className="mar-field"><span className="mar-field-label">DOSE (mg)</span>
                  <input className="mar-input" inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} /></div>
              )}
              <div className="mar-field"><span className="mar-field-label">{amtLabel}</span>
                <input className="mar-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            </>
          )}
          <div className="mar-field"><span className="mar-field-label">{insulin ? "INITIALS" : "INITIAL"}</span>
            <StaffPicker api={api} value={staff} onChange={setStaff} placeholder="ID" /></div>
          <div className="mar-field mar-field-wide"><span className="mar-field-label">{insulin ? "NOTES" : "NOTES / WHY NEEDED"}</span>
            <input className="mar-input" placeholder={layout.requireWhy ? "e.g. headache" : insulin ? "Required if held (0 units)" : "Optional"} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
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
