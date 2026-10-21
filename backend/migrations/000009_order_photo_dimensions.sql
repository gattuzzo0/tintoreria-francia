-- Ancho y alto del full preparado. El thumb no tiene fila: se deriva del object_key.
-- Aplicar en SQL Editor. Rollback:
--   alter table tintoreria_francia.order_photos drop column if exists width, drop column if exists height;
--   alter table tintoreria_francia.order_photos drop constraint if exists order_photos_content_type_check;
--   alter table tintoreria_francia.order_photos add constraint order_photos_content_type_check
--     check (content_type in ('image/jpeg', 'image/png', 'image/webp'));

alter table tintoreria_francia.order_photos
  add column if not exists width integer,
  add column if not exists height integer;

alter table tintoreria_francia.order_photos
  drop constraint if exists order_photos_content_type_check;

alter table tintoreria_francia.order_photos
  add constraint order_photos_content_type_check
  check (content_type in ('image/jpeg', 'image/webp'));

alter table tintoreria_francia.order_photos
  drop constraint if exists order_photos_width_check;

alter table tintoreria_francia.order_photos
  add constraint order_photos_width_check
  check (width is null or width between 1 and 1080);

alter table tintoreria_francia.order_photos
  drop constraint if exists order_photos_height_check;

alter table tintoreria_francia.order_photos
  add constraint order_photos_height_check
  check (height is null or height between 1 and 1440);
