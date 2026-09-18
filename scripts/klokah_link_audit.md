# Klokah link audit (馬蘭 did=4)

- total: 151
- ok: 151
- fail: 0
- set_prefer: `https://klokah.iformosa.com.tw/set_prefer_dialect/4`

## Notes

All 151 unit `source_url`s match Maralan content when the session dialect is set to did=4.
The one false-negative (`junior_type6_class36`) was an extractor miss on `matchA_ab_A` keys (配合題); URL and content are correct.

Perceived wrong dialect on open (南勢 vs 馬蘭) is fixed by the header click handler: open `set_prefer_dialect/4` first, then navigate to `source_url`.

## Failures

(none)
