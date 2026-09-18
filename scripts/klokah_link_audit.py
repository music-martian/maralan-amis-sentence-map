#!/usr/bin/env python3
"""Audit unit source_urls against live Klokah Maralan (did=4) content."""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
import http.cookiejar
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from difflib import SequenceMatcher

SITE = Path(__file__).resolve().parent.parent
UNITS_DIR = SITE / "data" / "units"
OUT_JSON = SITE / "scripts" / "klokah_link_audit.json"
OUT_MD = SITE / "scripts" / "klokah_link_audit.md"

SET_DIALECT = "https://klokah.iformosa.com.tw/set_prefer_dialect/4"
EXPECTED_DIALECT = "馬蘭阿美語"

GLOTTAL = "'\u2019\u2018\u02bc\u02be\u02bb\u02bd`"
PUNCT = ".!?。！？,，;；:：…\"\"「」『』（）()[]¿¡/／ "


def norm_amis(s: str) -> str:
    if not s:
        return ""
    t = str(s)
    for g in GLOTTAL:
        t = t.replace(g, "'")
    for p in PUNCT:
        t = t.replace(p, " ")
    t = re.sub(r"\s+", " ", t).strip().lower()
    return t


def fuzzy_ok(a: str, b: str, threshold: float = 0.72) -> Tuple[bool, float]:
    na, nb = norm_amis(a), norm_amis(b)
    if not na or not nb:
        return False, 0.0
    if na == nb:
        return True, 1.0
    if na in nb or nb in na:
        return True, 0.95
    ratio = SequenceMatcher(None, na, nb).ratio()
    return ratio >= threshold, ratio


def extract_first_amis(html: str, url: str) -> Optional[str]:
    # sentence LEARN_DATA
    m = re.search(r"window\.LEARN_DATA\s*=\s*(\[.*?\]);", html, re.S)
    if m:
        try:
            data = json.loads(m.group(1))
            if data and isinstance(data, list):
                item = data[0]
                for key in (
                    "sentenceA_ab",
                    "choiceOneA_ab",
                    "word_ab",
                    "recognize_ab",
                    "pictureTalk_ab",
                ):
                    v = item.get(key)
                    if v and str(v).strip():
                        return str(v).strip()
                # any *_ab / matchA_ab_A style
                for k, v in item.items():
                    if not v or not str(v).strip():
                        continue
                    if k.endswith("_ab") or "_ab_" in k or k.endswith("Ab"):
                        return str(v).strip()
        except Exception:
            pass

    # essay / dialogue textData
    m = re.search(r"window\.textData\s*=\s*(\[.*?\]);", html, re.S)
    if m:
        try:
            data = json.loads(m.group(1))
            if data:
                item = data[0]
                for key in ("ab", "sentenceAb", "sentence_ab"):
                    v = item.get(key)
                    if v and str(v).strip():
                        return str(v).strip()
        except Exception:
            pass

    # talk lesson object
    m = re.search(r"\blesson\s*=\s*(\{.*?\});\s*(?:\n|<)", html, re.S)
    if not m:
        m = re.search(r"\blesson\s*=\s*(\{.*?\})\s*;", html, re.S)
    if m:
        blob = m.group(1)
        for pat in (r'"AB1"\s*:\s*"((?:\\.|[^"\\])*)"', r'"lessonAB"\s*:\s*"((?:\\.|[^"\\])*)"'):
            mm = re.search(pat, blob)
            if mm:
                try:
                    return json.loads('"' + mm.group(1) + '"')
                except Exception:
                    return mm.group(1).encode().decode("unicode_escape", errors="replace")

    # dialogue h1-ish title with latin
    for mm in re.finditer(
        r'class="[^"]*title[^"]*"[^>]*>\s*([^<]{4,120})\s*<', html
    ):
        t = mm.group(1).strip()
        if re.search(r"[A-Za-z]", t) and not t.startswith("http"):
            return t

    return None


def parse_dialect(html: str) -> Optional[str]:
    m = re.search(r"目前語言:([^<\n]+)", html)
    return m.group(1).strip() if m else None


def http_get(opener, url: str, timeout: int = 45) -> Tuple[int, str, str]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "maralan-amis-sentence-map-audit/1.0",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    try:
        with opener.open(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body, resp.geturl()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        return e.code, body, url
    except Exception as e:
        return 0, str(e), url


def load_units() -> List[Dict[str, Any]]:
    out = []
    for path in sorted(UNITS_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        sents = data.get("sentences") or []
        first = ""
        if sents:
            first = sents[0].get("amis") or ""
        out.append(
            {
                "id": data.get("id") or path.stem,
                "module": data.get("module"),
                "title": data.get("title"),
                "source_url": data.get("source_url") or "",
                "our_first_amis": first,
                "path": str(path.relative_to(SITE)),
            }
        )
    return out


def main() -> int:
    units = load_units()
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    st, body, final = http_get(opener, SET_DIALECT)
    print(f"set_prefer_dialect/4 -> {st} final={final}", flush=True)

    results = []
    ok_n = fail_n = 0
    for i, u in enumerate(units, 1):
        url = u["source_url"]
        row: Dict[str, Any] = {
            "id": u["id"],
            "module": u["module"],
            "title": u["title"],
            "source_url": url,
            "our_first_amis": u["our_first_amis"],
            "path": u["path"],
        }
        if not url:
            row.update(ok=False, reason="empty_source_url")
            fail_n += 1
            results.append(row)
            print(f"[{i}/{len(units)}] FAIL {u['id']} empty url", flush=True)
            continue

        # refresh dialect periodically in case session expires
        if i == 1 or i % 40 == 0:
            http_get(opener, SET_DIALECT)

        status, html, final_url = http_get(opener, url)
        row["http_status"] = status
        row["final_url"] = final_url
        dialect = parse_dialect(html) if html else None
        row["dialect"] = dialect
        first = extract_first_amis(html, url) if html and status == 200 else None
        row["klokah_first_amis"] = first

        reasons = []
        if status != 200:
            reasons.append(f"http_{status}")
        if status == 200 and dialect and EXPECTED_DIALECT not in dialect:
            reasons.append(f"dialect:{dialect}")
        if status == 200 and not dialect:
            reasons.append("dialect_missing")
        if status == 200 and not first:
            reasons.append("empty_content")
        match = False
        ratio = 0.0
        if first and u["our_first_amis"]:
            match, ratio = fuzzy_ok(first, u["our_first_amis"])
            row["similarity"] = round(ratio, 3)
            if not match:
                reasons.append("amis_mismatch")
        elif first and not u["our_first_amis"]:
            reasons.append("our_amis_empty")
        elif status == 200 and u["our_first_amis"] and not first:
            pass  # already empty_content

        # Redirect to wrong dialect in path (e.g. /learn/1/...)
        if final_url and "/learn/1/" in final_url and "/learn/4/" in url:
            reasons.append("redirected_to_dialect_1")

        ok = not reasons and match
        # If we got content match and dialect ok, good even if dialect_missing? prefer strict
        if not reasons and match:
            ok = True
        elif not reasons and not u["our_first_amis"] and first:
            ok = True  # nothing to compare
            reasons = []
        elif "amis_mismatch" not in reasons and status == 200 and dialect and EXPECTED_DIALECT in dialect and first:
            # dialect+content present; if our empty somehow
            ok = match if u["our_first_amis"] else True

        # Recompute ok strictly:
        ok = (
            status == 200
            and dialect is not None
            and EXPECTED_DIALECT in dialect
            and bool(first)
            and (not u["our_first_amis"] or match)
        )
        if not ok and not reasons:
            reasons.append("unknown")

        row["ok"] = ok
        row["reason"] = ";".join(reasons) if reasons else "ok"
        if ok:
            ok_n += 1
        else:
            fail_n += 1
        results.append(row)
        flag = "OK" if ok else "FAIL"
        print(
            f"[{i}/{len(units)}] {flag} {u['id']} {row['reason']} sim={row.get('similarity')} "
            f"| ours={u['our_first_amis'][:40]!r} | klok={ (first or '')[:40]!r}",
            flush=True,
        )
        time.sleep(0.15)

    summary = {
        "total": len(results),
        "ok": ok_n,
        "fail": fail_n,
        "expected_dialect": EXPECTED_DIALECT,
        "set_prefer": SET_DIALECT,
    }
    by_reason: Dict[str, int] = {}
    for r in results:
        if not r["ok"]:
            by_reason[r["reason"]] = by_reason.get(r["reason"], 0) + 1
    summary["fail_reasons"] = by_reason

    report = {"summary": summary, "units": results}
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Klokah link audit (馬蘭 did=4)",
        "",
        f"- total: {summary['total']}",
        f"- ok: {summary['ok']}",
        f"- fail: {summary['fail']}",
        f"- set_prefer: `{SET_DIALECT}`",
        "",
        "## Fail reasons",
        "",
    ]
    for k, v in sorted(by_reason.items(), key=lambda x: -x[1]):
        lines.append(f"- `{k}`: {v}")
    lines += ["", "## Failures", ""]
    for r in results:
        if r["ok"]:
            continue
        lines.append(
            f"- **{r['id']}** ({r['module']}): `{r['reason']}`\n"
            f"  - url: {r['source_url']}\n"
            f"  - final: {r.get('final_url')}\n"
            f"  - dialect: {r.get('dialect')}\n"
            f"  - ours: {r.get('our_first_amis')!r}\n"
            f"  - klokah: {r.get('klokah_first_amis')!r}\n"
            f"  - sim: {r.get('similarity')}"
        )
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"wrote {OUT_JSON} and {OUT_MD}")
    return 0 if fail_n == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
