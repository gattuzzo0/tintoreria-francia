from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ROW = re.compile(
    r"^\s+\('((?:[^']|'')*)', '((?:[^']|'')*)', '(pza|kg|par|m)', (\d+), (\d+)\)[,;]?\s*$"
)
SEED = re.compile(
    r"^\s+\('s\d+', '((?:[^']|'')*)', '((?:[^']|'')*)', '(pza|kg|par|m)', (\d+), (\d+)\),?\s*$"
)


def _quotes(text: str, start: str, end: str) -> list[str]:
    i = text.index(start)
    j = text.index(end, i)
    return re.findall(r'"([^"]+)"', text[i:j])


def _rows(text: str, pattern: re.Pattern[str]) -> list[tuple[str, str, str, int, int]]:
    out = []
    for line in text.splitlines():
        m = pattern.match(line)
        if not m:
            continue
        name, cat, unit, cents, sort = m.groups()
        out.append((name.replace("''", "'"), cat.replace("''", "'"), unit, int(cents), int(sort)))
    return out


class CatalogSeedTest(unittest.TestCase):
    def test_catalog_copies_match(self) -> None:
        migration = (ROOT / "backend/migrations/000017_catalog.sql").read_text(encoding="utf-8")
        schema = (ROOT / "backend/supabase_schema.sql").read_text(encoding="utf-8")
        routes = (ROOT / "backend/api/catalog_routes.py").read_text(encoding="utf-8")
        web = (ROOT / "frontend/lib/pos-data.ts").read_text(encoding="utf-8")

        rows = _rows(migration, ROW)
        seed = _rows(schema, SEED)
        py = _quotes(routes, "Category = Literal[", "]")
        ts = _quotes(web, "export const CATEGORIES = [", "] as const")
        schema_cats = re.findall(
            r"'([^']+)'",
            schema.split("category text not null check (category in (", 1)[1].split(")),", 1)[0],
        )

        self.assertEqual(py, ts)
        self.assertEqual(py, schema_cats)
        self.assertEqual(len(rows), 176)
        self.assertEqual([r[4] for r in rows], list(range(1, 177)))
        self.assertEqual(len({r[0] for r in rows}), 176)
        for name, cat, _unit, cents, _sort in rows:
            self.assertLessEqual(len(name), 60)
            self.assertIn(cat, py)
            self.assertEqual(cents % 100, 0)
            self.assertGreaterEqual(cents, 100)
        self.assertEqual([(n, c, u, cents, s) for n, c, u, cents, s in seed], rows)
        self.assertIn("'m'", schema.split("unit text not null check", 1)[1].split("),", 1)[0])


if __name__ == "__main__":
    unittest.main()
