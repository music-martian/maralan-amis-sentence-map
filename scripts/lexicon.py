"""Klokah 馬蘭學習詞表 (1,094) — load, normalize, closed-class role hints."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Apostrophe / glottal lookalikes → canonical for lookup
_APOS_RE = re.compile(r"['\u2019\u2018\u02bc\u02be\u02bb`]")

CASE_FORMS = frozenset({"ko", "ku", "no", "nu", "to", "i"})

# Closed-class category → default role hint (open classes = None)
CLOSED_ROLE_BY_CAT = {
    "02": "pronoun",
    "03": "particle",  # or adverb if already in ADVERBS set at apply time
    "35": "adverb",
    "36": "particle",  # case markers still win via CASE_FORMS
    # 33 助動詞: do NOT force pred
}

# Orthographic aliases seen in corpus vs vocab list
ORTHO_ALIASES = {
    # vocab has cingra; corpus also uses cira for 3sg
    "cira": "cingra",
    "cingra": "cingra",
}


def normalize_vocab_key(amis: str) -> str:
    """Lowercase; unify apostrophes; strip; collapse spaces."""
    t = (amis or "").strip().lower()
    t = _APOS_RE.sub("'", t)
    t = re.sub(r"\s+", " ", t)
    # drop trailing sentence punct for lookup
    t = re.sub(r"[?!！？。．，,;:；]+$", "", t).strip()
    return t


def _is_junk_amis(amis: str) -> bool:
    if not amis or amis.strip() in {"無此詞彙", "无此词汇"}:
        return True
    # multi-dialect lists like "ci, ko, ca, …"
    if "," in amis or "…" in amis or "..." in amis:
        return True
    return False


def _prefer_entry(old: Dict[str, Any], new: Dict[str, Any]) -> Dict[str, Any]:
    """Prefer closed-class category for role hints; else keep first."""
    old_c = str(old.get("cat_code") or "")
    new_c = str(new.get("cat_code") or "")
    old_closed = old_c in CLOSED_ROLE_BY_CAT
    new_closed = new_c in CLOSED_ROLE_BY_CAT
    if new_closed and not old_closed:
        return new
    return old


class MaralanLexicon:
    def __init__(self, path: Path):
        self.path = path
        self.by_form: Dict[str, Dict[str, Any]] = {}
        self.pronouns: Set[str] = set()
        self.phrase_forms: Set[str] = set()  # multiword keys
        self.count = 0
        self._load()

    def _register(self, key: str, entry: Dict[str, Any]) -> None:
        if not key:
            return
        if key in self.by_form:
            self.by_form[key] = _prefer_entry(self.by_form[key], entry)
        else:
            self.by_form[key] = entry

    def _load(self) -> None:
        if not self.path.is_file():
            return
        data = json.loads(self.path.read_text(encoding="utf-8"))
        entries: List[Dict[str, Any]] = data.get("entries") or []
        self.count = len(entries)
        for raw in entries:
            amis = (raw.get("amis") or "").strip()
            if _is_junk_amis(amis):
                continue
            # Skip parenthetical variants like i(tini) for exact match; register base
            if "(" in amis and ")" in amis:
                base = re.sub(r"\([^)]*\)", "", amis).strip()
                if base:
                    self._index_form(base, raw)
                continue
            self._index_form(amis, raw)

        # Orthography aliases: cira ↔ cingra
        cingra = self.by_form.get("cingra")
        if cingra:
            self._register("cira", cingra)

    def _index_form(self, amis: str, raw: Dict[str, Any]) -> None:
        key = normalize_vocab_key(amis)
        if not key:
            return
        entry = {
            "amis": amis,
            "zh": (raw.get("zh") or "").strip(),
            "level": (raw.get("level") or "").strip(),
            "cat_code": str(raw.get("cat_code") or ""),
            "cat_name": raw.get("cat_name") or "",
            "cat": raw.get("cat") or "",
            "code": raw.get("code") or "",
        }
        self._register(key, entry)

        cat = entry["cat_code"]
        parts = key.split()
        if cat == "02":
            if len(parts) == 1:
                self.pronouns.add(key)
            else:
                # multiword e.g. "no miso" — full phrase + last token
                self.phrase_forms.add(key)
                self._register(key, entry)
                last = parts[-1]
                if last and last not in CASE_FORMS:
                    # last token as pronoun form (miso/mako/mira/mita)
                    self.pronouns.add(last)
                    # don't overwrite a richer closed entry for last alone
                    if last not in self.by_form:
                        self._register(last, {**entry, "amis": last})
        elif len(parts) > 1:
            self.phrase_forms.add(key)

    def lookup(self, text: str) -> Optional[Dict[str, Any]]:
        key = normalize_vocab_key(text)
        if not key:
            return None
        # alias chain
        alias = ORTHO_ALIASES.get(key)
        if key in self.by_form:
            return self.by_form[key]
        if alias and alias in self.by_form:
            return self.by_form[alias]
        return None

    def closed_role_hint(self, text: str, adverbs: Set[str]) -> Optional[str]:
        """Return pronoun/particle/adverb for closed-class hits only."""
        hit = self.lookup(text)
        if not hit:
            return None
        cat = hit.get("cat_code") or ""
        if cat not in CLOSED_ROLE_BY_CAT:
            return None
        key = normalize_vocab_key(text)
        # case markers always win over cat 36 particle
        if key in CASE_FORMS:
            return None  # caller keeps case
        role = CLOSED_ROLE_BY_CAT[cat]
        if cat == "03" and key in adverbs:
            return "adverb"
        if cat == "36" and key in CASE_FORMS:
            return None
        return role


_CACHE: Optional[MaralanLexicon] = None


def get_lexicon(materials_root: Path) -> MaralanLexicon:
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    path = materials_root / "glossary" / "maralan_vocab.json"
    _CACHE = MaralanLexicon(path)
    return _CACHE


def tw_structure(s: str) -> str:
    """Mainland → Taiwan school grammar wording in structure blurbs."""
    if not s:
        return s
    s = s.replace("自由主格代詞", "自由主格代名詞")
    s = s.replace("謂語", "述語")
    # bare 代詞 → 代名詞 (do not touch 代名詞 already)
    s = re.sub(r"(?<!名)代詞(?!名)", "代名詞", s)
    return s
