#!/usr/bin/env python3
"""
Salvage the mangled students-export CSV.

The Lovable SQL-editor export corrupted CSV quoting (quadruple quotes inside the
metadata JSON, stray quotes in text fields), so a normal CSV parser fails. But:
  - ';' is a clean field delimiter (values never contain ';')
  - each record begins on its own physical line that starts with a UUID
  - lines not starting with a UUID are embedded-newline continuations
  - every line has trailing comma padding after the last real field

Strategy: merge continuation lines, split each record by ';' (raw, no quote
handling), strip trailing comma padding, keep the first 28 fields. Values are
preserved verbatim as text. Output a clean comma-delimited CSV.
"""
import csv
import re
import sys

SRC = sys.argv[1]
DST = sys.argv[2]

HEADER = [
    "id", "email", "full_name", "gender", "parent_name", "contact_number",
    "university_name", "college_name", "course", "degree", "department",
    "class_semester", "academic_session", "roll_number", "internship_domain",
    "emergency_name", "emergency_contact", "emergency_relation", "status",
    "created_at", "registration_id", "metadata", "cybercafe_shop_name",
    "cybercafe_email", "joining_date", "completion_date", "internship_duration",
    "referral_code",
]
NCOL = len(HEADER)
UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12};")
TS = re.compile(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}")

records = []
cur = None
with open(SRC, "r", encoding="utf-8", errors="replace", newline="") as fh:
    first = True
    for line in fh:
        line = line.rstrip("\n").rstrip("\r")
        if first:  # skip header line
            first = False
            continue
        if UUID.match(line):
            if cur is not None:
                records.append(cur)
            cur = line
        else:
            if cur is not None:
                cur += " " + line  # merge embedded-newline continuation
    if cur is not None:
        records.append(cur)

good = bad = ts_ok = 0
rows = []
for rec in records:
    rec = rec.rstrip(",")  # strip trailing comma padding
    parts = rec.split(";")
    if len(parts) < NCOL:
        parts = parts + [""] * (NCOL - len(parts))
        bad += 1
    elif len(parts) > NCOL:
        # extra ';' (rare) -> fold overflow back into metadata (col idx 21)
        head = parts[:21]
        tail = parts[len(parts) - 6:]           # last 6 real cols
        mid = parts[21:len(parts) - 6]          # metadata + any overflow
        parts = head + [";".join(mid)] + tail
        bad += 1
    else:
        good += 1
    parts = parts[:NCOL]
    parts[-1] = parts[-1].rstrip(",")
    if TS.match(parts[19].strip()):
        ts_ok += 1
    rows.append(parts)

with open(DST, "w", encoding="utf-8", newline="") as out:
    w = csv.writer(out, lineterminator="\n")
    w.writerow(HEADER)
    w.writerows(rows)

print(f"records={len(rows)} clean_split={good} adjusted={bad} created_at_is_timestamp={ts_ok}")
