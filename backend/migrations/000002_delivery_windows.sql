-- Ventanas de entrega. Regular +5…+15. Exprés hoy, mañana o +2 (delivery_days puede ser 0).
-- Aplicar en SQL Editor. Rollback: restaurar create_order de 000001 y check delivery_days between 1 and 30.

do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
  where con.conrelid = 'tintoreria_francia.orders'::regclass
    and con.contype = 'c'
    and att.attname = 'delivery_days'
  limit 1;
  if cname is not null then
    execute format('alter table tintoreria_francia.orders drop constraint %I', cname);
  end if;
end $$;

alter table tintoreria_francia.orders
  add constraint orders_delivery_days_check check (delivery_days between 0 and 30);

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
  v_today date := (now() at time zone 'America/Mexico_City')::date;
begin
  if p_idempotency_key is not null then
    select folio into v_folio from tintoreria_francia.orders where idempotency_key = p_idempotency_key;
    if found then
      return v_folio;
    end if;
  end if;

  if p_branch is null or p_branch not in ('Nereo Rdz.', 'Himno Nal.', 'Centro') then
    raise exception 'Sucursal inválida' using errcode = '22023';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'La orden requiere al menos un servicio' using errcode = '22023';
  end if;

  if not exists (select 1 from tintoreria_francia.customers where id = p_customer_id) then
    raise exception 'Cliente no encontrado' using errcode = '22023';
  end if;

  if p_express then
    if p_delivery_date is null or p_delivery_date < v_today or p_delivery_date > v_today + 2 then
      raise exception 'La entrega exprés debe ser hoy, mañana o en 2 días' using errcode = '22023';
    end if;
  elsif p_delivery_date is null or p_delivery_date < v_today + 5 or p_delivery_date > v_today + 15 then
    raise exception 'La entrega regular debe ser entre 5 y 15 días' using errcode = '22023';
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

    insert into tintoreria_francia.order_lines (order_folio, service_id, name, unit, unit_price_cents, qty)
    values (v_folio, v_service.id, v_service.name, v_service.unit, v_service.price_cents, v_qty);
  end loop;

  perform tintoreria_francia.recalc_order_totals(v_folio);
  return v_folio;
end;
$$;
