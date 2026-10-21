-- Foto de observaciones: metadata en Postgres, archivo en R2 (object_key).
-- Aplicar en SQL Editor. Rollback: drop table tintoreria_francia.order_photos;

create table if not exists tintoreria_francia.order_photos (
  id uuid primary key default gen_random_uuid(),
  order_folio integer references tintoreria_francia.orders (folio) on delete cascade,
  staff_user_id uuid references auth.users (id) on delete set null,
  object_key text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 4000000),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_tintoreria_francia_order_photos_folio
  on tintoreria_francia.order_photos (order_folio)
  where order_folio is not null;

alter table tintoreria_francia.order_photos enable row level security;
alter table tintoreria_francia.order_photos force row level security;

revoke all on table tintoreria_francia.order_photos from anon, authenticated;
grant all on table tintoreria_francia.order_photos to service_role;
