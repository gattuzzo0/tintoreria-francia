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
