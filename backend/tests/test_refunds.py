import unittest

from api.refunds import is_void_cash_sale, refund_refusal


class RefundRulesTest(unittest.TestCase):
    def test_cash_refund_drops_the_sale_until_recharge(self):
        self.assertTrue(is_void_cash_sale("efectivo", None))
        self.assertFalse(is_void_cash_sale("efectivo", "2026-11-02T12:00:00+00:00"))
        self.assertFalse(is_void_cash_sale("tarjeta", None))

    def test_refusal(self):
        self.assertEqual(refund_refusal("pendiente", "Centro", "Centro", 1000, False, True), "Esta orden no está cobrada.")
        self.assertEqual(
            refund_refusal("transferencia", "Centro", "Centro", 1000, False, True),
            "Esta orden no se puede reembolsar.",
        )
        self.assertEqual(
            refund_refusal("efectivo", "Nereo Rdz.", "Centro", 1000, False, True),
            "La orden es de otra sucursal.",
        )
        self.assertEqual(refund_refusal("efectivo", "Centro", "Centro", 0, False, True), "La orden no tiene monto por reembolsar.")
        self.assertEqual(refund_refusal("efectivo", "Centro", "Centro", 1000, False, False), "Esta orden no tiene nota.")
        self.assertEqual(
            refund_refusal("efectivo", "Centro", "Centro", 1000, True, True),
            "Esta orden ya tiene PDF o XML de factura.",
        )
        self.assertIsNone(refund_refusal("tarjeta", "Centro", "Centro", 1000, True, True))
        self.assertIsNone(refund_refusal("efectivo", "Centro", "Centro", 1000, False, True))


if __name__ == "__main__":
    unittest.main()
