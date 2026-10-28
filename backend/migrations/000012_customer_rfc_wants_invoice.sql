-- RFC del cliente y marca de factura en la orden. Aplicar en SQL Editor.
-- Rollback: alter table tintoreria_francia.orders drop column wants_invoice;
--           alter table tintoreria_francia.customers drop column rfc;

alter table tintoreria_francia.customers
  add column if not exists rfc text
  check (rfc is null or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$');

alter table tintoreria_francia.orders
  add column if not exists wants_invoice boolean not null default false;
