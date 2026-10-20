"""Editor server helpers: review-field cleanup, catalogue save, price fetcher (python3 -m unittest discover -s tests)."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import server  # noqa: E402


def _sample() -> dict:
    return {
        "version": 1,
        "brands": [
            {
                "id": "acme",
                "name": "Acme",
                "logo": "",
                "filaments": [
                    {
                        "id": "acme-pla",
                        "brand_id": "acme",
                        "name": "Acme PLA",
                        "type": "PLA",
                        "origin_url": " https://acme.example/products/pla ",
                        "confidence": 140,
                        "colors": [
                            {
                                "id": "c-red",
                                "name": "Red",
                                "color": "#FF0000",
                                "images": [],
                                "origin_url": "javascript:alert(1)",
                                "confidence": "42.4",
                                "confidence_note": "  hex from photo  ",
                            },
                            {"id": "c-blue", "name": "Blue", "color": "#0000FF", "images": [], "confidence": "x", "confidence_note": " "},
                        ],
                    }
                ],
            }
        ],
    }


class ReviewFieldsTest(unittest.TestCase):
    def test_normalize_clamps_and_drops_bad_values(self):
        data = server.normalize_review_fields(_sample())
        fil = data["brands"][0]["filaments"][0]
        red, blue = fil["colors"]
        self.assertEqual(fil["origin_url"], "https://acme.example/products/pla")
        self.assertEqual(fil["confidence"], 100)
        self.assertNotIn("origin_url", red)  # only http(s) links are kept
        self.assertEqual(red["confidence"], 42)
        self.assertEqual(red["confidence_note"], "hex from photo")
        self.assertNotIn("confidence", blue)
        self.assertNotIn("confidence_note", blue)

    def test_save_preserves_review_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "catalogue.json")
            with mock.patch.object(server, "CATALOGUE_FILE", path):
                server.save_catalogue(_sample())
                with open(path, encoding="utf-8") as f:
                    saved = json.load(f)
        red = saved["brands"][0]["filaments"][0]["colors"][0]
        self.assertEqual(red["confidence"], 42)
        self.assertEqual(red["confidence_note"], "hex from photo")
        self.assertEqual(saved["brands"][0]["filaments"][0]["origin_url"], "https://acme.example/products/pla")


class PriceFetcherTest(unittest.TestCase):
    def test_detect_platform(self):
        from price_fetcher import detect_platform
        self.assertEqual(detect_platform("https://shopee.vn/product/123/456"), "Shopee")
        self.assertEqual(detect_platform("https://shope.ee/abcXYZ"), "Shopee")
        self.assertEqual(detect_platform("https://www.lazada.vn/products/i123.html"), "Lazada")
        self.assertEqual(detect_platform("https://tiki.vn/nhua-in-3d-p123.html"), "Tiki")
        self.assertEqual(detect_platform("https://shop.tiktok.com/view/product/123"), "TikTok")
        self.assertEqual(detect_platform("https://tinmorry.com/filament"), "Tinmorry")
        self.assertEqual(detect_platform(""), "Khác")

    def test_extract_price_from_html(self):
        from price_fetcher import extract_price_from_html
        # OpenGraph meta tag
        html_og = '<meta property="product:price:amount" content="240000">'
        self.assertEqual(extract_price_from_html(html_og), 240000)

        # JSON-LD script
        html_ld = '<script type="application/ld+json">{"@context": "https://schema.org", "offers": {"price": "199000"}}</script>'
        self.assertEqual(extract_price_from_html(html_ld), 199000)

        # Vietnamese currency text regex
        html_vn = '<div class="price-box">Giá: 275.000₫ (Đã bao gồm VAT)</div>'
        self.assertEqual(extract_price_from_html(html_vn), 275000)

    def test_fetch_product_price_empty(self):
        from price_fetcher import fetch_product_price
        res = fetch_product_price("")
        self.assertFalse(res["success"])
        self.assertIsNone(res["price"])


if __name__ == "__main__":
    unittest.main()
