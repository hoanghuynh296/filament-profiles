# Data files

Read by 3D Noobs Studio (downloaded from `main`, cached, with a copy bundled in the app). Every file carries
`schema_version`; the app ignores a file whose version is newer than it understands, so new optional fields never
need a version bump.

## catalogue.json

`{schema_version?, version, repo_url, updated_at, brands: [brand]}`

- brand `{id, name, logo, filaments: [filament]}`
- filament `{id, brand_id, name, type, description?, price?, spool_g?, aliases?, origin_url?, confidence?,
  confidence_note?, buy_url?, colors: [colour]}`
- colour `{id, name, color: "#RRGGBB", color_code?, images: ["images/…"], purchase_links?: [{platform, url, price?}],
  origin_url?, confidence?, confidence_note?, buy_url?}`

| Field | Meaning |
|---|---|
| `origin_url` | Page the data was taken from (review only, never shown as a shop link). |
| `confidence` | 0–100, how sure the colour / data is; below 70 the app shows "màu thực có thể khác". |
| `purchase_links` | Shop listings with an optional price. |
| `buy_url` | **Optional.** The link the app's "Mua" button opens (affiliate link). On a colour, or on the filament for every colour of it; a colour's own wins. When missing the app falls back to `purchase_links`, then a marketplace search. Only `http(s)://` URLs are used. |

## color_styles.json

`{schema_version: 1, updated_at, styles: [style]}`; style
`{id (snake_case), name, description, colors: ["#RRGGBB" × 3–6], suits: [kinds of model], events: [event ids]}`.
Color Studio's AI picks from this list (it may also propose a free style of its own).

## color_events.json

`{schema_version: 1, updated_at, events: [event]}`; event `{id, name, rule, styles: [style ids]}`. The app computes
the dates (Asia/Ho_Chi_Minh) and tells the AI which events fall in the next 60 days.

| `rule.kind` | Fields | Example |
|---|---|---|
| `solar` | `month`, `day` | Halloween `{month: 10, day: 31}` |
| `lunar` | `month`, `day` (Vietnamese lunar calendar, UTC+7, never a leap month) | Tết `{month: 1, day: 1}` |
| `nth_weekday` | `month`, `weekday` (0 = Monday … 6 = Sunday), `n` (1–5, −1 = last) | Mother's Day `{month: 5, weekday: 6, n: 2}` |
| `easter` | — | Western Easter Sunday |

Any rule may add `offset_days` (Black Friday = 4th Thursday of November + 1).
