import * as React from "react";
import { MarApi, errorText } from "./api";
import { DailyBoxSheet } from "./DailyBoxSheet";
import { PrnSheet } from "./PrnSheet";
import { fmtDateOnly, parseDateOnly } from "./dates";
import { DayRow, DoseRow, LAYOUTS, Medication, ReconRow, SHEET_LABELS, SheetInfo, Staff } from "./types";

export interface MarSheetAppProps {
  api: MarApi;
  sheetId?: string;
  userId: string;
  readOnly: boolean;
  width: number;
  /** Opens a new Detox Medication record (PRN sheet "+ Add a medication to the list"). */
  onAddMedication?: () => void;
}

interface Data {
  sheet: SheetInfo;
  doses: DoseRow[];
  recons: ReconRow[];
  days: DayRow[];
  meds: Medication[];
}

export const MarSheetApp: React.FC<MarSheetAppProps> = ({ api, sheetId, userId, readOnly, width, onAddMedication }) => {
  const [data, setData] = React.useState<Data>();
  const [me, setMe] = React.useState<Staff>();
  const [meChecked, setMeChecked] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!sheetId) return;
    setLoading(true);
    try {
      const [sheet, doses, recons, days, meds] = await Promise.all([
        api.loadSheet(sheetId),
        api.loadDoses(sheetId),
        api.loadRecons(sheetId),
        api.loadDays(sheetId),
        api.loadMedications(),
      ]);
      setData({ sheet, doses, recons, days, meds });
      setError(undefined);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [api, sheetId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const findMe = async () => {
      try {
        setMe(await api.currentStaff(userId));
      } catch {
        setMe(undefined);
      } finally {
        setMeChecked(true);
      }
    };
    void findMe();
  }, [api, userId]);

  if (!sheetId) {
    return (
      <div className="mar-root">
        <div className="mar-banner">
          Choose the <b>Sheet Type</b>, fill in the prescription on the <b>Sheet</b> tab, then <b>Save</b>. The paper
          sheet appears here once the MAR Sheet is saved.
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="mar-root">{error ? <div className="mar-banner mar-banner-error">{error}</div> : <div className="mar-loading">Loading sheet…</div>}</div>;
  }

  const { sheet } = data;
  const layout = LAYOUTS[sheet.sheetType];
  const isPrn = layout?.kind === "prn";
  const start = parseDateOnly(sheet.startDate);
  const monthYear = start ? start.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "";
  const c = sheet.client;
  const title = layout?.title ?? (SHEET_LABELS[sheet.sheetType] ?? "MAR").toUpperCase();

  return (
    <div className="mar-root">
      <div className="mar-toolbar">
        <span className="mar-me">
          {meChecked && (me ? <>Charting as <b>{me.initials}</b> ({me.name})</> : <span className="mar-warn">No Staff record matches your email — pick your name in the ID box when you chart.</span>)}
        </span>
        <button type="button" className="mar-btn" disabled={loading} onClick={() => void load()}>
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {sheet.refusalCount >= 3 ? (
        <div className="mar-banner mar-banner-error">
          <b>{sheet.refusalCount} refusals charted.</b> After 3 refusals client medication is to be stopped — client to see a clinician if requesting re-start.
        </div>
      ) : sheet.refusalCount > 0 ? (
        <div className="mar-banner mar-banner-warn">{sheet.refusalCount} refusal{sheet.refusalCount > 1 ? "s" : ""} charted on this sheet.</div>
      ) : null}
      {sheet.status && sheet.status !== "Active" && (
        <div className="mar-banner mar-banner-warn">This sheet is <b>{sheet.status}</b> — new doses cannot be recorded.</div>
      )}
      {error && <div className="mar-banner mar-banner-error">{error}</div>}

      <div className="mar-paper">
        <div className="mar-titlebar">
          <span className="mar-title">{title}</span>
          <span className="mar-corner">{layout?.corner ?? "Medication Sheet"}</span>
        </div>
        <div className="mar-header">
          <div className="mar-label">
            <div className="mar-cap">Client Label</div>
            <div className="mar-client-name">{c.name}</div>
            <div>DOB: {fmtDateOnly(c.dob)}</div>
            <div>PHN: {c.phn ?? ""}</div>
            <div>File #: {c.fileNo ?? ""}</div>
          </div>
          <div className="mar-bed">
            Bed # <b>{c.bed ?? "____"}</b>
          </div>
          <div className="mar-presc">
            {isPrn ? (
              <div>Month/Year: <b>{monthYear}</b></div>
            ) : (
              <>
                <div>Medication <b>{sheet.medication ?? ""}</b></div>
                <div>Dose: <b>{sheet.dose ?? ""}{sheet.doseUnit && sheet.dose && !/[a-z]/i.test(sheet.dose) ? ` ${sheet.doseUnit}` : ""}</b></div>
                {sheet.frequency && <div>Frequency: <b>{sheet.frequency}</b></div>}
                <div>DATE: <b>{fmtDateOnly(sheet.startDate)}{sheet.endDate ? ` – ${fmtDateOnly(sheet.endDate)}` : ""}</b></div>
              </>
            )}
            <div>Allergies: <b className={c.allergies ? "mar-allergy" : ""}>{c.allergies ?? ""}</b></div>
          </div>
        </div>
        {layout?.kind === "prn" ? (
          layout.contraLine ? (
            <div className="mar-substance">
              Medical conditions that are contraindicated with PRN (OTC) Medications: <b>{sheet.contraindications ?? ""}</b>
            </div>
          ) : (
            <div className="mar-substance-gap" />
          )
        ) : (
          <div className="mar-substance">
            Substance History: <b>{sheet.substanceHistory ?? ""}</b> <span className="mar-hint">{layout?.substanceHint ?? "(TYPE OF OPIATE / LAST USE)"}</span>
          </div>
        )}

        {layout?.kind === "prn" ? (
          <PrnSheet api={api} sheet={sheet} layout={layout} doses={data.doses} meds={data.meds} me={me}
            readOnly={readOnly} reload={load} onAddMedication={onAddMedication} />
        ) : layout ? (
          <DailyBoxSheet api={api} sheet={sheet} layout={layout} doses={data.doses} recons={data.recons} days={data.days} me={me}
            readOnly={readOnly} stacked={width > 0 && width < 1100} reload={load} />
        ) : (
          <div className="mar-banner">
            The paper layout for <b>{SHEET_LABELS[sheet.sheetType] ?? "this sheet type"}</b> is not built yet. Use the{" "}
            <b>Doses &amp; Reconciliation</b> tab for now.
          </div>
        )}

        {layout && (
          <div className="mar-footer">
            {layout.instructionsLabel && <div><b>{layout.instructionsLabel}</b></div>}
            {/* the insulin log shows the prescription instructions inside its block instead */}
            {sheet.instructions && !(layout.kind === "prn" && layout.blockStyle === "insulin") && (
              <div className="mar-instructions">{sheet.instructions}</div>
            )}
            {layout.footer.map((f) => (
              <div key={f} className="mar-small">{f}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
