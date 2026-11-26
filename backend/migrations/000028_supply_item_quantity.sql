-- Cantidad al dar de alta. Milésimas de la unidad: 20.5 L = 20500. Piezas en miles exactos.
-- Requiere 000027. Filas ya guardadas quedan en 1; bórralas y vuelve a darlas de alta si no es real.
-- Rollback: alter table tintoreria_francia.supply_items drop column quantity_milli;

alter table tintoreria_francia.supply_items
  add column if not exists quantity_milli integer not null default 1000;

alter table tintoreria_francia.supply_items
  alter column quantity_milli drop default;

alter table tintoreria_francia.supply_items
  drop constraint if exists supply_items_quantity_milli_check;

alter table tintoreria_francia.supply_items
  add constraint supply_items_quantity_milli_check
  check (quantity_milli between 1 and 999999000);
