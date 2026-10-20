# Filament catalogue editor

Owner-only tool to edit `catalogue.json` and `images/` of this repository (brands, product lines, colours,
purchase links, review fields), then commit and push them. It is stand-alone: Python 3.10+ standard library for the
server, React + Vite + Tailwind for the UI. 3D Noob Studio does not ship it; the app only downloads `catalogue.json`
from GitHub (`app/catalogue_source.py` there).

## Run

```bash
cd editor
npm install && npm run build   # once, and after changing src/
python3 server.py              # http://127.0.0.1:8090
```

- `python3 server.py --host 0.0.0.0` opens it to the LAN (iPad). There is no login: use it on a trusted network only.
- Hot reload while editing the UI: `python3 server.py` in one terminal, `npm run dev` in another, then open
  http://localhost:5180 (Vite proxies `/api` and `/images` to the server).
- Env: `EDITOR_PORT` (default 8090), `CATALOGUE_REPO` (repo to edit; default the parent of `editor/`).
- Tests: `python3 -m unittest discover -s tests`.

## API (server.py)

| Method | Path | |
|---|---|---|
| GET / POST | `/api/catalogue` | read / save `catalogue.json` (save normalises image paths and review fields) |
| GET | `/api/git-status` | branch, commit, uncommitted `catalogue.json` / `images/` |
| POST | `/api/commit-push` | `{message}` → commit `catalogue.json` + `images/` only, push `origin main` |
| POST | `/api/pull` | `git pull origin main` |
| POST | `/api/upload-image?name=<file>` | raw image body (≤ 10 MB) → `{image_url: "images/…"}` |
| POST | `/api/fetch-price` | `{url}` → price and platform of a Shopee / Lazada / Tiki / other product page |
| GET | `/images/<file>` | repo images |

Image paths in `catalogue.json` are repo-relative (`images/<file>`), so any reader can load them from GitHub or
jsDelivr. Review fields (`origin_url`, `confidence` 0-100, `confidence_note`) are optional on lines and colours.
