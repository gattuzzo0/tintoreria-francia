from __future__ import annotations

import unittest

from pydantic import ValidationError

from api.expenses_routes import ExpenseCreate, month_range, totals_by_month


def _body(**over: object) -> ExpenseCreate:
    base: dict[str, object] = {
        "branch": "Centro",
        "spentOn": "2026-11-02",
        "amountCents": 15000,
        "concept": "Renta",
        "paymentMethod": "efectivo",
    }
    base.update(over)
    return ExpenseCreate.model_validate(base)


class ExpenseTests(unittest.TestCase):
    def test_totals_by_month(self):
        rows = [("2026-01-02", 10000), ("2026-01-20", 5000), ("2026-11-01", 200)]
        self.assertEqual(totals_by_month(rows), [15000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 200, 0])

    def test_month_range(self):
        self.assertEqual(month_range(2026, 11), ("2026-11-01", "2026-12-01"))
        self.assertEqual(month_range(2026, 12), ("2026-12-01", "2027-01-01"))

    def test_whole_pesos(self):
        self.assertEqual(_body().amount_cents, 15000)
        with self.assertRaises(ValidationError):
            _body(amountCents=15050)
        with self.assertRaises(ValidationError):
            _body(amountCents=50)
        with self.assertRaises(ValidationError):
            _body(paymentMethod="pendiente")

    def test_concept_collapses(self):
        self.assertEqual(_body(concept="  dos   espacios ").concept, "dos espacios")
        with self.assertRaises(ValidationError):
            _body(concept="   ")
