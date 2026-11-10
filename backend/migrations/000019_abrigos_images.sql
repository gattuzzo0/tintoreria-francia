-- Fotos de las variantes de Abrigos. El Abrigo liso ya está en 000018.
-- Rollback: update tintoreria_francia.services set image_path = null where category = 'Abrigos, gabardinas y prendas de invierno' and name <> 'Abrigo';

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
