"""Per-dialect config for the Klokah sentence-map pipeline.

Adding 南勢/秀姑巒/恆春 later = fetch materials with
  maralan-amis/scripts/fetch_klokah_dialect.py <did> <materials_dir>
  maralan-amis/scripts/glossary_to_json.py <xlsx> <materials_dir>/glossary/<slug>_vocab.json <name> <did> <url>
then add one entry below and run build_corpus.py --dialect <slug>.
Order here = order in the site's dialect selector.
"""
DIALECTS = [
    {
        "slug": "coastal",
        "did": "3",
        "name": "海岸阿美語",
        "materials": "materials_coastal",           # relative to maralan-amis/
        "vocab": "coastal_vocab.json",              # under <materials>/glossary/
        "glossary_xlsx": "2022學習詞表-03海岸阿美語.xlsx",
        "hand_tuned_greetings": False,
        "gloss_overrides": {},
    },
    {
        "slug": "maralan",
        "did": "4",
        "name": "馬蘭阿美語",
        "materials": "materials",
        "vocab": "maralan_vocab.json",
        "glossary_xlsx": "2022學習詞表-04馬蘭阿美語.xlsx",
        "hand_tuned_greetings": True,               # data/greetings.json (馬蘭 only)
        # hand fixes made in build 20260923a (exact token text → gloss)
        "gloss_overrides": {"Laway": "人名", "kasadak": "出去"},
    },
]
DEFAULT_DIALECT = "maralan"
BY_SLUG = {d["slug"]: d for d in DIALECTS}
