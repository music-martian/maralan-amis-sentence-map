#!/usr/bin/env python3
"""
Corpus-wide audit + auto-fix for maralan-amis-sentence-map.

Scans data/units/*.json, data/greetings.json, and syncs data.js GREETINGS.

Issue classes:
  1. missing_trailing_punct — amis ends with .!?。！？ but tokens don't
  2. punct_on_hang — sentence punct ids live in hang arrays → move to main group
  3. glued_semicolon — word token contains ;/； → split word + punct + word
  4. glottal_fix — restore/tighten U+02BC glottals; no space after leading glottal
  5. punct_glued — peel leading/trailing sentence punct off word tokens
  6. layout_orphan / one_word_broken — fix unresolved layout ids; one-word groups

Prints counts found & fixed, writes JSON in place, regenerates data.js from greetings.
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

SITE = Path(__file__).resolve().parent.parent
UNITS_DIR = SITE / "data" / "units"
GREETINGS_JSON = SITE / "data" / "greetings.json"
DATA_JS = SITE / "data.js"

GLOTTAL_CHARS = "'\u2019\u2018\u02bc\u02be\u02bb`"
GLOTTAL_RE = re.compile(f"[{re.escape(GLOTTAL_CHARS)}]")
SENT_PUNCT = ".!?。！？"
SENT_PUNCT_RE = re.compile(r"[.!?。！？]+$")
SENT_PUNCT_BASES = {"period", "q", "excl"}
PUNCT_CHARS = "¿¡?!！？。．.,，,;；:…/／\"\"「」『』（）()[]"
PUNCT_ONLY_RE = re.compile(r"^[" + re.escape(PUNCT_CHARS) + r"]+$")
LEAD_PUNCT_RE = re.compile(r"^[" + re.escape(PUNCT_CHARS) + r"]+")
TRAIL_PUNCT_RE = re.compile(r"[" + re.escape(PUNCT_CHARS) + r"]+$")
SEMI_RE = re.compile(r"[;；]")

COUNTS_FOUND: Dict[str, int] = defaultdict(int)
COUNTS_FIXED: Dict[str, int] = defaultdict(int)
EXAMPLES: Dict[str, List[str]] = defaultdict(list)
SKIPS: Dict[str, List[str]] = defaultdict(list)


def note(cls: str, uid: str, detail: str, *, found: bool = True, fixed: bool = False) -> None:
    if found:
        COUNTS_FOUND[cls] += 1
    if fixed:
        COUNTS_FIXED[cls] += 1
    if len(EXAMPLES[cls]) < 8:
        EXAMPLES[cls].append(f"{uid}: {detail}")


def skip(cls: str, uid: str, detail: str) -> None:
    if len(SKIPS[cls]) < 8:
        SKIPS[cls].append(f"{uid}: {detail}")


def norm_punct(p: str) -> str:
    return (
        str(p)
        .replace("。", ".")
        .replace("．", ".")
        .replace("？", "?")
        .replace("！", "!")
    )


def norm_glottal(text: str) -> str:
    if not text:
        return ""
    s = GLOTTAL_RE.sub("ʼ", text)
    # Only leading/word-initial: "ʼ Ateki" → "ʼAteki"
    def _tight(m: re.Match) -> str:
        return m.group(1) + "ʼ"
    s = re.sub(
        r"(^|[\s(（\[「『\"“‘])ʼ\s+(?=[A-Za-z\u00C0-\u024F])",
        _tight,
        s,
    )
    return s


def is_punct_text(text: str) -> bool:
    return bool(text) and bool(PUNCT_ONLY_RE.fullmatch(text))


def punct_id_base(ch: str) -> str:
    mapping = {
        ".": "period",
        "．": "period",
        "。": "period",
        "?": "q",
        "？": "q",
        "!": "excl",
        "！": "excl",
        ",": "comma",
        "，": "comma",
        ";": "semi",
        "；": "semi",
        "/": "slash",
        "／": "slash",
        ":": "colon",
    }
    return mapping.get(ch, "punct")


def is_sent_punct_id(tid: str) -> bool:
    base = re.sub(r"_\d+$", "", tid or "")
    return base in SENT_PUNCT_BASES


def is_sent_punct_tok(tok: Dict[str, Any]) -> bool:
    text = tok.get("text") or ""
    if tok.get("role") == "punct" and any(c in SENT_PUNCT for c in text):
        return True
    return is_sent_punct_id(tok.get("id") or "")


def unique_id(base: str, used: set) -> str:
    if base not in used:
        return base
    n = 2
    while f"{base}_{n}" in used:
        n += 1
    return f"{base}_{n}"


def replace_id_in_layout(layout: Dict[str, Any], old: str, new: str) -> None:
    groups = layout.get("groups") or []
    for g in groups:
        for i, tid in enumerate(g):
            if tid == old:
                g[i] = new
    hangs = layout.get("hangs") or {}
    new_hangs: Dict[str, List[str]] = {}
    for parent, kids in hangs.items():
        p = new if parent == old else parent
        new_hangs[p] = [new if k == old else k for k in kids]
    layout["hangs"] = new_hangs


def remove_id_from_hangs(layout: Dict[str, Any], tid: str) -> Optional[str]:
    """Remove tid from all hangs; return parent id if found."""
    hangs = layout.get("hangs") or {}
    found_parent = None
    for parent, kids in list(hangs.items()):
        if tid in kids:
            found_parent = parent
            hangs[parent] = [k for k in kids if k != tid]
            if not hangs[parent]:
                del hangs[parent]
    return found_parent


def ensure_id_on_main_group(layout: Dict[str, Any], tid: str, prefer_after: Optional[str] = None) -> None:
    groups = layout.setdefault("groups", [])
    for g in groups:
        if tid in g:
            return
    if not groups:
        groups.append([tid])
        return
    # Prefer group containing prefer_after (hang parent)
    target = None
    if prefer_after:
        for g in groups:
            if prefer_after in g:
                target = g
                break
    if target is None:
        target = groups[-1]
    if prefer_after and prefer_after in target:
        idx = target.index(prefer_after) + 1
        # skip existing punct already after parent? append near end of group
        target.insert(len(target), tid) if tid not in target else None
        if tid not in target:
            target.insert(idx, tid)
        # de-dupe if insert path weird
        while target.count(tid) > 1:
            target.remove(tid)
        if tid not in target:
            target.append(tid)
    else:
        target.append(tid)


def peel_edge_punct(text: str) -> Tuple[str, str, str]:
    """Return (lead_punct, core, trail_punct). Glottals stay in core."""
    if not text:
        return "", "", ""
    lead = ""
    trail = ""
    m = LEAD_PUNCT_RE.match(text)
    if m:
        lead = m.group(0)
        text = text[m.end() :]
    m = TRAIL_PUNCT_RE.search(text)
    if m:
        trail = m.group(0)
        text = text[: m.start()]
    return lead, text, trail


def make_punct_tok(ch: str, used: set) -> Dict[str, Any]:
    base = punct_id_base(ch)
    tid = unique_id(base, used)
    used.add(tid)
    return {"id": tid, "text": ch, "role": "punct", "gloss_zh": "", "gloss_en": ""}


def split_semicolon_text(text: str) -> List[str]:
    parts = re.split(r"([;；])", text)
    return [p for p in parts if p]


def audit_fix_sentence(unit_id: str, s: Dict[str, Any]) -> bool:
    """Mutate sentence in place. Return True if changed."""
    sid = f"{unit_id}#{s.get('id')}"
    changed = False
    amis = (s.get("amis") or "").strip()
    tokens: List[Dict[str, Any]] = s.setdefault("tokens", [])
    layout: Dict[str, Any] = s.setdefault("layout", {})
    if "groups" not in layout:
        layout["groups"] = []
    if "hangs" not in layout:
        layout["hangs"] = {}

    # --- 4. Glottal normalize / tighten (before other text peels) ---
    for t in tokens:
        if t.get("role") == "punct":
            continue
        old = t.get("text") or ""
        new = norm_glottal(old)
        if new != old:
            spaced = bool(re.search(r"\u02bc\s+[A-Za-z]", GLOTTAL_RE.sub("\u02bc", old)))
            cls = "glottal_spaced" if spaced else "glottal_unnormalized"
            note(cls, sid, f"{t.get('id')} {old!r} → {new!r}", fixed=True)
            t["text"] = new
            changed = True

    # Restore glottal stripped vs amis words (exact stripped-key match)
    def peel_word(w: str) -> str:
        w = LEAD_PUNCT_RE.sub("", w)
        w = TRAIL_PUNCT_RE.sub("", w)
        return w

    tok_by_key: Dict[str, List[Dict[str, Any]]] = {}
    for t in tokens:
        if t.get("role") == "punct":
            continue
        key = GLOTTAL_RE.sub("", norm_glottal(t.get("text") or "")).lower()
        tok_by_key.setdefault(key, []).append(t)
    for w in amis.split():
        aw = peel_word(w)
        an = norm_glottal(aw)
        if not GLOTTAL_RE.search(an):
            continue
        key = GLOTTAL_RE.sub("", an).lower()
        for t in tok_by_key.get(key) or []:
            cur = norm_glottal(t.get("text") or "")
            if not GLOTTAL_RE.search(cur):
                # restore from amis word, keep token casing if possible
                note("glottal_stripped", sid, f"{t.get('id')} {cur!r} → {an!r}", fixed=True)
                t["text"] = an
                changed = True

    # --- 5. Punct glued on word tokens ---
    new_tokens: List[Dict[str, Any]] = []
    used_ids = {t["id"] for t in tokens if t.get("id")}
    layout_id_rewrites: List[Tuple[str, List[str]]] = []  # old → [new ids in order]

    for tok in tokens:
        if tok.get("role") == "punct":
            new_tokens.append(tok)
            continue
        text = tok.get("text") or ""
        lead, core, trail = peel_edge_punct(text)
        if not lead and not trail:
            new_tokens.append(tok)
            continue
        note("punct_glued", sid, f"{tok.get('id')} {text!r}", fixed=True)
        changed = True
        orig_id = tok["id"]
        pieces: List[Dict[str, Any]] = []
        for ch in lead:
            pieces.append(make_punct_tok(ch, used_ids))
        if core:
            wt = dict(tok)
            wt["text"] = norm_glottal(core)
            pieces.append(wt)
        for ch in trail:
            pieces.append(make_punct_tok(ch, used_ids))
        if not pieces:
            new_tokens.append(tok)
            continue
        layout_id_rewrites.append((orig_id, [p["id"] for p in pieces]))
        new_tokens.extend(pieces)

    if layout_id_rewrites:
        for old, new_ids in layout_id_rewrites:
            if new_ids == [old]:
                continue
            groups = layout.get("groups") or []
            for g in groups:
                if old in g:
                    i = g.index(old)
                    g[i : i + 1] = new_ids
            hangs = layout.get("hangs") or {}
            for parent, kids in list(hangs.items()):
                if old in kids:
                    i = kids.index(old)
                    kids[i : i + 1] = new_ids
                if parent == old:
                    hangs[new_ids[0] if new_ids else old] = hangs.pop(parent)
    tokens[:] = new_tokens

    # --- 3. Glued semicolon ---
    newer: List[Dict[str, Any]] = []
    used_ids = {t["id"] for t in tokens if t.get("id")}
    for t in tokens:
        text = t.get("text") or ""
        if t.get("role") == "punct" or not SEMI_RE.search(text) or is_punct_text(text):
            newer.append(t)
            continue
        parts = split_semicolon_text(text)
        if len(parts) <= 1:
            newer.append(t)
            continue
        note("glued_semicolon", sid, f"{t.get('id')} {text!r}", fixed=True)
        changed = True
        piece_ids: List[str] = []
        first_word = True
        for p in parts:
            if SEMI_RE.fullmatch(p) or is_punct_text(p):
                pt = make_punct_tok(p, used_ids)
                newer.append(pt)
                piece_ids.append(pt["id"])
            else:
                if first_word:
                    nt = dict(t)
                    nt["text"] = norm_glottal(p)
                    newer.append(nt)
                    piece_ids.append(nt["id"])
                    first_word = False
                else:
                    base = re.sub(r"[^A-Za-z0-9]+", "", GLOTTAL_RE.sub("", p)).lower() or "w"
                    tid = unique_id(base, used_ids)
                    used_ids.add(tid)
                    newer.append({
                        "id": tid,
                        "text": norm_glottal(p),
                        "role": t.get("role") or "noun",
                        "gloss_zh": "",
                        "gloss_en": "",
                    })
                    piece_ids.append(tid)
        old = t["id"]
        groups = layout.get("groups") or []
        for g in groups:
            if old in g:
                i = g.index(old)
                g[i : i + 1] = piece_ids
        hangs = layout.get("hangs") or {}
        for parent, kids in list(hangs.items()):
            if old in kids:
                i = kids.index(old)
                kids[i : i + 1] = piece_ids
            if parent == old:
                hangs[piece_ids[0]] = hangs.pop(parent)
    tokens[:] = newer

    # --- 1. Missing trailing sentence punct ---
    m = SENT_PUNCT_RE.search(amis)
    if m:
        trailing = m.group(0)
        end_joined = ""
        for t in reversed(tokens):
            tx = t.get("text") or ""
            if t.get("role") == "punct" or is_punct_text(tx):
                end_joined = tx + end_joined
            else:
                break
        if not (end_joined and norm_punct(end_joined).endswith(norm_punct(trailing))):
            note("missing_trailing_punct", sid, f"amis ends {trailing!r}, tokens end {end_joined!r}", fixed=True)
            changed = True
            used_ids = {t["id"] for t in tokens if t.get("id")}
            # avoid duplicating partial trailing
            need = trailing
            if end_joined:
                n_end, n_need = norm_punct(end_joined), norm_punct(trailing)
                for k in range(min(len(n_end), len(n_need)), 0, -1):
                    if n_end.endswith(n_need[:k]):
                        need = trailing[k:]
                        break
            new_ids = []
            for ch in need:
                pt = make_punct_tok(ch, used_ids)
                tokens.append(pt)
                new_ids.append(pt["id"])
            for nid in new_ids:
                ensure_id_on_main_group(layout, nid)

    # --- 2. Sentence punct on hang row ---
    by_id = {t["id"]: t for t in tokens}
    hangs = layout.get("hangs") or {}
    for parent, kids in list(hangs.items()):
        for kid in list(kids):
            kt = by_id.get(kid)
            if (kt and is_sent_punct_tok(kt)) or is_sent_punct_id(kid):
                note("punct_on_hang", sid, f"hang[{parent}] ← {kid}", fixed=True)
                changed = True
                remove_id_from_hangs(layout, kid)
                ensure_id_on_main_group(layout, kid, prefer_after=parent)

    # --- 6. Layout orphans / one-word breakage ---
    by_id = {t["id"]: t for t in tokens}
    token_ids = set(by_id)
    groups = layout.get("groups") or []
    hangs = layout.get("hangs") or {}

    # Fix pred/pred2 id↔role drift for single-predicate one-group sentences
    content = [t for t in tokens if t.get("role") != "punct"]
    pred_like = [t for t in content if t.get("role") in ("pred", "pred2") or t.get("id") in ("pred", "pred2")]

    # Collect unresolved refs
    layout_ids: List[Tuple[str, str]] = []  # (where, id)
    for gi, g in enumerate(groups):
        for tid in g:
            layout_ids.append((f"groups[{gi}]", tid))
    for parent, kids in hangs.items():
        layout_ids.append((f"hangs.parent", parent))
        for kid in kids:
            layout_ids.append((f"hangs[{parent}]", kid))

    for where, tid in layout_ids:
        if tid in token_ids:
            continue
        # tolerate / fix pred↔pred2
        if tid == "pred2" and "pred" in token_ids:
            note("layout_orphan", sid, f"{where} pred2→pred", fixed=True)
            replace_id_in_layout(layout, "pred2", "pred")
            changed = True
            # also fix role if sole clause word
            tok = by_id["pred"]
            if tok.get("role") == "pred2" and len([t for t in content if t.get("role") in ("pred", "pred2")]) <= 1:
                tok["role"] = "pred"
                note("one_word_broken", sid, "role pred2→pred", fixed=True)
            continue
        if tid == "pred" and "pred2" in token_ids:
            note("layout_orphan", sid, f"{where} pred→pred2", fixed=True)
            replace_id_in_layout(layout, "pred", "pred2")
            changed = True
            continue
        # role-based rescue
        role_hit = next((t for t in tokens if t.get("role") == tid), None)
        if role_hit:
            note("layout_orphan", sid, f"{where} {tid}→{role_hit['id']} (via role)", fixed=True)
            replace_id_in_layout(layout, tid, role_hit["id"])
            changed = True
            continue
        note("layout_orphan", sid, f"{where} unresolved {tid}", fixed=False)
        skip("layout_orphan", sid, f"left unresolved {tid}")

    # One-word: ensure group references real token id
    content = [t for t in tokens if t.get("role") != "punct"]
    if len(content) == 1:
        cid = content[0]["id"]
        # normalize solo pred2 → pred
        if content[0].get("role") == "pred2":
            note("one_word_broken", sid, f"solo role pred2→pred on {cid}", fixed=True)
            content[0]["role"] = "pred"
            changed = True
        groups = layout.get("groups") or []
        if not any(cid in g for g in groups):
            note("one_word_broken", sid, f"groups missing {cid}: {groups}", fixed=True)
            changed = True
            # rewrite pred2 refs or rebuild
            if groups and len(groups) == 1:
                # replace unknown pred* with cid; keep punct ids
                new_g = []
                for tid in groups[0]:
                    if tid in token_ids:
                        new_g.append(tid)
                    elif tid in ("pred", "pred2"):
                        if cid not in new_g:
                            new_g.append(cid)
                    else:
                        new_g.append(tid)
                if cid not in new_g:
                    new_g.insert(0, cid)
                layout["groups"] = [new_g]
            else:
                punct_ids = [t["id"] for t in tokens if t.get("role") == "punct"]
                layout["groups"] = [[cid] + punct_ids]
                layout["hangs"] = {}

    # Ensure every token appears somewhere in layout (append orphans to last main group)
    by_id = {t["id"]: t for t in tokens}
    token_ids = set(by_id)
    present = set()
    for g in layout.get("groups") or []:
        present.update(g)
    for parent, kids in (layout.get("hangs") or {}).items():
        present.add(parent)
        present.update(kids)
    for t in tokens:
        if t["id"] not in present:
            if t.get("role") == "punct" and is_sent_punct_tok(t):
                note("layout_orphan", sid, f"token {t['id']} not in layout → main", fixed=True)
                ensure_id_on_main_group(layout, t["id"])
                changed = True
            elif len(content) == 1 and t["id"] == content[0]["id"]:
                note("one_word_broken", sid, f"token {t['id']} not in layout", fixed=True)
                ensure_id_on_main_group(layout, t["id"])
                changed = True
            else:
                # non-punct content missing from layout — append to avoid invisible beads
                note("layout_orphan", sid, f"token {t['id']} not in layout → append", fixed=True)
                ensure_id_on_main_group(layout, t["id"])
                changed = True

    return changed


def write_data_js_from_greetings(greetings: Dict[str, Any]) -> None:
    payload = {
        "source": greetings.get("source") or "",
        "dialect": greetings.get("dialect") or "馬蘭阿美語",
        "unit": greetings.get("unit") or "問候道別謝謝",
        "class_id": greetings.get("class_id") or "16",
        "footer": greetings.get("footer") or "Klokah 句型篇國中版 · 馬蘭阿美語 · 問候道別謝謝",
        "sentences": greetings.get("sentences") or [],
    }
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    js = (
        "/** Greetings unit fallback — inlined so file:// works without fetch. */\n"
        f"const GREETINGS = {body};\n"
        "if (typeof window !== 'undefined') window.GREETINGS = GREETINGS;\n"
    )
    DATA_JS.write_text(js, encoding="utf-8")


def load_unit(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    files_changed = 0
    sentences_changed = 0
    sentences_total = 0

    unit_paths = sorted(UNITS_DIR.glob("*.json"))
    for path in unit_paths:
        data = load_unit(path)
        uid = data.get("id") or path.stem
        file_changed = False
        for s in data.get("sentences") or []:
            sentences_total += 1
            if audit_fix_sentence(uid, s):
                sentences_changed += 1
                file_changed = True
        if file_changed:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            files_changed += 1

    greetings = load_unit(GREETINGS_JSON) if GREETINGS_JSON.exists() else None
    if greetings:
        g_changed = False
        for s in greetings.get("sentences") or []:
            sentences_total += 1
            if audit_fix_sentence("greetings", s):
                sentences_changed += 1
                g_changed = True
        if g_changed:
            GREETINGS_JSON.write_text(
                json.dumps(greetings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            files_changed += 1
        # Always sync data.js from greetings (keeps inline fallback identical)
        write_data_js_from_greetings(greetings)
        print("Synced data.js from data/greetings.json")

    # Align junior_type2_class16 with greetings when both exist (canonical hand-tune)
    jpath = UNITS_DIR / "junior_type2_class16.json"
    if greetings and jpath.exists():
        jdata = load_unit(jpath)
        # Keep unit metadata; sync sentence 07+ any fixed greetings sentences by id
        g_by_id = {s["id"]: s for s in greetings.get("sentences") or []}
        synced = False
        for s in jdata.get("sentences") or []:
            gs = g_by_id.get(s.get("id"))
            if gs and (s.get("tokens") != gs.get("tokens") or s.get("layout") != gs.get("layout")):
                s["tokens"] = deepcopy(gs["tokens"])
                s["layout"] = deepcopy(gs["layout"])
                if "structure" in gs:
                    s["structure"] = gs["structure"]
                synced = True
        if synced:
            jpath.write_text(json.dumps(jdata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print("Synced junior_type2_class16.json sentences from greetings")
            files_changed += 1

    print("=== Corpus audit+fix ===")
    print(f"sentences scanned: {sentences_total}")
    print(f"sentences changed: {sentences_changed}")
    print(f"files written: {files_changed}")
    print("\n-- counts found / fixed --")
    all_cls = sorted(set(COUNTS_FOUND) | set(COUNTS_FIXED) | set(EXAMPLES))
    if not all_cls:
        print("  (none)")
    for cls in all_cls:
        print(f"  {cls}: found={COUNTS_FOUND[cls]} fixed={COUNTS_FIXED[cls]}")
        for ex in EXAMPLES.get(cls) or []:
            print(f"    e.g. {ex}")
    if SKIPS:
        print("\n-- intentional / remaining skips --")
        for cls, items in SKIPS.items():
            for it in items:
                print(f"  {cls}: {it}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
