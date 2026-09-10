export interface TurnawayRow {
  date: Date | null;
  gender: string;
  method: string;
}

export type Breakdown = "gender" | "method" | "both";

export interface ChartBar {
  key: string; // series key, used for colour + legend
  value: number;
}

export interface ChartGroup {
  label: string; // x-axis label
  bars: ChartBar[];
}

/** Alpha House brand palette (Brand Guidelines pp. 5-6) plus fallbacks. */
export const PALETTE = [
  "#587b70", // deep teal (secondary)
  "#bb4b26", // rust (secondary)
  "#a0a972", // sage (primary)
  "#f7d06e", // yellow (secondary)
  "#829086", // grey-green (primary)
  "#c6b39f", // tan (primary)
  "#3b6ea5",
  "#8c5e3c",
  "#6b8f3c",
  "#7d5a8c",
  "#4b8f8c",
  "#b58900",
];

export const NOT_SPECIFIED = "(Not specified)";
export const NEUTRAL = "#9aa0a6";
