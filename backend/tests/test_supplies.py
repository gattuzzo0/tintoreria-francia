from __future__ import annotations

import unittest

from pydantic import ValidationError

from api.supplies_routes import SupplyCreate, SupplyItemCreate, format_quantity, opening_stats, quantity_milli


def _body(**over: object) -> SupplyCreate:
    base: dict[str, object] = {"branch": "Centro", "item": "Ganchos", "openedOn": "2026-11-02"}
    base.update(over)
    return SupplyCreate.model_validate(base)


class SupplyTests(unittest.TestCase):
    def test_average_gap(self):
        stats = opening_stats(
            [("Cloro", "2026-01-01"), ("Cloro", "2026-01-11"), ("Cloro", "2026-02-10")],
        )
        self.assertEqual(stats, [{"item": "Cloro", "count": 3, "lastOpened": "2026-02-10", "avgDays": 20}])

    def test_single_opening_has_no_average(self):
        stats = opening_stats([("Ganchos", "2026-03-01")])
        self.assertIsNone(stats[0]["avgDays"])
        self.assertEqual(stats[0]["count"], 1)

    def test_groups_case_and_uses_latest_spelling(self):
        stats = opening_stats([("ganchos", "2026-01-01"), ("Ganchos", "2026-01-15")])
        self.assertEqual(stats[0]["item"], "Ganchos")
        self.assertEqual(stats[0]["count"], 2)
        self.assertEqual(stats[0]["avgDays"], 14)

    def test_sorts_dates_and_rounds_half_up(self):
        stats = opening_stats(
            [("Cloro", "2026-01-04"), ("Cloro", "2026-01-01"), ("Cloro", "2026-01-02")],
        )
        self.assertEqual(stats[0]["lastOpened"], "2026-01-04")
        self.assertEqual(stats[0]["avgDays"], 2)

    def test_empty(self):
        self.assertEqual(opening_stats([]), [])

    def test_item_collapses(self):
        self.assertEqual(_body(item="  bote   de cloro ").item, "bote de cloro")
        with self.assertRaises(ValidationError):
            _body(item="   ")
        with self.assertRaises(ValidationError):
            _body(openedOn="1999-01-01")


def _item(**over: object) -> SupplyItemCreate:
    base: dict[str, object] = {"branch": "Centro", "name": "Cloro", "unit": "litro", "quantity": "20"}
    base.update(over)
    return SupplyItemCreate.model_validate(base)


class SupplyItemTests(unittest.TestCase):
    def test_name_and_unit(self):
        item = _item(name="  bote   de cloro ")
        self.assertEqual(item.name, "bote de cloro")
        self.assertEqual(item.unit, "litro")

    def test_rejects_blank_and_unknown_unit(self):
        with self.assertRaises(ValidationError):
            _item(name="   ")
        with self.assertRaises(ValidationError):
            _item(unit="litros")
        with self.assertRaises(ValidationError):
            _item(unit="caja")

    def test_quantity(self):
        self.assertEqual(quantity_milli("20.5", "litro"), 20500)
        self.assertEqual(quantity_milli("1,5", "kilogramo"), 1500)
        self.assertEqual(quantity_milli("3", "pza"), 3000)
        self.assertEqual(format_quantity(20500), "20.5")
        self.assertEqual(format_quantity(20000), "20")
        self.assertEqual(format_quantity(250), "0.25")
        self.assertEqual(_item(quantity="20.5").quantity, "20.5")
        with self.assertRaises(ValidationError):
            _item(quantity="0")
        with self.assertRaises(ValidationError):
            _item(unit="pza", quantity="1.5")
