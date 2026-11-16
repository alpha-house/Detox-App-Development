// Shared types and the per-sheet layout registry for the MAR Sheet control.

/** cp_marsheettype option values (Detox publisher prefix 12157). */
export const SHEET = {
  II: 121570000, // Insulin Injection Log
  PO: 121570001, // PRN (OTC) MAR
  HM: 121570002, // General (Home) MAR
  MK: 121570003, // Methadone/Kadian Maintenance
  MT: 121570004, // Methadone/Kadian Titration
  SM: 121570005, // Suboxone Maintenance
  ST: 121570006, // Suboxone Titration
  HC: 121570007, // High-Risk Controlled Medication
  BT: 121570008, // Benzodiazepine Taper (8-Day)
  B5: 121570009, // Benzodiazepine Taper (Pre-filled 5-Day)
  BM: 121570010, // Benzodiazepine Maintenance
} as const;

export const SHEET_LABELS: Record<number, string> = {
  [SHEET.II]: "Insulin Injection Log",
  [SHEET.PO]: "PRN (OTC) MAR",
  [SHEET.HM]: "General (Home) MAR",
  [SHEET.MK]: "Methadone/Kadian Maintenance",
  [SHEET.MT]: "Methadone/Kadian Titration",
  [SHEET.SM]: "Suboxone Maintenance",
  [SHEET.ST]: "Suboxone Titration",
  [SHEET.HC]: "High-Risk Controlled Medication",
  [SHEET.BT]: "Benzodiazepine Taper (8-Day)",
  [SHEET.B5]: "Benzodiazepine Taper (Pre-filled 5-Day)",
  [SHEET.BM]: "Benzodiazepine Maintenance",
};

export const DOSE_UNITS: Record<number, string> = {
  121570000: "mg",
  121570001: "units",
  121570002: "tabs",
  121570003: "mL",
};

export const MAR_STATUS: Record<number, string> = {
  121570000: "Active",
  121570001: "Completed",
  121570002: "Discontinued",
  121570003: "Stopped - 3 Refusals",
};

export interface Staff {
  id: string;
  name: string;
  initials: string;
}

export interface ClientInfo {
  name: string;
  dob?: string;
  phn?: string;
  fileNo?: string;
  bed?: string;
  allergies?: string;
}

export interface SheetInfo {
  id: string;
  sheetType: number;
  medication?: string;
  dose?: string;
  doseUnit?: string;
  frequency?: string;
  startDate?: string; // yyyy-mm-dd
  endDate?: string; // yyyy-mm-dd
  substanceHistory?: string;
  instructions?: string;
  status?: string;
  refusalCount: number;
  admissionId?: string;
  client: ClientInfo;
}

export interface DoseRow {
  id: string;
  at: Date;
  dose?: number;
  count?: number;
  count2mg?: number;
  count8mg?: number;
  bp?: string;
  hr?: number;
  staff?: Staff;
}

export interface ReconRow {
  id: string;
  at: Date;
  count?: number;
  count2mg?: number;
  count8mg?: number;
  isRefusal: boolean;
  reason?: string;
  staff1?: Staff;
  staff2?: Staff;
}

/** A titration/taper day box's own record (cp_marday): the per-day instruction. */
export interface DayRow {
  id: string;
  date: string; // yyyy-mm-dd (DateOnly)
  dayNumber?: number;
  instruction?: string;
}

/** Layout for the "daily box" sheets: DATE boxes of TIME/DOSE/COUNT/ID/BP-HR + TD,
 *  with the Medication Reconciliation panel on the right. */
export interface DailyBoxLayout {
  kind: "dailyBox";
  title: string;
  corner: string;
  countLabel: string;
  /** Suboxone: the count column is split into 2 mg and 8 mg (cp_count2mg / cp_count8mg). */
  splitCounts?: boolean;
  /** Titration sheets: each DATE box carries an INSTRUCTION, stored as a cp_marday record. */
  dayInstructions?: boolean;
  showHR: boolean;
  boxesPerPage: number;
  minRows: number;
  substanceHint: string;
  instructionsLabel: string;
  footer: string[];
  reconCountLabel: string;
}

export type SheetLayout = DailyBoxLayout;

const REFUSAL_RULE =
  "CHART IF REFUSE MEDICATION AND WHY. AFTER 3 REFUSALS CLIENT MEDICATION TO BE STOPPED AND SEE A CLINICIAN IF REQUESTING RE-START";

/** The 12-date-box maintenance layout shared by Methadone/Kadian, High-Risk Controlled
 *  and Benzodiazepine Maintenance; each sheet only overrides its own wording. */
const MAINTENANCE: DailyBoxLayout = {
  kind: "dailyBox",
  title: "",
  corner: "Medication Sheet",
  countLabel: "COUNT",
  showHR: true,
  boxesPerPage: 12,
  minRows: 3,
  substanceHint: "(TYPE OF OPIATE / LAST USE)",
  instructionsLabel: "INSTRUCTIONS:",
  footer: ["TD = TOTAL DAILY DOSE", REFUSAL_RULE],
  reconCountLabel: "#",
};

/** Sheets with a built paper layout. Other sheet types fall back to the standard tabs. */
export const LAYOUTS: Record<number, SheetLayout> = {
  [SHEET.MK]: {
    ...MAINTENANCE,
    title: "METHADONE/KADIAN MAINTENANCE MEDICATION",
    instructionsLabel: "INSTRUCTIONS: Please include script end and start dates",
  },
  [SHEET.HC]: {
    ...MAINTENANCE,
    title: "HIGH-RISK CONTROLLED MEDICATION – OPIATES/STIMULANTS/NABILONE/T3'S",
    substanceHint: "",
  },
  [SHEET.BM]: {
    ...MAINTENANCE,
    title: "BENZODIAZEPINE MAINTENANCE MEDICATION",
  },
  [SHEET.SM]: {
    ...MAINTENANCE,
    title: "SUBOXONE MAINTENANCE MEDICATION",
    countLabel: "AMT",
    splitCounts: true,
    instructionsLabel: "INSTRUCTIONS: Please include prescription start and end dates",
    footer: ["TD = TOTAL DAILY DOSE   AMT = AMOUNT REMAINING", REFUSAL_RULE],
  },
  [SHEET.MT]: {
    ...MAINTENANCE,
    title: "METHADONE/KADIAN TITRATION",
    corner: "Taper Medication Sheet",
    boxesPerPage: 8,
    dayInstructions: true,
    instructionsLabel: "ADDED INSTRUCTIONS/NOTES: Please include start and end dates",
    footer: ["TD = TOTAL DAILY COUNT", REFUSAL_RULE],
  },
  [SHEET.ST]: {
    ...MAINTENANCE,
    title: "SUBOXONE TITRATION",
    corner: "Taper Medication Sheet",
    boxesPerPage: 8,
    dayInstructions: true,
    splitCounts: true,
    instructionsLabel: "ADDED INSTRUCTIONS/NOTES:",
    footer: ["TD = TOTAL DAILY COUNT", REFUSAL_RULE],
  },
};
