-- Gastos de la sucursal (fecha, monto en centavos, concepto, forma de pago).
-- Aplicar en SQL Editor.
-- Rollback: drop table tintoreria_francia.expenses;

create table if not exists tintoreria_francia.expenses (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Nereo Rdz.', 'Sucursal móvil', 'Centro')),
  spent_on date not null check (spent_on between date '2020-01-01' and date '2100-12-31'),
  -- Pesos enteros, de $1 a $9,999,999, guardados en centavos.
  amount_cents integer not null check (
    amount_cents between 100 and 999999900 and amount_cents % 100 = 0
  ),
  concept text not null check (char_length(concept) between 1 and 200),
  payment_method text not null check (payment_method in ('efectivo', 'tarjeta', 'transferencia')),
  staff_user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_tintoreria_francia_expenses_branch_spent_on
  on tintoreria_francia.expenses (branch, spent_on desc);

alter table tintoreria_francia.expenses enable row level security;
alter table tintoreria_francia.expenses force row level security;
revoke all on tintoreria_francia.expenses from anon, authenticated;
grant all on tintoreria_francia.expenses to service_role;
