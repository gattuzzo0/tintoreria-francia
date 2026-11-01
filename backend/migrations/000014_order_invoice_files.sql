-- PDF y XML de la factura externa. El archivo vive en R2; aquí solo la llave.
-- Aplicar en SQL Editor.
-- Rollback: alter table tintoreria_francia.orders
--   drop constraint if exists orders_invoice_pdf_key_check,
--   drop constraint if exists orders_invoice_xml_key_check,
--   drop column if exists invoice_pdf_key,
--   drop column if exists invoice_xml_key;

alter table tintoreria_francia.orders
  add column if not exists invoice_pdf_key text,
  add column if not exists invoice_xml_key text;

alter table tintoreria_francia.orders
  drop constraint if exists orders_invoice_pdf_key_check,
  add constraint orders_invoice_pdf_key_check
    check (
      invoice_pdf_key is null
      or invoice_pdf_key ~ '^invoices/[0-9]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
    ),
  drop constraint if exists orders_invoice_xml_key_check,
  add constraint orders_invoice_xml_key_check
    check (
      invoice_xml_key is null
      or invoice_xml_key ~ '^invoices/[0-9]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.xml$'
    );
