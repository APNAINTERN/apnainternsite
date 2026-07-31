#!/usr/bin/env python3
"""
Normalize the Lovable CSV exports into clean, standard RFC-4180 comma-delimited
CSVs so they can be loaded reliably.

Fixes observed in the raw exports:
  - mixed delimiters: most files use ';', a few use ','
  - students-*.csv: ';'-delimited but every line has ~135 trailing comma
    padding columns (the padding lands inside the last real field)
  - user_security-*.csv: ','-delimited with a trailing empty column

Strategy (source files are never modified):
  - pick delimiter ';' if the header contains ';', else ','
  - parse with the csv module (quote-aware, handles embedded newlines)
  - strip trailing commas from header names, drop trailing empty-named columns
    -> real column count
  - per row: keep the first <real_cols> fields (drops extra padding fields);
    for ';'-delimited files also strip trailing commas from the last kept field
  - write out as UTF-8, comma-delimited, standard quoting
Output filename: <table>.csv  (table = name before '-export')
"""
import csv
import os
import re
import sys

csv.field_size_limit(1 << 30)

SRC = sys.argv[1]
DST = sys.argv[2]
os.makedirs(DST, exist_ok=True)


def table_for(filename):
    base = filename[:-4] if filename.endswith(".csv") else filename
    name = re.split(r"-export", base)[0]
    return name


def clean_name(n):
    return n.strip().strip(",").strip()


def main():
    files = sorted(f for f in os.listdir(SRC) if f.endswith(".csv"))
    for f in files:
        src = os.path.join(SRC, f)
        table = table_for(f)
        dst = os.path.join(DST, table + ".csv")
        with open(src, "r", encoding="utf-8", newline="") as fh:
            first = fh.readline()
        delim = ";" if ";" in first else ","
        with open(src, "r", encoding="utf-8", newline="") as fh, \
             open(dst, "w", encoding="utf-8", newline="") as out:
            rdr = csv.reader(fh, delimiter=delim)
            wtr = csv.writer(out)  # comma, minimal quoting
            header = next(rdr)
            header = [clean_name(h) for h in header]
            # real column count = last non-empty header name + 1
            real = 0
            for i, h in enumerate(header):
                if h != "":
                    real = i + 1
            header = header[:real]
            wtr.writerow(header)
            rows = 0
            for row in rdr:
                fields = row[:real]
                if len(fields) < real:
                    fields = fields + [""] * (real - len(fields))
                if delim == ";" and fields:
                    fields[-1] = fields[-1].rstrip(",")
                wtr.writerow(fields)
                rows += 1
            print(f"{table:<28} delim='{delim}' cols={real} rows={rows}")


if __name__ == "__main__":
    main()
