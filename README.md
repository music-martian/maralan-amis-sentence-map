# 馬蘭阿美語 · 句型圖

Interactive sentence maps for **馬蘭阿美語 (Maralan Amis)** from the Klokah gather (國中／高中句型、生活會話、情境族語、族語短文).

- **Learn:** full SVG maps with Amis labels + color legend  
- **Practice:** Chinese shown; tap colored pills to reveal Amis  
- **Audio:** 🔊 plays Klokah clips when available  
- **Browse:** Module → Type → Unit cascading selectors; each unit loads its own JSON

## Live site

`https://music-martian.github.io/maralan-amis-sentence-map/`

## Open locally

GitHub Pages (and this app) **fetch** per-unit JSON under `data/units/`.  
`file://` cannot fetch those files — use a tiny server:

```bash
python3 -m http.server 8765
# then open http://localhost:8765/
```

The greetings unit (`junior_type2_class16`) is also inlined in `data.js` as an offline fallback.

## Data layout

| File | Role |
|------|------|
| `catalog.js` / `data/catalog.json` | Module → type → unit index + counts |
| `data/units/*.json` | Per-unit sentence arrays (tokens + layout) |
| `data.js` | Inlined greetings fallback |
| `scripts/build_corpus.py` (in sibling `maralan-amis` repo materials workspace) | Rebuild from Klokah gather JSON |

Rebuild corpus (from the materials workspace):

```bash
python3 /workspace/maralan-amis/scripts/build_corpus.py
```

## Auto-tagging limits

Role tags and bead layouts are **best-effort heuristics** (case markers, common pronouns, first-content-word ≈ predicate, `ko X no Y` genitive hangs, comma → two groups). They are simplified for learning and **may need refinement**. English is left empty except the hand-tuned greetings unit — we do not invent free translations for ~2800 lines.

## Source

Klokah hub: https://klokah.iformosa.com.tw/  
Dialect: 馬蘭阿美語 (did=4). Skipped modules (no Maralan sentence lists) are documented in the materials inventory.
