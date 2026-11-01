from __future__ import annotations

import unittest
import uuid

from api.invoice_files import invoice_object_key, sniff_invoice


class InvoiceFileTests(unittest.TestCase):
    def test_key_uses_folio_and_uuid(self):
        file_id = str(uuid.uuid4())
        self.assertEqual(invoice_object_key(1120, file_id, "pdf"), f"invoices/1120/{file_id}.pdf")
        self.assertEqual(invoice_object_key(1120, file_id, "xml"), f"invoices/1120/{file_id}.xml")

    def test_key_rejects_a_bad_id(self):
        with self.assertRaises(ValueError):
            invoice_object_key(1120, "../factura", "pdf")

    def test_sniff_pdf(self):
        self.assertTrue(sniff_invoice("pdf", b"%PDF-1.7\n"))
        self.assertFalse(sniff_invoice("pdf", b"<?xml version='1.0'?>"))
        self.assertFalse(sniff_invoice("pdf", b""))

    def test_sniff_xml(self):
        self.assertTrue(sniff_invoice("xml", b"\xef\xbb\xbf<?xml version='1.0'?><cfdi:Comprobante"))
        self.assertTrue(sniff_invoice("xml", b"  <cfdi:Comprobante"))
        self.assertTrue(sniff_invoice("xml", b"<Comprobante"))
        self.assertFalse(sniff_invoice("xml", b"%PDF-1.4"))
        self.assertFalse(sniff_invoice("xml", b"<html><body>"))
