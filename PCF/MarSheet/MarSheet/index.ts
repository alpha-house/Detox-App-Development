import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { MarSheetApp, MarSheetAppProps } from "./components/MarSheetApp";
import { MarApi, cleanId } from "./components/api";
import * as React from "react";

/**
 * MAR Sheet — shows a cp_marsheet record as its paper Medication Administration Record.
 * Each dose / reconciliation line the nurse fills in is saved as its own
 * cp_medicationadministration / cp_medicationreconciliation record.
 *
 * Place it on the MAR Sheet main form, bound to cp_name (the binding is only an anchor;
 * the control reads the record id from the form context).
 */
export class MarSheet implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  private api!: MarApi;

  public init(context: ComponentFramework.Context<IInputs>): void {
    this.api = new MarApi(context.webAPI);
    context.mode.trackContainerResize(true);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    const info = (context.mode as unknown as { contextInfo?: { entityId?: string } }).contextInfo;
    const id = info?.entityId ? cleanId(info.entityId) : undefined;
    const props: MarSheetAppProps = {
      api: this.api,
      sheetId: id,
      userId: context.userSettings.userId,
      readOnly: context.mode.isControlDisabled,
      width: context.mode.allocatedWidth,
    };
    // key: remount when the form moves from "new" to a saved record
    return React.createElement(MarSheetApp, { ...props, key: id ?? "new" });
  }

  public getOutputs(): IOutputs {
    return {};
  }

  public destroy(): void {
    // nothing to clean up
  }
}
