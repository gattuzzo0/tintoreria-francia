-- Categoría Desmanchado y otros servicios.
-- Manchas y Servicio de compostura son títulos de la lista, no servicios.
-- Rollback: delete from tintoreria_francia.services where category = 'Desmanchado y otros servicios';
-- y volver a crear services_category_check sin esa categoría.

begin;

do $mig$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'tintoreria_francia.services'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%category%'
      and pg_get_constraintdef(con.oid) not ilike '%price_cents%'
      and pg_get_constraintdef(con.oid) not ilike '%char_length%'
  loop
    execute format('alter table tintoreria_francia.services drop constraint %I', r.conname);
  end loop;

  execute $sql$
    alter table tintoreria_francia.services
      add constraint services_category_check check (category in (
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
      ))
  $sql$;
end
$mig$;

insert into tintoreria_francia.services (name, category, unit, price_cents, sort_order)
select v.name, v.category, v.unit, v.price_cents, v.sort_order
from (values
    ('Tratamiento de olores', 'Desmanchado y otros servicios', 'pza', 6000, 177),
    ('Desmanchado especial', 'Desmanchado y otros servicios', 'pza', 7000, 178),
    ('Tratamiento de manchas amarillas', 'Desmanchado y otros servicios', 'pza', 5000, 179),
    ('Servicio de teñido', 'Desmanchado y otros servicios', 'pza', 25000, 180),
    ('Bastillas', 'Desmanchado y otros servicios', 'pza', 30000, 181),
    ('Cierre de pantalón', 'Desmanchado y otros servicios', 'pza', 30000, 182),
    ('Arreglos básicos', 'Desmanchado y otros servicios', 'pza', 20000, 183)
) as v(name, category, unit, price_cents, sort_order)
where not exists (
  select 1 from tintoreria_francia.services s
  where s.name = v.name and s.active
);

commit;
