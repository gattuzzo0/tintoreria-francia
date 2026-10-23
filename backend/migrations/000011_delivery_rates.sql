-- Cargos exprés configurables (mismo día, día siguiente, 2 días). Aplicar en SQL Editor.
-- Rollback: drop table delivery_rates; drop column orders.surcharge_pct;
-- y recrear recalc_order_totals y create_order desde 000010.

create table if not exists tintoreria_francia.delivery_rates (
  id boolean primary key default true check (id),
  extra_same_pct smallint not null default 30 check (extra_same_pct between 0 and 100),
  extra_next_pct smallint not null default 30 check (extra_next_pct between 0 and 100),
  urgent_pct smallint not null default 30 check (urgent_pct between 0 and 100)
);

insert into tintoreria_francia.delivery_rates (id) values (true) on conflict do nothing;

alter table tintoreria_francia.delivery_rates enable row level security;
alter table tintoreria_francia.delivery_rates force row level security;
revoke all on tintoreria_francia.delivery_rates from anon, authenticated;
grant all on tintoreria_francia.delivery_rates to service_role;

alter table tintoreria_francia.orders
  add column if not exists surcharge_pct smallint
  check (surcharge_pct is null or surcharge_pct between 0 and 100);

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

    insert into tintoreria_francia.order_lines (order_folio, service_id, name, unit, unit_price_cents, qty, color)
    values (v_folio, v_service.id, v_service.name, v_service.unit, v_service.price_cents, v_qty, v_color);
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
