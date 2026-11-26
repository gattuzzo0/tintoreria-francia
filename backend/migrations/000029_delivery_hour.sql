-- Extra urgente de hoy o del dia siguiente guarda la hora acordada, de 9 a 19.
-- Hoy tiene que ser despues de la hora actual. El dia siguiente, cualquier hora del horario. Domingo no.
-- Rollback: alter table tintoreria_francia.orders drop constraint if exists orders_delivery_hour_check;
-- alter table tintoreria_francia.orders drop column if exists delivery_hour;
-- y restaurar create_order de 000025.

begin;

alter table tintoreria_francia.orders
  add column if not exists delivery_hour smallint;

do $mig$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'tintoreria_francia.orders'::regclass
      and conname = 'orders_delivery_hour_check'
  ) then
    alter table tintoreria_francia.orders
      add constraint orders_delivery_hour_check
      check (delivery_hour is null or delivery_hour between 9 and 19);
  end if;
end
$mig$;

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
  p_idempotency_key text default null,
  p_delivery_hour integer default null
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
  v_pattern text;
  v_press boolean;
  v_extra integer;
  v_price integer;
  v_pct integer;
  v_same_pct integer;
  v_next_pct integer;
  v_two_pct integer;
  v_today date := (now() at time zone 'America/Mexico_City')::date;
  v_clock integer := extract(hour from (now() at time zone 'America/Mexico_City'))::int;
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

  if p_express and p_delivery_date = v_today then
    if p_delivery_hour is null
       or p_delivery_hour < 9
       or p_delivery_hour > 19
       or p_delivery_hour <= v_clock then
      raise exception 'Elige una hora de hoy, después de ahora y hasta las 19:00' using errcode = '22023';
    end if;
  elsif p_express and p_delivery_date = v_next then
    if p_delivery_hour is null or p_delivery_hour < 9 or p_delivery_hour > 19 then
      raise exception 'Elige una hora del día siguiente, entre las 9:00 y las 19:00' using errcode = '22023';
    end if;
  elsif p_delivery_hour is not null then
    raise exception 'La hora solo aplica a la entrega extra urgente de hoy o de mañana' using errcode = '22023';
  end if;

  insert into tintoreria_francia.orders
    (customer_id, express, delivery_days, delivery_date, delivery_hour, payment_method, notes, staff_user_id, idempotency_key, branch)
  values (p_customer_id, p_express, p_delivery_date - v_today, p_delivery_date, p_delivery_hour, p_payment_method,
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
    v_pattern := coalesce(v_line ->> 'pattern', '');
    if v_service.unit = 'kg' then
      v_color := '';
      v_pattern := '';
    elsif v_color not in ('rojo', 'amarillo', 'verde', 'azul', 'azul_claro', 'morado', 'rosa', 'naranja', 'cafe', 'negro', 'blanco') then
      raise exception 'Color inválido' using errcode = '22023';
    elsif v_pattern not in ('rayas', 'cuadros', 'ninguno') then
      raise exception 'Elige rayas, cuadros o ninguno' using errcode = '22023';
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
    v_press := coalesce(v_line ->> 'pressOnly', '') in ('true', 't');
    if v_service.unit = 'kg' then
      v_press := false;
    elsif v_press then
      v_price := round(v_price * 60 / 100.0)::integer;
    end if;

    insert into tintoreria_francia.order_lines (order_folio, service_id, name, unit, unit_price_cents, qty, color, fill, length, pattern, press_only)
    values (v_folio, v_service.id, v_service.name, v_service.unit, v_price, v_qty, v_color, v_fill, v_length, v_pattern, v_press);
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

revoke all on function tintoreria_francia.create_order(uuid, uuid, boolean, text, text, jsonb, date, text, text, integer) from public, anon, authenticated;
grant execute on function tintoreria_francia.create_order(uuid, uuid, boolean, text, text, jsonb, date, text, text, integer) to service_role;

commit;

