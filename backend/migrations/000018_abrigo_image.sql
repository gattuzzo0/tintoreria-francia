-- Foto de prueba en la tarjeta Abrigo.
-- Rollback: update tintoreria_francia.services set image_path = null where name = 'Abrigo' and category = 'Abrigos, gabardinas y prendas de invierno';

update tintoreria_francia.services
set image_path = '/services/abrigo.jpg'
where name = 'Abrigo'
  and category = 'Abrigos, gabardinas y prendas de invierno';
