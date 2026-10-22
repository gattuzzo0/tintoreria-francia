from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from api.deps import require_pos_staff
from api.photo_keys import is_r2_key, object_key, thumb_key
from api.r2_client import GET_EXPIRES, LOCAL_ORIGINS, PAGE_ORIGIN, PUT_EXPIRES, bucket_cors_rules
from server import app

PHOTO_ID = "cd48b693-f727-458e-ba61-9f5d84950b9f"
PRESIGNED = "https://r2.example/signed"
ROW = {
    "id": PHOTO_ID,
    "object_key": "orders/u/pic.jpg",
    "staff_user_id": "u",
    "order_folio": 1,
    "content_type": "image/jpeg",
}


class PhotoKeyTests(unittest.TestCase):
    def test_thumb_suffix_and_http_is_not_a_key(self):
        self.assertEqual(thumb_key("orders/abc/photo.jpg"), "orders/abc/photo_thumb.webp")
        self.assertIsNone(thumb_key("https://cdn.example/a.jpg"))
        self.assertFalse(is_r2_key("http://cdn.example/a.jpg"))
        self.assertEqual(object_key("user", PHOTO_ID, "image/webp"), f"orders/user/{PHOTO_ID}.webp")
        self.assertEqual(object_key("user", PHOTO_ID, "image/jpeg"), f"orders/user/{PHOTO_ID}.jpg")


class PhotoHttpTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app, follow_redirects=False)
        self.load = patch("api.order_photo_routes._load_photo", new_callable=AsyncMock).start()
        self.presign = patch("api.order_photo_routes.presign_get", return_value=PRESIGNED).start()
        self.exists = patch("api.order_photo_routes.object_exists", return_value=True).start()
        self.load.return_value = dict(ROW)
        app.dependency_overrides[require_pos_staff] = lambda: {"user_id": "u", "role": "empleado", "email": None}

    def tearDown(self):
        patch.stopall()
        app.dependency_overrides.clear()

    def test_file_thumb_redirects_without_credentials(self):
        res = self.client.get(
            f"/api/orders/photos/{PHOTO_ID}/file",
            params={"v": "thumb"},
            headers={"Origin": "http://localhost:3000"},
        )
        self.assertEqual(res.status_code, 302)
        self.assertEqual(res.headers["location"], PRESIGNED)
        self.assertEqual(res.headers["access-control-allow-origin"], "*")
        self.assertNotIn("access-control-allow-credentials", res.headers)
        self.assertIn("max-age=86400", res.headers["cache-control"])
        self.assertIn("s-maxage=86400", res.headers["cdn-cache-control"])
        self.presign.assert_called_once_with("orders/u/pic_thumb.webp")

    def test_missing_thumb_signs_original(self):
        self.exists.return_value = False
        res = self.client.get(f"/api/orders/photos/{PHOTO_ID}/file", params={"v": "thumb"})
        self.assertEqual(res.status_code, 302)
        self.presign.assert_called_once_with("orders/u/pic.jpg")

    def test_http_url_is_not_signed(self):
        self.load.return_value = {**ROW, "object_key": "https://legacy.example/a.jpg"}
        plain = self.client.get(f"/api/orders/photos/{PHOTO_ID}/file")
        self.assertEqual(plain.status_code, 302)
        self.assertEqual(plain.headers["location"], "https://legacy.example/a.jpg")
        self.presign.assert_not_called()
        thumb = self.client.get(f"/api/orders/photos/{PHOTO_ID}/file", params={"v": "thumb"})
        self.assertEqual(thumb.status_code, 404)

    def test_url_returns_presigned_json(self):
        res = self.client.get(f"/api/orders/photos/{PHOTO_ID}/url")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"url": PRESIGNED})
        self.presign.assert_called_once_with("orders/u/pic.jpg")


class PresignRejectTests(unittest.TestCase):
    def setUp(self):
        from api.deps import require_staff_writer

        self.client = TestClient(app)
        app.dependency_overrides[require_staff_writer] = lambda: {"user_id": "u", "role": "empleado", "email": None}

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_presign_rejects_png_and_heic(self):
        for mime in ("image/png", "image/heic", "image/avif"):
            res = self.client.post("/api/orders/photos/presign", json={"contentType": mime})
            self.assertEqual(res.status_code, 422, mime)


class PresignParamTests(unittest.TestCase):
    def test_get_is_nostore_for_seven_days(self):
        with (
            patch("api.r2_client.get_r2") as get_r2,
            patch("api.r2_client.get_r2_bucket_name", return_value="bucket"),
        ):
            get_r2.return_value.generate_presigned_url.return_value = PRESIGNED
            from api.r2_client import presign_get

            self.assertEqual(presign_get("orders/a/b.jpg"), PRESIGNED)
            _args, kwargs = get_r2.return_value.generate_presigned_url.call_args
            self.assertEqual(kwargs["ExpiresIn"], GET_EXPIRES)
            self.assertEqual(kwargs["ExpiresIn"], 604800)
            self.assertEqual(kwargs["Params"]["ResponseCacheControl"], "no-store")
            self.assertNotIn("immutable", kwargs["Params"]["ResponseCacheControl"])

    def test_put_fixes_content_type_for_ten_minutes(self):
        with (
            patch("api.r2_client.get_r2") as get_r2,
            patch("api.r2_client.get_r2_bucket_name", return_value="bucket"),
        ):
            get_r2.return_value.generate_presigned_url.return_value = PRESIGNED
            from api.r2_client import presign_put

            presign_put("orders/a/b.jpg", "image/jpeg")
            _args, kwargs = get_r2.return_value.generate_presigned_url.call_args
            self.assertEqual(kwargs["ExpiresIn"], PUT_EXPIRES)
            self.assertEqual(kwargs["Params"]["ContentType"], "image/jpeg")


class BucketCorsTests(unittest.TestCase):
    def test_get_and_put_are_separate_rules(self):
        rules = bucket_cors_rules()
        origins = [origin for rule in rules for origin in rule["AllowedOrigins"]]
        self.assertNotIn("*", origins)
        get_rule = next(rule for rule in rules if "GET" in rule["AllowedMethods"])
        put_rule = next(rule for rule in rules if "PUT" in rule["AllowedMethods"])
        self.assertIn(PAGE_ORIGIN, get_rule["AllowedOrigins"])
        self.assertTrue(any(origin in get_rule["AllowedOrigins"] for origin in LOCAL_ORIGINS))
        self.assertNotIn("PUT", get_rule["AllowedMethods"])
        self.assertEqual(put_rule["AllowedOrigins"], [PAGE_ORIGIN, *LOCAL_ORIGINS])
        self.assertIn("http://localhost:3000", put_rule["AllowedOrigins"])


def _header_source_matches(source: str, path: str) -> bool:
    """Misma idea que path-to-regexp de Vercel: :param es un segmento y el patrón va anclado."""
    pattern = re.sub(r":[A-Za-z0-9_]+", "[^/]+", source)
    return re.fullmatch(pattern, path) is not None


class VercelFileHeaderTests(unittest.TestCase):
    def test_file_redirect_is_not_credentialed(self):
        cfg = json.loads(Path(__file__).resolve().parents[1].joinpath("vercel.json").read_text(encoding="utf-8"))
        file_path = f"/api/orders/photos/{PHOTO_ID}/file"
        matched = [block for block in cfg["headers"] if _header_source_matches(block["source"], file_path)]
        self.assertTrue(matched)
        for block in matched:
            keys = {header["key"].lower() for header in block["headers"]}
            self.assertNotIn("access-control-allow-credentials", keys)
        acao = [
            header["value"]
            for block in matched
            for header in block["headers"]
            if header["key"].lower() == "access-control-allow-origin"
        ]
        self.assertEqual(acao, ["*"])
        for api_path in ("/api/orders", "/api/orders/photos/presign", f"/api/orders/photos/{PHOTO_ID}/url"):
            self.assertTrue(
                any(
                    _header_source_matches(block["source"], api_path)
                    and any(header["key"].lower() == "access-control-allow-credentials" for header in block["headers"])
                    for block in cfg["headers"]
                ),
                api_path,
            )


class PurgeOrderPhotosTests(unittest.TestCase):
    def test_purge_deletes_full_and_thumb(self):
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"id": "p", "object_key": "orders/u/pic.jpg"},
        ]
        with (
            patch("api.order_photo_routes.get_supabase", return_value=sb),
            patch("api.order_photo_routes.delete_object") as delete,
        ):
            from api.order_photo_routes import purge_order_photos

            removed = purge_order_photos(7)
        self.assertEqual(removed, 1)
        self.assertEqual(delete.call_args_list[0].args, ("orders/u/pic.jpg",))
        self.assertEqual(delete.call_args_list[1].args, ("orders/u/pic_thumb.webp",))
        sb.table.return_value.delete.return_value.eq.assert_called_once_with("order_folio", 7)
