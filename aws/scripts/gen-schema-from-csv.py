#!/usr/bin/env python3
"""
Reconstruct table schema + build a column-aware loader from the Lovable CSV
exports in eZYINTERNDATA/.

The Lovable "export each table" CSVs are the only source of truth for the base
tables that were created in the Supabase dashboard (students, classes,
notifications, payments, attendance, ...), because those CREATE TABLE
statements are NOT in supabase/migrations/.

For every CSV we:
  - detect the delimiter (',' or ';')
  - read the header
  - infer each column's Postgres type by scanning ALL values
    (falls back to text on any ambiguity, so import never loses data)

Output (written to the paths given on argv):
  build.sql  -> CREATE TABLE IF NOT EXISTS for tables that do NOT already exist
  load.sql   -> \copy <schema>.<table> (col,...) FROM '<container path>' ... for ALL csvs

Existing tables (already created by bootstrap + migrations) are only loaded,
never re-created, so their authoritative schema is preserved.
"""
import csv
import json
import os
import re
import sys

CSV_DIR = sys.argv[1]
BUILD_SQL = sys.argv[2]
LOAD_SQL = sys.argv[3]
CONTAINER_DIR = sys.argv[4]  # path CSVs are mounted at inside the psql container
EXISTING = set(a for a in sys.argv[5:])  # already-existing schema.table names

UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
INT_RE = re.compile(r"^-?\d+$")
NUM_RE = re.compile(r"^-?\d+\.\d+$")
TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:?\d{2})?|Z)?$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
BOOL_VALS = {"t", "f", "true", "false"}


def detect_delim(path):
    with open(path, "r", encoding="utf-8", newline="") as fh:
        first = fh.readline()
    return ";" if first.count(";") > first.count(",") else ","


def table_for(filename):
    base = filename[:-4] if filename.endswith(".csv") else filename
    name = re.split(r"-export", base)[0]
    if name == "auth_users":
        return "auth", "users"
    if name == "auth_identities":
        return "auth", "identities"
    return "public", name


def is_json(v):
    if not (v.startswith("{") or v.startswith("[")):
        return False
    try:
        json.loads(v)
        return True
    except Exception:
        return False


def infer_types(path, delim, header):
    n = len(header)
    # per-column capability flags; start optimistic, knock down as we see values
    can = [{"uuid": True, "int": True, "num": True, "bool": True,
            "ts": True, "date": True, "json": True, "seen": False} for _ in range(n)]
    uniq_id = None
    id_idx = header.index("id") if "id" in header else -1
    if id_idx >= 0:
        uniq_id = set()
        id_dup = [False]
    with open(path, "r", encoding="utf-8", newline="") as fh:
        rdr = csv.reader(fh, delimiter=delim)
        next(rdr, None)  # skip header
        for row in rdr:
            if len(row) != n:
                # ragged row -> be safe, force all remaining to text later
                for c in can:
                    c["uuid"] = c["int"] = c["num"] = c["bool"] = c["ts"] = c["date"] = c["json"] = False
                continue
            for i, raw in enumerate(row):
                v = raw.strip()
                if v == "":
                    continue
                c = can[i]
                c["seen"] = True
                if c["uuid"] and not UUID_RE.match(v):
                    c["uuid"] = False
                if c["int"]:
                    if not INT_RE.match(v):
                        c["int"] = False
                    else:
                        s = v.lstrip("-")
                        # reject leading-zero (e.g. phone) and > bigint range
                        if (len(s) > 1 and s[0] == "0") or len(s) > 18:
                            c["int"] = False
                if c["num"] and not (INT_RE.match(v) or NUM_RE.match(v)):
                    c["num"] = False
                if c["bool"] and v.lower() not in BOOL_VALS:
                    c["bool"] = False
                if c["ts"] and not TS_RE.match(v):
                    c["ts"] = False
                if c["date"] and not DATE_RE.match(v):
                    c["date"] = False
                if c["json"] and not is_json(v):
                    c["json"] = False
            if id_idx >= 0 and not id_dup[0]:
                idv = row[id_idx].strip()
                if idv:
                    if idv in uniq_id:
                        id_dup[0] = True
                    else:
                        uniq_id.add(idv)

    types = []
    for i, c in enumerate(can):
        if not c["seen"]:
            t = "text"
        elif c["uuid"]:
            t = "uuid"
        elif c["bool"]:
            t = "boolean"
        elif c["int"]:
            t = "bigint"
        elif c["num"]:
            t = "numeric"
        elif c["ts"]:
            t = "timestamptz"
        elif c["date"]:
            t = "date"
        elif c["json"]:
            t = "jsonb"
        else:
            t = "text"
        types.append(t)
    id_unique = id_idx >= 0 and not id_dup[0] and len(uniq_id) > 0
    return types, id_idx, id_unique


def qident(name):
    return '"' + name.replace('"', '""') + '"'


def main():
    files = sorted(f for f in os.listdir(CSV_DIR) if f.endswith(".csv"))
    build = []
    load = []
    report = []
    for f in files:
        path = os.path.join(CSV_DIR, f)
        schema, table = table_for(f)
        full = f"{schema}.{table}"
        delim = detect_delim(path)
        with open(path, "r", encoding="utf-8", newline="") as fh:
            header = next(csv.reader(fh, delimiter=delim))
        header = [h.strip() for h in header]
        exists = full in EXISTING
        collist = ", ".join(qident(h) for h in header)
        container_path = f"{CONTAINER_DIR}/{f}"
        if not exists:
            types, id_idx, id_unique = infer_types(path, delim, header)
            cols_sql = []
            for h, t in zip(header, types):
                cols_sql.append(f"  {qident(h)} {t}")
            pk = ""
            if id_idx >= 0 and id_unique:
                pk = f",\n  PRIMARY KEY ({qident('id')})"
            build.append(
                f"CREATE TABLE IF NOT EXISTS {schema}.{qident(table)} (\n"
                + ",\n".join(cols_sql)
                + pk
                + "\n);"
            )
            report.append(f"RECONSTRUCTED {full} ({len(header)} cols)")
        else:
            report.append(f"existing      {full} (load only)")
        load.append(
            f"\\echo Loading {full}\n"
            f"\\copy {schema}.{qident(table)} ({collist}) FROM '{container_path}' "
            f"WITH (FORMAT csv, HEADER true, DELIMITER '{delim}', NULL '', QUOTE '\"')"
        )

    with open(BUILD_SQL, "w") as fh:
        fh.write("SET client_min_messages = warning;\n")
        fh.write("\n\n".join(build) + "\n")
    with open(LOAD_SQL, "w") as fh:
        fh.write("SET session_replication_role = replica;\n")
        fh.write("\n".join(load) + "\n")
    print("\n".join(report))
    print(f"\nWrote {BUILD_SQL} and {LOAD_SQL}")


if __name__ == "__main__":
    main()
