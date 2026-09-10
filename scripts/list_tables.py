"""List all tables in the Dataverse environment.

Queries EntityDefinitions and groups results into custom vs system tables.
"""
import os
import sys
import json
import urllib.request
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from auth import get_token, load_env


def list_tables():
    load_env()
    base_url = os.environ["DATAVERSE_URL"].rstrip("/")
    token = get_token()

    select = "LogicalName,SchemaName,EntitySetName,DisplayName,IsCustomEntity,IsManaged"
    url = f"{base_url}/api/data/v9.2/EntityDefinitions?$select={select}"

    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
    })

    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    tables = data.get("value", [])

    def display_name(t):
        dn = t.get("DisplayName") or {}
        labels = dn.get("LocalizedLabels") or []
        return labels[0]["Label"] if labels else ""

    custom = [t for t in tables if t.get("IsCustomEntity")]
    system = [t for t in tables if not t.get("IsCustomEntity")]

    print(f"Total tables: {len(tables)}  (custom: {len(custom)}, system: {len(system)})")
    print()
    print("=" * 100)
    print("CUSTOM TABLES")
    print("=" * 100)
    print(f"{'Logical Name':<45} {'Display Name':<35} {'Managed'}")
    print("-" * 100)
    for t in sorted(custom, key=lambda x: x["LogicalName"]):
        print(f"{t['LogicalName']:<45} {display_name(t):<35} {t.get('IsManaged')}")

    print()
    print("=" * 100)
    print(f"SYSTEM TABLES (showing all {len(system)})")
    print("=" * 100)
    print(f"{'Logical Name':<45} {'Display Name':<35}")
    print("-" * 100)
    for t in sorted(system, key=lambda x: x["LogicalName"]):
        print(f"{t['LogicalName']:<45} {display_name(t):<35}")


if __name__ == "__main__":
    list_tables()
