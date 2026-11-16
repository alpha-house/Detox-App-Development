import * as React from "react";
import { MarApi, errorText } from "./api";
import {
  addDays,
  combine,
  dateInputValue,
  dayKey,
  diffDays,
  fmtBoxDate,
  fmtShortDate,
  fmtTime,
  parseDateOnly,
  startOfDay,
  timeInputValue,
} from "./dates";
import { StaffPicker } from "./StaffPicker";
import { DailyBoxLayout, DoseRow, ReconRow, SheetInfo, Staff } from "./types";

interface Props {
  api: MarApi;
  sheet: SheetInfo;
  layout: DailyBoxLayout;
  doses: DoseRow[];
  recons: ReconRow[];
  me?: Staff;
  readOnly: boolean;
  stacked: boolean;
  reload: () => Promise<void>;
}

type Editing = { kind: "dose"; day: string; id?: string } | { kind: "recon"; id?: string } | null;

const toNum = (s: string): number | undefined => {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};
const numStr = (n?: number) => (n === undefined ? "" : String(n));
const FUTURE_SLACK_MS = 5 * 60 * 1000;

export const DailyBoxSheet: React.FC<Props> = (p) => {
  const { sheet, layout, doses, recons } = p;
  const today = startOfDay(new Date());
  const [editing, setEditing] = React.useState<Editing>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  // ---- which days the boxes show (the paper's DATE boxes, 12 per page)
  const byDay = React.useMemo(() => {
    const m = new Map<string, DoseRow[]>();
    for (const d of doses) {
      const k = dayKey(d.at);
      const list = m.get(k) ?? [];
      list.push(d);
      m.set(k, list);
    }
    return m;
  }, [doses]);

  // Day 1 = script start date (or the first dose if one was charted earlier).
  let anchor = parseDateOnly(sheet.startDate) ?? (doses[0] ? startOfDay(doses[0].at) : today);
  if (doses[0] && doses[0].at < anchor) anchor = startOfDay(doses[0].at);

  const perPage = layout.boxesPerPage;
  const lastDay = doses.length ? startOfDay(doses[doses.length - 1].at) : today;
  const lastIdx = Math.max(diffDays(anchor, today), diffDays(anchor, lastDay), 0);
  const pageCount = Math.floor(lastIdx / perPage) + 1;
  const [page, setPage] = React.useState(() => Math.min(Math.max(0, Math.floor(diffDays(anchor, today) / perPage)), pageCount - 1));
  const days = Array.from({ length: perPage }, (_, i) => addDays(anchor, page * perPage + i));
  const endDate = parseDateOnly(sheet.endDate);

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

  const unit = sheet.doseUnit ? ` ${sheet.doseUnit}` : "";
  const canAddDose = !p.readOnly && sheet.status === "Active";

  return (
    <div className={"mar-body" + (p.stacked ? " mar-stacked" : "")}>
      <div className="mar-days">
        <div className="mar-pager">
          <button type="button" className="mar-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
            ‹ Previous
          </button>
          <span>
            Days {page * perPage + 1}–{page * perPage + perPage} · {fmtShortDate(days[0])} – {fmtShortDate(days[perPage - 1])}
          </span>
          <button type="button" className="mar-btn" disabled={page >= pageCount - 1 && days[perPage - 1] >= today} onClick={() => setPage(page + 1)}>
            Next ›
          </button>
        </div>
        {error && <div className="mar-banner mar-banner-error">{error}</div>}
        <div className="mar-grid">
          {days.map((day) => {
            const k = dayKey(day);
            const rows = byDay.get(k) ?? [];
            const isFuture = day > today;
            const afterEnd = !!endDate && day > endDate;
            const td = rows.reduce((s, r) => s + (r.dose ?? 0), 0);
            const addingHere = editing?.kind === "dose" && editing.day === k && !editing.id;
            const fillers = Math.max(0, layout.minRows - rows.length - (canAddDose && !isFuture ? 1 : 0));
            return (
              <div key={k} className={"mar-box" + (k === dayKey(today) ? " mar-box-today" : "") + (isFuture ? " mar-box-future" : "")}>
                <div className="mar-box-date">
                  DATE: <b>{fmtBoxDate(day)}</b>
                  {k === dayKey(today) && <span className="mar-tag">Today</span>}
                  {afterEnd && <span className="mar-tag mar-tag-warn">After script end</span>}
                </div>
                <table className="mar-table">
                  <thead>
                    <tr>
                      <th>TIME</th>
                      <th>DOSE</th>
                      <th>{layout.countLabel}</th>
                      <th>ID</th>
                      <th>{layout.showHR ? "BP / HR" : "BP"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) =>
                      editing?.kind === "dose" && editing.id === r.id ? (
                        <DoseEditor key={r.id} {...p} day={day} row={r} busy={busy} onCancel={() => setEditing(null)}
                          onSave={(v) => void run(() => p.api.saveDose(sheet, { ...v, id: r.id }))} />
                      ) : (
                        <tr key={r.id} className={p.readOnly ? "" : "mar-row-click"} onClick={() => !p.readOnly && !busy && setEditing({ kind: "dose", day: k, id: r.id })}>
                          <td>{fmtTime(r.at)}</td>
                          <td>{numStr(r.dose)}</td>
                          <td>{numStr(r.count)}</td>
                          <td title={r.staff?.name}>{r.staff?.initials ?? ""}</td>
                          <td>{[r.bp, layout.showHR && r.hr !== undefined ? r.hr : undefined].filter((x) => x !== undefined && x !== "").join(" / ")}</td>
                        </tr>
                      )
                    )}
                    {canAddDose && !isFuture &&
                      (addingHere ? (
                        <DoseEditor {...p} day={day} busy={busy} onCancel={() => setEditing(null)}
                          onSave={(v) => void run(() => p.api.saveDose(sheet, v))} />
                      ) : (
                        <tr className="mar-row-add" onClick={() => !busy && setEditing({ kind: "dose", day: k })}>
                          <td colSpan={5}>+ Record dose</td>
                        </tr>
                      ))}
                    {Array.from({ length: fillers }, (_, i) => (
                      <tr key={"f" + i} className="mar-row-blank">
                        <td>&nbsp;</td><td /><td /><td /><td />
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>TD</td>
                      <td colSpan={4}>{rows.some((r) => r.dose !== undefined) ? `${td}${unit}` : ""}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })}
        </div>
      </div>

      <ReconPanel {...p} editing={editing} setEditing={setEditing} busy={busy} run={run} />
    </div>
  );
};

// ------------------------------------------------------------------ dose editor row
interface DoseEditorProps extends Props {
  day: Date;
  row?: DoseRow;
  busy: boolean;
  onCancel: () => void;
  onSave: (v: { at: Date; dose?: number; count?: number; bp?: string; hr?: number; staff?: Staff }) => void;
}

const DoseEditor: React.FC<DoseEditorProps> = ({ api, sheet, layout, me, day, row, busy, onCancel, onSave }) => {
  const isToday = dayKey(day) === dayKey(new Date());
  const [time, setTime] = React.useState(row ? timeInputValue(row.at) : isToday ? timeInputValue(new Date()) : "");
  const [dose, setDose] = React.useState(row ? numStr(row.dose) : numStr(toNum((sheet.dose ?? "").replace(/[^\d.]/g, ""))));
  const [count, setCount] = React.useState(numStr(row?.count));
  const [bp, setBp] = React.useState(row?.bp ?? "");
  const [hr, setHr] = React.useState(numStr(row?.hr));
  const [staff, setStaff] = React.useState<Staff | undefined>(row?.staff ?? me);
  const [msg, setMsg] = React.useState<string>();

  const save = () => {
    const at = combine(day, time);
    if (!at) return setMsg("Enter the time.");
    if (at.getTime() > Date.now() + FUTURE_SLACK_MS) return setMsg("That time is in the future.");
    if (!staff) return setMsg("Pick your name for ID.");
    if (bp && !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(bp.trim())) return setMsg("BP as 120/80.");
    onSave({ at, dose: toNum(dose), count: toNum(count), bp: bp.trim() || undefined, hr: toNum(hr), staff });
  };

  return (
    <>
      <tr className="mar-row-edit">
        <td><input className="mar-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></td>
        <td><input className="mar-input" inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} /></td>
        <td><input className="mar-input" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} /></td>
        <td><StaffPicker api={api} value={staff} onChange={setStaff} placeholder="ID" /></td>
        <td className="mar-bphr">
          <input className="mar-input" placeholder="BP" value={bp} onChange={(e) => setBp(e.target.value)} />
          {layout.showHR && <input className="mar-input" inputMode="numeric" placeholder="HR" value={hr} onChange={(e) => setHr(e.target.value)} />}
        </td>
      </tr>
      <tr className="mar-row-actions">
        <td colSpan={5}>
          {msg && <span className="mar-msg">{msg}</span>}
          <button type="button" className="mar-btn" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className="mar-btn mar-btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </td>
      </tr>
    </>
  );
};

// ------------------------------------------------------------------ reconciliation panel
interface ReconPanelProps extends Props {
  editing: Editing;
  setEditing: (e: Editing) => void;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
}

const RECON_MIN_ROWS = 14;

const ReconPanel: React.FC<ReconPanelProps> = (p) => {
  const { api, sheet, layout, recons, readOnly, editing, setEditing, busy, run } = p;

  const saveRecon = (v: Parameters<MarApi["saveRecon"]>[1]) =>
    run(async () => {
      await api.saveRecon(sheet, v);
      // keep the sheet's Refusal Count in step with the reconciliation entries
      const n = (await api.loadRecons(sheet.id)).filter((r) => r.isRefusal).length;
      if (n !== sheet.refusalCount) await api.setRefusalCount(sheet.id, n);
    });

  const adding = editing?.kind === "recon" && !editing.id;
  const fillers = Math.max(0, RECON_MIN_ROWS - recons.length - 1);
  return (
    <div className="mar-recon">
      <div className="mar-recon-title">
        MEDICATION RECONCILIATION <span>– TO BE DONE ONCE DAILY ON EVENING/NIGHTS</span>
      </div>
      <table className="mar-table">
        <thead>
          <tr>
            <th>DATE</th>
            <th>TIME</th>
            <th>{layout.reconCountLabel}</th>
            <th>REASON / REFUSAL / WHY</th>
            <th>ID</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          {recons.map((r) =>
            editing?.kind === "recon" && editing.id === r.id ? (
              <ReconEditor key={r.id} {...p} row={r} onCancel={() => setEditing(null)} onSave={(v) => void saveRecon({ ...v, id: r.id })} />
            ) : (
              <tr key={r.id} className={(r.isRefusal ? "mar-refusal " : "") + (readOnly ? "" : "mar-row-click")}
                onClick={() => !readOnly && !busy && setEditing({ kind: "recon", id: r.id })}>
                <td>{fmtShortDate(r.at)}</td>
                <td>{fmtTime(r.at)}</td>
                <td>{numStr(r.count)}</td>
                <td>{r.isRefusal && <b>REFUSED </b>}{r.reason ?? ""}</td>
                <td title={r.staff1?.name}>{r.staff1?.initials ?? ""}</td>
                <td title={r.staff2?.name}>{r.staff2?.initials ?? ""}</td>
              </tr>
            )
          )}
          {!readOnly &&
            (adding ? (
              <ReconEditor {...p} onCancel={() => setEditing(null)} onSave={(v) => void saveRecon(v)} />
            ) : (
              <tr className="mar-row-add" onClick={() => !busy && setEditing({ kind: "recon" })}>
                <td colSpan={6}>+ Add reconciliation / refusal</td>
              </tr>
            ))}
          {Array.from({ length: fillers }, (_, i) => (
            <tr key={"f" + i} className="mar-row-blank">
              <td>&nbsp;</td><td /><td /><td /><td /><td />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface ReconEditorProps extends ReconPanelProps {
  row?: ReconRow;
  onCancel: () => void;
  onSave: (v: { at: Date; count?: number; isRefusal: boolean; reason?: string; staff1?: Staff; staff2?: Staff }) => void;
}

const ReconEditor: React.FC<ReconEditorProps> = ({ api, me, row, busy, onCancel, onSave }) => {
  const now = new Date();
  const [date, setDate] = React.useState(dateInputValue(row?.at ?? now));
  const [time, setTime] = React.useState(timeInputValue(row?.at ?? now));
  const [count, setCount] = React.useState(numStr(row?.count));
  const [refused, setRefused] = React.useState(row?.isRefusal ?? false);
  const [reason, setReason] = React.useState(row?.reason ?? "");
  const [staff1, setStaff1] = React.useState<Staff | undefined>(row?.staff1 ?? me);
  const [staff2, setStaff2] = React.useState<Staff | undefined>(row?.staff2);
  const [msg, setMsg] = React.useState<string>();

  const save = () => {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) : undefined;
    const at = day && combine(day, time);
    if (!at) return setMsg("Enter the date and time.");
    if (at.getTime() > Date.now() + FUTURE_SLACK_MS) return setMsg("That time is in the future.");
    if (refused && !reason.trim()) return setMsg("Chart why the medication was refused.");
    if (!staff1) return setMsg("Pick your name for the first ID.");
    onSave({ at, count: toNum(count), isRefusal: refused, reason: reason.trim() || undefined, staff1, staff2 });
  };

  return (
    <>
      <tr className="mar-row-edit">
        <td><input className="mar-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></td>
        <td><input className="mar-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></td>
        <td><input className="mar-input" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} /></td>
        <td>
          <label className="mar-check">
            <input type="checkbox" checked={refused} onChange={(e) => setRefused(e.target.checked)} /> Refused
          </label>
          <input className="mar-input mar-input-wide" placeholder={refused ? "Why refused (required)" : "Reason / notes"} value={reason} onChange={(e) => setReason(e.target.value)} />
        </td>
        <td><StaffPicker api={api} value={staff1} onChange={setStaff1} placeholder="ID" /></td>
        <td><StaffPicker api={api} value={staff2} onChange={setStaff2} placeholder="2nd ID" /></td>
      </tr>
      <tr className="mar-row-actions">
        <td colSpan={6}>
          {msg && <span className="mar-msg">{msg}</span>}
          <button type="button" className="mar-btn" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className="mar-btn mar-btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </td>
      </tr>
    </>
  );
};
