from __future__ import annotations

import unittest

from api.validation import (
    delivery_patch,
    invoice_on_create,
    normalize_cfdi_use,
    normalize_fiscal_zip,
    normalize_legal_name,
    normalize_rfc,
    normalize_tax_regime,
)


class RfcTests(unittest.TestCase):
    def test_normalize(self):
        self.assertIsNone(normalize_rfc(None))
        self.assertIsNone(normalize_rfc("  "))
        self.assertEqual(normalize_rfc("xaxx010101000"), "XAXX010101000")
        self.assertEqual(normalize_rfc("a&b 010101 xxx"), "A&B010101XXX")
        self.assertEqual(normalize_rfc("ÑXXX010101AB1"), "ÑXXX010101AB1")
        with self.assertRaises(ValueError):
            normalize_rfc("AB010101AB1")
        with self.assertRaises(ValueError):
            normalize_rfc("XAXX0101010001")

    def test_invoice_flag_only_when_money_moves(self):
        self.assertFalse(invoice_on_create("pendiente", True))
        self.assertFalse(invoice_on_create("efectivo", False))
        self.assertTrue(invoice_on_create("tarjeta", True))

    def test_delivery_collects_only_pending_pickup(self):
        plain = delivery_patch("efectivo", "entregado", None, True)
        self.assertEqual(plain, {"status": "entregado"})
        with self.assertRaises(ValueError):
            delivery_patch("pendiente", "entregado", None, True)
        with self.assertRaises(ValueError):
            delivery_patch("pendiente", "entregado", "pendiente", True)
        settled = delivery_patch("pendiente", "entregado", "efectivo", True)
        self.assertEqual(
            settled,
            {"status": "entregado", "payment_method": "efectivo", "wants_invoice": True},
        )
        skipped = delivery_patch("pendiente", "proceso", "efectivo", True)
        self.assertEqual(skipped, {"status": "proceso"})

    def test_fiscal_profile(self):
        self.assertEqual(normalize_legal_name("  maría  lópez "), "MARÍA LÓPEZ")
        self.assertIsNone(normalize_legal_name("   "))
        with self.assertRaises(ValueError):
            normalize_legal_name("@@@")
        self.assertEqual(normalize_fiscal_zip("78 200"), "78200")
        with self.assertRaises(ValueError):
            normalize_fiscal_zip("7820")
        self.assertEqual(normalize_tax_regime("626"), "626")
        with self.assertRaises(ValueError):
            normalize_tax_regime("999")
        self.assertEqual(normalize_cfdi_use("g03"), "G03")
        with self.assertRaises(ValueError):
            normalize_cfdi_use("P01")


if __name__ == "__main__":
    unittest.main()
