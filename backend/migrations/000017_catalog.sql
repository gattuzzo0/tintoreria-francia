-- Reemplaza el catálogo (categorías + servicios).
-- Aplicar en SQL Editor. Una transacción: si falla, no queda a medias.
-- Servicios ya usados en órdenes no se pueden borrar: quedan inactivos,
-- categoría Artículos especiales, nombre con prefijo "Anterior · ".
-- Fuera de la lista (sin precio en la fuente): Funda decorativa, Cubrecolchón.
-- "Vestido de seda de fiesta" es el de $160 (el casual de seda queda en $120).
-- Rollback: no automático. Filas "Anterior · " son el catálogo viejo citado por órdenes.

begin;

do $mig$
declare
  r record;
  n int;
begin
  for r in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'tintoreria_francia.services'::regclass
      and con.contype = 'c'
      and (
        pg_get_constraintdef(con.oid) ilike '%category%'
        or pg_get_constraintdef(con.oid) ilike '%unit%'
      )
      and pg_get_constraintdef(con.oid) not ilike '%price_cents%'
      and pg_get_constraintdef(con.oid) not ilike '%char_length%'
  loop
    execute format('alter table tintoreria_francia.services drop constraint %I', r.conname);
  end loop;

  if not exists (
    select 1 from tintoreria_francia.services
    where name = 'Kilo de lavado hipoalergénico' and active
  ) then
    delete from tintoreria_francia.services s
    where not exists (
      select 1 from tintoreria_francia.order_lines l where l.service_id = s.id
    );

    update tintoreria_francia.services
    set active = false,
        category = 'Artículos especiales',
        name = left('Anterior · ' || name, 60),
        sort_order = 10000,
        updated_at = now();

    insert into tintoreria_francia.services (name, category, unit, price_cents, sort_order)
    values
    ('Abrigo', 'Abrigos, gabardinas y prendas de invierno', 'pza', 12000, 1),
    ('Abrigo de cashmere', 'Abrigos, gabardinas y prendas de invierno', 'pza', 15000, 2),
    ('Abrigo con forro', 'Abrigos, gabardinas y prendas de invierno', 'pza', 15000, 3),
    ('Gabardina corta', 'Abrigos, gabardinas y prendas de invierno', 'pza', 12000, 4),
    ('Gabardina con forro', 'Abrigos, gabardinas y prendas de invierno', 'pza', 15000, 5),
    ('Capa', 'Abrigos, gabardinas y prendas de invierno', 'pza', 12000, 6),
    ('Poncho', 'Abrigos, gabardinas y prendas de invierno', 'pza', 15000, 7),
    ('Ruana/zarape', 'Abrigos, gabardinas y prendas de invierno', 'pza', 18000, 8),
    ('Chamarra ligera', 'Chamarras y prendas deportivas', 'pza', 9000, 9),
    ('Chamarra de mezclilla', 'Chamarras y prendas deportivas', 'pza', 10000, 10),
    ('Chamarra', 'Chamarras y prendas deportivas', 'pza', 12000, 11),
    ('Chamarra de plumas', 'Chamarras y prendas deportivas', 'pza', 17000, 12),
    ('Chamarra impermeable', 'Chamarras y prendas deportivas', 'pza', 12000, 13),
    ('Chamarra rompevientos', 'Chamarras y prendas deportivas', 'pza', 10000, 14),
    ('Chamarra de piel', 'Chamarras y prendas deportivas', 'pza', 35000, 15),
    ('Chamarra de gamuza', 'Chamarras y prendas deportivas', 'pza', 25000, 16),
    ('Chamarra de motociclista/piel', 'Chamarras y prendas deportivas', 'pza', 45000, 17),
    ('Chaleco ligero', 'Chamarras y prendas deportivas', 'pza', 9000, 18),
    ('Chaleco relleno', 'Chamarras y prendas deportivas', 'pza', 10000, 19),
    ('Chaleco de plumas', 'Chamarras y prendas deportivas', 'pza', 13000, 20),
    ('Chaleco de vestir/mezclilla o tela', 'Chamarras y prendas deportivas', 'pza', 9000, 21),
    ('Chaleco de piel', 'Chamarras y prendas deportivas', 'pza', 20000, 22),
    ('Sudadera', 'Chamarras y prendas deportivas', 'pza', 9000, 23),
    ('Pants', 'Chamarras y prendas deportivas', 'pza', 9000, 24),
    ('Conjunto deportivo', 'Chamarras y prendas deportivas', 'pza', 18000, 25),
    ('Saco de caballero', 'Sacos, blazers y trajes', 'pza', 9000, 26),
    ('Saco de lino', 'Sacos, blazers y trajes', 'pza', 10000, 27),
    ('Blazer', 'Sacos, blazers y trajes', 'pza', 9000, 28),
    ('Saco con bordados', 'Sacos, blazers y trajes', 'pza', 12000, 29),
    ('Saco de etiqueta', 'Sacos, blazers y trajes', 'pza', 12000, 30),
    ('Smoking 2 piezas', 'Sacos, blazers y trajes', 'pza', 20000, 31),
    ('Traje de dos piezas', 'Sacos, blazers y trajes', 'pza', 18000, 32),
    ('Traje de tres piezas', 'Sacos, blazers y trajes', 'pza', 23000, 33),
    ('Traje de lino 2 piezas', 'Sacos, blazers y trajes', 'pza', 20000, 34),
    ('Chaleco de traje', 'Sacos, blazers y trajes', 'pza', 5000, 35),
    ('Pantalón de traje/pantalón', 'Sacos, blazers y trajes', 'pza', 9000, 36),
    ('Pantalón de lino', 'Pantalones y prendas inferiores', 'pza', 10000, 37),
    ('Pantalón de seda', 'Pantalones y prendas inferiores', 'pza', 10000, 38),
    ('Pantalón de piel', 'Pantalones y prendas inferiores', 'pza', 20000, 39),
    ('Leggings', 'Pantalones y prendas inferiores', 'pza', 9000, 40),
    ('Falda pantalón', 'Pantalones y prendas inferiores', 'pza', 12000, 41),
    ('Overol', 'Pantalones y prendas inferiores', 'pza', 12000, 42),
    ('Jumpsuit', 'Pantalones y prendas inferiores', 'pza', 16000, 43),
    ('Camisa de caballero manga larga/corta', 'Camisas, blusas y prendas superiores', 'pza', 9000, 44),
    ('Camisa de lino', 'Camisas, blusas y prendas superiores', 'pza', 10000, 45),
    ('Camisa de seda', 'Camisas, blusas y prendas superiores', 'pza', 10000, 46),
    ('Camisa con bordados', 'Camisas, blusas y prendas superiores', 'pza', 12000, 47),
    ('Blusa', 'Camisas, blusas y prendas superiores', 'pza', 9000, 48),
    ('Blusa de seda', 'Camisas, blusas y prendas superiores', 'pza', 10000, 49),
    ('Blusa de lino', 'Camisas, blusas y prendas superiores', 'pza', 10000, 50),
    ('Blusa bordada', 'Camisas, blusas y prendas superiores', 'pza', 12000, 51),
    ('Blusa con olanes', 'Camisas, blusas y prendas superiores', 'pza', 10000, 52),
    ('Blusón', 'Camisas, blusas y prendas superiores', 'pza', 10000, 53),
    ('Túnica', 'Camisas, blusas y prendas superiores', 'pza', 18000, 54),
    ('Playera', 'Camisas, blusas y prendas superiores', 'pza', 9000, 55),
    ('Top', 'Camisas, blusas y prendas superiores', 'pza', 9000, 56),
    ('Crop top', 'Camisas, blusas y prendas superiores', 'pza', 9000, 57),
    ('Corsé', 'Camisas, blusas y prendas superiores', 'pza', 9000, 58),
    ('Vestido casual', 'Vestidos', 'pza', 9000, 59),
    ('Vestido camisero', 'Vestidos', 'pza', 10000, 60),
    ('Vestido de seda', 'Vestidos', 'pza', 12000, 61),
    ('Vestido de lino', 'Vestidos', 'pza', 12000, 62),
    ('Vestido de punto/tejido', 'Vestidos', 'pza', 12000, 63),
    ('Vestido de mezclilla', 'Vestidos', 'pza', 10000, 64),
    ('Vestido de noche', 'Vestidos', 'pza', 12000, 65),
    ('Vestido con varias capas', 'Vestidos', 'pza', 16000, 66),
    ('Vestido de seda de fiesta', 'Vestidos', 'pza', 16000, 67),
    ('Vestido tableado', 'Vestidos', 'pza', 20000, 68),
    ('Vestido con cola', 'Vestidos', 'pza', 15000, 69),
    ('Vestido de novia', 'Vestidos', 'pza', 60000, 70),
    ('Vestido de quinceañera', 'Vestidos', 'pza', 60000, 71),
    ('Vestido de primera comunión', 'Vestidos', 'pza', 30000, 72),
    ('Vestido de bautizo', 'Vestidos', 'pza', 25000, 73),
    ('Vestido de presentación', 'Vestidos', 'pza', 30000, 74),
    ('Velo de novia', 'Vestidos', 'pza', 10000, 75),
    ('Falda', 'Faldas', 'pza', 9000, 76),
    ('Falda plisada', 'Faldas', 'pza', 13000, 77),
    ('Falda de tablas', 'Faldas', 'pza', 16000, 78),
    ('Falda de mezclilla', 'Faldas', 'pza', 9000, 79),
    ('Falda de vestir', 'Faldas', 'pza', 9000, 80),
    ('Falda de piel', 'Faldas', 'pza', 15000, 81),
    ('Falda bordada', 'Faldas', 'pza', 12000, 82),
    ('Suéter/cardigan', 'Suéteres y tejidos', 'pza', 9000, 83),
    ('Poncho tejido', 'Suéteres y tejidos', 'pza', 16000, 84),
    ('Chal tejido', 'Suéteres y tejidos', 'pza', 12000, 85),
    ('Chalina', 'Suéteres y tejidos', 'pza', 10000, 86),
    ('Bufanda', 'Suéteres y tejidos', 'pza', 8000, 87),
    ('Pashmina', 'Suéteres y tejidos', 'pza', 8000, 88),
    ('Cuello tejido', 'Suéteres y tejidos', 'pza', 7000, 89),
    ('Guantes', 'Suéteres y tejidos', 'pza', 7000, 90),
    ('Gorro', 'Suéteres y tejidos', 'pza', 7000, 91),
    ('Boina', 'Suéteres y tejidos', 'pza', 7000, 92),
    ('Pasamontañas', 'Suéteres y tejidos', 'pza', 7000, 93),
    ('Corbata', 'Ropa de caballero y accesorios', 'pza', 6000, 94),
    ('Corbatín', 'Ropa de caballero y accesorios', 'pza', 6000, 95),
    ('Pañuelo de bolsillo', 'Ropa de caballero y accesorios', 'pza', 6000, 96),
    ('Pañuelo de vestir', 'Ropa de caballero y accesorios', 'pza', 6000, 97),
    ('Fajín', 'Ropa de caballero y accesorios', 'pza', 7000, 98),
    ('Tirantes textiles', 'Ropa de caballero y accesorios', 'pza', 6000, 99),
    ('Chaleco formal', 'Ropa de caballero y accesorios', 'pza', 5000, 100),
    ('Mascada', 'Ropa de caballero y accesorios', 'pza', 6000, 101),
    ('Pañuelo de seda', 'Ropa de caballero y accesorios', 'pza', 6000, 102),
    ('Vestido infantil', 'Ropa infantil y de bebé', 'pza', 9000, 103),
    ('Vestido de fiesta infantil', 'Ropa infantil y de bebé', 'pza', 11000, 104),
    ('Traje infantil', 'Ropa infantil y de bebé', 'pza', 9000, 105),
    ('Saco infantil', 'Ropa infantil y de bebé', 'pza', 5000, 106),
    ('Pantalón infantil', 'Ropa infantil y de bebé', 'pza', 5000, 107),
    ('Camisa infantil', 'Ropa infantil y de bebé', 'pza', 5000, 108),
    ('Blusa infantil', 'Ropa infantil y de bebé', 'pza', 5000, 109),
    ('Suéter infantil', 'Ropa infantil y de bebé', 'pza', 5000, 110),
    ('Chamarra infantil', 'Ropa infantil y de bebé', 'pza', 9000, 111),
    ('Abrigo infantil', 'Ropa infantil y de bebé', 'pza', 10000, 112),
    ('Sábana de cajón', 'Ropa de cama', 'pza', 7000, 113),
    ('Sábana plana', 'Ropa de cama', 'pza', 7000, 114),
    ('Funda de almohada', 'Ropa de cama', 'pza', 5000, 115),
    ('Protector de colchón', 'Ropa de cama', 'pza', 15000, 116),
    ('Cubrecolchón Sonagre', 'Ropa de cama', 'pza', 29900, 117),
    ('Edredón', 'Ropa de cama', 'pza', 18000, 118),
    ('Edredón de plumas', 'Ropa de cama', 'pza', 22000, 119),
    ('Cobertor', 'Ropa de cama', 'pza', 15000, 120),
    ('Colcha', 'Ropa de cama', 'pza', 13000, 121),
    ('Pie de cama', 'Ropa de cama', 'pza', 9000, 122),
    ('Manta', 'Ropa de cama', 'pza', 9000, 123),
    ('Frazada', 'Ropa de cama', 'pza', 12000, 124),
    ('Almohada', 'Ropa de cama', 'pza', 12000, 125),
    ('Cojín tubular largo', 'Ropa de cama', 'pza', 15000, 126),
    ('Cojín decorativo con relleno', 'Ropa de cama', 'pza', 9000, 127),
    ('Cortina ligera por metro', 'Cortinas y decoración textil', 'm', 12000, 128),
    ('Cortina gruesa por metro', 'Cortinas y decoración textil', 'm', 18000, 129),
    ('Cortina blackout por metro', 'Cortinas y decoración textil', 'm', 25000, 130),
    ('Cortina de lino por metro', 'Cortinas y decoración textil', 'm', 22000, 131),
    ('Cortina de terciopelo por metro', 'Cortinas y decoración textil', 'm', 22000, 132),
    ('Cortina con forro por metro', 'Cortinas y decoración textil', 'm', 22000, 133),
    ('Visillo', 'Cortinas y decoración textil', 'pza', 6000, 134),
    ('Faldón de cama', 'Cortinas y decoración textil', 'pza', 12000, 135),
    ('Mantel decorativo por metro', 'Cortinas y decoración textil', 'm', 15000, 136),
    ('Camino de mesa', 'Cortinas y decoración textil', 'pza', 8000, 137),
    ('Individuales de tela', 'Cortinas y decoración textil', 'pza', 6000, 138),
    ('Servilletas de tela', 'Cortinas y decoración textil', 'pza', 4000, 139),
    ('Fundas de sillas completa', 'Cortinas y decoración textil', 'pza', 12000, 140),
    ('Fundas de cojines 30x30', 'Cortinas y decoración textil', 'pza', 6000, 141),
    ('Toalla grande de baño', 'Cortinas y decoración textil', 'pza', 6000, 142),
    ('Bata de laboratorio', 'Uniformes y ropa de trabajo', 'pza', 10000, 143),
    ('Bata médica', 'Uniformes y ropa de trabajo', 'pza', 10000, 144),
    ('Filipina', 'Uniformes y ropa de trabajo', 'pza', 14000, 145),
    ('Uniforme de enfermería', 'Uniformes y ropa de trabajo', 'pza', 18000, 146),
    ('Uniforme de cocina', 'Uniformes y ropa de trabajo', 'pza', 18000, 147),
    ('Mandil de cocina', 'Uniformes y ropa de trabajo', 'pza', 10000, 148),
    ('Uniforme industrial', 'Uniformes y ropa de trabajo', 'pza', 20000, 149),
    ('Overol de trabajo', 'Uniformes y ropa de trabajo', 'pza', 20000, 150),
    ('Uniforme de seguridad', 'Uniformes y ropa de trabajo', 'pza', 18000, 151),
    ('Disfraz infantil', 'Artículos especiales', 'pza', 18000, 152),
    ('Disfraz adulto', 'Artículos especiales', 'pza', 20000, 153),
    ('Vestuario teatral', 'Artículos especiales', 'pza', 25000, 154),
    ('Vestuario de danza', 'Artículos especiales', 'pza', 25000, 155),
    ('Traje regional', 'Artículos especiales', 'pza', 25000, 156),
    ('Vestido típico', 'Artículos especiales', 'pza', 25000, 157),
    ('Traje de charro 2 piezas', 'Artículos especiales', 'pza', 20000, 158),
    ('Traje de mariachi', 'Artículos especiales', 'pza', 20000, 159),
    ('Toga de graduación', 'Artículos especiales', 'pza', 25000, 160),
    ('Birrete', 'Artículos especiales', 'pza', 10000, 161),
    ('Bandera textil por metro', 'Artículos especiales', 'm', 15000, 162),
    ('Banderín', 'Artículos especiales', 'pza', 9000, 163),
    ('Peluche pequeño', 'Artículos especiales', 'pza', 6000, 164),
    ('Peluche mediano', 'Artículos especiales', 'pza', 12000, 165),
    ('Peluche grande', 'Artículos especiales', 'pza', 25000, 166),
    ('Bolsa de tela', 'Artículos especiales', 'pza', 15000, 167),
    ('Mochila de tela', 'Artículos especiales', 'pza', 12000, 168),
    ('Pañalera textil', 'Artículos especiales', 'pza', 15000, 169),
    ('Autoasiento de bebé', 'Artículos especiales', 'pza', 30000, 170),
    ('Tenis de tela', 'Artículos especiales', 'par', 15000, 171),
    ('Tenis de piel', 'Artículos especiales', 'par', 28000, 172),
    ('Lavado por kilogramo', 'Servicios adicionales de lavandería', 'kg', 3500, 173),
    ('Lavado de ropa blanca', 'Servicios adicionales de lavandería', 'kg', 4500, 174),
    ('Lavado de ropa de bebé', 'Servicios adicionales de lavandería', 'kg', 5500, 175),
    ('Kilo de lavado hipoalergénico', 'Servicios adicionales de lavandería', 'kg', 8000, 176);

    select count(*) into n from tintoreria_francia.services where active;
    if n <> 176 then
      raise exception 'Catálogo activo = %; se esperaban 176', n;
    end if;
  end if;

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
    'Servicios adicionales de lavandería'
      ))
  $sql$;

  execute $sql$
    alter table tintoreria_francia.services
      add constraint services_unit_check check (unit in ('pza', 'kg', 'par', 'm'))
  $sql$;
end
$mig$;

commit;
