"""
core/price_fetcher.py
Fetches product price and metadata from e-commerce links (Shopee, Lazada, Tiki, generic sites).
Pure helper: non-blocking, safe parsing, timeout-protected.
"""
from __future__ import annotations

import json
import logging
import re
import urllib.parse
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def detect_platform(url: str) -> str:
    """Identify the platform name from URL hostname."""
    url_lower = (url or "").lower()
    if "shopee.vn" in url_lower or "shope.ee" in url_lower:
        return "Shopee"
    if "lazada.vn" in url_lower:
        return "Lazada"
    if "tiki.vn" in url_lower:
        return "Tiki"
    if "tiktok.com" in url_lower:
        return "TikTok"

    # Try parsing domain name
    try:
        parsed = urllib.parse.urlparse(url)
        host = parsed.netloc.split(":")[0].replace("www.", "")
        if host:
            parts = host.split(".")
            name = parts[0] if len(parts) > 1 else host
            return name.capitalize()
    except Exception:
        pass
    return "Khác"


def extract_price_from_html(html: str) -> int | None:
    """Extract price from OpenGraph, JSON-LD, or structured meta tags in HTML."""
    if not html:
        return None

    # 1. OpenGraph / Twitter meta price
    og_patterns = [
        r'<meta[^>]+(?:property|name)=["\'](?:product:price:amount|og:price:amount)["\'][^>]+content=["\']([0-9\.,]+)["\']',
        r'<meta[^>]+content=["\']([0-9\.,]+)["\'][^>]+(?:property|name)=["\'](?:product:price:amount|og:price:amount)["\']',
    ]
    for p in og_patterns:
        m = re.search(p, html, re.IGNORECASE)
        if m:
            clean = re.sub(r"[^\d]", "", m.group(1))
            if clean and int(clean) > 1000:
                return int(clean)

    # 2. JSON-LD scripts
    json_ld_blocks = re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.DOTALL | re.IGNORECASE,
    )
    for block in json_ld_blocks:
        try:
            data = json.loads(block.strip())
            items = data if isinstance(data, list) else [data]
            for it in items:
                if isinstance(it, dict):
                    offers = it.get("offers")
                    if isinstance(offers, dict):
                        p = offers.get("price") or offers.get("lowPrice")
                        if p:
                            clean = re.sub(r"[^\d]", "", str(p))
                            if clean and int(clean) > 1000:
                                return int(clean)
                    elif isinstance(offers, list) and offers:
                        p = offers[0].get("price")
                        if p:
                            clean = re.sub(r"[^\d]", "", str(p))
                            if clean and int(clean) > 1000:
                                return int(clean)
        except Exception:
            continue

    # 3. Microdata / Javascript state JSON
    js_patterns = [
        r'"price":\s*([0-9]+(?:\.[0-9]+)?)',
        r'"lowPrice":\s*([0-9]+(?:\.[0-9]+)?)',
        r'"current_price":\s*([0-9]+)',
        r'"price_amount":\s*([0-9]+)',
    ]
    for p in js_patterns:
        matches = re.findall(p, html)
        for m in matches:
            clean = re.sub(r"[^\d]", "", str(m))
            if clean:
                val = int(clean)
                # Filter reasonable filament price range (e.g. 50,000 to 5,000,000)
                if 50000 <= val <= 5000000:
                    return val

    # 4. Vietnamese price text pattern (e.g. 240.000₫ or 199.000 đ)
    text_matches = re.findall(r"(\d{1,3}(?:\.\d{3})+)\s*(?:₫|đ|vnd|vnđ)", html, re.IGNORECASE)
    for m in text_matches:
        val = int(m.replace(".", ""))
        if 50000 <= val <= 5000000:
            return val

    return None


def fetch_shopee_api(shop_id: str, item_id: str, timeout: float = 4.0) -> int | None:
    """Attempt to fetch product price directly from Shopee public item API."""
    api_url = f"https://shopee.vn/api/v4/item/get?itemid={item_id}&shopid={shop_id}"
    req = urllib.request.Request(
        api_url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": f"https://shopee.vn/product/{shop_id}/{item_id}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
            item = data.get("data", {}).get("item") or data.get("item", {})
            raw_price = item.get("price") or item.get("price_min")
            if raw_price:
                # Shopee price is multiplied by 100,000
                price = int(raw_price) // 100000
                if price > 1000:
                    return price
    except Exception as e:
        logger.debug("Shopee API item get failed: %s", e)
    return None


def fetch_product_price(url: str, timeout: float = 6.0) -> dict[str, Any]:
    """Fetch product metadata & price from link."""
    clean_url = (url or "").strip()
    if not clean_url:
        return {"success": False, "platform": "Khác", "price": None, "message": "URL rỗng"}

    if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
        clean_url = f"https://{clean_url}"

    platform = detect_platform(clean_url)

    req = urllib.request.Request(
        clean_url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        },
    )

    resolved_url = clean_url
    html = ""
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            resolved_url = resp.geturl()
            # Only read up to 500KB to stay fast
            html = resp.read(500000).decode("utf-8", errors="ignore")
    except Exception as e:
        logger.warning("Error fetching product page %s: %s", clean_url, e)

    # Re-detect platform after redirect
    platform = detect_platform(resolved_url)

    # Try Shopee API if shop_id & item_id present
    price = None
    if platform == "Shopee":
        m = re.search(r"[i\.](\d+)\.(\d+)", resolved_url) or re.search(r"/product/(\d+)/(\d+)", resolved_url)
        if m:
            shop_id, item_id = m.group(1), m.group(2)
            price = fetch_shopee_api(shop_id, item_id, timeout=timeout)

    # If no price yet, parse HTML
    if price is None and html:
        price = extract_price_from_html(html)

    # If no price yet, check if price is mentioned in URL slug (e.g. 240k or 250k)
    if price is None:
        slug_m = re.search(r"[-_](\d{2,4})k\b", clean_url, re.IGNORECASE)
        if slug_m:
            val = int(slug_m.group(1)) * 1000
            if 50000 <= val <= 5000000:
                price = val

    # Extract Title if available
    title = None
    if html:
        title_m = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
        if title_m:
            title = re.sub(r"\s+", " ", title_m.group(1)).strip()

    return {
        "success": price is not None,
        "platform": platform,
        "price": price,
        "title": title,
        "original_url": clean_url,
        "resolved_url": resolved_url,
        "message": "Đã tìm thấy giá" if price else "Không tự động tìm được giá, vui lòng tự nhập giá",
    }

