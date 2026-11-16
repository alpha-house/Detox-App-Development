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
  contraindications?: string;
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
  amount?: number;
  notes?: string;
  medicationId?: string;
  medicationName?: string;
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
  start?: Date;
  stop?: Date;
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
  /** Taper sheets: boxes are headed DAY ONE, DAY TWO… (the calendar date is shown small). */
  dayLabels?: boolean;
  /** Taper sheets: each day has START / STOP times (cp_daystart / cp_daystop). */
  startStop?: boolean;
  /** Pre-printed instruction per day box (index 0 = DAY ONE); replaces the editable one. */
  fixedInstructions?: string[];
  /** Day boxes (0-based) that have no dose table on paper, e.g. "STOP TAPER". A table is
   *  still shown if doses were charted on that day, so nothing recorded is ever hidden. */
  noDoseDays?: number[];
  showHR: boolean;
  boxesPerPage: number;
  minRows: number;
  substanceHint: string;
  instructionsLabel: string;
  footer: string[];
  reconCountLabel: string;
}

/** PRN (OTC) layout: one block per medication (from cp_detoxmedication), each block a list of
 *  DATE rows with TIME/AMT/INITIAL entries and NOTES / WHY NEEDED. No reconciliation panel. */
export interface PrnLayout {
  kind: "prn";
  title: string;
  corner: string;
  substanceHint: string;
  instructionsLabel: string;
  footer: string[];
  /** TIME/AMT/INITIAL slots per date row on paper (more wrap onto the same row). */
  slotsPerRow: number;
  /** "medicationList": a block per cp_detoxmedication on the PRN list (PRN OTC).
   *  "sheet": one block for the sheet's own medication / dose / frequency / start-end (Home MAR). */
  source: "medicationList" | "sheet";
  /** NOTES / WHY NEEDED must be filled in (PRN). */
  requireWhy: boolean;
  /** Show the DOSE (mg) field in the editor (PRN); Home MAR charts AMT only. */
  showDoseField: boolean;
  /** Header shows the "contraindicated with PRN (OTC) medications" line. */
  contraLine: boolean;
}

export type SheetLayout = DailyBoxLayout | PrnLayout;

/** A row of cp_detoxmedication. */
export interface Medication {
  id: string;
  name: string;
  strength?: string;
  directions?: string;
  maxDaily?: number;
  maxUnit?: "mg" | "tabs";
  prn: boolean;
  order?: number;
}

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
  [SHEET.PO]: {
    kind: "prn",
    title: "PRN (OTC) MEDICATION ADMINISTRATION RECORD (MAR)",
    corner: "Alpha House Detox",
    substanceHint: "",
    instructionsLabel: "INSTRUCTIONS:",
    footer: ["Chart each dose given: TIME / AMOUNT / INITIAL, and why it was needed."],
    slotsPerRow: 5,
    source: "medicationList",
    requireWhy: true,
    showDoseField: true,
    contraLine: true,
  },
  [SHEET.HM]: {
    kind: "prn",
    title: "HOME MEDICATION ADMINISTRATION RECORD (MAR)",
    corner: "Alpha House Detox",
    substanceHint: "",
    instructionsLabel: "INSTRUCTIONS:",
    footer: ["Chart each dose given: TIME / AMOUNT / INITIAL. Use NOTES / WHY NEEDED for anything not given as prescribed."],
    slotsPerRow: 4,
    source: "sheet",
    requireWhy: false,
    showDoseField: false,
    contraLine: false,
  },
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
  [SHEET.BT]: {
    ...MAINTENANCE,
    title: "BENZODIAZEPINE TAPER",
    corner: "Taper Medication Sheet",
    boxesPerPage: 8,
    dayLabels: true,
    dayInstructions: true,
    startStop: true,
    substanceHint: "",
    reconCountLabel: "COUNT",
    instructionsLabel: "PRESCRIPTION INSTRUCTIONS:",
    footer: ["Legend: Use DAY/MONTH/TIME for Start and Stop Times", "TD = TOTAL DAILY DOSE", REFUSAL_RULE],
  },
  [SHEET.B5]: {
    ...MAINTENANCE,
    title: "BENZODIAZEPINE TAPER",
    corner: "pre-filled 5 Day Taper Medication Sheet",
    boxesPerPage: 8,
    dayLabels: true,
    startStop: true,
    showHR: false,
    fixedInstructions: [
      "TAKE 1 TABLET QID DAILY",
      "TAKE 1 TABLET QID DAILY",
      "TAKE 1 TABLET TID DAILY",
      "TAKE 1 TABLET BID DAILY",
      "TAKE 1 TABLET OD DAILY",
      "STOP TAPER — REASSESS IF NEEDED",
    ],
    noDoseDays: [5, 6, 7],
    substanceHint: "(Bev/non-bev/last use) (USE DAY/MONTH/TIME FOR START AND STOP TIMES)",
    instructionsLabel: "INSTRUCTIONS:",
    footer: [
      "LEGEND: TD = TOTAL DAILY DOSE · QID = 4 TIMES A DAY · TID = 3 TIMES A DAY · BID = 2 TIMES A DAY · OD = ONCE A DAY",
      REFUSAL_RULE,
    ],
  },
};
