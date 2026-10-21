-- Una orden puede tener la foto de recepción y más fotos tomadas en las notas.
-- Aplicar en SQL Editor. Rollback: drop index idx_tintoreria_francia_order_photos_folio;
--   create unique index idx_tintoreria_francia_order_photos_folio
--     on tintoreria_francia.order_photos (order_folio) where order_folio is not null;

drop index if exists tintoreria_francia.idx_tintoreria_francia_order_photos_folio;

create index if not exists idx_tintoreria_francia_order_photos_folio
  on tintoreria_francia.order_photos (order_folio);
