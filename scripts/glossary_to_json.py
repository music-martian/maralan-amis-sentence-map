#!/usr/bin/env python3
"""Convert a Klokah 2022學習詞表 xlsx into <slug>_vocab.json (same schema as maralan_vocab.json).
Usage: glossary_to_json.py XLSX OUT_JSON DIALECT_NAME DID SOURCE_URL"""
import json, re, sys, openpyxl
xlsx, out, name, did, src = sys.argv[1:6]
ws = openpyxl.load_workbook(xlsx).worksheets[0]
cats, entries, cur = [], [], None
for r in ws.iter_rows(min_row=4, values_only=True):
    r = [None if v is None else str(v).strip() for v in r[:6]]
    if r[0] == "類別" and r[1]:
        m = re.match(r"(\d+)(.*)", r[1]); cur = {"code": m.group(1), "name": m.group(2), "label": r[1]}
        cats.append(cur); continue
    if not r[0] or not r[1] or not cur: continue
    entries.append({"seq": r[0], "code": r[1], "zh": r[2], "amis": r[3], "note": r[4], "level": r[5],
                    "cat": cur["label"], "cat_code": cur["code"], "cat_name": cur["name"]})
json.dump({"source": src, "dialect": name, "did": int(did), "count": len(entries), "categories": cats, "entries": entries},
          open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(len(entries), "entries")
