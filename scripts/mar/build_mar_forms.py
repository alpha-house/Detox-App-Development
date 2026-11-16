"""
build_mar_forms.py — Step 2 of the Medication Administration Records (MAR) build.

Run after build_mar_schema.py. Re-runnable: forms and views are rewritten with
stable GUIDs, mappings and the admission tab are skipped if already present.

  1. Views       Active / Associated views for the 4 MAR tables (+ MAR Sheet lookup view)
  2. Mappings    MAR Sheet -> Day / Administration / Reconciliation copy Sheet Type
                 (and Admission) onto new child records created from the sheet
  3. Forms       Admission quick view "MAR Client Header" (Name, File #, Bed, PHN,
                 Allergies, Diabetes) and main forms for the 4 MAR tables
  4. Admission   "Medications" tab after "Withdrawal" with MAR Sheets and
                 Medication Administration subgrids
  5. Publish

Usage:  py -3 -u scripts/mar/build_mar_forms.py
"""
import os
import sys
import uuid
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_mar_schema import call  # noqa: E402  (Azure CLI auth, retries, solution header)

NS = uuid.UUID("6f1c2b7e-3a51-4c2e-9d0e-6a1b8f4c2d11")
ADMISSION_FORM_ID = "3c4fe04d-3904-f011-bae3-6045bd5e4e91"   # "Detox Admission" main form
MARK = "tab_medications_mar"


def g(key):
    """Stable GUID so re-runs produce identical form XML."""
    return "{" + str(uuid.uuid5(NS, key)).upper() + "}"


# ------------------------------------------------------------------ metadata
CLASSID = {
    "String": "{4273EDBD-AC1D-40d3-9FB2-095C621B552D}",
    "Memo": "{E0DECE4B-6FC8-4a8f-A065-082708572369}",
    "Picklist": "{3EF39988-22BB-4f0b-BBBE-64B5A3748AEE}",
    "Lookup": "{270BD3DB-D9AF-4782-9025-509E298DEC0A}",
    "Owner": "{270BD3DB-D9AF-4782-9025-509E298DEC0A}",
    "DateTime": "{5B773807-9FB2-42db-97C3-7A91EFF8ADFF}",
    "Integer": "{C6D124CA-7EDA-4a60-AEA9-7FB8D318B68F}",
    "Decimal": "{C3EFE0C3-0EC6-42be-8349-CBD9079C5A6F}",
    "Boolean": "{67FAC785-CD58-4f9f-ABB3-4B7DDC6ED5ED}",
}
SUBGRID = "{E7A81278-8635-4D9E-8D4D-59480B391C5B}"
QUICKVIEW = "{5C5600E0-1D6E-4205-A272-BE80DA87FD42}"

_attr_cache = {}


def attrs(table):
    if table not in _attr_cache:
        r = call("GET", f"EntityDefinitions(LogicalName='{table}')/Attributes"
                        "?$select=LogicalName,AttributeType,DisplayName")
        _attr_cache[table] = {
            a["LogicalName"]: (a["AttributeType"],
                               ((a.get("DisplayName") or {}).get("UserLocalizedLabel") or {}).get("Label", ""))
            for a in r["value"]}
    return _attr_cache[table]


def otc(table):
    return call("GET", f"EntityDefinitions(LogicalName='{table}')?$select=ObjectTypeCode")["ObjectTypeCode"]


def views(table):
    r = call("GET", f"savedqueries?$select=savedqueryid,name,querytype,isdefault"
                    f"&$filter=returnedtypecode eq '{table}'")
    return r["value"]


# ------------------------------------------------------------------ form XML builders
def lbl(text):
    return f'<labels><label description="{escape(text)}" languagecode="1033" /></labels>'


def field_cell(table, field, key, colspan=1, label=None):
    atype, disp = attrs(table)[field]
    return (f'<cell id="{g(key + field)}" showlabel="true" colspan="{colspan}">{lbl(label or disp)}'
            f'<control id="{field}" classid="{CLASSID[atype]}" datafieldname="{field}" disabled="false" /></cell>')


def empty_cell(key):
    return f'<cell id="{g(key)}" showlabel="false">{lbl("")}</cell>'


def section(key, title, rows, table, two_col=True, showlabel=True):
    """rows: list of tuples of field names (None = empty cell); a 1-tuple spans the section."""
    out = []
    for i, r in enumerate(rows):
        if two_col and len(r) == 1:
            out.append("<row>" + field_cell(table, r[0], key, colspan=2) + "</row>")
        else:
            out.append("<row>" + "".join(
                field_cell(table, f, key) if f else empty_cell(f"{key}-empty-{i}-{j}")
                for j, f in enumerate(r)) + "</row>")
    return (f'<section name="{key}" id="{g(key)}" showlabel="{str(showlabel).lower()}" showbar="false" '
            f'IsUserDefined="0" columns="{"11" if two_col else "1"}" labelwidth="130">'
            f'{lbl(title)}<rows>{"".join(out)}</rows></section>')


def subgrid_section(key, title, relationship, target, view_id, per_page=10, height=8):
    # the section already shows the title, so the grid cell's own label is hidden
    rows = (f'<row><cell id="{g(key + "cell")}" showlabel="false" rowspan="{height}" colspan="1" auto="false">'
            f'{lbl(title)}<control indicationOfSubgrid="true" id="{key}" classid="{SUBGRID}"><parameters>'
            f'<RecordsPerPage>{per_page}</RecordsPerPage><AutoExpand>Fixed</AutoExpand>'
            f'<EnableQuickFind>false</EnableQuickFind><EnableViewPicker>false</EnableViewPicker>'
            f'<EnableChartPicker>false</EnableChartPicker><ChartGridMode>Grid</ChartGridMode>'
            f'<RelationshipName>{relationship}</RelationshipName><TargetEntityType>{target}</TargetEntityType>'
            f'<ViewId>{{{view_id}}}</ViewId><ViewIds>{{{view_id}}}</ViewIds></parameters></control></cell></row>'
            + "<row />" * (height - 1))
    return (f'<section name="{key}_section" id="{g(key + "section")}" showlabel="true" showbar="false" '
            f'IsUserDefined="0" columns="1">{lbl(title)}<rows>{rows}</rows></section>')


def quickview_section(key, title, lookup_field, quick_form_id):
    qf = escape(f'<QuickFormIds><QuickFormId entityname="cp_cp_admission">{quick_form_id}</QuickFormId></QuickFormIds>')
    return (f'<section name="{key}" id="{g(key)}" showlabel="true" showbar="false" IsUserDefined="0" columns="1">'
            f'{lbl(title)}<rows><row><cell id="{g(key + "cell")}" showlabel="false">{lbl(title)}'
            f'<control id="{key}_qv" classid="{QUICKVIEW}" datafieldname="{lookup_field}" '
            f'uniqueid="{g(key + "qv")}"><parameters><QuickForms>{qf}</QuickForms>'
            f'<ControlMode>Edit</ControlMode></parameters></control></cell></row></rows></section>')


def tab(key, title, sections):
    return (f'<tab name="{key}" id="{g(key)}" IsUserDefined="0" showlabel="true" verticallayout="true">'
            f'{lbl(title)}<columns><column width="100%"><sections>{"".join(sections)}</sections>'
            f'</column></columns></tab>')


def form(tabs, control_descriptions=""):
    return f'<form><tabs>{"".join(tabs)}</tabs>{control_descriptions}</form>'


PCF_NAME = "cp_AlphaHouse.MarSheet"


def pcf_section(key, title):
    """A full-width cell holding cp_name, rendered by the MAR Sheet PCF (see pcf_binding)."""
    return (f'<section name="{key}" id="{g(key)}" showlabel="false" showbar="false" IsUserDefined="0" columns="1">'
            f'{lbl(title)}<rows><row><cell id="{g(key + "cell")}" showlabel="false">{lbl(title)}'
            f'<control id="mar_paper_sheet" classid="{CLASSID["String"]}" datafieldname="cp_name" '
            f'disabled="false" uniqueid="{g(key + "ctl")}" /></cell></row></rows></section>')


def pcf_binding(key):
    uid = g(key + "ctl")
    per_factor = "".join(
        f'<customControl name="{PCF_NAME}" formFactor="{ff}"><parameters>'
        f'<anchor type="SingleLine.Text">cp_name</anchor></parameters></customControl>' for ff in (0, 1, 2))
    return (f'<controlDescriptions><controlDescription forControl="{uid}">'
            f'<customControl id="{CLASSID["String"]}"><parameters><datafieldname>cp_name</datafieldname>'
            f'</parameters></customControl>{per_factor}</controlDescription></controlDescriptions>')


# ------------------------------------------------------------------ 1. views
VIEW_COLUMNS = {
    "cp_marsheet": ([("cp_name", 110), ("cp_sheettype", 220), ("cp_medication", 200), ("cp_dose", 120),
                     ("cp_startdate", 110), ("cp_enddate", 110), ("cp_marstatus", 140), ("cp_refusalcount", 90)],
                    "cp_startdate", True),
    "cp_marday": ([("cp_name", 110), ("cp_daynumber", 80), ("cp_daydate", 110), ("cp_dayinstruction", 250),
                   ("cp_daystart", 140), ("cp_daystop", 140)], "cp_daynumber", False),
    "cp_medicationadministration": ([("cp_name", 110), ("cp_administeredon", 150), ("cp_sheettype", 200),
                                     ("cp_dose", 80), ("cp_amount", 80), ("cp_count", 70), ("cp_count2mg", 80),
                                     ("cp_count8mg", 80), ("cp_bp", 80), ("cp_hr", 60), ("cp_staff", 120),
                                     ("cp_notes", 200)], "cp_administeredon", True),
    "cp_medicationreconciliation": ([("cp_name", 110), ("cp_reconciledon", 150), ("cp_count", 70),
                                     ("cp_count2mg", 80), ("cp_count8mg", 80), ("cp_isrefusal", 80),
                                     ("cp_reason", 220), ("cp_staff1", 120), ("cp_staff2", 120)],
                                    "cp_reconciledon", True),
}


def build_view(table, cols, order, desc, code):
    pk = table + "id"
    fetch = (f'<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">'
             f'<entity name="{table}">' + "".join(f'<attribute name="{c}" />' for c, _ in cols)
             + f'<attribute name="{pk}" /><order attribute="{order}" descending="{str(desc).lower()}" />'
             f'<filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter>'
             f'</entity></fetch>')
    layout = (f'<grid name="resultset" object="{code}" jump="cp_name" select="1" icon="1" preview="1">'
              f'<row name="result" id="{pk}">' + "".join(f'<cell name="{c}" width="{w}" />' for c, w in cols)
              + '</row></grid>')
    return fetch, layout


def step_views():
    print("== Views")
    ids = {}
    for table, (cols, order, desc) in VIEW_COLUMNS.items():
        code = otc(table)
        fetch, layout = build_view(table, cols, order, desc, code)
        for v in views(table):
            if v["querytype"] in (0, 2) and (v["querytype"] == 2 or v["isdefault"]):
                call("PATCH", f"savedqueries({v['savedqueryid']})", {"fetchxml": fetch, "layoutxml": layout})
                print(f"   {table}: {v['name']} updated")
                if v["querytype"] == 2:
                    ids[table] = v["savedqueryid"]
            if table == "cp_marsheet" and v["querytype"] == 64:
                lcols = [("cp_name", 110), ("cp_sheettype", 220), ("cp_medication", 200), ("cp_startdate", 110)]
                f2, l2 = build_view(table, lcols, "cp_startdate", True, code)
                call("PATCH", f"savedqueries({v['savedqueryid']})", {"fetchxml": f2, "layoutxml": l2})
                print(f"   {table}: {v['name']} updated")
    return ids


# ------------------------------------------------------------------ 2. mappings
MAPPINGS = [
    ("cp_marsheet", "cp_medicationadministration", ["cp_sheettype", "cp_admission"]),
    ("cp_marsheet", "cp_medicationreconciliation", ["cp_sheettype", "cp_admission"]),
    ("cp_marsheet", "cp_marday", ["cp_sheettype"]),
]


def step_mappings():
    print("== Field mappings (parent MAR Sheet -> new child record)")
    for src, tgt, fields in MAPPINGS:
        em = call("GET", f"entitymaps?$select=entitymapid&$filter=sourceentityname eq '{src}' "
                         f"and targetentityname eq '{tgt}'")["value"]
        if not em:
            print(f"   {src}->{tgt}: no entity map found (relationship missing?)")
            continue
        emid = em[0]["entitymapid"]
        have = {a["sourceattributename"] for a in call(
            "GET", f"attributemaps?$select=sourceattributename&$filter=_entitymapid_value eq {emid}")["value"]}
        for f in fields:
            if f in have:
                print(f"   {src}.{f} -> {tgt}.{f}: exists")
                continue
            call("POST", "attributemaps", {"entitymapid@odata.bind": f"/entitymaps({emid})",
                                           "sourceattributename": f, "targetattributename": f})
            print(f"   {src}.{f} -> {tgt}.{f}: created")


# ------------------------------------------------------------------ 3. forms
def upsert_form(table, ftype, name, xml, existing_name="Information", description=""):
    forms = call("GET", f"systemforms?$select=formid,name&$filter=objecttypecode eq '{table}' and type eq {ftype}")["value"]
    match = next((f for f in forms if f["name"] == name), None) or \
        next((f for f in forms if f["name"] == existing_name and ftype == 2), None)
    body = {"name": name, "formxml": xml, "description": description}
    if match:
        call("PATCH", f"systemforms({match['formid']})", body)
        print(f"   {table}: form '{name}' updated")
        return match["formid"]
    body.update({"objecttypecode": table, "type": ftype})
    r = call("POST", "systemforms?$select=formid", body) or {}
    fid = r.get("formid") or call("GET", f"systemforms?$select=formid&$filter=objecttypecode eq '{table}' "
                                         f"and type eq {ftype} and name eq '{name}'")["value"][0]["formid"]
    print(f"   {table}: form '{name}' created")
    return fid


def step_forms(assoc):
    print("== Forms")
    A = "cp_cp_admission"
    qv_xml = form([tab("marqv_tab", "MAR Client Header", [section(
        "marqv_sec", "Client", [("cp_client",), ("cp_detoxfile",), ("cp_bed",), ("cr6ca_ahcnumber",),
                                ("cp_allergies",), ("cp_diabetes",), ("cp_typeofdiabetes",)], A,
        two_col=False, showlabel=False)])])  # single-column only; the host section shows "Client"
    qv_id = upsert_form(A, 6, "MAR Client Header", qv_xml,
                        description="Client details shown at the top of MAR sheets.")

    t = "cp_marsheet"
    has_pcf = bool(call("GET", f"customcontrols?$select=name&$filter=name eq '{PCF_NAME}'")["value"])
    pcf_tabs = [tab("ms_tab_paper", "MAR", [pcf_section("ms_paper", "MAR")])] if has_pcf else []
    if not has_pcf:
        print(f"   {PCF_NAME} not deployed yet - MAR Sheet form built without the paper tab")
    upsert_form(t, 2, "MAR Sheet", form(pcf_tabs + [
        tab("ms_tab_sheet", "Sheet", [
            quickview_section("ms_client", "Client", "cp_admission", qv_id),
            section("ms_presc", "Prescription", [
                ("cp_sheettype", "cp_admission"), ("cp_medication", "cp_marstatus"),
                ("cp_dose", "cp_doseunit"), ("cp_frequency", None), ("cp_startdate", "cp_enddate"),
                ("cp_substancehistory", "cp_refusalcount"), ("cp_instructions",),
                ("cp_po_contraindications",), ("cp_name", "ownerid")], t)]),
        tab("ms_tab_entries", "Doses & Reconciliation", [
            subgrid_section("sg_mar_doses", "Doses", "cp_marsheet_cp_medicationadministration",
                            "cp_medicationadministration", assoc["cp_medicationadministration"], 15, 10),
            subgrid_section("sg_mar_recon", "Medication Reconciliation", "cp_marsheet_cp_medicationreconciliation",
                            "cp_medicationreconciliation", assoc["cp_medicationreconciliation"], 10, 8),
            subgrid_section("sg_mar_days", "Days (titration / taper sheets)", "cp_marsheet_cp_marday",
                            "cp_marday", assoc["cp_marday"], 8, 6)])],
        pcf_binding("ms_paper") if has_pcf else ""))

    t = "cp_medicationadministration"
    upsert_form(t, 2, "Medication Administration", form([tab("ma_tab", "Dose", [
        section("ma_main", "Dose", [
            ("cp_marsheet", "cp_sheettype"), ("cp_administeredon", "cp_staff"), ("cp_dose", "cp_amount"),
            ("cp_count", "cp_bp"), ("cp_count2mg", "cp_hr"), ("cp_count8mg", "cp_marday"), ("cp_notes",)], t),
        section("ma_insulin", "Insulin Injection Log only", [("cp_ii_bglevel", "cp_ii_injectionsite")], t),
        section("ma_prn", "PRN (OTC) only", [("cp_po_medication", None)], t),
        section("ma_admin", "Record", [("cp_admission", "cp_name"), ("ownerid", None)], t)])]))

    t = "cp_medicationreconciliation"
    upsert_form(t, 2, "Medication Reconciliation", form([tab("mr_tab", "Reconciliation", [
        section("mr_main", "Reconciliation", [
            ("cp_marsheet", "cp_sheettype"), ("cp_reconciledon", "cp_isrefusal"), ("cp_count", "cp_staff1"),
            ("cp_count2mg", "cp_staff2"), ("cp_count8mg", None), ("cp_reason",)], t),
        section("mr_admin", "Record", [("cp_admission", "cp_name"), ("ownerid", None)], t)])]))

    t = "cp_marday"
    upsert_form(t, 2, "MAR Day", form([tab("md_tab", "Day", [
        section("md_main", "Day", [
            ("cp_marsheet", "cp_sheettype"), ("cp_daynumber", "cp_daydate"), ("cp_daystart", "cp_daystop"),
            ("cp_dayinstruction",), ("cp_name", "ownerid")], t),
        subgrid_section("sg_day_doses", "Doses on this day", "cp_marday_cp_medicationadministration",
                        "cp_medicationadministration", assoc["cp_medicationadministration"], 10, 6)])]))


# ------------------------------------------------------------------ 4. admission tab
def step_admission_tab(assoc):
    print("== Admission form: Medications tab")
    xml = call("GET", f"systemforms({ADMISSION_FORM_ID})/Microsoft.Dynamics.CRM.RetrieveUnpublished()"
                      "?$select=formxml")["formxml"]
    new_tab = tab(MARK, "Medications", [
        subgrid_section("sg_adm_marsheets", "MAR Sheets", "cp_cp_admission_cp_marsheet",
                        "cp_marsheet", assoc["cp_marsheet"], 10, 8),
        subgrid_section("sg_adm_doses", "All Doses (every sheet)", "cp_cp_admission_cp_medicationadministration",
                        "cp_medicationadministration", assoc["cp_medicationadministration"], 10, 8)])
    if MARK in xml:
        # regenerate the existing tab in place so layout fixes reach the live form
        s = xml.find(f'<tab name="{MARK}"')
        e = xml.find("</tab>", s) + len("</tab>")
        if xml[s:e] == new_tab:
            print("   already up to date")
            return
        call("PATCH", f"systemforms({ADMISSION_FORM_ID})", {"formxml": xml[:s] + new_tab + xml[e:]})
        print("   regenerated")
        return
    i = xml.find('<label description="Withdrawal" languagecode="1033"')
    if i < 0:
        raise RuntimeError("Could not find the Withdrawal tab on the admission form")
    start = xml.rfind("<tab ", 0, i)
    end = xml.find("</tab>", i) + len("</tab>")
    if "<tab " in xml[start + 5:i]:
        raise RuntimeError("Withdrawal label is not a tab label")
    call("PATCH", f"systemforms({ADMISSION_FORM_ID})", {"formxml": xml[:end] + new_tab + xml[end:]})
    print("   inserted after Withdrawal")


def step_publish():
    print("== Publish")
    ents = "".join(f"<entity>{t}</entity>" for t in
                   ["cp_marsheet", "cp_marday", "cp_medicationadministration",
                    "cp_medicationreconciliation", "cp_cp_admission"])
    call("POST", "PublishXml", {"ParameterXml": f"<importexportxml><entities>{ents}</entities></importexportxml>"})
    print("   published")


if __name__ == "__main__":
    assoc = step_views()
    step_mappings()
    step_forms(assoc)
    step_admission_tab(assoc)
    step_publish()
    print("Done.")
