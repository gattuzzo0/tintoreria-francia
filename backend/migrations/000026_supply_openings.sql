-- Apertura de un insumo (una caja de ganchos, un bote de cloro). Sin cantidad ni stock.
-- Aplicar en SQL Editor.
-- Rollback: drop table tintoreria_francia.supply_openings;

create table if not exists tintoreria_francia.supply_openings (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Nereo Rdz.', 'Sucursal móvil', 'Centro')),
  item text not null check (char_length(item) between 1 and 80),
  opened_on date not null check (opened_on between date '2020-01-01' and date '2100-12-31'),
  staff_user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_tintoreria_francia_supply_openings_branch_opened_on
  on tintoreria_francia.supply_openings (branch, opened_on desc);

alter table tintoreria_francia.supply_openings enable row level security;
alter table tintoreria_francia.supply_openings force row level security;
revoke all on tintoreria_francia.supply_openings from anon, authenticated;
grant all on tintoreria_francia.supply_openings to service_role;
