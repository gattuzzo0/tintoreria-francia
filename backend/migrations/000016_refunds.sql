-- Reembolso en efectivo de una orden ya cobrada. Una vez por folio.
-- Aplicar en SQL Editor.
-- Rollback: drop table tintoreria_francia.refunds;

create table if not exists tintoreria_francia.refunds (
  id uuid primary key default gen_random_uuid(),
  folio integer not null unique references tintoreria_francia.orders (folio),
  branch text not null check (branch in ('Nereo Rdz.', 'Sucursal móvil', 'Centro')),
  amount_cents integer not null check (amount_cents > 0),
  original_payment text not null check (original_payment in ('efectivo', 'tarjeta')),
  recharged_at timestamptz,
  staff_user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_tintoreria_francia_refunds_branch_created_at
  on tintoreria_francia.refunds (branch, created_at desc);

alter table tintoreria_francia.refunds enable row level security;
alter table tintoreria_francia.refunds force row level security;
revoke all on tintoreria_francia.refunds from anon, authenticated;
grant all on tintoreria_francia.refunds to service_role;
