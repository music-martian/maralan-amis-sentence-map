#!/usr/bin/env python3
"""
Build Maralan Amis sentence-map corpus from Klokah gather materials.

Reads junior/senior/talk/dialogue/essay JSON under materials/,
auto-tokenizes + heuristic role-tags, emits:
  - maralan-amis-sentence-map/data/catalog.json
  - maralan-amis-sentence-map/data/units/*.json
  - maralan-amis-sentence-map/catalog.js  (catalog inlined for Pages)
  - maralan-amis-sentence-map/data.js     (hand-tuned greetings fallback)

Auto-tagging is best-effort for learning maps — not linguistic gold.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_HERE = Path(__file__).resolve().parent
# Support both:
#   maralan-amis/scripts/build_corpus.py
#   maralan-amis-sentence-map/scripts/build_corpus.py (mirrored)
if (_HERE.parent / "materials").is_dir():
    ROOT = _HERE.parent
    SITE = ROOT.parent / "maralan-amis-sentence-map"
    if not SITE.is_dir():
        # materials-only tree without sibling site name match
        SITE = ROOT.parent / "maralan-amis-sentence-map"
else:
    SITE = _HERE.parent
    ROOT = SITE.parent / "maralan-amis"
MATERIALS = ROOT / "materials"
UNITS_DIR = SITE / "data" / "units"
CATALOG_JSON = SITE / "data" / "catalog.json"

# Glottal-stop letters in Amis (never sentence punctuation)
GLOTTAL_CHARS = "'\u2019\u2018\u02bc\u02be\u02bb`"  # ' ’ ‘ ʼ ʾ ʻ `
GLOTTAL_RE = re.compile(f"[{re.escape(GLOTTAL_CHARS)}]")
# Legacy alias
APOS_CHARS = GLOTTAL_CHARS
APOS_RE = GLOTTAL_RE  # normalize ALL glottals (lead/mid/trail) → U+02BC

CASE_MARKERS = {"ko", "ku", "no", "nu", "to", "i"}
# "i" is also locative/particle — handled carefully

PRONOUNS = {
    "kako", "kiso", "miso", "mako", "mito", "namo", "naira",
    "kita", "kami", "kamo", "ako", "iso", "ira",
    "tisowanan", "takowanan", "tamowanan", "tamiyanan", "tamianan",
    "noka", "niyam", "nito", "nira", "nina", "nia",
    "mapolong",
}

FINAL_PARTICLES = {"i", "haw", "saw", "a", "han", "sa"}
ADVERBS = {"mamaan", "anini", "anocila", "iraay", "cowa", "caay", "awa"}

# Fixed Chinese glosses for function words (match greetings prototype style)
FUNCTION_GLOSS_ZH = {
    "ko": "主格", "ku": "主格",
    "no": "屬格", "nu": "屬格",
    "to": "斜格",
    "i": "在",
    "a": "連繫",
    "haw": "助詞", "saw": "助詞", "han": "助詞", "sa": "助詞",
    "kako": "我", "kiso": "你", "miso": "你", "mako": "我的",
    "mito": "我們", "namo": "你們", "naira": "他們",
    "kita": "咱們", "kami": "我們", "kamo": "你們",
    "ako": "我的", "iso": "你的", "ira": "他的",
    "cima": "誰", "maan": "什麼", "icowa": "哪裡",
    "mamaan": "也", "mamaanay": "怎麼了",
    "o": "主題",
}

_LEXICON_CACHE: Optional[Dict[str, str]] = None


KLOKAH_HUB = "https://klokah.iformosa.com.tw"
KLOKAH_DID = "4"


def source_url_sentence(level: str, type_id: Any, class_id: Any) -> str:
    """Canonical sentence learn URL with Maralan did=4 in the path."""
    return f"{KLOKAH_HUB}/sentence/{level}/learn/{KLOKAH_DID}/{type_id}/{class_id}"


def source_url_talk(book_id: Any) -> str:
    """Talk URLs have no did in path; click handler sets dialect cookie."""
    return f"{KLOKAH_HUB}/talk/learn/{book_id}"


def source_url_dialogue(scene: Any, stage: Any) -> str:
    return f"{KLOKAH_HUB}/dialogue/d{KLOKAH_DID}/s{scene}/l{stage}/talking"


def source_url_essay(scene: Any, lesson: Any) -> str:
    return f"{KLOKAH_HUB}/essay/d{KLOKAH_DID}/s{scene}/l{lesson}/learn"




def lexicon_key(amis: str) -> str:
    t = normalize_amis(amis).lower().strip()
    t = re.sub(r"[?!！？。．，,;:]+", "", t).strip()
    return t


def build_lexicon() -> Dict[str, str]:
    """Merge type-1 vocab word_ab→word_ch + function glosses + hand-tuned tokens."""
    global _LEXICON_CACHE
    if _LEXICON_CACHE is not None:
        return _LEXICON_CACHE
    lex: Dict[str, str] = dict(FUNCTION_GLOSS_ZH)
    # Prefer short, learner-friendly case glosses over long Klokah labels later
    for p in list(MATERIALS.glob("junior_type1_*.json")) + list(MATERIALS.glob("senior_type1_*.json")):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        for item in d.get("learn_data") or []:
            ab = (item.get("word_ab") or "").strip()
            ch = (item.get("word_ch") or "").strip()
            if not ab or not ch:
                continue
            # simplify long meta labels
            for part in re.split(r"\s*/\s*", ab):
                k = lexicon_key(part)
                if not k:
                    continue
                # don't overwrite short function glosses with verbose dictionary notes
                if k in FUNCTION_GLOSS_ZH:
                    continue
                if k not in lex:
                    # trim parenthetical clutter a bit for bead labels
                    short = re.sub(r"[（(][^）)]*[）)]", "", ch).strip() or ch
                    if len(short) > 8:
                        short = short[:8]
                    lex[k] = short
    # Hand-tuned greetings tokens
    for s in load_hand_tuned_greetings():
        for tok in s.get("tokens") or []:
            k = lexicon_key(tok.get("text") or "")
            g = (tok.get("gloss_zh") or "").strip()
            if k and g:
                lex[k] = g
    # Always prefer 在 for Amis i / I (locative / particle)
    lex["i"] = "在"
    _LEXICON_CACHE = lex
    return lex


def gloss_zh_for(text: str, role: str, sentence_zh: str = "", n_tokens: int = 0) -> str:
    if role == "punct":
        return ""
    lex = build_lexicon()
    k = lexicon_key(text)
    if k in lex:
        return lex[k]
    # Single-token sentence: whole Chinese line is the gloss
    if n_tokens == 1 and sentence_zh:
        short = re.sub(r"[（(][^）)]*[）)]", "", sentence_zh).strip() or sentence_zh
        return short[:10]
    # Role fallbacks
    if role == "case":
        return {"ko": "主格", "ku": "主格", "no": "屬格", "nu": "屬格", "to": "斜格", "i": "在"}.get(k, "格標記")
    if role == "particle":
        return "助詞"
    if role == "adverb":
        return "副詞"
    return ""



HAND_TUNED_GREETINGS: Optional[List[Dict[str, Any]]] = None


def _force_i_gloss_zai(sentences: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Ensure Amis word i / I always glosses as 在 in hand-tuned tokens."""
    for s in sentences or []:
        for tok in s.get("tokens") or []:
            if (tok.get("text") or "").strip().lower() == "i":
                tok["gloss_zh"] = "在"
    return sentences


def load_hand_tuned_greetings() -> List[Dict[str, Any]]:
    """Prefer existing hand-tuned greetings from site data.js / greetings.json."""
    global HAND_TUNED_GREETINGS
    if HAND_TUNED_GREETINGS is not None:
        return HAND_TUNED_GREETINGS
    candidates = [
        SITE / "data" / "greetings.json",
        SITE / "data.js",
    ]
    for p in candidates:
        if not p.exists():
            continue
        raw = p.read_text(encoding="utf-8")
        if p.suffix == ".json":
            data = json.loads(raw)
            HAND_TUNED_GREETINGS = _force_i_gloss_zai(data.get("sentences") or [])
            return HAND_TUNED_GREETINGS
        # strip JS wrapper
        m = re.search(r"const GREETINGS\s*=\s*(\{.*?\});\s*if\s*\(typeof", raw, re.S)
        if not m:
            m = re.search(r"=\s*(\{.*\"sentences\".*\});\s*(?:if|window)", raw, re.S)
        if m:
            data = json.loads(m.group(1))
            HAND_TUNED_GREETINGS = _force_i_gloss_zai(data.get("sentences") or [])
            return HAND_TUNED_GREETINGS
    HAND_TUNED_GREETINGS = []
    return HAND_TUNED_GREETINGS


def normalize_amis(text: str) -> str:
    if not text:
        return ""
    t = text.strip()
    # Glottals are letters: normalize every form to U+02BC MODIFIER LETTER APOSTROPHE
    t = GLOTTAL_RE.sub("ʼ", t)
    # Leading/word-initial only: "ʼ Ateki" → "ʼAteki" (never "lomaʼ namo")
    def _tight_lead_glottal(m: re.Match) -> str:
        return m.group(1) + "ʼ"
    t = re.sub(
        r"(^|[\s(（\[「『\"“‘])ʼ\s+(?=[A-Za-z\u00C0-\u024F])",
        _tight_lead_glottal,
        t,
    )
    t = re.sub(r"\s+", " ", t)
    return t


def norm_key(amis: str) -> str:
    t = normalize_amis(amis).lower()
    t = re.sub(r"[?!！？。．，,;；:]+$", "", t).strip()
    t = re.sub(r"\s+", " ", t)
    return t


def tokenize(amis: str) -> List[str]:
    """Split on whitespace; keep punctuation as standalone tokens (incl. /／;；)."""
    amis = normalize_amis(amis)
    if not amis:
        return []
    tokens: List[str] = []
    for raw in amis.split():
        tokens.extend(_split_token_keep_punct(raw))
    return tokens


# Punctuation shown as plain text between/after word beads (not inside capsules).
# NOTE: glottal letters are NOT punctuation — keep them on word tokens.
PUNCT_CHARS = "¿¡?!！？。．.,，,;；:…/／\"\"「」『』（）()[]"
PUNCT_RE = re.compile(r"^[" + re.escape(PUNCT_CHARS) + r"]+$")
LEAD_PUNCT_RE = re.compile(r"^[" + re.escape(PUNCT_CHARS) + r"]+")
TRAIL_PUNCT_RE = re.compile(r"[" + re.escape(PUNCT_CHARS) + r"]+$")


def is_punct(tok: str) -> bool:
    return bool(tok) and bool(PUNCT_RE.fullmatch(tok))


def strip_punct(tok: str) -> str:
    """Strip edge sentence-punct only; keep glottal letters attached to the word."""
    if not tok:
        return ""
    return re.sub(
        r"^[^\w\u02bc\u2019\u2018\u02be\u02bb']+|[^\w\u02bc\u2019\u2018\u02be\u02bb']+$",
        "",
        tok,
        flags=re.UNICODE,
    )


def _split_token_keep_punct(tok: str) -> List[str]:
    """Peel leading/trailing punct into separate tokens; split internal /／;；.

    Glottal letters are NOT in PUNCT_CHARS — they stay inside word beads.
    Trailing sentence punct is peeled here; build_layout keeps it on the main
    group (never inside hang arrays).
    """
    if not tok:
        return []
    if is_punct(tok):
        # emit each punct char separately so ?! become two beads
        return list(tok)

    out: List[str] = []
    m_lead = LEAD_PUNCT_RE.match(tok)
    if m_lead:
        out.extend(list(m_lead.group(0)))
        tok = tok[m_lead.end() :]

    trail = ""
    m_trail = TRAIL_PUNCT_RE.search(tok)
    if m_trail:
        trail = m_trail.group(0)
        tok = tok[: m_trail.start()]

    if tok:
        # split on internal slash/semicolon, keep punctuation as its own token
        parts = re.split(r"([/／;；])", tok)
        for p in parts:
            if p:
                out.append(p)

    if trail:
        out.extend(list(trail))
    return out


def _punct_id_base(tok: str) -> str:
    mapping = {
        "/": "slash",
        "／": "slash",
        "?": "q",
        "？": "q",
        "!": "excl",
        "！": "excl",
        ".": "period",
        "。": "period",
        "．": "period",
        ",": "comma",
        "，": "comma",
        ";": "semi",
        "；": "semi",
        ":": "colon",
        "…": "ellipsis",
        "「": "lq",
        "」": "rq",
        "『": "lq2",
        "』": "rq2",
        '"': "quot",
        "\u201c": "quot",
        "\u201d": "quot",
        "'": "apos",
        "（": "lparen",
        "）": "rparen",
        "(": "lparen",
        ")": "rparen",
        "[": "lbracket",
        "]": "rbracket",
    }
    if tok in mapping:
        return mapping[tok]
    return "punc"


def tag_roles(tokens: List[str]) -> List[Dict[str, Any]]:
    """Heuristic Amis role tagging. Best-effort. Punct → role punct (kept)."""
    n = len(tokens)
    roles: List[Optional[str]] = [None] * n
    lowers = [strip_punct(t).lower() for t in tokens]

    # Mark punctuation first
    for i, t in enumerate(tokens):
        if is_punct(t) or not lowers[i]:
            if is_punct(t) or not strip_punct(t):
                roles[i] = "punct"

    # Clause split indices (comma tokens)
    clause_starts = [0]
    for i, t in enumerate(tokens):
        if t in {",", "，"} or (roles[i] != "punct" and (t.endswith(",") or t.endswith("，"))):
            if i + 1 < n:
                clause_starts.append(i + 1)

    # Mark case markers (standalone)
    for i, low in enumerate(lowers):
        if roles[i] == "punct":
            continue
        if not low:
            continue
        if low in {"ko", "ku", "no", "nu", "to"}:
            roles[i] = "case"
        elif low == "i":
            # sentence-final i (ignore trailing punct when deciding)
            j = i + 1
            while j < n and roles[j] == "punct":
                j += 1
            if j >= n:
                roles[i] = "particle"  # sentence-final i
            else:
                # locative case-like before content
                roles[i] = "case"

    # Pronouns / known adverbs / special preds
    for i, low in enumerate(lowers):
        if roles[i]:
            continue
        if low in PRONOUNS:
            roles[i] = "pronoun"
        elif low == "mamaan":
            roles[i] = "adverb"
        elif low == "mamaanay":
            roles[i] = "pred"
        elif low in {"cima", "maan", "icowa", "pina", "kala", "sakamaan"} and i == 0:
            roles[i] = "pred"
        elif low in FINAL_PARTICLES:
            # final among content (ignore trailing punct)
            j = i + 1
            while j < n and roles[j] == "punct":
                j += 1
            if j >= n:
                roles[i] = "particle"
        elif low in ADVERBS:
            roles[i] = "adverb"

    # First content word of each clause → pred / pred2 (if none yet)
    for ci, start in enumerate(clause_starts):
        end = clause_starts[ci + 1] if ci + 1 < len(clause_starts) else n
        already = any(
            roles[i] in {"pred", "pred2"} for i in range(start, end) if roles[i]
        )
        if already:
            continue
        for i in range(start, end):
            if roles[i]:
                continue
            low = lowers[i]
            if not low or roles[i] == "punct" or is_punct(tokens[i]):
                continue
            # skip leftover case
            if low in CASE_MARKERS:
                roles[i] = "case"
                continue
            roles[i] = "pred" if ci == 0 else "pred2"
            break

    # Remaining → noun (default content)
    for i in range(n):
        if roles[i] is None:
            if is_punct(tokens[i]) or not lowers[i]:
                roles[i] = "punct"
            else:
                roles[i] = "noun"

    out = []
    used_ids: Dict[str, int] = {}
    for i, tok in enumerate(tokens):
        role = roles[i] or "noun"
        if role == "punct":
            base = _punct_id_base(tok)
        else:
            # Ids stay ASCII-ish: drop glottals so leading glottal words keep stable ids
            base = re.sub(r"[^A-Za-z0-9]+", "", strip_punct(tok)) or f"t{i}"
            base = base.lower() or f"t{i}"
        # stable-ish ids
        if role == "pred" and "pred" not in used_ids:
            tid = "pred"
        elif role == "pred2" and "pred2" not in used_ids:
            tid = "pred2"
        else:
            c = used_ids.get(base, 0)
            used_ids[base] = c + 1
            tid = base if c == 0 else f"{base}_{c + 1}"
            used_ids[tid] = 1
        used_ids[tid] = used_ids.get(tid, 0) + 1
        # ensure uniqueness
        while any(x["id"] == tid for x in out):
            used_ids[base] = used_ids.get(base, 0) + 1
            tid = f"{base}_{used_ids[base]}"
        if role == "punct":
            out.append({
                "id": tid,
                "text": tok,
                "role": "punct",
                "gloss_zh": "",
                "gloss_en": "",
            })
        else:
            out.append({
                "id": tid,
                "text": strip_punct(tok) or tok,
                "role": role,
                "gloss_zh": "",  # filled later in make_sentence
                "gloss_en": "",
            })
    return out


def build_layout(tokens: List[Dict[str, Any]], amis: str) -> Dict[str, Any]:
    """Build groups / hangs / plus_between_groups from tagged tokens."""
    ids = [t["id"] for t in tokens]
    by_id = {t["id"]: t for t in tokens}
    n = len(tokens)

    if n == 0:
        return {"groups": [], "hangs": {}, "plus_between_groups": False, "structure": ""}

    # Long sentence: linear bead layout, no complex hangs (count content only)
    content_n = sum(1 for t in tokens if t.get("role") != "punct")
    if content_n > 12:
        return {
            "groups": [ids],
            "hangs": {},
            "plus_between_groups": False,
            "structure": "長句：線性排列（自動標記，結構簡化）",
        }

    # Detect clause split on comma tokens
    comma_idxs = [
        i for i, t in enumerate(tokens)
        if t["text"] in {",", "，"} or t["text"].endswith(",") or t["text"].endswith("，")
    ]

    groups: List[List[str]] = []
    hangs: Dict[str, List[str]] = {}
    plus = False

    def split_range(start: int, end: int) -> List[str]:
        return [tokens[i]["id"] for i in range(start, end)]

    if comma_idxs or re.search(r"[,，]", amis):
        # Two (or more) groups
        cuts = [0]
        for ci in comma_idxs:
            # drop comma from group membership optionally — keep in left group then start next
            cuts.append(ci + 1)
        cuts.append(n)
        # build groups skipping lone comma-only starts
        for gi in range(len(cuts) - 1):
            a, b = cuts[gi], cuts[gi + 1]
            gids = []
            for i in range(a, b):
                # keep punct (incl. commas) in linear group order between neighbors
                gids.append(tokens[i]["id"])
            if gids:
                groups.append(gids)
        if len(groups) >= 2:
            plus = True
        elif not groups:
            groups = [ids]
    else:
        groups = [ids[:]]

    # Genitive hang: pattern case(ko|ku) + noun + case(no|nu) + possessor
    # Hang no+possessor under the noun
    def apply_hangs(group: List[str]) -> List[str]:
        new_group = []
        i = 0
        while i < len(group):
            tid = group[i]
            tok = by_id[tid]
            # punctuation never participates in hang heuristics
            if tok.get("role") == "punct":
                new_group.append(tid)
                i += 1
                continue
            # look ahead for ko X no Y
            if (
                i + 3 < len(group)
                and tok["role"] == "case"
                and strip_punct(tok["text"]).lower() in {"ko", "ku"}
                and by_id[group[i + 1]]["role"] in {"noun", "pronoun", "pred", "pred2"}
                and by_id[group[i + 2]]["role"] == "case"
                and strip_punct(by_id[group[i + 2]]["text"]).lower() in {"no", "nu"}
            ):
                noun_id = group[i + 1]
                no_id = group[i + 2]
                poss_id = group[i + 3]
                new_group.append(tid)
                new_group.append(noun_id)
                hang_ids = [no_id, poss_id]
                i += 4
                hangs[noun_id] = hang_ids
                # Trailing sentence punct after hang chain → main group (top row)
                while i < len(group) and by_id[group[i]].get("role") == "punct":
                    new_group.append(group[i])
                    i += 1
                continue
            # also: noun no possessor without leading ko still in group
            if (
                i + 2 < len(group)
                and tok["role"] in {"noun", "pronoun"}
                and by_id[group[i + 1]]["role"] == "case"
                and strip_punct(by_id[group[i + 1]]["text"]).lower() in {"no", "nu"}
            ):
                no_id = group[i + 1]
                poss_id = group[i + 2]
                new_group.append(tid)
                hang_ids = [no_id, poss_id]
                i += 3
                hangs[tid] = hang_ids
                # Trailing sentence punct after hang chain → main group (top row)
                while i < len(group) and by_id[group[i]].get("role") == "punct":
                    new_group.append(group[i])
                    i += 1
                continue
            new_group.append(tid)
            i += 1
        return new_group

    groups = [apply_hangs(g) for g in groups]

    # Safety: sentence-final punct must stay on the main/top row, never in hangs.
    SENT_PUNCT_TEXTS = {".", "．", "。", "?", "？", "!", "！"}

    def _is_sent_punct_id(tid: str) -> bool:
        tok = by_id.get(tid)
        if tok and tok.get("role") == "punct" and (tok.get("text") or "") in SENT_PUNCT_TEXTS:
            return True
        base = re.sub(r"_\d+$", "", tid or "")
        return base in {"period", "q", "excl"}

    for parent, kids in list(hangs.items()):
        kept = []
        moved = []
        for kid in kids:
            if _is_sent_punct_id(kid):
                moved.append(kid)
            else:
                kept.append(kid)
        if moved:
            hangs[parent] = kept
            if not kept:
                del hangs[parent]
            placed = False
            for g in groups:
                if parent in g:
                    for mid in moved:
                        if mid not in g:
                            g.append(mid)
                    placed = True
                    break
            if not placed and groups:
                for mid in moved:
                    if mid not in groups[-1]:
                        groups[-1].append(mid)

    # structure note
    pred_texts = [t["text"] for t in tokens if t["role"] in {"pred", "pred2"}]
    if plus:
        structure = "兩句以 ＋ 連接（自動切分）"
    elif hangs:
        structure = "謂語為中心；屬格 no/nu 掛於名詞下（自動）"
    elif pred_texts:
        structure = f"謂語 {pred_texts[0]} 為中心（自動標記）"
    else:
        structure = "線性排列（自動標記）"

    return {
        "groups": groups,
        "hangs": hangs,
        "plus_between_groups": plus,
        "structure": structure,
    }


def make_sentence(
    sid: str,
    amis: str,
    zh: str,
    en: str = "",
    audio: str = "",
    audio_primary: Optional[bool] = None,
    audio_note: str = "",
) -> Optional[Dict[str, Any]]:
    amis = normalize_amis(amis)
    zh = (zh or "").strip()
    if not amis:
        return None
    toks = tokenize(amis)
    tagged = tag_roles(toks)
    # One-word / single-clause: never leave a lone pred2 (breaks layout ids)
    content_tagged = [t for t in tagged if t.get("role") != "punct"]
    if len(content_tagged) == 1 and content_tagged[0].get("role") == "pred2":
        content_tagged[0]["role"] = "pred"
        if content_tagged[0].get("id") == "pred2":
            content_tagged[0]["id"] = "pred"
    n_content = sum(1 for t in tagged if t.get("role") != "punct")
    # Fill Chinese bead glosses (prototype style)
    for t in tagged:
        if t.get("role") == "punct":
            t["gloss_zh"] = ""
        else:
            t["gloss_zh"] = gloss_zh_for(
                t.get("text") or "", t.get("role") or "", zh, n_content
            )
            if (t.get("text") or "").strip().lower() == "i":
                t["gloss_zh"] = "在"
        t["gloss_en"] = t.get("gloss_en") or ""
    layout = build_layout(tagged, amis)
    s: Dict[str, Any] = {
        "id": sid,
        "amis": amis,
        "zh": zh,
        "en": en or "",
        "tokens": tagged,
        "layout": layout,
        "structure": layout.get("structure", ""),
    }
    if audio:
        s["audio"] = audio
    if audio_primary is not None:
        s["audio_primary"] = audio_primary
    if audio_note:
        s["audio_note"] = audio_note
    return s


# ---------- extractors for material shapes ----------

def extract_from_learn_item(item: Dict[str, Any]) -> List[Tuple[str, str, str, str, bool]]:
    """
    Return list of (amis, zh, audio, tag, is_primary_for_audio).
    """
    out: List[Tuple[str, str, str, str, bool]] = []

    def add(ab, ch, au, tag, primary=True):
        ab = (ab or "").strip()
        if ab:
            out.append((ab, (ch or "").strip(), (au or "").strip(), tag, primary))

    # sentence A/B/C exchange
    shared_au = item.get("sentence_audio") or ""
    for i, L in enumerate("ABC"):
        ab = item.get(f"sentence{L}_ab")
        if ab and str(ab).strip():
            add(ab, item.get(f"sentence{L}_ch"), shared_au, f"s{L}", primary=(i == 0))

    if item.get("word_ab"):
        add(item["word_ab"], item.get("word_ch"), item.get("word_audio"), "word")
    if item.get("recognize_ab"):
        add(item["recognize_ab"], item.get("recognize_ch"), item.get("recognize_audio"), "rec")
    if item.get("pictureTalk_ab"):
        add(item["pictureTalk_ab"], item.get("pictureTalk_ch"), item.get("pictureTalk_audio"), "pt")
    if item.get("choiceThree_ab"):
        add(item["choiceThree_ab"], item.get("choiceThree_ch"), item.get("choiceThree_audio"), "c3")

    shared_c1 = item.get("choiceOne_audio") or ""
    for i, L in enumerate("ABC"):
        ab = item.get(f"choiceOne{L}_ab")
        if ab and str(ab).strip():
            au = item.get(f"choiceOne{L}_audio") or shared_c1
            add(ab, item.get(f"choiceOne{L}_ch"), au, f"c1{L}", primary=True)

    for L in "ABC":
        ab = item.get(f"choiceTwo{L}_ab")
        if ab and str(ab).strip():
            add(ab, item.get(f"choiceTwo{L}_ch"), item.get(f"choiceTwo{L}_audio"), f"c2{L}")

    for L in "ABCDE":
        ab = item.get(f"dialogue{L}_ab")
        if ab and str(ab).strip():
            add(ab, item.get(f"dialogue{L}_ch"), item.get(f"dialogue{L}_audio"), f"d{L}")
        ab = item.get(f"oralReading{L}_ab")
        if ab and str(ab).strip():
            add(ab, item.get(f"oralReading{L}_ch"), item.get(f"oralReading{L}_audio"), f"or{L}")

    for L in "ABCDE":
        for side in "AB":
            ab = item.get(f"match{L}_ab_{side}")
            if ab and str(ab).strip():
                add(ab, item.get(f"match{L}_ch_{side}"), item.get(f"match{L}_audio"), f"m{L}{side}")

    return out


def sentences_from_unit_file(
    path: Path,
    unit_id: str,
    hand_tuned: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[Dict[str, Any], int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    sentences: List[Dict[str, Any]] = []
    seen: set = set()

    # Prefer hand-tuned for greetings class
    if hand_tuned:
        return (
            {
                "id": unit_id,
                "module": "junior",
                "type_id": str(data.get("type_id", "2")),
                "type_name": data.get("type_name") or "生活百句",
                "class_id": str(data.get("class_id", "16")),
                "title": data.get("class_name") or "問候道別謝謝",
                "source_url": source_url_sentence("junior", data.get("type_id", "2"), data.get("class_id", "16")),
                "dialect": "馬蘭阿美語",
                "hand_tuned": True,
                "sentences": hand_tuned,
            },
            len(hand_tuned),
        )

    seq = 0
    for item in data.get("learn_data") or []:
        extracted = extract_from_learn_item(item)
        for amis, zh, audio, tag, primary in extracted:
            key = norm_key(amis)
            if not key or key in seen:
                continue
            seen.add(key)
            seq += 1
            note = ""
            if tag.startswith("s") and tag != "sA":
                note = "音訊為整段對話（含前後句），非單句錄音"
            elif tag.startswith("s"):
                note = "音訊為 Klokah 對話段（可能含多句）"
            s = make_sentence(
                sid=f"{seq:03d}",
                amis=amis,
                zh=zh,
                en="",
                audio=audio,
                audio_primary=primary if tag.startswith("s") else True,
                audio_note=note,
            )
            if s:
                if tag.startswith("s"):
                    s["audio_exchange"] = f"ex{item.get('order', seq)}"
                sentences.append(s)

    level = data.get("level") or ("junior" if "junior" in path.name else "senior")
    type_id = str(data.get("type_id", ""))
    class_id = str(data.get("class_id", ""))
    meta = {
        "id": unit_id,
        "module": level,
        "type_id": type_id,
        "type_name": data.get("type_name") or "",
        "class_id": class_id,
        "title": data.get("class_name") or unit_id,
        "source_url": source_url_sentence(level, type_id, class_id),
        "dialect": "馬蘭阿美語",
        "sentences": sentences,
    }
    return meta, len(sentences)


def load_curriculum(level: str) -> List[Dict[str, Any]]:
    p = MATERIALS / f"{level}_curriculum_index.json"
    if not p.exists():
        return []
    return json.loads(p.read_text(encoding="utf-8"))


def process_sentence_modules() -> Tuple[List[Dict], Dict[str, int]]:
    """Junior + senior 句型篇."""
    modules_out = []
    counts = {"junior": 0, "senior": 0}
    hand = load_hand_tuned_greetings()

    for level, title in (("junior", "國中句型"), ("senior", "高中句型")):
        curriculum = load_curriculum(level)
        types_out = []
        for tinfo in curriculum:
            type_id = str(tinfo["type_id"])
            type_name = tinfo.get("type_name") or f"type{type_id}"
            units_out = []
            for cinfo in tinfo.get("classes") or []:
                class_id = str(cinfo["class_id"])
                fname = f"{level}_type{type_id}_class{class_id}.json"
                fpath = MATERIALS / fname
                if not fpath.exists():
                    print(f"WARN missing {fname}", file=sys.stderr)
                    continue
                unit_id = f"{level}_type{type_id}_class{class_id}"
                use_hand = (
                    level == "junior"
                    and type_id == "2"
                    and class_id == "16"
                    and hand
                )
                unit, n = sentences_from_unit_file(
                    fpath, unit_id, hand_tuned=hand if use_hand else None
                )
                # write unit file
                out_path = UNITS_DIR / f"{unit_id}.json"
                out_path.write_text(
                    json.dumps(unit, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
                units_out.append({
                    "id": unit_id,
                    "title": unit["title"],
                    "class_id": class_id,
                    "path": f"data/units/{unit_id}.json",
                    "count": n,
                    "source_url": unit.get("source_url") or "",
                    "hand_tuned": bool(unit.get("hand_tuned")),
                })
                counts[level] += n
            if units_out:
                types_out.append({
                    "id": type_id,
                    "title": type_name,
                    "units": units_out,
                })
        modules_out.append({
            "id": level,
            "title": title,
            "types": types_out,
        })
    return modules_out, counts


def process_talk() -> Tuple[Dict, int]:
    types_units = []
    total = 0
    books = sorted(
        MATERIALS.glob("talk/talk_book*.json"),
        key=lambda p: int(re.search(r"(\d+)", p.stem).group(1)),
    )
    units_meta = []
    for path in books:
        data = json.loads(path.read_text(encoding="utf-8"))
        book_id = str(data.get("book_id"))
        unit_id = f"talk_book{book_id}"
        sentences = []
        seen = set()
        seq = 0
        for item in data.get("items") or []:
            amis = item.get("sentence_ab") or ""
            key = norm_key(amis)
            if not key or key in seen:
                continue
            seen.add(key)
            seq += 1
            zh = item.get("sentence_ch") or ""
            speaker = item.get("speaker") or ""
            if speaker and zh and not zh.startswith(speaker):
                # keep zh as-is; speaker separate
                pass
            s = make_sentence(
                sid=f"{seq:03d}",
                amis=amis,
                zh=zh if not speaker else f"{speaker}：{zh}" if "：" not in zh[:20] else zh,
                en="",
                audio=item.get("sentence_audio") or "",
                audio_primary=True,
            )
            if s:
                if speaker:
                    s["speaker"] = speaker
                sentences.append(s)
        unit = {
            "id": unit_id,
            "module": "talk",
            "title": data.get("book_name") or data.get("title_ch") or unit_id,
            "title_ab": data.get("title_ab") or "",
            "source_url": source_url_talk(book_id),
            "dialect": "馬蘭阿美語",
            "sentences": sentences,
        }
        (UNITS_DIR / f"{unit_id}.json").write_text(
            json.dumps(unit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        units_meta.append({
            "id": unit_id,
            "title": unit["title"],
            "path": f"data/units/{unit_id}.json",
            "count": len(sentences),
            "source_url": unit["source_url"],
        })
        total += len(sentences)
    mod = {
        "id": "talk",
        "title": "生活會話",
        "types": [{
            "id": "books",
            "title": "會話課本",
            "units": units_meta,
        }],
    }
    return mod, total


def process_dialogue() -> Tuple[Dict, int]:
    total = 0
    # group by scene
    by_scene: Dict[int, List] = {}
    files = sorted(MATERIALS.glob("dialogue/dialogue_s*_l*_talking.json"))
    for path in files:
        m = re.search(r"dialogue_s(\d+)_l(\d+)_talking", path.name)
        if not m:
            continue
        scene, stage = int(m.group(1)), int(m.group(2))
        data = json.loads(path.read_text(encoding="utf-8"))
        unit_id = f"dialogue_s{scene}_l{stage}"
        sentences = []
        seen = set()
        seq = 0
        for item in data.get("text_data") or []:
            amis = item.get("sentenceAb") or item.get("ab") or ""
            key = norm_key(amis)
            if not key or key in seen:
                continue
            seen.add(key)
            seq += 1
            # Prefer source en only if we want — user said greetings only for en
            s = make_sentence(
                sid=f"{seq:03d}",
                amis=amis,
                zh=item.get("sentenceCh") or item.get("ch") or "",
                en="",  # do not copy free EN for 900 lines
                audio=item.get("mp3") or "",
                audio_primary=True,
            )
            if s:
                sentences.append(s)
        level = data.get("level") or ""
        title = data.get("title") or f"對話練習"
        unit_title = f"情境{scene} · {level} · {title}" if level else f"情境{scene} · {title}"
        unit = {
            "id": unit_id,
            "module": "dialogue",
            "scene": scene,
            "stage": stage,
            "title": unit_title,
            "source_url": source_url_dialogue(scene, stage),
            "dialect": "馬蘭阿美語",
            "sentences": sentences,
        }
        (UNITS_DIR / f"{unit_id}.json").write_text(
            json.dumps(unit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        by_scene.setdefault(scene, []).append({
            "id": unit_id,
            "title": unit_title,
            "path": f"data/units/{unit_id}.json",
            "count": len(sentences),
            "source_url": unit["source_url"],
            "stage": stage,
        })
        total += len(sentences)

    types_out = []
    for scene in sorted(by_scene):
        units = sorted(by_scene[scene], key=lambda u: u.get("stage", 0))
        # clean stage from catalog entry
        for u in units:
            u.pop("stage", None)
        types_out.append({
            "id": f"s{scene}",
            "title": f"情境 {scene}",
            "units": units,
        })
    mod = {"id": "dialogue", "title": "情境族語", "types": types_out}
    return mod, total


def split_on_sentence_punct(text: str) -> List[str]:
    """Split on 。！？!? but ignore punctuation inside ASCII/“” quotes and 「」 pairs."""
    if not text:
        return []
    parts: List[str] = []
    buf: List[str] = []
    in_dq = False  # toggle on " / “ / ”
    corner = 0  # nest depth for 「 … 」
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch in '"“”':
            in_dq = not in_dq
            buf.append(ch)
        elif ch == "「":  # placeholder replaced below
            corner += 1
            buf.append(ch)
        elif ch == "」":
            corner = max(0, corner - 1)
            buf.append(ch)
        elif ch in "。！？!?" and not in_dq and corner == 0:
            buf.append(ch)
            piece = "".join(buf).strip()
            if piece:
                parts.append(piece)
            buf = []
            i += 1
            while i < n and text[i].isspace():
                i += 1
            continue
        else:
            buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        parts.append(tail)
    return parts


def split_essay_text(ab: str, ch: str) -> List[Tuple[str, str]]:
    """Split long essay paragraphs on 。！？/!/? ; keep short lines.
    Sentence splits are ignored inside ASCII/“” double quotes and 「」 pairs.
    """
    ab = normalize_amis(ab)
    ch = (ch or "").strip()
    if not ab:
        return []
    # If short or no sentence punctuation, keep as-is
    if len(tokenize(ab)) <= 12 and not re.search(r"[。！？!?]", ab):
        return [(ab, ch)]
    parts = split_on_sentence_punct(ab)
    parts = [p for p in parts if p]
    if len(parts) <= 1:
        return [(ab, ch)]
    ch_parts = split_on_sentence_punct(ch) if ch else []
    ch_parts = [p for p in ch_parts if p]
    out = []
    for i, p in enumerate(parts):
        z = ch_parts[i] if i < len(ch_parts) else (ch if len(parts) == 1 else "")
        out.append((p, z))
    return out


def process_essay() -> Tuple[Dict, int]:
    total = 0
    units_meta = []
    files = sorted(MATERIALS.glob("essay/essay_s*.json"))
    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        scene = data.get("scene")
        lesson = data.get("lesson")
        unit_id = f"essay_s{scene}_l{lesson}"
        sentences = []
        seen = set()
        seq = 0
        for item in data.get("text_data") or []:
            ab = item.get("ab") or item.get("sentenceAb") or ""
            ch = item.get("ch") or item.get("sentenceCh") or ""
            audio = ""
            # essay may have snd bool; build mp3 if sn present
            sn = item.get("sn") or ""
            if sn and "/" in str(sn):
                tid, iid = str(sn).split("/", 1)
                audio = f"https://web.klokah.tw/text/sound/{tid}/{iid}.mp3"
            for piece_ab, piece_ch in split_essay_text(ab, ch):
                key = norm_key(piece_ab)
                if not key or key in seen:
                    continue
                seen.add(key)
                seq += 1
                s = make_sentence(
                    sid=f"{seq:03d}",
                    amis=piece_ab,
                    zh=piece_ch,
                    en="",
                    audio=audio if seq == 1 or len(split_essay_text(ab, ch)) == 1 else audio,
                    audio_primary=True,
                )
                if s:
                    sentences.append(s)
        theme = data.get("theme") or ""
        title = f"短文 s{scene}/l{lesson}" + (f" · {theme}" if theme else "")
        unit = {
            "id": unit_id,
            "module": "essay",
            "title": title,
            "theme": theme,
            "source_url": source_url_essay(scene, lesson),
            "dialect": "馬蘭阿美語",
            "sentences": sentences,
        }
        (UNITS_DIR / f"{unit_id}.json").write_text(
            json.dumps(unit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        units_meta.append({
            "id": unit_id,
            "title": title,
            "path": f"data/units/{unit_id}.json",
            "count": len(sentences),
            "source_url": unit["source_url"],
        })
        total += len(sentences)
    mod = {
        "id": "essay",
        "title": "族語短文",
        "types": [{"id": "lessons", "title": "短文課", "units": units_meta}],
    }
    return mod, total


def write_catalog_js(catalog: Dict[str, Any]) -> None:
    body = json.dumps(catalog, ensure_ascii=False, indent=2)
    js = (
        "/** Auto-generated catalog — module/type/unit index for sentence maps. */\n"
        f"const CATALOG = {body};\n"
        "if (typeof window !== 'undefined') window.CATALOG = CATALOG;\n"
    )
    (SITE / "catalog.js").write_text(js, encoding="utf-8")


def write_data_js_greetings_fallback(greetings_unit: Dict[str, Any]) -> None:
    """Keep GREETINGS global for offline / file:// fallback of default unit."""
    payload = {
        "source": greetings_unit.get("source_url") or "",
        "dialect": "馬蘭阿美語",
        "unit": greetings_unit.get("title") or "問候道別謝謝",
        "class_id": "16",
        "footer": "Klokah 句型篇國中版 · 馬蘭阿美語 · 問候道別謝謝",
        "sentences": greetings_unit.get("sentences") or [],
    }
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    js = (
        "/** Greetings unit fallback — inlined so file:// works without fetch. */\n"
        f"const GREETINGS = {body};\n"
        "if (typeof window !== 'undefined') window.GREETINGS = GREETINGS;\n"
    )
    (SITE / "data.js").write_text(js, encoding="utf-8")


def main() -> None:
    UNITS_DIR.mkdir(parents=True, exist_ok=True)
    # clear old unit jsons
    for old in UNITS_DIR.glob("*.json"):
        old.unlink()

    modules, js_counts = process_sentence_modules()
    talk_mod, talk_n = process_talk()
    dialogue_mod, dialogue_n = process_dialogue()
    essay_mod, essay_n = process_essay()

    modules.append(talk_mod)
    modules.append(dialogue_mod)
    modules.append(essay_mod)

    counts = {
        "junior": js_counts["junior"],
        "senior": js_counts["senior"],
        "talk": talk_n,
        "dialogue": dialogue_n,
        "essay": essay_n,
    }
    grand = sum(counts.values())

    catalog = {
        "dialect": "馬蘭阿美語",
        "dialect_id": "4",
        "default_unit": "junior_type2_class16",
        "generated_note": (
            "Auto-tagged sentence maps from Klokah gather. "
            "Roles/layout are best-effort heuristics for learning — not linguistic gold."
        ),
        "totals": {**counts, "all": grand},
        "modules": modules,
        "hub_url": "https://klokah.iformosa.com.tw/",
    }

    CATALOG_JSON.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_JSON.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    write_catalog_js(catalog)

    # greetings fallback
    gpath = UNITS_DIR / "junior_type2_class16.json"
    if gpath.exists():
        write_data_js_greetings_fallback(json.loads(gpath.read_text(encoding="utf-8")))

    print("=== Corpus build complete ===")
    for k in ("junior", "senior", "talk", "dialogue", "essay"):
        print(f"  {k}: {counts[k]} sentences")
    print(f"  TOTAL: {grand}")
    print(f"  units dir: {UNITS_DIR}")
    print(f"  catalog: {CATALOG_JSON}")
    n_units = len(list(UNITS_DIR.glob('*.json')))
    print(f"  unit files: {n_units}")


if __name__ == "__main__":
    main()
