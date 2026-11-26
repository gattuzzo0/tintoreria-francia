-- Artículos de inventario que luego se descontarán. Solo nombre y unidad.
-- Aplicar en SQL Editor.
-- Rollback: drop table tintoreria_francia.supply_items;

create table if not exists tintoreria_francia.supply_items (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Nereo Rdz.', 'Sucursal móvil', 'Centro')),
  name text not null check (char_length(name) between 1 and 80),
  unit text not null check (unit in ('litro', 'kilogramo', 'pza')),
  staff_user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_tintoreria_francia_supply_items_branch_name
  on tintoreria_francia.supply_items (branch, lower(name));

alter table tintoreria_francia.supply_items enable row level security;
alter table tintoreria_francia.supply_items force row level security;
revoke all on tintoreria_francia.supply_items from anon, authenticated;
grant all on tintoreria_francia.supply_items to service_role;
