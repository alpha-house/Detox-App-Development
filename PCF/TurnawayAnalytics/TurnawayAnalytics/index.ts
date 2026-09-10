import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { TurnawayApp, TurnawayAppProps } from "./components/TurnawayApp";
import { TurnawayRow } from "./components/types";
import * as React from "react";

const DATE_COL = "cp_assessmentdateandtime";
const GENDER_COL = "cp_gender";
const METHOD_COL = "cp_assessmentmethod";
const DUP_COL = "cp_isduplicate";
const PAGE_SIZE = 5000;

export class TurnawayAnalytics implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  private pageSizeSet = false;

  public init(
    context: ComponentFramework.Context<IInputs>,
    _notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary
  ): void {
    context.mode.trackContainerResize(true);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    const ds = context.parameters.turnaways;

    // Ask the platform for a big page once, so we don't round-trip 25 records at a time.
    const paging = ds.paging as unknown as {
      hasNextPage: boolean;
      loadNextPage: () => void;
      setPageSize?: (n: number) => void;
    };
    if (!this.pageSizeSet && typeof paging?.setPageSize === "function") {
      this.pageSizeSet = true;
      try {
        paging.setPageSize(PAGE_SIZE);
      } catch {
        /* older runtimes: ignore */
      }
    }

    const loading = !!ds.loading;
    if (!loading && paging?.hasNextPage) {
      paging.loadNextPage();
    }
    const stillPaging = !loading && !!paging?.hasNextPage;

    // Config check: the view must expose the columns we aggregate on.
    let setupMessage: string | undefined;
    const columns = ds.columns ?? [];
    if (!loading && columns.length > 0) {
      const names = new Set(columns.map((c) => c.name));
      const missing = [DATE_COL, GENDER_COL, METHOD_COL].filter((c) => !names.has(c));
      if (missing.length) {
        setupMessage =
          "Add these column(s) to the view so the component can read them: " +
          missing.join(", ") +
          ".";
      }
    }

    const rows: TurnawayRow[] = [];
    if (!setupMessage) {
      for (const id of ds.sortedRecordIds ?? []) {
        const rec = ds.records[id];
        if (!rec) continue;
        if (readBool(rec, DUP_COL)) continue; // exclude flagged duplicates
        rows.push({
          date: readDate(rec, DATE_COL),
          gender: readText(rec, GENDER_COL),
          method: readText(rec, METHOD_COL),
        });
      }
    }

    const allocatedH = context.mode.allocatedHeight;
    const props: TurnawayAppProps = {
      rows,
      loading: loading || !!stillPaging,
      setupMessage,
      height: allocatedH && allocatedH > 200 ? allocatedH : 480,
    };
    return React.createElement(TurnawayApp, props);
  }

  public getOutputs(): IOutputs {
    return {};
  }

  public destroy(): void {
    /* no-op */
  }
}

function readText(rec: ComponentFramework.PropertyHelper.DataSetApi.EntityRecord, col: string): string {
  try {
    const fv = rec.getFormattedValue(col);
    if (fv?.trim()) return fv.trim();
  } catch {
    /* column not on view */
  }
  return "(Not specified)";
}

function readDate(
  rec: ComponentFramework.PropertyHelper.DataSetApi.EntityRecord,
  col: string
): Date | null {
  try {
    const v = rec.getValue(col) as unknown;
    if (v == null) return null;
    const d = v instanceof Date ? v : new Date(v as string | number);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function readBool(
  rec: ComponentFramework.PropertyHelper.DataSetApi.EntityRecord,
  col: string
): boolean {
  try {
    const v = rec.getValue(col) as unknown;
    return v === true || v === 1 || v === "1" || v === "true";
  } catch {
    return false;
  }
}
