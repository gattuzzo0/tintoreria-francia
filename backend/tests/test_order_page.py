from __future__ import annotations

import unittest

from api.orders_routes import order_page_folios


class OrderPageTests(unittest.TestCase):
    def test_notes_lead_even_when_older(self):
        chosen, more = order_page_folios([50, 10], [100, 90, 80, 40], first=True, page_size=2)
        self.assertEqual(chosen, [50, 10, 100, 90])
        self.assertTrue(more)

    def test_next_page_is_only_plain(self):
        chosen, more = order_page_folios([50, 10], [80, 40, 30], first=False, page_size=2)
        self.assertEqual(chosen, [80, 40])
        self.assertTrue(more)

    def test_short_plain_page_ends(self):
        chosen, more = order_page_folios([10], [100], first=True, page_size=6)
        self.assertEqual(chosen, [10, 100])
        self.assertFalse(more)
