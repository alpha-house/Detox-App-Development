"""
build_mar_schema.py — Step 1 of the Medication Administration Records (MAR) build.

Creates, in the Detox solution (publisher prefix cp):
  * Global choice   cp_marsheettype  (the 11 paper MAR sheets)
  * Tables          cp_marsheet, cp_marday, cp_medicationadministration,
                    cp_medicationreconciliation  (user-owned, audited)
  * Columns         per the agreed hybrid design (shared columns + sheet-specific
                    cp_ii_*/cp_po_* columns)
  * Relationships   Admission 1:N MAR Sheet 1:N {Day, Administration, Reconciliation}
                    plus shortcut lookups to Admission and cp_staff lookups

Idempotent: every table, column and relationship is checked before it is created,
so the script can be re-run to fill in anything a previous run missed.

Auth: uses the Azure CLI token of the signed-in user
      (az login --tenant <tenant> --allow-no-subscriptions).
Target: MAR_DATAVERSE_URL env var, default https://ahc-sandbox.crm3.dynamics.com

Usage:  py -3 scripts/mar/build_mar_schema.py
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ORG = os.environ.get("MAR_DATAVERSE_URL", "https://ahc-sandbox.crm3.dynamics.com").rstrip("/")
API = ORG + "/api/data/v9.2/"
SOLUTION = "Detox"
LCID = 1033
OPT = 121570000  # Detox publisher option value prefix 12157 -> 121,570,000

_token = None


def token():
    global _token
    if not _token:
        out = subprocess.run(
            f"az account get-access-token --resource {ORG} --query accessToken -o tsv",
            shell=True, capture_output=True, text=True)
        _token = out.stdout.strip()
        if not _token:
            sys.exit("Could not get a token from Azure CLI:\n" + out.stderr)
    return _token


def call(method, path, body=None, retries=6):
    url = API + urllib.parse.quote(path, safe="/?&=$,()':")
    data = json.dumps(body).encode() if body is not None else None
    headers = {
        "Authorization": "Bearer " + token(),
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
        "OData-MaxVersion": "4.0", "OData-Version": "4.0",
        "MSCRM.SolutionUniqueName": SOLUTION,
    }
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                raw = r.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")
            transient = (e.code in (429, 503, 504)
                         or "0x80040216" in msg or "0x80060891" in msg
                         or "another customization" in msg.lower()
                         or "metadatacache" in msg.lower().replace(" ", ""))
            if transient and attempt < retries - 1:
                wait = 10 * (attempt + 1)
                print(f"    transient error ({e.code}); retrying in {wait}s")
                time.sleep(wait)
                continue
            raise RuntimeError(f"{method} {path} -> {e.code}: {msg[:800]}") from None


def exists(path):
    try:
        call("GET", path, retries=1)
        return True
    except RuntimeError as e:
        if "-> 404" in str(e):
            return False
        raise


def label(text):
    return {"@odata.type": "Microsoft.Dynamics.CRM.Label",
            "LocalizedLabels": [{"@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                                 "Label": text, "LanguageCode": LCID}]}


def options(names):
    return [{"Value": OPT + i, "Label": label(n)} for i, n in enumerate(names)]


def req(level):
    return {"Value": level, "CanBeChanged": True,
            "ManagedPropertyLogicalName": "canmodifyrequirementlevelsettings"}


# ---------------------------------------------------------------- definitions
SHEET_TYPES = [
    "Insulin Injection Log",                       # II
    "PRN (OTC) MAR",                               # PO
    "General (Home) MAR",                          # HM
    "Methadone/Kadian Maintenance",                # MK
    "Methadone/Kadian Titration",                  # MT
    "Suboxone Maintenance",                        # SM
    "Suboxone Titration",                          # ST
    "High-Risk Controlled Medication",             # HC
    "Benzodiazepine Taper (8-Day)",                # BT
    "Benzodiazepine Taper (Pre-filled 5-Day)",     # B5
    "Benzodiazepine Maintenance",                  # BM
    "Vital Signs",                                 # VS
]

TABLES = [
    # schema, display, plural, description, autonumber prefix
    ("cp_MARSheet", "MAR Sheet", "MAR Sheets",
     "One paper Medication Administration Record sheet (or medication block) for an admission.", "MAR"),
    ("cp_MARDay", "MAR Day", "MAR Days",
     "A day box on a titration or taper MAR sheet: day instruction and start/stop.", "MD"),
    ("cp_MedicationAdministration", "Medication Administration", "Medication Administrations",
     "One dose row on a MAR sheet.", "MA"),
    ("cp_MedicationReconciliation", "Medication Reconciliation", "Medication Reconciliations",
     "Evening/night medication count for a MAR sheet, including refusals; two staff sign-offs.", "MR"),
    ("cp_DetoxMedication", "Detox Medication", "Detox Medications",
     "Medication list used on MAR sheets (e.g. the PRN (OTC) sheet). Nurses can add medications here.", None),
]

# Per-table overrides: the medication list is a shared reference list (organization-owned)
# whose name is the medication itself, so no auto-number and the name is required.
TABLE_OPTIONS = {
    "cp_DetoxMedication": {"ownership": "OrganizationOwned", "name_label": "Medication", "name_required": True},
}

DETOX_APP_ID = "3dc6e19a-3e04-417c-8ab7-edae6be2f759"   # "Detox" model-driven app
APP_TABLES = ["cp_detoxmedication"]                      # tables nurses open directly from the app

# Seed rows for cp_detoxmedication: the medications printed on the PRN (OTC) paper sheet.
# name, strength, directions, max per day, max unit (0 = mg, 1 = tabs), PRN list, display order
SEED_MEDICATIONS = [
    ("Ibuprofen (Advil)", "200 mg / 400 mg",
     "Please circle if 200 or 400 mg. MAX 2400 mg/day.", 2400, 0, True, 10),
    ("Acetaminophen (Tylenol)", "500 mg",
     "Take 1-2 tabs q4h PRN. DO NOT EXCEED 6 TABS/day.", 6, 1, True, 20),
    ("Ginger Gravol (Organic Ginger extract)", "20 mg (equivalent to 340 mg dried ginger)",
     "2 tabs q4-6h PRN. DO NOT EXCEED 6 TABS/day.", 6, 1, True, 30),
]


def s(schema, disp, maxlen, desc=""):
    return {"@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata", "SchemaName": schema,
            "DisplayName": label(disp), "Description": label(desc), "RequiredLevel": req("None"),
            "MaxLength": maxlen, "FormatName": {"Value": "Text"}}


def memo(schema, disp, maxlen=4000, desc=""):
    return {"@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata", "SchemaName": schema,
            "DisplayName": label(disp), "Description": label(desc), "RequiredLevel": req("None"),
            "MaxLength": maxlen, "Format": "TextArea"}


def whole(schema, disp, desc=""):
    return {"@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata", "SchemaName": schema,
            "DisplayName": label(disp), "Description": label(desc), "RequiredLevel": req("None"),
            "MinValue": 0, "MaxValue": 100000, "Format": "None"}


def dec(schema, disp, precision=2, desc=""):
    return {"@odata.type": "Microsoft.Dynamics.CRM.DecimalAttributeMetadata", "SchemaName": schema,
            "DisplayName": label(disp), "Description": label(desc), "RequiredLevel": req("None"),
            "Precision": precision, "MinValue": 0, "MaxValue": 100000}


def date_only(schema, disp, desc=""):
    return {"@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", "SchemaName": schema,
            "DisplayName": label(disp), "Description": label(desc), "RequiredLevel": req("None"),
            "Format": "DateOnly", "DateTimeBehavior": {"Value": "DateOnly"}}


def date_time(schema, disp, desc="", level="None"):
    return {"@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", "SchemaName": schema,
            "DisplayName": label(disp), "Description": label(desc), "RequiredLevel": req(level),
            "Format": "DateAndTime", "DateTimeBehavior": {"Value": "UserLocal"}}


def yesno(schema, disp, desc=""):
    return {"@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata", "SchemaName": schema,
            "DisplayName": label(disp), "Description": label(desc), "RequiredLevel": req("None"),
            "DefaultValue": False,
            "OptionSet": {"@odata.type": "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata",
                          "TrueOption": {"Value": 1, "Label": label("Yes")},
                          "FalseOption": {"Value": 0, "Label": label("No")}}}


def choice(schema, disp, names, desc="", default_index=None):
    a = {"@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata", "SchemaName": schema,
         "DisplayName": label(disp), "Description": label(desc), "RequiredLevel": req("None"),
         "OptionSet": {"@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
                       "IsGlobal": False, "OptionSetType": "Picklist", "Options": options(names)}}
    if default_index is not None:
        a["DefaultFormValue"] = OPT + default_index
    return a


def sheettype(desc="Which paper MAR sheet this record belongs to.", level="None"):
    return {"@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata", "SchemaName": "cp_SheetType",
            "DisplayName": label("Sheet Type"), "Description": label(desc), "RequiredLevel": req(level),
            "GlobalOptionSet@odata.bind": "__SHEETTYPE_OPTIONSET__"}  # resolved to the MetadataId at run time


COLUMNS = {
    "cp_marsheet": [
        sheettype(level="ApplicationRequired"),
        s("cp_Medication", "Medication", 200),
        s("cp_Dose", "Prescribed Dose", 100, "Prescribed dose as written on the sheet."),
        choice("cp_DoseUnit", "Dose Unit", ["mg", "units", "tabs", "mL"]),
        s("cp_Frequency", "Frequency", 100, "How often the medication is given, e.g. BID, QID, q4h PRN (HOME MAR)."),
        date_only("cp_StartDate", "Start Date", "Script / prescription start date."),
        date_only("cp_EndDate", "End Date", "Script / prescription end date."),
        s("cp_SubstanceHistory", "Substance History", 500, "Type of opiate / last use"),
        memo("cp_Instructions", "Prescription Instructions"),
        choice("cp_MARStatus", "MAR Status",
               ["Active", "Completed", "Discontinued", "Stopped - 3 Refusals"], default_index=0),
        whole("cp_RefusalCount", "Refusal Count",
              "Number of reconciliation entries marked as a refusal (3 = stop and see a clinician)."),
        memo("cp_PO_Contraindications", "PO Contraindicated Conditions", 2000,
             "PRN (OTC): medical conditions that are contraindicated with PRN (OTC) medications."),
    ],
    "cp_marday": [
        sheettype(),
        whole("cp_DayNumber", "Day Number"),
        date_only("cp_DayDate", "Day Date"),
        s("cp_DayInstruction", "Day Instruction", 500, "e.g. Take 1 tablet QID"),
        date_time("cp_DayStart", "Day Start"),
        date_time("cp_DayStop", "Day Stop"),
    ],
    "cp_medicationadministration": [
        sheettype(),
        date_time("cp_AdministeredOn", "Administered On", "Date and time the dose was given.",
                  level="ApplicationRequired"),
        dec("cp_Dose", "Dose", 2, "Dose given (numeric; unit comes from the MAR sheet)."),
        dec("cp_Amount", "Amount", 2, "Amount given (PRN OTC and Home MAR)."),
        whole("cp_Count", "Count", "Count remaining after the dose."),
        whole("cp_Count2mg", "Count 2 mg", "Suboxone: 2 mg count / amount remaining."),
        whole("cp_Count8mg", "Count 8 mg", "Suboxone: 8 mg count / amount remaining."),
        s("cp_BP", "BP", 20, "Blood pressure, e.g. 120/80"),
        whole("cp_HR", "HR", "Heart rate"),
        memo("cp_Notes", "Notes", 2000, "Notes / why needed."),
        dec("cp_II_BGLevel", "II B.G. Level", 1, "Insulin: blood glucose level (mmol/L)."),
        choice("cp_II_InjectionSite", "II Injection Site",
               ["Abdomen - Left", "Abdomen - Right", "Arm - Left", "Arm - Right",
                "Thigh - Left", "Thigh - Right", "Buttock - Left", "Buttock - Right"]),
        choice("cp_PO_Medication", "PO Medication",
               ["Ibuprofen (Advil) 200 mg", "Ibuprofen (Advil) 400 mg",
                "Acetaminophen (Tylenol) 500 mg", "Ginger Gravol"]),
        # Vital Signs, CIWA/COWS, Urine/Blood Testing Results Record. BP, HR and the B.G. level
        # reuse the shared cp_bp / cp_hr / cp_ii_bglevel columns; the admission's own intake
        # readings (cp_bp, cp_hr, cp_temp, cp_o2sats, cp_ciwascore1, cp_cowsscore1) are read
        # from the admission, not copied here.
        whole("cp_VS_RespiratoryRate", "VS Respiratory Rate", "Breaths per minute."),
        whole("cp_VS_OxygenSaturation", "VS Oxygen Saturation", "SpO2 in %."),
        dec("cp_VS_Temperature", "VS Temp", 1, "Temperature in degrees C."),
        whole("cp_VS_COWSScore", "VS COWS Score", "Clinical Opiate Withdrawal Scale score."),
        whole("cp_VS_CIWAScore", "VS CIWA Score", "CIWA withdrawal score."),
        choice("cp_VS_HCGResult", "VS HCG Test Result", ["Negative", "Positive", "Declined"]),
        s("cp_VS_DrugTestResult", "VS Drug Test Result", 300,
          "Positive results only, e.g. THC, fentanyl."),
    ],
    "cp_medicationreconciliation": [
        sheettype(),
        date_time("cp_ReconciledOn", "Reconciled On", level="ApplicationRequired"),
        whole("cp_Count", "Count"),
        whole("cp_Count2mg", "Count 2 mg"),
        whole("cp_Count8mg", "Count 8 mg"),
        yesno("cp_IsRefusal", "Refusal", "Yes when this entry records a refused medication."),
        memo("cp_Reason", "Reason / Refusal / Why", 2000),
    ],
    "cp_detoxmedication": [
        s("cp_Strength", "Strength", 200, "e.g. 200 mg / 400 mg"),
        memo("cp_Directions", "Directions", 1000, "As printed on the sheet, e.g. Take 1-2 tabs q4h PRN."),
        dec("cp_MaxDailyAmount", "Max Daily Amount", 2, "Maximum per day, in the Max Daily Unit."),
        choice("cp_MaxDailyUnit", "Max Daily Unit", ["mg", "tabs"],
               "mg = checked against Dose; tabs = checked against Amount."),
        yesno("cp_PRNOTC", "PRN (OTC) list", "Show this medication on the PRN (OTC) MAR sheet."),
        whole("cp_DisplayOrder", "Display Order", "Order on the sheet (lowest first)."),
    ],
}

RESTRICT = "Restrict"
REMOVE = "RemoveLink"
# schema name, referenced (one), referencing (many), lookup schema, display, required, delete behaviour
RELATIONSHIPS = [
    ("cp_cp_admission_cp_marsheet", "cp_cp_admission", "cp_marsheet", "cp_Admission", "Admission", True, RESTRICT),
    ("cp_marsheet_cp_marday", "cp_marsheet", "cp_marday", "cp_MARSheet", "MAR Sheet", True, RESTRICT),
    ("cp_marsheet_cp_medicationadministration", "cp_marsheet", "cp_medicationadministration",
     "cp_MARSheet", "MAR Sheet", True, RESTRICT),
    ("cp_marsheet_cp_medicationreconciliation", "cp_marsheet", "cp_medicationreconciliation",
     "cp_MARSheet", "MAR Sheet", True, RESTRICT),
    ("cp_cp_admission_cp_medicationadministration", "cp_cp_admission", "cp_medicationadministration",
     "cp_Admission", "Admission", False, REMOVE),
    ("cp_cp_admission_cp_medicationreconciliation", "cp_cp_admission", "cp_medicationreconciliation",
     "cp_Admission", "Admission", False, REMOVE),
    ("cp_marday_cp_medicationadministration", "cp_marday", "cp_medicationadministration",
     "cp_MARDay", "MAR Day", False, REMOVE),
    ("cp_staff_cp_medicationadministration", "cp_staff", "cp_medicationadministration",
     "cp_Staff", "Staff", False, REMOVE),
    ("cp_staff_cp_medicationreconciliation_staff1", "cp_staff", "cp_medicationreconciliation",
     "cp_Staff1", "Staff 1", False, REMOVE),
    ("cp_staff_cp_medicationreconciliation_staff2", "cp_staff", "cp_medicationreconciliation",
     "cp_Staff2", "Staff 2", False, REMOVE),
    # PRN (OTC) and other list-driven sheets: which medication a dose was. A medication that
    # has been charted cannot be deleted (deactivate it instead).
    ("cp_detoxmedication_cp_medicationadministration", "cp_detoxmedication", "cp_medicationadministration",
     "cp_DetoxMedication", "Medication", False, RESTRICT),
]


# ---------------------------------------------------------------- steps
def step_optionset():
    print("== Global choice cp_marsheettype")
    if exists("GlobalOptionSetDefinitions(Name='cp_marsheettype')"):
        have = {o["Value"] for o in call("GET", "GlobalOptionSetDefinitions(Name='cp_marsheettype')")["Options"]}
        for i, name in enumerate(SHEET_TYPES):
            if OPT + i not in have:
                call("POST", "InsertOptionValue", {"OptionSetName": "cp_marsheettype", "Value": OPT + i,
                                                   "Label": label(name), "SolutionUniqueName": SOLUTION})
                print(f"   added {OPT + i} {name}")
        print("   exists")
        return
    call("POST", "GlobalOptionSetDefinitions", {
        "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
        "Name": "cp_marsheettype", "DisplayName": label("MAR Sheet Type"),
        "Description": label("The paper Medication Administration Record sheets used in Detox."),
        "IsGlobal": True, "OptionSetType": "Picklist", "Options": options(SHEET_TYPES)})
    print("   created")


def step_tables():
    print("== Tables")
    for schema, disp, plural, desc, prefix in TABLES:
        logical = schema.lower()
        if exists(f"EntityDefinitions(LogicalName='{logical}')?$select=LogicalName"):
            print(f"   {logical}: exists")
            continue
        opt = TABLE_OPTIONS.get(schema, {})
        name_attr = {
            "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
            "SchemaName": "cp_Name", "DisplayName": label(opt.get("name_label", "Name")), "IsPrimaryName": True,
            "RequiredLevel": req("ApplicationRequired" if opt.get("name_required") else "None"),
            "MaxLength": 200 if opt.get("name_required") else 100, "FormatName": {"Value": "Text"},
        }
        if prefix:
            name_attr["AutoNumberFormat"] = prefix + "-{SEQNUM:6}"
        call("POST", "EntityDefinitions", {
            "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
            "SchemaName": schema, "DisplayName": label(disp), "DisplayCollectionName": label(plural),
            "Description": label(desc), "OwnershipType": opt.get("ownership", "UserOwned"),
            "HasActivities": False, "HasNotes": False, "IsActivity": False,
            "IsAuditEnabled": {"Value": True, "CanBeChanged": True,
                               "ManagedPropertyLogicalName": "canmodifyauditsettings"},
            "PrimaryNameAttribute": "cp_name",
            "Attributes": [name_attr]})
        print(f"   {logical}: created")


def step_columns():
    print("== Columns")
    os_id = call("GET", "GlobalOptionSetDefinitions(Name='cp_marsheettype')")["MetadataId"]
    for table, cols in COLUMNS.items():
        call("GET", f"EntityDefinitions(LogicalName='{table}')?$select=LogicalName")  # warm cache
        for col in cols:
            logical = col["SchemaName"].lower()
            if exists(f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{logical}')?$select=LogicalName"):
                print(f"   {table}.{logical}: exists")
                continue
            if col.get("GlobalOptionSet@odata.bind") == "__SHEETTYPE_OPTIONSET__":
                col = dict(col, **{"GlobalOptionSet@odata.bind": f"/GlobalOptionSetDefinitions({os_id})"})
            call("POST", f"EntityDefinitions(LogicalName='{table}')/Attributes", col)
            print(f"   {table}.{logical}: created")


def step_relationships():
    print("== Relationships")
    for name, one, many, lookup, disp, required, delete in RELATIONSHIPS:
        if exists(f"RelationshipDefinitions(SchemaName='{name}')?$select=SchemaName"):
            print(f"   {name}: exists")
            continue
        pk = call("GET", f"EntityDefinitions(LogicalName='{one}')?$select=PrimaryIdAttribute")["PrimaryIdAttribute"]
        call("POST", "RelationshipDefinitions", {
            "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
            "SchemaName": name, "ReferencedEntity": one, "ReferencingEntity": many,
            "ReferencedAttribute": pk,
            "CascadeConfiguration": {"Assign": "NoCascade", "Delete": delete, "Merge": "NoCascade",
                                     "Reparent": "NoCascade", "Share": "NoCascade",
                                     "Unshare": "NoCascade", "RollupView": "NoCascade"},
            "Lookup": {"@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
                       "SchemaName": lookup, "DisplayName": label(disp),
                       "RequiredLevel": req("ApplicationRequired" if required else "None")}})
        print(f"   {name}: created ({many}.{lookup.lower()} -> {one}, delete={delete})")


def step_app_components():
    print("== Detox app: add tables")
    for t in APP_TABLES:
        mid = call("GET", f"EntityDefinitions(LogicalName='{t}')?$select=MetadataId")["MetadataId"]
        have = call("GET", f"appmodulecomponents?$select=objectid&$filter=_appmoduleidunique_value ne null "
                           f"and objectid eq {mid} and componenttype eq 1")["value"]
        if have:
            print(f"   {t}: already in app")
            continue
        call("POST", "AddAppComponents", {
            "AppId": DETOX_APP_ID,
            "Components": [{"@odata.type": "Microsoft.Dynamics.CRM.entity", "entityid": mid}]})
        print(f"   {t}: added")


def step_seed_medications():
    print("== Seed cp_detoxmedication")
    for name, strength, directions, max_amt, unit_idx, prn, order in SEED_MEDICATIONS:
        safe = name.replace("'", "''")
        if call("GET", f"cp_detoxmedications?$select=cp_name&$filter=cp_name eq '{safe}'")["value"]:
            print(f"   {name}: exists")
            continue
        call("POST", "cp_detoxmedications", {
            "cp_name": name, "cp_strength": strength, "cp_directions": directions,
            "cp_maxdailyamount": max_amt, "cp_maxdailyunit": OPT + unit_idx,
            "cp_prnotc": prn, "cp_displayorder": order})
        print(f"   {name}: created")


def step_publish():
    print("== Publish")
    ents = "".join(f"<entity>{t[0].lower()}</entity>" for t in TABLES) + "<entity>cp_cp_admission</entity><entity>cp_staff</entity>"
    call("POST", "PublishXml", {"ParameterXml":
         f"<importexportxml><entities>{ents}</entities>"
         "<optionsets><optionset>cp_marsheettype</optionset></optionsets></importexportxml>"})
    print("   published")


if __name__ == "__main__":
    print("Target:", ORG, "| solution:", SOLUTION)
    step_optionset()
    step_tables()
    print("   waiting 30s for metadata to settle"); time.sleep(30)
    step_columns()
    print("   waiting 20s for metadata to settle"); time.sleep(20)
    step_relationships()
    step_publish()
    step_app_components()
    step_seed_medications()
    call("POST", "PublishXml", {"ParameterXml":
         f"<importexportxml><appmodules><appmodule>{DETOX_APP_ID}</appmodule></appmodules></importexportxml>"})
    print("Done.")
