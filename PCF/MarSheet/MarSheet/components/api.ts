// Data access for the MAR Sheet control (Dataverse Web API via context.webAPI).
import { ClientInfo, DOSE_UNITS, DayRow, DoseRow, MAR_STATUS, ReconRow, SheetInfo, Staff } from "./types";

type Rec = Record<string, unknown>;

/** What an editor row hands to saveDose / saveRecon. */
export interface DoseInput {
  at: Date;
  dose?: number;
  count?: number;
  count2mg?: number;
  count8mg?: number;
  bp?: string;
  hr?: number;
  staff?: Staff;
  /** Titration sheets: the cp_marday record for the dose's date, if one exists. */
  dayId?: string;
}
export interface ReconInput {
  at: Date;
  count?: number;
  count2mg?: number;
  count8mg?: number;
  isRefusal: boolean;
  reason?: string;
  staff1?: Staff;
  staff2?: Staff;
}
type WebApi = ComponentFramework.WebApi;

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? (v === "" ? undefined : v) : typeof v === "number" || typeof v === "boolean" ? String(v) : undefined;
const num = (v: unknown): number | undefined => (v === null || v === undefined || v === "" ? undefined : Number(v));
const odataStr = (s: string) => s.replace(/'/g, "''");
export const cleanId = (id: string) => id.replace(/[{}]/g, "").toLowerCase();

function toStaff(r: unknown): Staff | undefined {
  if (!r || typeof r !== "object") return undefined;
  const o = r as Rec;
  const id = str(o.cp_staffid);
  if (!id) return undefined;
  const name = str(o.cp_name) ?? "";
  return { id, name, initials: str(o.cp_initials) ?? name };
}

export class MarApi {
  constructor(private readonly web: WebApi) {}

  async loadSheet(id: string): Promise<SheetInfo> {
    const r = (await this.web.retrieveRecord(
      "cp_marsheet",
      id,
      "?$select=cp_sheettype,cp_medication,cp_dose,cp_doseunit,cp_frequency,cp_startdate,cp_enddate,cp_substancehistory," +
        "cp_instructions,cp_marstatus,cp_refusalcount,_cp_admission_value" +
        "&$expand=cp_Admission($select=cp_detoxfile,cp_allergies,cr6ca_ahcnumber;" +
        "$expand=cp_Client($select=fullname,cp_dateofbirth,birthdate),cp_Bed($select=cp_name))"
    )) as Rec;
    const adm = (r.cp_Admission ?? {}) as Rec;
    const cl = (adm.cp_Client ?? {}) as Rec;
    const bed = (adm.cp_Bed ?? {}) as Rec;
    const client: ClientInfo = {
      name: str(cl.fullname) ?? "",
      dob: str(cl.cp_dateofbirth) ?? str(cl.birthdate),
      phn: str(adm.cr6ca_ahcnumber),
      fileNo: str(adm.cp_detoxfile),
      bed: str(bed.cp_name),
      allergies: str(adm.cp_allergies),
    };
    return {
      id,
      sheetType: Number(r.cp_sheettype),
      medication: str(r.cp_medication),
      dose: str(r.cp_dose),
      doseUnit: DOSE_UNITS[Number(r.cp_doseunit)],
      frequency: str(r.cp_frequency),
      startDate: str(r.cp_startdate)?.substring(0, 10),
      endDate: str(r.cp_enddate)?.substring(0, 10),
      substanceHistory: str(r.cp_substancehistory),
      instructions: str(r.cp_instructions),
      status: MAR_STATUS[Number(r.cp_marstatus)],
      refusalCount: num(r.cp_refusalcount) ?? 0,
      admissionId: str(r._cp_admission_value),
      client,
    };
  }

  async loadDoses(sheetId: string): Promise<DoseRow[]> {
    const res = await this.web.retrieveMultipleRecords(
      "cp_medicationadministration",
      "?$select=cp_administeredon,cp_dose,cp_count,cp_count2mg,cp_count8mg,cp_bp,cp_hr" +
        `&$filter=_cp_marsheet_value eq ${sheetId} and statecode eq 0` +
        "&$orderby=cp_administeredon asc&$expand=cp_Staff($select=cp_staffid,cp_name,cp_initials)",
      5000
    );
    return res.entities.map((e: Rec) => ({
      id: String(e.cp_medicationadministrationid),
      at: new Date(String(e.cp_administeredon)),
      dose: num(e.cp_dose),
      count: num(e.cp_count),
      count2mg: num(e.cp_count2mg),
      count8mg: num(e.cp_count8mg),
      bp: str(e.cp_bp),
      hr: num(e.cp_hr),
      staff: toStaff(e.cp_Staff),
    }));
  }

  async loadRecons(sheetId: string): Promise<ReconRow[]> {
    const res = await this.web.retrieveMultipleRecords(
      "cp_medicationreconciliation",
      "?$select=cp_reconciledon,cp_count,cp_count2mg,cp_count8mg,cp_isrefusal,cp_reason" +
        `&$filter=_cp_marsheet_value eq ${sheetId} and statecode eq 0&$orderby=cp_reconciledon asc` +
        "&$expand=cp_Staff1($select=cp_staffid,cp_name,cp_initials),cp_Staff2($select=cp_staffid,cp_name,cp_initials)",
      5000
    );
    return res.entities.map((e: Rec) => ({
      id: String(e.cp_medicationreconciliationid),
      at: new Date(String(e.cp_reconciledon)),
      count: num(e.cp_count),
      count2mg: num(e.cp_count2mg),
      count8mg: num(e.cp_count8mg),
      isRefusal: e.cp_isrefusal === true,
      reason: str(e.cp_reason),
      staff1: toStaff(e.cp_Staff1),
      staff2: toStaff(e.cp_Staff2),
    }));
  }

  /** Staff record whose email matches the signed-in user's primary email. */
  async currentStaff(userId: string): Promise<Staff | undefined> {
    const u = (await this.web.retrieveRecord("systemuser", cleanId(userId), "?$select=internalemailaddress")) as Rec;
    const email = str(u.internalemailaddress);
    if (!email) return undefined;
    const res = await this.web.retrieveMultipleRecords(
      "cp_staff",
      `?$select=cp_staffid,cp_name,cp_initials&$filter=cp_email eq '${odataStr(email)}' and statecode eq 0&$top=1`
    );
    return toStaff(res.entities[0]);
  }

  async searchStaff(text: string): Promise<Staff[]> {
    const t = odataStr(text.trim());
    if (!t) return [];
    const res = await this.web.retrieveMultipleRecords(
      "cp_staff",
      `?$select=cp_staffid,cp_name,cp_initials&$filter=statecode eq 0 and (contains(cp_name,'${t}') or contains(cp_initials,'${t}'))` +
        "&$orderby=cp_name asc&$top=10"
    );
    return res.entities.map((e: Rec) => toStaff(e)).filter((s): s is Staff => !!s);
  }

  async saveDose(
    sheet: SheetInfo,
    v: DoseInput & { id?: string }
  ): Promise<void> {
    const body: Rec = {
      cp_administeredon: v.at.toISOString(),
      cp_dose: v.dose ?? null,
      cp_count: v.count ?? null,
      cp_count2mg: v.count2mg ?? null,
      cp_count8mg: v.count8mg ?? null,
      cp_bp: v.bp ?? null,
      cp_hr: v.hr ?? null,
    };
    if (v.staff) body["cp_Staff@odata.bind"] = `/cp_staffs(${v.staff.id})`;
    if (v.dayId) body["cp_MARDay@odata.bind"] = `/cp_mardaies(${v.dayId})`;
    if (v.id) {
      await this.web.updateRecord("cp_medicationadministration", v.id, body);
      return;
    }
    body["cp_MARSheet@odata.bind"] = `/cp_marsheets(${sheet.id})`;
    body.cp_sheettype = sheet.sheetType;
    if (sheet.admissionId) body["cp_Admission@odata.bind"] = `/cp_cp_admissions(${sheet.admissionId})`;
    await this.web.createRecord("cp_medicationadministration", body);
  }

  async saveRecon(
    sheet: SheetInfo,
    v: ReconInput & { id?: string }
  ): Promise<void> {
    const body: Rec = {
      cp_reconciledon: v.at.toISOString(),
      cp_count: v.count ?? null,
      cp_count2mg: v.count2mg ?? null,
      cp_count8mg: v.count8mg ?? null,
      cp_isrefusal: v.isRefusal,
      cp_reason: v.reason ?? null,
    };
    if (v.staff1) body["cp_Staff1@odata.bind"] = `/cp_staffs(${v.staff1.id})`;
    if (v.staff2) body["cp_Staff2@odata.bind"] = `/cp_staffs(${v.staff2.id})`;
    if (v.id) {
      await this.web.updateRecord("cp_medicationreconciliation", v.id, body);
      return;
    }
    body["cp_MARSheet@odata.bind"] = `/cp_marsheets(${sheet.id})`;
    body.cp_sheettype = sheet.sheetType;
    if (sheet.admissionId) body["cp_Admission@odata.bind"] = `/cp_cp_admissions(${sheet.admissionId})`;
    await this.web.createRecord("cp_medicationreconciliation", body);
  }

  async loadDays(sheetId: string): Promise<DayRow[]> {
    const res = await this.web.retrieveMultipleRecords(
      "cp_marday",
      `?$select=cp_daydate,cp_daynumber,cp_dayinstruction,cp_daystart,cp_daystop&$filter=_cp_marsheet_value eq ${sheetId} and statecode eq 0&$orderby=cp_daydate asc`,
      500
    );
    return res.entities
      .map((e: Rec) => ({
        id: String(e.cp_mardayid),
        date: (str(e.cp_daydate) ?? "").substring(0, 10),
        dayNumber: num(e.cp_daynumber),
        instruction: str(e.cp_dayinstruction),
        start: str(e.cp_daystart) ? new Date(String(e.cp_daystart)) : undefined,
        stop: str(e.cp_daystop) ? new Date(String(e.cp_daystop)) : undefined,
      }))
      .filter((d) => d.date);
  }

  /** Create or update a day box's record (one cp_marday per sheet + date). Only the
   *  fields passed are written, so saving START/STOP never clears the instruction. */
  async saveDay(
    sheet: SheetInfo,
    v: { id?: string; date: string; dayNumber: number; instruction?: string | null; start?: Date | null; stop?: Date | null }
  ): Promise<string> {
    const body: Rec = { cp_daynumber: v.dayNumber };
    if (v.instruction !== undefined) body.cp_dayinstruction = v.instruction;
    if (v.start !== undefined) body.cp_daystart = v.start ? v.start.toISOString() : null;
    if (v.stop !== undefined) body.cp_daystop = v.stop ? v.stop.toISOString() : null;
    if (v.id) {
      await this.web.updateRecord("cp_marday", v.id, body);
      return v.id;
    }
    body.cp_daydate = v.date;
    body.cp_sheettype = sheet.sheetType;
    body["cp_MARSheet@odata.bind"] = `/cp_marsheets(${sheet.id})`;
    const r = await this.web.createRecord("cp_marday", body);
    return r.id;
  }

  async setRefusalCount(sheetId: string, n: number): Promise<void> {
    await this.web.updateRecord("cp_marsheet", sheetId, { cp_refusalcount: n });
  }
}

export function errorText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
