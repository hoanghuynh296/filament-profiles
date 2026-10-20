#!/usr/bin/env python3
"""Filament catalogue editor: a small stand-alone server for the owner (Python 3.10+, standard library only).

Edits `catalogue.json` and `images/` of the filament-profiles git repository this folder lives in, and commits /
pushes them. Serves the built UI from `dist/` (`npm run build`) plus a JSON API under `/api/`, and the repo images
under `/images/`. 3D Noob Studio only downloads `catalogue.json` from GitHub; it does not need this server.

    python3 server.py                 # http://127.0.0.1:8090
    python3 server.py --host 0.0.0.0  # reachable from the LAN (no login: only on a trusted network)

Env: EDITOR_PORT (default 8090), CATALOGUE_REPO (default: the parent folder of this file).
"""
from __future__ import annotations

import argparse
import json
import logging
import mimetypes
import os
import subprocess
import sys
import time
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import price_fetcher  # noqa: E402

logger = logging.getLogger("catalogue-editor")

REPO_DIR = os.path.abspath(os.environ.get("CATALOGUE_REPO") or os.path.join(HERE, ".."))
REPO_URL = "https://github.com/hoanghuynh296/filament-profiles"
CATALOGUE_FILE = os.path.join(REPO_DIR, "catalogue.json")
IMAGES_DIR = os.path.join(REPO_DIR, "images")
DIST_DIR = os.path.join(HERE, "dist")

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_JSON_BYTES = 50 * 1024 * 1024
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"}

# Review fields on lines and colours: origin_url (page the data came from), confidence (0-100),
# confidence_note (why it is low). All optional; items below the UI threshold (default 70) need a manual check.
REVIEW_THRESHOLD = 70


# ── catalogue.json ──────────────────────────────────────────────────────────────────────────────

def _run_git(args: list[str]) -> tuple[int, str, str]:
    try:
        proc = subprocess.run(["git", *args], cwd=REPO_DIR, capture_output=True, text=True, timeout=60)
        return proc.returncode, proc.stdout.strip(), proc.stderr.strip()
    except Exception as e:  # git missing, timeout
        logger.error("git %s failed: %s", args, e)
        return -1, "", str(e)


_OLD_IMAGE_PREFIX = "/api/catalogue/images/"


def _repo_image_path(path: Any) -> Any:
    """Images are stored repo-relative ("images/x.webp") so any install can load them from the git repo / CDN."""
    if isinstance(path, str) and path.startswith(_OLD_IMAGE_PREFIX):
        return "images/" + path[len(_OLD_IMAGE_PREFIX):]
    return path


def normalize_image_paths(data: dict[str, Any]) -> dict[str, Any]:
    for brand in data.get("brands") or []:
        if not isinstance(brand, dict):
            continue
        brand["logo"] = _repo_image_path(brand.get("logo"))
        for fil in brand.get("filaments") or []:
            for col in (fil or {}).get("colors") or []:
                if isinstance(col, dict) and isinstance(col.get("images"), list):
                    col["images"] = [_repo_image_path(p) for p in col["images"]]
    return data


def _clean_review_fields(item: dict[str, Any]) -> None:
    url = item.get("origin_url")
    if url is not None:
        url = str(url).strip()
        if url.startswith(("http://", "https://")):
            item["origin_url"] = url
        else:
            item.pop("origin_url", None)
    conf = item.get("confidence")
    if conf is not None:
        try:
            item["confidence"] = max(0, min(100, int(round(float(conf)))))
        except (TypeError, ValueError):
            item.pop("confidence", None)
    note = item.get("confidence_note")
    if note is not None:
        note = str(note).strip()
        if note:
            item["confidence_note"] = note
        else:
            item.pop("confidence_note", None)


def normalize_review_fields(data: dict[str, Any]) -> dict[str, Any]:
    for brand in data.get("brands") or []:
        if not isinstance(brand, dict):
            continue
        for fil in brand.get("filaments") or []:
            if not isinstance(fil, dict):
                continue
            _clean_review_fields(fil)
            for col in fil.get("colors") or []:
                if isinstance(col, dict):
                    _clean_review_fields(col)
    return data


def load_catalogue() -> dict[str, Any]:
    if os.path.exists(CATALOGUE_FILE):
        try:
            with open(CATALOGUE_FILE, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and "brands" in data:
                return normalize_image_paths(data)
        except Exception as e:
            logger.error("Failed to read %s: %s", CATALOGUE_FILE, e)
    return {"version": 1, "updated_at": int(time.time()), "repo_url": REPO_URL, "brands": []}


def save_catalogue(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("Catalogue data must be a dictionary")
    data["version"] = data.get("version", 1)
    data["updated_at"] = int(time.time())
    data["repo_url"] = REPO_URL
    data.setdefault("brands", [])
    normalize_image_paths(data)
    normalize_review_fields(data)
    tmp = f"{CATALOGUE_FILE}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CATALOGUE_FILE)
    return data


# ── git ─────────────────────────────────────────────────────────────────────────────────────────

def get_git_status() -> dict[str, Any]:
    is_repo = os.path.isdir(os.path.join(REPO_DIR, ".git"))
    code, branch, _ = _run_git(["branch", "--show-current"])
    code, commit_hash, _ = _run_git(["rev-parse", "--short", "HEAD"])
    commit_hash = commit_hash if code == 0 else "unknown"
    code, commit_msg, _ = _run_git(["log", "-1", "--pretty=%B"])
    commit_msg = commit_msg if code == 0 else ""
    # Only the data the editor writes counts as "not pushed yet" (the editor's own source is ignored).
    _, status_out, _ = _run_git(["status", "--porcelain", "--", "catalogue.json", "images"])
    uncommitted = [line.strip() for line in status_out.splitlines() if line.strip()]
    code, remote, _ = _run_git(["remote", "get-url", "origin"])
    return {
        "is_repo": is_repo,
        "branch": branch or "main",
        "commit_hash": commit_hash,
        "commit_message": commit_msg.strip(),
        "has_uncommitted_changes": bool(uncommitted),
        "uncommitted_files": uncommitted,
        "remote_url": remote if code == 0 else REPO_URL,
    }


def commit_and_push(message: str) -> dict[str, Any]:
    message = message.strip() or f"chore(catalogue): update filament catalogue ({time.strftime('%Y-%m-%d %H:%M')})"
    _run_git(["add", "catalogue.json"])
    if os.path.isdir(IMAGES_DIR):
        _run_git(["add", "images/"])
    code, _, _ = _run_git(["diff", "--cached", "--quiet", "--", "catalogue.json", "images"])
    if code == 0:
        return {"success": True, "message": "Không có thay đổi mới để commit", "commit_hash": get_git_status()["commit_hash"]}
    # Commit only the catalogue data, even if something else happens to be staged.
    code, out, err = _run_git(["commit", "-m", message, "--", "catalogue.json", "images"])
    if code != 0:
        return {"success": False, "error": f"Lỗi commit: {err or out}"}
    code, out, err = _run_git(["push", "origin", "main"])
    if code != 0:
        return {"success": False, "error": f"Lỗi đẩy lên GitHub: {err or out}. Vui lòng kiểm tra quyền SSH / mạng."}
    return {"success": True, "message": "Đã lưu và commit lên GitHub thành công!", "commit_hash": get_git_status()["commit_hash"]}


def pull_from_git() -> dict[str, Any]:
    code, out, err = _run_git(["pull", "origin", "main"])
    if code != 0:
        return {"success": False, "error": f"Lỗi tải từ GitHub: {err or out}"}
    return {"success": True, "output": out, "catalogue": load_catalogue()}


def save_image_file(content: bytes, filename: str) -> str:
    os.makedirs(IMAGES_DIR, exist_ok=True)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in IMAGE_EXTS:
        ext = ".png"
    name = f"img_{int(time.time())}_{os.urandom(4).hex()}{ext}"
    with open(os.path.join(IMAGES_DIR, name), "wb") as f:
        f.write(content)
    return f"images/{name}"


# ── HTTP ────────────────────────────────────────────────────────────────────────────────────────

class ApiError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


class Handler(BaseHTTPRequestHandler):
    server_version = "CatalogueEditor/1"

    def log_message(self, fmt: str, *args: Any) -> None:
        logger.info("%s %s", self.address_string(), fmt % args)

    # helpers
    def _send(self, status: int, body: bytes, ctype: str, cache: str = "no-store") -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, data: Any, status: int = 200) -> None:
        self._send(status, json.dumps(data, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _body(self, limit: int) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        if length > limit:
            raise ApiError(413, "Dữ liệu quá lớn")
        return self.rfile.read(length) if length else b""

    def _json_body(self) -> Any:
        try:
            return json.loads(self._body(MAX_JSON_BYTES) or b"null")
        except json.JSONDecodeError:
            raise ApiError(400, "Invalid JSON body")

    def _file(self, path: str, cache: str) -> None:
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        with open(path, "rb") as f:
            self._send(200, f.read(), ctype, cache)

    def _route(self, method: str) -> None:
        url = urllib.parse.urlsplit(self.path)
        path = urllib.parse.unquote(url.path)
        try:
            if path.startswith("/api/"):
                return self._api(method, path[len("/api/"):], urllib.parse.parse_qs(url.query))
            if method not in ("GET", "HEAD"):
                raise ApiError(405, "Method not allowed")
            if path.startswith("/images/"):
                fpath = os.path.join(IMAGES_DIR, os.path.basename(path))
                if not os.path.isfile(fpath):
                    raise ApiError(404, "Hình ảnh không tồn tại")
                return self._file(fpath, "public, max-age=86400")
            return self._static(path)
        except ApiError as e:
            self._json({"detail": e.detail}, e.status)
        except Exception as e:  # keep the server alive, report the error to the UI
            logger.exception("Request failed: %s %s", method, path)
            self._json({"detail": str(e)}, 500)

    def _static(self, path: str) -> None:
        index = os.path.join(DIST_DIR, "index.html")
        if not os.path.isfile(index):
            msg = "Chưa build giao diện: chạy `npm install && npm run build` trong thư mục editor (hoặc `npm run dev`)."
            return self._send(503, msg.encode("utf-8"), "text/plain; charset=utf-8")
        fpath = os.path.realpath(os.path.join(DIST_DIR, path.lstrip("/")))
        if fpath.startswith(os.path.realpath(DIST_DIR) + os.sep) and os.path.isfile(fpath):
            return self._file(fpath, "public, max-age=31536000, immutable" if "/assets/" in path else "no-cache")
        self._file(index, "no-cache")

    def _api(self, method: str, name: str, query: dict[str, list[str]]) -> None:
        if method == "GET" and name == "catalogue":
            return self._json(load_catalogue())
        if method == "POST" and name == "catalogue":
            body = self._json_body()
            if not isinstance(body, dict) or not isinstance(body.get("brands"), list):
                raise ApiError(400, "Catalogue data must contain a 'brands' array")
            return self._json(save_catalogue(body))
        if method == "GET" and name == "git-status":
            return self._json(get_git_status())
        if method == "POST" and name == "commit-push":
            body = self._json_body()
            res = commit_and_push(str((body or {}).get("message", "")) if isinstance(body, dict) else "")
            if not res.get("success"):
                raise ApiError(500, res.get("error", "Lỗi commit hoặc push"))
            return self._json(res)
        if method == "POST" and name == "pull":
            res = pull_from_git()
            if not res.get("success"):
                raise ApiError(500, res.get("error", "Lỗi kéo từ GitHub"))
            return self._json(res)
        if method == "POST" and name == "upload-image":
            ctype = self.headers.get("Content-Type", "")
            if not ctype.startswith("image/"):
                raise ApiError(400, "Chỉ hỗ trợ file hình ảnh (JPG, PNG, WEBP, SVG)")
            content = self._body(MAX_IMAGE_BYTES)
            if not content:
                raise ApiError(400, "File rỗng")
            return self._json({"image_url": save_image_file(content, (query.get("name") or ["image.png"])[0])})
        if method == "POST" and name == "fetch-price":
            body = self._json_body()
            url = str((body or {}).get("url") or "").strip() if isinstance(body, dict) else ""
            if not url:
                raise ApiError(400, "Trường 'url' là bắt buộc")
            return self._json(price_fetcher.fetch_product_price(url))
        raise ApiError(404, "Not found")

    def do_GET(self) -> None:  # noqa: N802
        self._route("GET")

    def do_HEAD(self) -> None:  # noqa: N802
        self._route("HEAD")

    def do_POST(self) -> None:  # noqa: N802
        self._route("POST")


def main() -> None:
    parser = argparse.ArgumentParser(description="Filament catalogue editor")
    parser.add_argument("--host", default="127.0.0.1", help="bind address (0.0.0.0 = whole LAN, no login)")
    parser.add_argument("--port", type=int, default=int(os.environ.get("EDITOR_PORT") or 8090))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not os.path.isdir(os.path.join(REPO_DIR, ".git")):
        logger.warning("%s is not a git repository: saving works, commit / pull will fail", REPO_DIR)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    logger.info("Catalogue editor on http://%s:%d (repo %s)", args.host, args.port, REPO_DIR)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
