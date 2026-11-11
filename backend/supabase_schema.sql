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
  category text not null check (category in (
    'Abrigos, gabardinas y prendas de invierno',
    'Chamarras y prendas deportivas',
    'Sacos, blazers y trajes',
    'Pantalones y prendas inferiores',
    'Camisas, blusas y prendas superiores',
    'Vestidos',
    'Faldas',
    'Suéteres y tejidos',
    'Ropa de caballero y accesorios',
    'Ropa infantil y de bebé',
    'Ropa de cama',
    'Cortinas y decoración textil',
    'Uniformes y ropa de trabajo',
    'Artículos especiales',
    'Servicios adicionales de lavandería',
    'Desmanchado y otros servicios'
  )),
  unit text not null check (unit in ('pza', 'kg', 'par', 'm')),
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
  rfc text check (rfc is null or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  legal_name text check (legal_name is null or char_length(legal_name) between 1 and 254),
  fiscal_zip text check (fiscal_zip is null or fiscal_zip ~ '^[0-9]{5}$'),
  tax_regime text check (tax_regime is null or tax_regime in (
    '601', '603', '605', '606', '607', '608', '610', '611', '612', '614', '615', '616',
    '620', '621', '622', '623', '624', '625', '626'
  )),
  cfdi_use text check (cfdi_use is null or cfdi_use in (
    'G01', 'G02', 'G03', 'I01', 'I02', 'I03', 'I04', 'I05', 'I06', 'I07', 'I08',
    'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10',
    'S01', 'CP01', 'CN01'
  )),
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
  wants_invoice boolean not null default false,
  status text not null default 'recibido' check (status in ('recibido', 'proceso', 'listo', 'entregado')),
  notes text not null default '' check (char_length(notes) <= 280),
  base_cents integer not null default 0 check (base_cents >= 0),
  surcharge_cents integer not null default 0 check (surcharge_cents >= 0),
  -- Porcentaje aplicado al crear. null = orden vieja, el recargo ya está en surcharge_cents (30% si exprés).
  surcharge_pct smallint check (surcharge_pct is null or surcharge_pct between 0 and 100),
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

-- PDF y XML de la factura hecha fuera del sistema. Ver migrations/000014_order_invoice_files.sql.
alter table tintoreria_francia.orders
  add column if not exists invoice_pdf_key text,
  add column if not exists invoice_xml_key text;
alter table tintoreria_francia.orders
  drop constraint if exists orders_invoice_pdf_key_check,
  add constraint orders_invoice_pdf_key_check
    check (
      invoice_pdf_key is null
      or invoice_pdf_key ~ '^invoices/[0-9]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
    ),
  drop constraint if exists orders_invoice_xml_key_check,
  add constraint orders_invoice_xml_key_check
    check (
      invoice_xml_key is null
      or invoice_xml_key ~ '^invoices/[0-9]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.xml$'
    );

create table if not exists tintoreria_francia.order_lines (
  id bigint generated always as identity primary key,
  order_folio integer not null references tintoreria_francia.orders (folio) on delete cascade,
  service_id text not null references tintoreria_francia.services (id),
  name text not null,
  unit text not null,
  unit_price_cents integer not null check (unit_price_cents > 0),
  qty integer not null check (qty between 1 and 999),
  color text not null default '' check (color in ('', 'rojo', 'amarillo', 'verde', 'azul', 'azul_claro', 'morado', 'rosa', 'naranja', 'cafe', 'negro', 'blanco')),
  fill text not null default '' check (fill in ('', 'medio', 'abundante', 'maxi')),
  length text not null default '' check (length in ('', 'tres_cuartos', 'mediapierna', 'largo', 'extra')),
  unique (order_folio, service_id, color, fill, length)
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

-- Foto de observaciones. El archivo vive en R2; aquí solo la llave.
create table if not exists tintoreria_francia.order_photos (
  id uuid primary key default gen_random_uuid(),
  order_folio integer references tintoreria_francia.orders (folio) on delete cascade,
  staff_user_id uuid references auth.users (id) on delete set null,
  object_key text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 4000000),
  width integer check (width between 1 and 1080),
  height integer check (height between 1 and 1440),
  created_at timestamptz not null default now()
);

create index if not exists idx_tintoreria_francia_order_photos_folio
  on tintoreria_francia.order_photos (order_folio);
-- Un solo renglón. Porcentajes de cargo exprés (0–100).
create table if not exists tintoreria_francia.delivery_rates (
  id boolean primary key default true check (id),
  extra_same_pct smallint not null default 30 check (extra_same_pct between 0 and 100),
  extra_next_pct smallint not null default 30 check (extra_next_pct between 0 and 100),
  urgent_pct smallint not null default 30 check (urgent_pct between 0 and 100)
);

insert into tintoreria_francia.delivery_rates (id) values (true) on conflict do nothing;

-- Gastos de sucursal. Ver migrations/000015_expenses.sql.
create table if not exists tintoreria_francia.expenses (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Nereo Rdz.', 'Sucursal móvil', 'Centro')),
  spent_on date not null check (spent_on between date '2020-01-01' and date '2100-12-31'),
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

-- Reembolso en efectivo. Ver migrations/000016_refunds.sql.
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
alter table tintoreria_francia.order_photos enable row level security;
alter table tintoreria_francia.order_photos force row level security;
alter table tintoreria_francia.delivery_rates enable row level security;
alter table tintoreria_francia.delivery_rates force row level security;
alter table tintoreria_francia.expenses enable row level security;
alter table tintoreria_francia.expenses force row level security;
alter table tintoreria_francia.refunds enable row level security;
alter table tintoreria_francia.refunds force row level security;

revoke all on schema tintoreria_francia from anon, authenticated;
revoke all on all tables in schema tintoreria_francia from anon, authenticated;
revoke all on all sequences in schema tintoreria_francia from anon, authenticated;

grant usage on schema tintoreria_francia to service_role;
grant all on all tables in schema tintoreria_francia to service_role;
grant all on all sequences in schema tintoreria_francia to service_role;

-- ---------------------------------------------------------------------
-- Totales: misma fórmula que el frontend (precios con IVA incluido)
--   base = Σ precio·cant; recargo = round(base·surcharge_pct/100)
--   total = base + recargo; subtotal = round(total / 1.16); iva = total − subtotal
-- ---------------------------------------------------------------------
create or replace function tintoreria_francia.recalc_order_totals(p_folio integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pct integer;
  v_base integer;
  v_surcharge integer;
  v_total integer;
  v_subtotal integer;
begin
  select coalesce(surcharge_pct, case when express then 30 else 0 end) into v_pct
    from tintoreria_francia.orders where folio = p_folio;
  select coalesce(sum(unit_price_cents * qty), 0) into v_base
    from tintoreria_francia.order_lines where order_folio = p_folio;
  v_surcharge := round(v_base * v_pct / 100.0)::integer;
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
-- p_lines: [{"serviceId": "s1", "qty": 2, "color": "negro", "fill": "", "length": ""}, ...]
-- fill si el nombre contiene "relleno": medio +30%, abundante +60%, maxi +85%.
-- length si el nombre contiene "largo": tres_cuartos +25%, mediapierna +50%, largo +60%, extra +70%.
-- Los porcentajes se suman sobre el precio de catálogo.
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
  v_fill text;
  v_length text;
  v_extra integer;
  v_price integer;
  v_pct integer;
  v_same_pct integer;
  v_next_pct integer;
  v_two_pct integer;
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

    select * into v_service from tintoreria_francia.services
     where id = v_line ->> 'serviceId' and active;
    if not found then
      raise exception 'Servicio no disponible: %', v_line ->> 'serviceId' using errcode = '22023';
    end if;

    v_color := coalesce(v_line ->> 'color', '');
    if v_service.unit = 'kg' then
      v_color := '';
    elsif v_color not in ('rojo', 'amarillo', 'verde', 'azul', 'azul_claro', 'morado', 'rosa', 'naranja', 'cafe', 'negro', 'blanco') then
      raise exception 'Color inválido' using errcode = '22023';
    end if;

    v_fill := coalesce(v_line ->> 'fill', '');
    v_length := coalesce(v_line ->> 'length', '');
    v_extra := 0;
    if position('relleno' in lower(v_service.name)) > 0 then
      if v_fill not in ('medio', 'abundante', 'maxi') then
        raise exception 'Elige el tipo de relleno' using errcode = '22023';
      end if;
      v_extra := v_extra + case v_fill when 'medio' then 30 when 'abundante' then 60 else 85 end;
    elsif v_fill <> '' then
      raise exception 'Este servicio no lleva relleno' using errcode = '22023';
    end if;
    if position('largo' in lower(v_service.name)) > 0 then
      if v_length not in ('tres_cuartos', 'mediapierna', 'largo', 'extra') then
        raise exception 'Elige el largo' using errcode = '22023';
      end if;
      v_extra := v_extra + case v_length
        when 'tres_cuartos' then 25
        when 'mediapierna' then 50
        when 'largo' then 60
        else 70
      end;
    elsif v_length <> '' then
      raise exception 'Este servicio no lleva largo' using errcode = '22023';
    end if;
    v_price := round(v_service.price_cents * (100 + v_extra) / 100.0)::integer;

    insert into tintoreria_francia.order_lines (order_folio, service_id, name, unit, unit_price_cents, qty, color, fill, length)
    values (v_folio, v_service.id, v_service.name, v_service.unit, v_price, v_qty, v_color, v_fill, v_length);
  end loop;

  select extra_same_pct, extra_next_pct, urgent_pct
    into v_same_pct, v_next_pct, v_two_pct
    from tintoreria_francia.delivery_rates
   where id;

  v_pct := case
    when not p_express then 0
    when p_delivery_date = v_same then v_same_pct
    when p_delivery_date = v_next then v_next_pct
    when p_delivery_date = v_urgent then v_two_pct
    else 0
  end;

  update tintoreria_francia.orders set surcharge_pct = v_pct where folio = v_folio;
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
-- Catálogo vigente. En una base ya poblada, aplicar migrations/000017_catalog.sql
-- (este insert no pisa filas existentes: on conflict do nothing).
insert into tintoreria_francia.services (id, name, category, unit, price_cents, sort_order) values
  ('s1', 'Abrigo', 'Abrigos, gabardinas y prendas de invierno', 'pza', 12000, 1),
  ('s2', 'Abrigo de cashmere', 'Abrigos, gabardinas y prendas de invierno', 'pza', 15000, 2),
  ('s3', 'Abrigo con forro', 'Abrigos, gabardinas y prendas de invierno', 'pza', 15000, 3),
  ('s4', 'Gabardina corta', 'Abrigos, gabardinas y prendas de invierno', 'pza', 12000, 4),
  ('s5', 'Gabardina con forro', 'Abrigos, gabardinas y prendas de invierno', 'pza', 15000, 5),
  ('s6', 'Capa', 'Abrigos, gabardinas y prendas de invierno', 'pza', 12000, 6),
  ('s7', 'Poncho', 'Abrigos, gabardinas y prendas de invierno', 'pza', 15000, 7),
  ('s8', 'Ruana/zarape', 'Abrigos, gabardinas y prendas de invierno', 'pza', 18000, 8),
  ('s9', 'Chamarra ligera', 'Chamarras y prendas deportivas', 'pza', 9000, 9),
  ('s10', 'Chamarra de mezclilla', 'Chamarras y prendas deportivas', 'pza', 10000, 10),
  ('s11', 'Chamarra', 'Chamarras y prendas deportivas', 'pza', 12000, 11),
  ('s12', 'Chamarra de plumas', 'Chamarras y prendas deportivas', 'pza', 17000, 12),
  ('s13', 'Chamarra impermeable', 'Chamarras y prendas deportivas', 'pza', 12000, 13),
  ('s14', 'Chamarra rompevientos', 'Chamarras y prendas deportivas', 'pza', 10000, 14),
  ('s15', 'Chamarra de piel', 'Chamarras y prendas deportivas', 'pza', 35000, 15),
  ('s16', 'Chamarra de gamuza', 'Chamarras y prendas deportivas', 'pza', 25000, 16),
  ('s17', 'Chamarra de motociclista/piel', 'Chamarras y prendas deportivas', 'pza', 45000, 17),
  ('s18', 'Chaleco ligero', 'Chamarras y prendas deportivas', 'pza', 9000, 18),
  ('s19', 'Chaleco relleno', 'Chamarras y prendas deportivas', 'pza', 10000, 19),
  ('s20', 'Chaleco de plumas', 'Chamarras y prendas deportivas', 'pza', 13000, 20),
  ('s21', 'Chaleco de vestir/mezclilla o tela', 'Chamarras y prendas deportivas', 'pza', 9000, 21),
  ('s22', 'Chaleco de piel', 'Chamarras y prendas deportivas', 'pza', 20000, 22),
  ('s23', 'Sudadera', 'Chamarras y prendas deportivas', 'pza', 9000, 23),
  ('s24', 'Pants', 'Chamarras y prendas deportivas', 'pza', 9000, 24),
  ('s25', 'Conjunto deportivo', 'Chamarras y prendas deportivas', 'pza', 18000, 25),
  ('s26', 'Saco de caballero', 'Sacos, blazers y trajes', 'pza', 9000, 26),
  ('s27', 'Saco de lino', 'Sacos, blazers y trajes', 'pza', 10000, 27),
  ('s28', 'Blazer', 'Sacos, blazers y trajes', 'pza', 9000, 28),
  ('s29', 'Saco con bordados', 'Sacos, blazers y trajes', 'pza', 12000, 29),
  ('s30', 'Saco de etiqueta', 'Sacos, blazers y trajes', 'pza', 12000, 30),
  ('s31', 'Smoking 2 piezas', 'Sacos, blazers y trajes', 'pza', 20000, 31),
  ('s32', 'Traje de dos piezas', 'Sacos, blazers y trajes', 'pza', 18000, 32),
  ('s33', 'Traje de tres piezas', 'Sacos, blazers y trajes', 'pza', 23000, 33),
  ('s34', 'Traje de lino 2 piezas', 'Sacos, blazers y trajes', 'pza', 20000, 34),
  ('s35', 'Chaleco de traje', 'Sacos, blazers y trajes', 'pza', 5000, 35),
  ('s36', 'Pantalón de traje/pantalón', 'Sacos, blazers y trajes', 'pza', 9000, 36),
  ('s37', 'Pantalón de lino', 'Pantalones y prendas inferiores', 'pza', 10000, 37),
  ('s38', 'Pantalón de seda', 'Pantalones y prendas inferiores', 'pza', 10000, 38),
  ('s39', 'Pantalón de piel', 'Pantalones y prendas inferiores', 'pza', 20000, 39),
  ('s40', 'Leggings', 'Pantalones y prendas inferiores', 'pza', 9000, 40),
  ('s41', 'Falda pantalón', 'Pantalones y prendas inferiores', 'pza', 12000, 41),
  ('s42', 'Overol', 'Pantalones y prendas inferiores', 'pza', 12000, 42),
  ('s43', 'Jumpsuit', 'Pantalones y prendas inferiores', 'pza', 16000, 43),
  ('s44', 'Camisa de caballero manga larga/corta', 'Camisas, blusas y prendas superiores', 'pza', 9000, 44),
  ('s45', 'Camisa de lino', 'Camisas, blusas y prendas superiores', 'pza', 10000, 45),
  ('s46', 'Camisa de seda', 'Camisas, blusas y prendas superiores', 'pza', 10000, 46),
  ('s47', 'Camisa con bordados', 'Camisas, blusas y prendas superiores', 'pza', 12000, 47),
  ('s48', 'Blusa', 'Camisas, blusas y prendas superiores', 'pza', 9000, 48),
  ('s49', 'Blusa de seda', 'Camisas, blusas y prendas superiores', 'pza', 10000, 49),
  ('s50', 'Blusa de lino', 'Camisas, blusas y prendas superiores', 'pza', 10000, 50),
  ('s51', 'Blusa bordada', 'Camisas, blusas y prendas superiores', 'pza', 12000, 51),
  ('s52', 'Blusa con olanes', 'Camisas, blusas y prendas superiores', 'pza', 10000, 52),
  ('s53', 'Blusón', 'Camisas, blusas y prendas superiores', 'pza', 10000, 53),
  ('s54', 'Túnica', 'Camisas, blusas y prendas superiores', 'pza', 18000, 54),
  ('s55', 'Playera', 'Camisas, blusas y prendas superiores', 'pza', 9000, 55),
  ('s56', 'Top', 'Camisas, blusas y prendas superiores', 'pza', 9000, 56),
  ('s57', 'Crop top', 'Camisas, blusas y prendas superiores', 'pza', 9000, 57),
  ('s58', 'Corsé', 'Camisas, blusas y prendas superiores', 'pza', 9000, 58),
  ('s59', 'Vestido casual', 'Vestidos', 'pza', 9000, 59),
  ('s60', 'Vestido camisero', 'Vestidos', 'pza', 10000, 60),
  ('s61', 'Vestido de seda', 'Vestidos', 'pza', 12000, 61),
  ('s62', 'Vestido de lino', 'Vestidos', 'pza', 12000, 62),
  ('s63', 'Vestido de punto/tejido', 'Vestidos', 'pza', 12000, 63),
  ('s64', 'Vestido de mezclilla', 'Vestidos', 'pza', 10000, 64),
  ('s65', 'Vestido de noche', 'Vestidos', 'pza', 12000, 65),
  ('s66', 'Vestido con varias capas', 'Vestidos', 'pza', 16000, 66),
  ('s67', 'Vestido de seda de fiesta', 'Vestidos', 'pza', 16000, 67),
  ('s68', 'Vestido tableado', 'Vestidos', 'pza', 20000, 68),
  ('s69', 'Vestido con cola', 'Vestidos', 'pza', 15000, 69),
  ('s70', 'Vestido de novia', 'Vestidos', 'pza', 60000, 70),
  ('s71', 'Vestido de quinceañera', 'Vestidos', 'pza', 60000, 71),
  ('s72', 'Vestido de primera comunión', 'Vestidos', 'pza', 30000, 72),
  ('s73', 'Vestido de bautizo', 'Vestidos', 'pza', 25000, 73),
  ('s74', 'Vestido de presentación', 'Vestidos', 'pza', 30000, 74),
  ('s75', 'Velo de novia', 'Vestidos', 'pza', 10000, 75),
  ('s76', 'Falda', 'Faldas', 'pza', 9000, 76),
  ('s77', 'Falda plisada', 'Faldas', 'pza', 13000, 77),
  ('s78', 'Falda de tablas', 'Faldas', 'pza', 16000, 78),
  ('s79', 'Falda de mezclilla', 'Faldas', 'pza', 9000, 79),
  ('s80', 'Falda de vestir', 'Faldas', 'pza', 9000, 80),
  ('s81', 'Falda de piel', 'Faldas', 'pza', 15000, 81),
  ('s82', 'Falda bordada', 'Faldas', 'pza', 12000, 82),
  ('s83', 'Suéter/cardigan', 'Suéteres y tejidos', 'pza', 9000, 83),
  ('s84', 'Poncho tejido', 'Suéteres y tejidos', 'pza', 16000, 84),
  ('s85', 'Chal tejido', 'Suéteres y tejidos', 'pza', 12000, 85),
  ('s86', 'Chalina', 'Suéteres y tejidos', 'pza', 10000, 86),
  ('s87', 'Bufanda', 'Suéteres y tejidos', 'pza', 8000, 87),
  ('s88', 'Pashmina', 'Suéteres y tejidos', 'pza', 8000, 88),
  ('s89', 'Cuello tejido', 'Suéteres y tejidos', 'pza', 7000, 89),
  ('s90', 'Guantes', 'Suéteres y tejidos', 'pza', 7000, 90),
  ('s91', 'Gorro', 'Suéteres y tejidos', 'pza', 7000, 91),
  ('s92', 'Boina', 'Suéteres y tejidos', 'pza', 7000, 92),
  ('s93', 'Pasamontañas', 'Suéteres y tejidos', 'pza', 7000, 93),
  ('s94', 'Corbata', 'Ropa de caballero y accesorios', 'pza', 6000, 94),
  ('s95', 'Corbatín', 'Ropa de caballero y accesorios', 'pza', 6000, 95),
  ('s96', 'Pañuelo de bolsillo', 'Ropa de caballero y accesorios', 'pza', 6000, 96),
  ('s97', 'Pañuelo de vestir', 'Ropa de caballero y accesorios', 'pza', 6000, 97),
  ('s98', 'Fajín', 'Ropa de caballero y accesorios', 'pza', 7000, 98),
  ('s99', 'Tirantes textiles', 'Ropa de caballero y accesorios', 'pza', 6000, 99),
  ('s100', 'Chaleco formal', 'Ropa de caballero y accesorios', 'pza', 5000, 100),
  ('s101', 'Mascada', 'Ropa de caballero y accesorios', 'pza', 6000, 101),
  ('s102', 'Pañuelo de seda', 'Ropa de caballero y accesorios', 'pza', 6000, 102),
  ('s103', 'Vestido infantil', 'Ropa infantil y de bebé', 'pza', 9000, 103),
  ('s104', 'Vestido de fiesta infantil', 'Ropa infantil y de bebé', 'pza', 11000, 104),
  ('s105', 'Traje infantil', 'Ropa infantil y de bebé', 'pza', 9000, 105),
  ('s106', 'Saco infantil', 'Ropa infantil y de bebé', 'pza', 5000, 106),
  ('s107', 'Pantalón infantil', 'Ropa infantil y de bebé', 'pza', 5000, 107),
  ('s108', 'Camisa infantil', 'Ropa infantil y de bebé', 'pza', 5000, 108),
  ('s109', 'Blusa infantil', 'Ropa infantil y de bebé', 'pza', 5000, 109),
  ('s110', 'Suéter infantil', 'Ropa infantil y de bebé', 'pza', 5000, 110),
  ('s111', 'Chamarra infantil', 'Ropa infantil y de bebé', 'pza', 9000, 111),
  ('s112', 'Abrigo infantil', 'Ropa infantil y de bebé', 'pza', 10000, 112),
  ('s113', 'Sábana de cajón', 'Ropa de cama', 'pza', 7000, 113),
  ('s114', 'Sábana plana', 'Ropa de cama', 'pza', 7000, 114),
  ('s115', 'Funda de almohada', 'Ropa de cama', 'pza', 5000, 115),
  ('s116', 'Protector de colchón', 'Ropa de cama', 'pza', 15000, 116),
  ('s117', 'Cubrecolchón Sonagre', 'Ropa de cama', 'pza', 29900, 117),
  ('s118', 'Edredón', 'Ropa de cama', 'pza', 18000, 118),
  ('s119', 'Edredón de plumas', 'Ropa de cama', 'pza', 22000, 119),
  ('s120', 'Cobertor', 'Ropa de cama', 'pza', 15000, 120),
  ('s121', 'Colcha', 'Ropa de cama', 'pza', 13000, 121),
  ('s122', 'Pie de cama', 'Ropa de cama', 'pza', 9000, 122),
  ('s123', 'Manta', 'Ropa de cama', 'pza', 9000, 123),
  ('s124', 'Frazada', 'Ropa de cama', 'pza', 12000, 124),
  ('s125', 'Almohada', 'Ropa de cama', 'pza', 12000, 125),
  ('s126', 'Cojín tubular largo', 'Ropa de cama', 'pza', 15000, 126),
  ('s127', 'Cojín decorativo con relleno', 'Ropa de cama', 'pza', 9000, 127),
  ('s128', 'Cortina ligera por metro', 'Cortinas y decoración textil', 'm', 12000, 128),
  ('s129', 'Cortina gruesa por metro', 'Cortinas y decoración textil', 'm', 18000, 129),
  ('s130', 'Cortina blackout por metro', 'Cortinas y decoración textil', 'm', 25000, 130),
  ('s131', 'Cortina de lino por metro', 'Cortinas y decoración textil', 'm', 22000, 131),
  ('s132', 'Cortina de terciopelo por metro', 'Cortinas y decoración textil', 'm', 22000, 132),
  ('s133', 'Cortina con forro por metro', 'Cortinas y decoración textil', 'm', 22000, 133),
  ('s134', 'Visillo', 'Cortinas y decoración textil', 'pza', 6000, 134),
  ('s135', 'Faldón de cama', 'Cortinas y decoración textil', 'pza', 12000, 135),
  ('s136', 'Mantel decorativo por metro', 'Cortinas y decoración textil', 'm', 15000, 136),
  ('s137', 'Camino de mesa', 'Cortinas y decoración textil', 'pza', 8000, 137),
  ('s138', 'Individuales de tela', 'Cortinas y decoración textil', 'pza', 6000, 138),
  ('s139', 'Servilletas de tela', 'Cortinas y decoración textil', 'pza', 4000, 139),
  ('s140', 'Fundas de sillas completa', 'Cortinas y decoración textil', 'pza', 12000, 140),
  ('s141', 'Fundas de cojines 30x30', 'Cortinas y decoración textil', 'pza', 6000, 141),
  ('s142', 'Toalla grande de baño', 'Cortinas y decoración textil', 'pza', 6000, 142),
  ('s143', 'Bata de laboratorio', 'Uniformes y ropa de trabajo', 'pza', 10000, 143),
  ('s144', 'Bata médica', 'Uniformes y ropa de trabajo', 'pza', 10000, 144),
  ('s145', 'Filipina', 'Uniformes y ropa de trabajo', 'pza', 14000, 145),
  ('s146', 'Uniforme de enfermería', 'Uniformes y ropa de trabajo', 'pza', 18000, 146),
  ('s147', 'Uniforme de cocina', 'Uniformes y ropa de trabajo', 'pza', 18000, 147),
  ('s148', 'Mandil de cocina', 'Uniformes y ropa de trabajo', 'pza', 10000, 148),
  ('s149', 'Uniforme industrial', 'Uniformes y ropa de trabajo', 'pza', 20000, 149),
  ('s150', 'Overol de trabajo', 'Uniformes y ropa de trabajo', 'pza', 20000, 150),
  ('s151', 'Uniforme de seguridad', 'Uniformes y ropa de trabajo', 'pza', 18000, 151),
  ('s152', 'Disfraz infantil', 'Artículos especiales', 'pza', 18000, 152),
  ('s153', 'Disfraz adulto', 'Artículos especiales', 'pza', 20000, 153),
  ('s154', 'Vestuario teatral', 'Artículos especiales', 'pza', 25000, 154),
  ('s155', 'Vestuario de danza', 'Artículos especiales', 'pza', 25000, 155),
  ('s156', 'Traje regional', 'Artículos especiales', 'pza', 25000, 156),
  ('s157', 'Vestido típico', 'Artículos especiales', 'pza', 25000, 157),
  ('s158', 'Traje de charro 2 piezas', 'Artículos especiales', 'pza', 20000, 158),
  ('s159', 'Traje de mariachi', 'Artículos especiales', 'pza', 20000, 159),
  ('s160', 'Toga de graduación', 'Artículos especiales', 'pza', 25000, 160),
  ('s161', 'Birrete', 'Artículos especiales', 'pza', 10000, 161),
  ('s162', 'Bandera textil por metro', 'Artículos especiales', 'm', 15000, 162),
  ('s163', 'Banderín', 'Artículos especiales', 'pza', 9000, 163),
  ('s164', 'Peluche pequeño', 'Artículos especiales', 'pza', 6000, 164),
  ('s165', 'Peluche mediano', 'Artículos especiales', 'pza', 12000, 165),
  ('s166', 'Peluche grande', 'Artículos especiales', 'pza', 25000, 166),
  ('s167', 'Bolsa de tela', 'Artículos especiales', 'pza', 15000, 167),
  ('s168', 'Mochila de tela', 'Artículos especiales', 'pza', 12000, 168),
  ('s169', 'Pañalera textil', 'Artículos especiales', 'pza', 15000, 169),
  ('s170', 'Autoasiento de bebé', 'Artículos especiales', 'pza', 30000, 170),
  ('s171', 'Tenis de tela', 'Artículos especiales', 'par', 15000, 171),
  ('s172', 'Tenis de piel', 'Artículos especiales', 'par', 28000, 172),
  ('s173', 'Lavado por kilogramo', 'Servicios adicionales de lavandería', 'kg', 3500, 173),
  ('s174', 'Lavado de ropa blanca', 'Servicios adicionales de lavandería', 'kg', 4500, 174),
  ('s175', 'Lavado de ropa de bebé', 'Servicios adicionales de lavandería', 'kg', 5500, 175),
  ('s176', 'Kilo de lavado hipoalergénico', 'Servicios adicionales de lavandería', 'kg', 8000, 176),
  ('s177', 'Tratamiento de olores', 'Desmanchado y otros servicios', 'pza', 6000, 177),
  ('s178', 'Desmanchado especial', 'Desmanchado y otros servicios', 'pza', 7000, 178),
  ('s179', 'Tratamiento de manchas amarillas', 'Desmanchado y otros servicios', 'pza', 5000, 179),
  ('s180', 'Servicio de teñido', 'Desmanchado y otros servicios', 'pza', 25000, 180),
  ('s181', 'Bastillas', 'Desmanchado y otros servicios', 'pza', 30000, 181),
  ('s182', 'Cierre de pantalón', 'Desmanchado y otros servicios', 'pza', 30000, 182),
  ('s183', 'Arreglos básicos', 'Desmanchado y otros servicios', 'pza', 20000, 183)
on conflict (id) do nothing;

select setval(
  'tintoreria_francia.services_id_seq',
  greatest(
    (select last_value from tintoreria_francia.services_id_seq),
    (select coalesce(max((regexp_match(id, '^s([0-9]+)$'))[1]::int), 1) from tintoreria_francia.services)
  )
);

update tintoreria_francia.services
set image_path = '/services/abrigo.jpg'
where name = 'Abrigo'
  and category = 'Abrigos, gabardinas y prendas de invierno';

update tintoreria_francia.services as s
set image_path = v.image_path
from (values
  ('Abrigo de cashmere', '/services/abrigo-cashmere.jpg'),
  ('Abrigo con forro', '/services/abrigo-forro.jpg'),
  ('Gabardina corta', '/services/gabardina-corta.jpg'),
  ('Gabardina con forro', '/services/gabardina-forro.jpg'),
  ('Capa', '/services/capa.jpg'),
  ('Poncho', '/services/poncho.jpg'),
  ('Ruana/zarape', '/services/ruana-zarape.jpg')
) as v(name, image_path)
where s.name = v.name
  and s.category = 'Abrigos, gabardinas y prendas de invierno';

-- Fotos del catálogo fuera de Abrigos. Abrigo y sus variantes están en 000018 y 000019.
-- Rollback: update tintoreria_francia.services set image_path = null
--   where image_path like '/services/%.jpg'
--     and category <> 'Abrigos, gabardinas y prendas de invierno';

update tintoreria_francia.services as s
set image_path = v.image_path
from (values
  ('Chamarra ligera', '/services/chamarra-ligera.jpg'),
  ('Chamarra de mezclilla', '/services/chamarra-mezclilla.jpg'),
  ('Chamarra', '/services/chamarra.jpg'),
  ('Chamarra de plumas', '/services/chamarra-plumas.jpg'),
  ('Chamarra impermeable', '/services/chamarra-impermeable.jpg'),
  ('Chamarra rompevientos', '/services/chamarra-rompevientos.jpg'),
  ('Chamarra de piel', '/services/chamarra-piel.jpg'),
  ('Chamarra de gamuza', '/services/chamarra-gamuza.jpg'),
  ('Chamarra de motociclista/piel', '/services/chamarra-motociclista.jpg'),
  ('Chaleco ligero', '/services/chaleco-ligero.jpg'),
  ('Chaleco relleno', '/services/chaleco-relleno.jpg'),
  ('Chaleco de plumas', '/services/chaleco-plumas.jpg'),
  ('Chaleco de vestir/mezclilla o tela', '/services/chaleco-vestir.jpg'),
  ('Chaleco de piel', '/services/chaleco-piel.jpg'),
  ('Sudadera', '/services/sudadera.jpg'),
  ('Pants', '/services/pants.jpg'),
  ('Conjunto deportivo', '/services/conjunto-deportivo.jpg')
) as v(name, image_path)
where s.name = v.name
  and s.category = 'Chamarras y prendas deportivas';

update tintoreria_francia.services as s
set image_path = v.image_path
from (values
  ('Saco de caballero', '/services/saco-caballero.jpg'),
  ('Saco de lino', '/services/saco-lino.jpg'),
  ('Blazer', '/services/blazer.jpg'),
  ('Saco con bordados', '/services/saco-bordados.jpg'),
  ('Saco de etiqueta', '/services/saco-etiqueta.jpg'),
  ('Smoking 2 piezas', '/services/smoking-2-piezas.jpg'),
  ('Traje de dos piezas', '/services/traje-dos-piezas.jpg'),
  ('Traje de tres piezas', '/services/traje-tres-piezas.jpg'),
  ('Traje de lino 2 piezas', '/services/traje-lino-2-piezas.jpg'),
  ('Chaleco de traje', '/services/chaleco-traje.jpg'),
  ('Pantalón de traje/pantalón', '/services/pantalon-traje.jpg')
) as v(name, image_path)
where s.name = v.name
  and s.category = 'Sacos, blazers y trajes';

update tintoreria_francia.services as s
set image_path = v.image_path
from (values
  ('Pantalón de lino', '/services/pantalon-lino.jpg'),
  ('Pantalón de seda', '/services/pantalon-seda.jpg'),
  ('Pantalón de piel', '/services/pantalon-piel.jpg'),
  ('Leggings', '/services/leggings.jpg'),
  ('Falda pantalón', '/services/falda-pantalon.jpg'),
  ('Overol', '/services/overol.jpg'),
  ('Jumpsuit', '/services/jumpsuit.jpg')
) as v(name, image_path)
where s.name = v.name
  and s.category = 'Pantalones y prendas inferiores';

update tintoreria_francia.services as s
set image_path = v.image_path
from (values
  ('Camisa de caballero manga larga/corta', '/services/camisa-caballero.jpg'),
  ('Camisa de lino', '/services/camisa-lino.jpg'),
  ('Camisa de seda', '/services/camisa-seda.jpg'),
  ('Camisa con bordados', '/services/camisa-bordados.jpg'),
  ('Blusa', '/services/blusa.jpg'),
  ('Blusa de seda', '/services/blusa-seda.jpg'),
  ('Blusa de lino', '/services/blusa-lino.jpg'),
  ('Blusa bordada', '/services/blusa-bordada.jpg'),
  ('Blusa con olanes', '/services/blusa-olanes.jpg'),
  ('Blusón', '/services/bluson.jpg'),
  ('Túnica', '/services/tunica.jpg'),
  ('Playera', '/services/playera.jpg'),
  ('Top', '/services/top.jpg'),
  ('Crop top', '/services/crop-top.jpg'),
  ('Corsé', '/services/corse.jpg')
) as v(name, image_path)
where s.name = v.name
  and s.category = 'Camisas, blusas y prendas superiores';

update tintoreria_francia.services as s
set image_path = v.image_path
from (values
  ('Vestido casual', '/services/vestido-casual.jpg'),
  ('Vestido camisero', '/services/vestido-camisero.jpg'),
  ('Vestido de seda', '/services/vestido-seda.jpg'),
  ('Vestido de lino', '/services/vestido-lino.jpg'),
  ('Vestido de punto/tejido', '/services/vestido-punto.jpg'),
  ('Vestido de mezclilla', '/services/vestido-mezclilla.jpg'),
  ('Vestido de noche', '/services/vestido-noche.jpg'),
  ('Vestido con varias capas', '/services/vestido-capas.jpg'),
  ('Vestido de seda de fiesta', '/services/vestido-seda-fiesta.jpg'),
  ('Vestido tableado', '/services/vestido-tableado.jpg'),
  ('Vestido con cola', '/services/vestido-cola.jpg'),
  ('Vestido de novia', '/services/vestido-novia.jpg'),
  ('Vestido de quinceañera', '/services/vestido-quinceanera.jpg'),
  ('Vestido de primera comunión', '/services/vestido-comunion.jpg'),
  ('Vestido de bautizo', '/services/vestido-bautizo.jpg'),
  ('Vestido de presentación', '/services/vestido-presentacion.jpg'),
  ('Velo de novia', '/services/velo-novia.jpg')
) as v(name, image_path)
where s.name = v.name
  and s.category = 'Vestidos';

update tintoreria_francia.services as s
set image_path = v.image_path
from (values
  ('Falda', '/services/falda.jpg'),
  ('Falda plisada', '/services/falda-plisada.jpg'),
  ('Falda de tablas', '/services/falda-tablas.jpg'),
  ('Falda de mezclilla', '/services/falda-mezclilla.jpg'),
  ('Falda de vestir', '/services/falda-vestir.jpg'),
  ('Falda de piel', '/services/falda-piel.jpg'),
  ('Falda bordada', '/services/falda-bordada.jpg')
) as v(name, image_path)
where s.name = v.name
  and s.category = 'Faldas';

update tintoreria_francia.services as s
set image_path = v.image_path
from (values
  ('Suéter/cardigan', '/services/sueter-cardigan.jpg'),
  ('Poncho tejido', '/services/poncho-tejido.jpg'),
  ('Chal tejido', '/services/chal-tejido.jpg'),
  ('Chalina', '/services/chalina.jpg'),
  ('Bufanda', '/services/bufanda.jpg'),
  ('Pashmina', '/services/pashmina.jpg'),
  ('Cuello tejido', '/services/cuello-tejido.jpg'),
  ('Guantes', '/services/guantes.jpg'),
  ('Gorro', '/services/gorro.jpg'),
  ('Boina', '/services/boina.jpg'),
  ('Pasamontañas', '/services/pasamontanas.jpg')
) as v(name, image_path)
where s.name = v.name
  and s.category = 'Suéteres y tejidos';

update tintoreria_francia.services as s
set image_path = v.image_path
from (values
  ('Corbata', '/services/corbata.jpg'),
  ('Corbatín', '/services/corbatin.jpg'),
  ('Pañuelo de bolsillo', '/services/panuelo-bolsillo.jpg'),
  ('Pañuelo de vestir', '/services/panuelo-vestir.jpg'),
  ('Fajín', '/services/fajin.jpg'),
  ('Tirantes textiles', '/services/tirantes.jpg'),
  ('Chaleco formal', '/services/chaleco-formal.jpg'),
  ('Mascada', '/services/mascada.jpg'),
  ('Pañuelo de seda', '/services/panuelo-seda.jpg')
) as v(name, image_path)
where s.name = v.name
  and s.category = 'Ropa de caballero y accesorios';

update tintoreria_francia.services as s
set image_path = v.image_path
from (values
  ('Vestido infantil', '/services/vestido-infantil.jpg'),
  ('Vestido de fiesta infantil', '/services/vestido-fiesta-infantil.jpg'),
  ('Traje infantil', '/services/traje-infantil.jpg'),
  ('Saco infantil', '/services/saco-infantil.jpg'),
  ('Pantalón infantil', '/services/pantalon-infantil.jpg'),
  ('Camisa infantil', '/services/camisa-infantil.jpg'),
  ('Blusa infantil', '/services/blusa-infantil.jpg'),
  ('Suéter infantil', '/services/sueter-infantil.jpg'),
  ('Chamarra infantil', '/services/chamarra-infantil.jpg'),
  ('Abrigo infantil', '/services/abrigo-infantil.jpg')
) as v(name, image_path)
where s.name = v.name
  and s.category = 'Ropa infantil y de bebé';

update tintoreria_francia.services as s
set image_path = v.image_path
from (values
  ('Sábana de cajón', '/services/sabana-cajon.jpg'),
  ('Sábana plana', '/services/sabana-plana.jpg'),
  ('Funda de almohada', '/services/funda-almohada.jpg'),
  ('Protector de colchón', '/services/protector-colchon.jpg'),
  ('Cubrecolchón Sonagre', '/services/cubrecolchon-sonagre.jpg'),
  ('Edredón', '/services/edredon.jpg'),
  ('Edredón de plumas', '/services/edredon-plumas.jpg'),
  ('Cobertor', '/services/cobertor.jpg'),
  ('Colcha', '/services/colcha.jpg'),
  ('Pie de cama', '/services/pie-de-cama.jpg'),
  ('Manta', '/services/manta.jpg'),
  ('Frazada', '/services/frazada.jpg'),
  ('Almohada', '/services/almohada.jpg'),
  ('Cojín tubular largo', '/services/cojin-tubular.jpg'),
  ('Cojín decorativo con relleno', '/services/cojin-decorativo.jpg')
) as v(name, image_path)
where s.name = v.name
  and s.category = 'Ropa de cama';

update tintoreria_francia.services as s
set image_path = v.image_path
from (values
  ('Cortina ligera por metro', '/services/cortina-ligera.jpg'),
  ('Cortina gruesa por metro', '/services/cortina-gruesa.jpg'),
  ('Cortina blackout por metro', '/services/cortina-blackout.jpg'),
  ('Cortina de lino por metro', '/services/cortina-lino.jpg'),
  ('Cortina de terciopelo por metro', '/services/cortina-terciopelo.jpg'),
  ('Cortina con forro por metro', '/services/cortina-forro.jpg'),
  ('Visillo', '/services/visillo.jpg'),
  ('Faldón de cama', '/services/faldon-cama.jpg'),
  ('Mantel decorativo por metro', '/services/mantel.jpg'),
  ('Camino de mesa', '/services/camino-mesa.jpg'),
  ('Individuales de tela', '/services/individuales.jpg'),
  ('Servilletas de tela', '/services/servilletas.jpg'),
  ('Fundas de sillas completa', '/services/fundas-sillas.jpg'),
  ('Fundas de cojines 30x30', '/services/fundas-cojines.jpg'),
  ('Toalla grande de baño', '/services/toalla.jpg')
) as v(name, image_path)
where s.name = v.name
  and s.category = 'Cortinas y decoración textil';

update tintoreria_francia.services as s
set image_path = v.image_path
from (values
  ('Bata de laboratorio', '/services/bata-laboratorio.jpg'),
  ('Bata médica', '/services/bata-medica.jpg'),
  ('Filipina', '/services/filipina.jpg'),
  ('Uniforme de enfermería', '/services/uniforme-enfermeria.jpg'),
  ('Uniforme de cocina', '/services/uniforme-cocina.jpg'),
  ('Mandil de cocina', '/services/mandil-cocina.jpg'),
  ('Uniforme industrial', '/services/uniforme-industrial.jpg'),
  ('Overol de trabajo', '/services/overol-trabajo.jpg'),
  ('Uniforme de seguridad', '/services/uniforme-seguridad.jpg')
) as v(name, image_path)
where s.name = v.name
  and s.category = 'Uniformes y ropa de trabajo';

update tintoreria_francia.services as s
set image_path = v.image_path
from (values
  ('Disfraz infantil', '/services/disfraz-infantil.jpg'),
  ('Disfraz adulto', '/services/disfraz-adulto.jpg'),
  ('Vestuario teatral', '/services/vestuario-teatral.jpg'),
  ('Vestuario de danza', '/services/vestuario-danza.jpg'),
  ('Traje regional', '/services/traje-regional.jpg'),
  ('Vestido típico', '/services/vestido-tipico.jpg'),
  ('Traje de charro 2 piezas', '/services/traje-charro.jpg'),
  ('Traje de mariachi', '/services/traje-mariachi.jpg'),
  ('Toga de graduación', '/services/toga.jpg'),
  ('Birrete', '/services/birrete.jpg'),
  ('Bandera textil por metro', '/services/bandera.jpg'),
  ('Banderín', '/services/banderin.jpg'),
  ('Peluche pequeño', '/services/peluche-pequeno.jpg'),
  ('Peluche mediano', '/services/peluche-mediano.jpg'),
  ('Peluche grande', '/services/peluche-grande.jpg'),
  ('Bolsa de tela', '/services/bolsa-tela.jpg'),
  ('Mochila de tela', '/services/mochila-tela.jpg'),
  ('Pañalera textil', '/services/panalera.jpg'),
  ('Autoasiento de bebé', '/services/autoasiento.jpg'),
  ('Tenis de tela', '/services/tenis-tela.jpg'),
  ('Tenis de piel', '/services/tenis-piel.jpg')
) as v(name, image_path)
where s.name = v.name
  and s.category = 'Artículos especiales';

update tintoreria_francia.services as s
set image_path = v.image_path
from (values
  ('Lavado por kilogramo', '/services/lavado-kilo.jpg'),
  ('Lavado de ropa blanca', '/services/lavado-blanca.jpg'),
  ('Lavado de ropa de bebé', '/services/lavado-bebe.jpg'),
  ('Kilo de lavado hipoalergénico', '/services/lavado-hipoalergenico.jpg')
) as v(name, image_path)
where s.name = v.name
  and s.category = 'Servicios adicionales de lavandería';

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
      (1041, 's44', 5),
      (1041, 's37', 2),
      (1040, 's65', 1),
      (1039, 's32', 2),
      (1039, 's94', 3),
      (1038, 's118', 1),
      (1038, 's136', 2),
      (1037, 's173', 6),
      (1036, 's1', 1),
      (1036, 's83', 2),
      (1035, 's44', 8)
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
