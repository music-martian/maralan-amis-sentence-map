#!/usr/bin/env python3
"""Fetch Klokah sentence materials for one dialect into a materials dir.

Repeats the 馬蘭 gather (see materials/INVENTORY.md): GET /set_prefer_dialect/{did}
with a cookie jar, then scrape
  句型篇 junior/senior  /sentence/{level}/learn/{did}/{type}/{class}  -> window.LEARN_DATA
  生活會話篇            /talk/learn/{book}                            -> HTML sentence-wrapper blocks
  情境族語              /dialogue/d{did}/s{S}/l{L}/talking             -> window.textData
  族語短文              /essay/d{did}/s{S}/l{L}/learn                  -> window.textData / essayData
Output layout matches materials/ so build_corpus.py reads it unchanged.

Usage: fetch_klokah_dialect.py DID OUT_DIR [--ref materials]   (ref = curriculum names/ids source)
"""
import html, json, re, sys, time, http.cookiejar, urllib.request
from pathlib import Path

HUB = "https://klokah.iformosa.com.tw"
did, out = sys.argv[1], Path(sys.argv[2])
ref = Path(sys.argv[sys.argv.index("--ref") + 1]) if "--ref" in sys.argv else Path(__file__).resolve().parent.parent / "materials"
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
op.addheaders = [("User-Agent", "Mozilla/5.0")]
log = []

def get(path):
    for i in range(3):
        try:
            return op.open(HUB + path, timeout=60).read().decode("utf-8", "replace")
        except Exception as e:
            err = e; time.sleep(2)
    log.append({"path": path, "error": str(err)}); return ""

def jsvar(s, name):
    m = re.search(r"(?:window\.)?%s\s*=\s*" % name, s)
    if not m: return None
    try: return json.JSONDecoder().raw_decode(s[m.end():])[0]
    except Exception: return None

def dump(p, d):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

get(f"/set_prefer_dialect/{did}")
summary = {}

# ---- 句型篇
for level in ("junior", "senior"):
    cur_ref = json.loads((ref / f"{level}_curriculum_index.json").read_text(encoding="utf-8"))
    cur_out, n_items = [], 0
    for t in cur_ref:
        tid = str(t["type_id"]); classes = []
        # class ids: union of reference ids and the live menu of the first class page
        ids = [str(c["class_id"]) for c in t["classes"]]
        names = {str(c["class_id"]): c["class_name"] for c in t["classes"]}
        first = get(f"/sentence/{level}/learn/{did}/{tid}/{ids[0]}")
        for raw in re.findall(r'data-item-id="([^"]+)"', first):
            d = json.loads(html.unescape(raw))
            if str(d.get("type")) == tid and str(d["class_id"]) not in ids: ids.append(str(d["class_id"]))
        for cid in ids:
            page = first if cid == ids[0] else get(f"/sentence/{level}/learn/{did}/{tid}/{cid}")
            ld = jsvar(page, "LEARN_DATA")
            pdid = (re.search(r'window\.DID\s*=\s*"(\d+)"', page) or [None, None])[1]
            if not ld:
                log.append({"level": level, "type": tid, "class": cid, "error": "no LEARN_DATA"}); continue
            auds = sorted({v for it in ld for k, v in it.items() if k.endswith("audio") and v})
            dump(out / f"{level}_type{tid}_class{cid}.json", {
                "source_url": f"{HUB}/sentence/{level}/learn/{did}/{tid}/{cid}", "level": level, "dialect_id": did,
                "type_id": tid, "type_name": t["type_name"], "class_id": cid, "class_name": names.get(cid, cid),
                "actual_item_count": len(ld), "did_ok": pdid == did and all(f"/sound/{did}/" in a for a in auds),
                "audio_url_samples": auds[:3], "learn_data": ld})
            classes.append({"class_id": cid, "class_name": names.get(cid, cid), "item_count": str(len(ld))})
            n_items += len(ld)
        cur_out.append({"type_id": tid, "type_name": t["type_name"], "classes": classes})
    dump(out / f"{level}_curriculum_index.json", cur_out)
    summary[level] = {"classes": sum(len(t["classes"]) for t in cur_out), "items": n_items}

# ---- 生活會話篇
res = []
for book in range(1, 31):
    s = get(f"/talk/learn/{book}")
    head = re.search(r'<h1 class="text-2xl">\s*\d+\s*\.\s*(.*?)</h1>', s, re.S)
    title = html.unescape(head.group(1)).strip() if head else ""
    m = re.match(r"(.*?[?.!]?)\s+([\u3400-\u9fff].*)$", title)
    title_ab, title_ch = (m.group(1), m.group(2)) if m else ("", title)
    items = []
    for blk in s.split("sentence-wrapper one-page")[1:]:
        au = re.search(r'<audio id="audio-\d+" src="([^"]+)"', blk)
        sp = re.search(r'text-material-subtitle font-semibold[^>]*>(.*?)</span>', blk, re.S)
        ab = re.search(r'text-material-title[^>]*>(.*?)</h1>', blk, re.S)
        ch = re.search(r'text-ch[^>]*>(.*?)</h6>', blk, re.S)
        if not ab: continue
        clean = lambda x: html.unescape(re.sub(r"<[^>]+>", "", x)).strip() if x else ""
        a = au.group(1) if au else ""
        items.append({"speaker": clean(sp.group(1)).rstrip(" :：") if sp else "", "sentence_ab": clean(ab.group(1)),
                      "sentence_ch": clean(ch.group(1)) if ch else "", "sentence_audio": a, "audios": [a] if a else []})
    if not items:
        log.append({"talk": book, "error": "no items"}); continue
    ok = all(f"/sound/{did}/sentence/{did}c{book}s" in i["sentence_audio"] for i in items)
    dump(out / "talk" / f"talk_book{book}.json", {"module": "talk", "module_name": "生活會話篇",
         "source_url": f"{HUB}/talk/learn/{book}", "dialect_id": did, "book_id": str(book), "book_name": title_ch,
         "title_ab": title_ab, "title_ch": title_ch, "item_count": len(items), "did_ok": ok, "items": items})
    res.append({"book_id": book, "book_name": title_ch, "title_ab": title_ab, "item_count": len(items), "did_ok": ok})
dump(out / "talk" / "talk_index.json", {"module": "talk", "results": res})
summary["talk"] = {"books": len(res), "items": sum(r["item_count"] for r in res)}

# ---- 情境族語
LV = lambda s: "初級" if s <= 5 else "中級" if s <= 9 else "中高級"
res = []
for sc in range(1, 13):
    for st in (1, 2, 3):
        s = get(f"/dialogue/d{did}/s{sc}/l{st}/talking")
        td = jsvar(s, "textData")
        if not td: continue
        tid = str(td[0].get("sn", "/").split("/")[0])
        for it in td:
            it.setdefault("mp3", f"https://web.klokah.tw/text/sound/{it['sn'].replace(chr(92), '')}.mp3")
        tt = re.search(r"對話練習\((.)\)", s)
        dump(out / "dialogue" / f"dialogue_s{sc}_l{st}_talking.json", {"module": "dialogue", "module_name": "情境族語",
             "source_url": f"{HUB}/dialogue/d{did}/s{sc}/l{st}/talking", "dialect_id": did, "scene": sc, "level": LV(sc),
             "lesson_stage": st, "activity_type": "talking", "tid": tid, "title": "對話練習(%s)" % "一二三"[st - 1],
             "item_count": len(td), "audio_url_pattern": "https://web.klokah.tw/text/sound/{tid}/{id}.mp3", "did_ok": True, "text_data": td})
        res.append({"scene": sc, "stage": st, "tid": tid, "item_count": len(td)})
dump(out / "dialogue" / "dialogue_index.json", {"module": "dialogue", "dialect_id": did, "results": res})
summary["dialogue"] = {"lessons": len(res), "items": sum(r["item_count"] for r in res)}

# ---- 族語短文
s = get(f"/essay/d{did}/s1/l1/learn")
ed = jsvar(s, "essayData") or {}
dump(out / "essay" / "essay_catalog.json", {"module": "essay", "dialect_id": did, "essay_data": ed})
ref_theme = {}
for p in (ref / "essay").glob("essay_s*_l*.json"):
    d = json.loads(p.read_text(encoding="utf-8")); ref_theme[(d["scene"], d["lesson"])] = d.get("theme", "")
res = []
for S, lessons in ed.items():
    if not S.startswith("S"): continue
    for L in lessons:
        sc, ls = int(S[1:]), int(L[1:])
        page = s if (sc, ls) == (1, 1) else get(f"/essay/d{did}/s{sc}/l{ls}/learn")
        td = jsvar(page, "textData")
        if not td: continue
        dump(out / "essay" / f"essay_s{sc}_l{ls}.json", {"module": "essay", "module_name": "族語短文",
             "source_url": f"{HUB}/essay/d{did}/s{sc}/l{ls}/learn", "dialect_id": did, "series_title": ed.get("title", ""),
             "scene": sc, "lesson": ls, "theme": ref_theme.get((sc, ls), ""), "item_count": len(td),
             "audio_url_pattern": "https://web.klokah.tw/text/sound/{tid}/{id}.mp3", "did_ok": True, "text_data": td})
        res.append({"scene": sc, "lesson": ls, "item_count": len(td)})
dump(out / "essay" / "essay_index.json", {"module": "essay", "dialect_id": did, "results": res})
summary["essay"] = {"lessons_catalogued": sum(len(v) for k, v in ed.items() if k.startswith("S")), "lessons_with_text": len(res),
                    "items": sum(r["item_count"] for r in res)}

dump(out / "fetch_log.json", {"did": did, "fetched_at": time.strftime("%Y-%m-%d %H:%M %z"), "summary": summary, "errors": log})
print(json.dumps(summary, ensure_ascii=False, indent=1)); print("errors:", len(log))
