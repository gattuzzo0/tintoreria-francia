-- =====================================================================
-- Tintorería Francia · esquema tintoreria_francia
--
-- Aplicar completo en Supabase → SQL Editor (idempotente: se puede volver
-- a correr). Después:
--   1. Settings → API → Data API → "Exposed schemas": agregar tintoreria_francia.
--   2. Crear el usuario staff en Authentication → Users y darle rol:
--        insert into tintoreria_francia.profiles (id, role, full_name)
--        select id, 'admin', 'Nombre' from auth.users where email = 'correo@dominio.mx'
--        on conflict (id) do update set role = excluded.role;
--
-- Dinero: enteros en centavos MXN. Los precios del catálogo ya incluyen IVA.
-- Seguridad: RLS activado y forzado sin políticas → anon/authenticated no
-- leen nada vía PostgREST; solo la API (service_role) accede.
-- Rollback: drop schema tintoreria_francia cascade;
-- =====================================================================

create schema if not exists tintoreria_francia;

-- ---------------------------------------------------------------------
-- Perfiles de staff (rol del producto; independiente de otras apps del proyecto)
-- ---------------------------------------------------------------------
create table if not exists tintoreria_francia.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'empleado')),
  full_name text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Catálogo de servicios
-- ---------------------------------------------------------------------
create sequence if not exists tintoreria_francia.services_id_seq start 21;

create table if not exists tintoreria_francia.services (
  id text primary key default ('s' || nextval('tintoreria_francia.services_id_seq')),
  name text not null check (char_length(name) between 1 and 60),
  category text not null check (category in ('Prendas', 'Trajes', 'Hogar', 'Especiales')),
  unit text not null check (unit in ('pza', 'kg', 'par')),
  price_cents integer not null check (price_cents between 1 and 10000000),
  image_path text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Clientes (teléfono guardado solo con dígitos)
-- ---------------------------------------------------------------------
create table if not exists tintoreria_francia.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  phone text not null unique check (phone ~ '^[0-9]{10}$'),
  email text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Órdenes y líneas
-- ---------------------------------------------------------------------
create sequence if not exists tintoreria_francia.orders_folio_seq start 1001;

create table if not exists tintoreria_francia.orders (
  folio integer primary key default nextval('tintoreria_francia.orders_folio_seq'),
  customer_id uuid not null references tintoreria_francia.customers (id),
  express boolean not null default false,
  delivery_days integer not null check (delivery_days between 0 and 30),
  delivery_date date,
  payment_method text not null check (payment_method in ('efectivo', 'tarjeta', 'transferencia', 'pendiente')),
  status text not null default 'recibido' check (status in ('recibido', 'proceso', 'listo', 'entregado')),
  notes text not null default '' check (char_length(notes) <= 280),
  base_cents integer not null default 0 check (base_cents >= 0),
  surcharge_cents integer not null default 0 check (surcharge_cents >= 0),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  staff_user_id uuid references auth.users (id) on delete set null,
  idempotency_key text unique,
  branch text check (branch is null or branch in ('Nereo Rdz.', 'Sucursal móvil', 'Centro')),
  created_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now()
);

-- Fecha prometida de entrega (día local CDMX). Se rellena y se vuelve NOT NULL al final del archivo.
alter table tintoreria_francia.orders add column if not exists delivery_date date;
alter table tintoreria_francia.orders
  add column if not exists branch text
  check (branch is null or branch in ('Nereo Rdz.', 'Sucursal móvil', 'Centro'));
create index if not exists idx_tintoreria_francia_orders_branch on tintoreria_francia.orders (branch);

create table if not exists tintoreria_francia.order_lines (
  id bigint generated always as identity primary key,
  order_folio integer not null references tintoreria_francia.orders (folio) on delete cascade,
  service_id text not null references tintoreria_francia.services (id),
  name text not null,
  unit text not null,
  unit_price_cents integer not null check (unit_price_cents > 0),
  qty integer not null check (qty between 1 and 999),
  color text not null default '' check (color in ('', 'rojo', 'amarillo', 'verde', 'azul', 'azul_claro', 'morado', 'rosa', 'naranja', 'cafe', 'negro', 'blanco')),
  unique (order_folio, service_id, color)
);

-- Historial de estados (para medir tiempos de proceso). Lo llena el trigger
-- trg_tintoreria_francia_orders_status_events; la API nunca escribe aquí.
create table if not exists tintoreria_francia.order_status_events (
  id bigint generated always as identity primary key,
  order_folio integer not null references tintoreria_francia.orders (folio) on delete cascade,
  status text not null check (status in ('recibido', 'proceso', 'listo', 'entregado')),
  changed_at timestamptz not null default now()
);

create index if not exists idx_tintoreria_francia_order_status_events_order_folio
  on tintoreria_francia.order_status_events (order_folio);

-- Notas del staff durante el proceso (p. ej. "se rompió un botón"). Solo se agregan.
create table if not exists tintoreria_francia.order_notes (
  id bigint generated always as identity primary key,
  order_folio integer not null references tintoreria_francia.orders (folio) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  staff_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tintoreria_francia_order_notes_order_folio
  on tintoreria_francia.order_notes (order_folio);
create index if not exists idx_tintoreria_francia_orders_created_at on tintoreria_francia.orders (created_at desc);
create index if not exists idx_tintoreria_francia_orders_customer_id on tintoreria_francia.orders (customer_id);
create index if not exists idx_tintoreria_francia_order_lines_order_folio on tintoreria_francia.order_lines (order_folio);

-- ---------------------------------------------------------------------
-- RLS: activado + forzado, sin políticas (solo service_role)
-- ---------------------------------------------------------------------
alter table tintoreria_francia.profiles enable row level security;
alter table tintoreria_francia.profiles force row level security;
alter table tintoreria_francia.services enable row level security;
alter table tintoreria_francia.services force row level security;
alter table tintoreria_francia.customers enable row level security;
alter table tintoreria_francia.customers force row level security;
alter table tintoreria_francia.orders enable row level security;
alter table tintoreria_francia.orders force row level security;
alter table tintoreria_francia.order_lines enable row level security;
alter table tintoreria_francia.order_lines force row level security;
alter table tintoreria_francia.order_status_events enable row level security;
alter table tintoreria_francia.order_status_events force row level security;
alter table tintoreria_francia.order_notes enable row level security;
alter table tintoreria_francia.order_notes force row level security;

revoke all on schema tintoreria_francia from anon, authenticated;
revoke all on all tables in schema tintoreria_francia from anon, authenticated;
revoke all on all sequences in schema tintoreria_francia from anon, authenticated;

grant usage on schema tintoreria_francia to service_role;
grant all on all tables in schema tintoreria_francia to service_role;
grant all on all sequences in schema tintoreria_francia to service_role;

-- ---------------------------------------------------------------------
-- Totales: misma fórmula que el frontend (precios con IVA incluido)
--   base = Σ precio·cant; recargo = round(base·0.30) si exprés
--   total = base + recargo; subtotal = round(total / 1.16); iva = total − subtotal
-- ---------------------------------------------------------------------
create or replace function tintoreria_francia.recalc_order_totals(p_folio integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_express boolean;
  v_base integer;
  v_surcharge integer;
  v_total integer;
  v_subtotal integer;
begin
  select express into v_express from tintoreria_francia.orders where folio = p_folio;
  select coalesce(sum(unit_price_cents * qty), 0) into v_base
    from tintoreria_francia.order_lines where order_folio = p_folio;
  v_surcharge := case when v_express then round(v_base * 0.30)::integer else 0 end;
  v_total := v_base + v_surcharge;
  v_subtotal := round(v_total / 1.16)::integer;
  update tintoreria_francia.orders
     set base_cents = v_base,
         surcharge_cents = v_surcharge,
         total_cents = v_total,
         subtotal_cents = v_subtotal,
         tax_cents = v_total - v_subtotal
   where folio = p_folio;
end;
$$;

-- ---------------------------------------------------------------------
-- create_order: crea orden + líneas en una transacción. Los precios se
-- resuelven del catálogo (nunca del cliente). Idempotente por p_idempotency_key.
-- p_lines: [{"serviceId": "s1", "qty": 2}, ...]
-- p_delivery_date (día local CDMX): regular +5…+15; exprés hoy, mañana o +2. Domingo → lunes.
-- ---------------------------------------------------------------------
drop function if exists tintoreria_francia.create_order(uuid, uuid, boolean, text, text, jsonb, text);
drop function if exists tintoreria_francia.create_order(uuid, uuid, boolean, text, text, jsonb, date, text);
drop function if exists tintoreria_francia.create_order(uuid, uuid, boolean, text, text, jsonb, date, text, text);

create or replace function tintoreria_francia.create_order(
  p_staff_user_id uuid,
  p_customer_id uuid,
  p_express boolean,
  p_payment_method text,
  p_notes text,
  p_lines jsonb,
  p_delivery_date date,
  p_branch text,
  p_idempotency_key text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_folio integer;
  v_line jsonb;
  v_service tintoreria_francia.services%rowtype;
  v_qty integer;
  v_color text;
  v_today date := (now() at time zone 'America/Mexico_City')::date;
  v_same date;
  v_next date;
  v_urgent date;
  v_regular_min date;
begin
  if p_idempotency_key is not null then
    select folio into v_folio from tintoreria_francia.orders where idempotency_key = p_idempotency_key;
    if found then
      return v_folio;
    end if;
  end if;

  if p_branch is null or p_branch not in ('Nereo Rdz.', 'Sucursal móvil', 'Centro') then
    raise exception 'Sucursal inválida' using errcode = '22023';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'La orden requiere al menos un servicio' using errcode = '22023';
  end if;

  if not exists (select 1 from tintoreria_francia.customers where id = p_customer_id) then
    raise exception 'Cliente no encontrado' using errcode = '22023';
  end if;

  v_same := v_today + (extract(dow from v_today)::int = 0)::int;
  v_next := v_today + 1 + (extract(dow from (v_today + 1))::int = 0)::int;
  v_urgent := v_today + 2 + (extract(dow from (v_today + 2))::int = 0)::int;
  v_regular_min := v_today + 5 + (extract(dow from (v_today + 5))::int = 0)::int;

  if p_delivery_date is not null and extract(dow from p_delivery_date) = 0 then
    raise exception 'No entregamos en domingo' using errcode = '22023';
  end if;

  if p_express then
    if p_delivery_date is null or p_delivery_date not in (v_same, v_next, v_urgent) then
      raise exception 'La entrega exprés debe ser hoy, mañana o en 2 días, y no en domingo' using errcode = '22023';
    end if;
  elsif p_delivery_date is null or p_delivery_date < v_regular_min or p_delivery_date > v_today + 15 then
    raise exception 'La entrega regular debe ser entre 5 y 15 días, sin domingos' using errcode = '22023';
  end if;

  insert into tintoreria_francia.orders
    (customer_id, express, delivery_days, delivery_date, payment_method, notes, staff_user_id, idempotency_key, branch)
  values (p_customer_id, p_express, p_delivery_date - v_today, p_delivery_date, p_payment_method,
          coalesce(p_notes, ''), p_staff_user_id, p_idempotency_key, p_branch)
  returning folio into v_folio;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line ->> 'qty')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 999 then
      raise exception 'Cantidad inválida' using errcode = '22023';
    end if;

    v_color := v_line ->> 'color';
    if v_color is null or v_color not in ('rojo', 'amarillo', 'verde', 'azul', 'azul_claro', 'morado', 'rosa', 'naranja', 'cafe', 'negro', 'blanco') then
      raise exception 'Color inválido' using errcode = '22023';
    end if;

    select * into v_service from tintoreria_francia.services
     where id = v_line ->> 'serviceId' and active;
    if not found then
      raise exception 'Servicio no disponible: %', v_line ->> 'serviceId' using errcode = '22023';
    end if;

    insert into tintoreria_francia.order_lines (order_folio, service_id, name, unit, unit_price_cents, qty, color)
    values (v_folio, v_service.id, v_service.name, v_service.unit, v_service.price_cents, v_qty, v_color);
  end loop;

  perform tintoreria_francia.recalc_order_totals(v_folio);
  return v_folio;
end;
$$;

create or replace function tintoreria_francia.log_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into tintoreria_francia.order_status_events (order_folio, status, changed_at)
    values (new.folio, new.status, case when tg_op = 'INSERT' then new.created_at else new.status_updated_at end);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tintoreria_francia_orders_status_events on tintoreria_francia.orders;
create trigger trg_tintoreria_francia_orders_status_events
  after insert or update of status on tintoreria_francia.orders
  for each row execute function tintoreria_francia.log_order_status();

revoke all on function tintoreria_francia.log_order_status() from public, anon, authenticated;
revoke all on function tintoreria_francia.recalc_order_totals(integer) from public, anon, authenticated;
revoke all on function tintoreria_francia.create_order(uuid, uuid, boolean, text, text, jsonb, date, text, text) from public, anon, authenticated;
grant execute on function tintoreria_francia.recalc_order_totals(integer) to service_role;
grant execute on function tintoreria_francia.create_order(uuid, uuid, boolean, text, text, jsonb, date, text, text) to service_role;

-- ---------------------------------------------------------------------
-- Datos iniciales
-- ---------------------------------------------------------------------
insert into tintoreria_francia.services (id, name, category, unit, price_cents, image_path, sort_order) values
  ('s1',  'Camisa',              'Prendas',    'pza',   4500, '/services/s1.png',   1),
  ('s2',  'Blusa',               'Prendas',    'pza',   5500, '/services/s2.png',   2),
  ('s3',  'Pantalón',            'Prendas',    'pza',   7000, '/services/s3.png',   3),
  ('s4',  'Falda',               'Prendas',    'pza',   6500, '/services/s4.png',   4),
  ('s5',  'Suéter',              'Prendas',    'pza',   8500, '/services/s5.png',   5),
  ('s6',  'Abrigo',              'Prendas',    'pza',  22000, '/services/s6.png',   6),
  ('s7',  'Lavado por kilo',     'Prendas',    'kg',    3800, '/services/s7.png',   7),
  ('s8',  'Traje 2 piezas',      'Trajes',     'pza',  21000, '/services/s8.png',   8),
  ('s9',  'Traje 3 piezas',      'Trajes',     'pza',  26000, '/services/s9.png',   9),
  ('s10', 'Saco',                'Trajes',     'pza',  14000, '/services/s10.png', 10),
  ('s11', 'Corbata',             'Trajes',     'pza',   5000, '/services/s11.png', 11),
  ('s12', 'Edredón matrimonial', 'Hogar',      'pza',  32000, '/services/s12.png', 12),
  ('s13', 'Edredón king',        'Hogar',      'pza',  38000, '/services/s13.png', 13),
  ('s14', 'Cortina (panel)',     'Hogar',      'pza',  16000, '/services/s14.png', 14),
  ('s15', 'Mantel',              'Hogar',      'pza',  12000, '/services/s15.png', 15),
  ('s16', 'Vestido de noche',    'Especiales', 'pza',  38000, '/services/s16.png', 16),
  ('s17', 'Vestido de novia',    'Especiales', 'pza', 145000, '/services/s17.png', 17),
  ('s18', 'Prenda de piel',      'Especiales', 'pza',  52000, '/services/s18.png', 18),
  ('s19', 'Tenis',               'Especiales', 'par',  18000, '/services/s19.png', 19),
  ('s20', 'Desmanchado',         'Especiales', 'pza',   9000, '/services/s20.png', 20)
on conflict (id) do nothing;

insert into tintoreria_francia.customers (id, name, phone, email) values
  ('00000000-0000-4000-8000-000000000001', 'Mariana López',   '5523148890', 'mariana.lopez@correo.mx'),
  ('00000000-0000-4000-8000-000000000002', 'Javier Ortega',   '5544710923', null),
  ('00000000-0000-4000-8000-000000000003', 'Sofía Ramírez',   '5590123345', 'sofia.rmz@correo.mx'),
  ('00000000-0000-4000-8000-000000000004', 'Andrés Castillo', '5566201178', null),
  ('00000000-0000-4000-8000-000000000005', 'Lucía Fernández', '5533985521', null)
on conflict (id) do nothing;

do $$
begin
  if exists (select 1 from tintoreria_francia.orders) then
    return;
  end if;

  insert into tintoreria_francia.orders (folio, customer_id, express, delivery_days, delivery_date, payment_method, status, notes, created_at) values
    (1041, '00000000-0000-4000-8000-000000000001', false, 2, '2026-10-14', 'tarjeta',       'recibido',  'Almidón ligero en camisas', '2026-10-12T09:12:00-06:00'),
    (1040, '00000000-0000-4000-8000-000000000003', true,  1, '2026-10-13', 'pendiente',     'recibido',  '', '2026-10-12T08:47:00-06:00'),
    (1039, '00000000-0000-4000-8000-000000000002', false, 2, '2026-10-13', 'tarjeta',       'proceso',   '', '2026-10-11T17:30:00-06:00'),
    (1038, '00000000-0000-4000-8000-000000000004', false, 2, '2026-10-13', 'efectivo',      'proceso',   '', '2026-10-11T12:05:00-06:00'),
    (1037, '00000000-0000-4000-8000-000000000005', false, 2, '2026-10-12', 'transferencia', 'listo',     '', '2026-10-10T19:22:00-06:00'),
    (1036, '00000000-0000-4000-8000-000000000001', false, 2, '2026-10-12', 'tarjeta',       'listo',     '', '2026-10-10T10:14:00-06:00'),
    (1035, '00000000-0000-4000-8000-000000000002', false, 2, '2026-10-11', 'efectivo',      'entregado', '', '2026-10-09T16:40:00-06:00');

  insert into tintoreria_francia.order_lines (order_folio, service_id, name, unit, unit_price_cents, qty)
  select l.folio, s.id, s.name, s.unit, s.price_cents, l.qty
    from (values
      (1041, 's1', 5), (1041, 's3', 2),
      (1040, 's16', 1),
      (1039, 's8', 2), (1039, 's11', 3),
      (1038, 's12', 1), (1038, 's15', 2),
      (1037, 's7', 6),
      (1036, 's6', 1), (1036, 's5', 2),
      (1035, 's1', 8)
    ) as l (folio, service_id, qty)
    join tintoreria_francia.services s on s.id = l.service_id;

  perform tintoreria_francia.recalc_order_totals(folio) from tintoreria_francia.orders;
  perform setval('tintoreria_francia.orders_folio_seq', 1041);
end;
$$;

-- Relleno del historial para órdenes creadas antes del trigger: solo se conoce
-- la recepción y el último cambio de estado (status_updated_at).
with pending as (
  select o.* from tintoreria_francia.orders o
   where not exists (select 1 from tintoreria_francia.order_status_events x where x.order_folio = o.folio)
)
insert into tintoreria_francia.order_status_events (order_folio, status, changed_at)
select folio, 'recibido', created_at from pending
union all
select folio, status, status_updated_at from pending where status <> 'recibido';

-- Fecha de entrega para órdenes previas a la columna: día de recepción + delivery_days.
update tintoreria_francia.orders
   set delivery_date = (created_at at time zone 'America/Mexico_City')::date + delivery_days
 where delivery_date is null;
alter table tintoreria_francia.orders alter column delivery_date set not null;
