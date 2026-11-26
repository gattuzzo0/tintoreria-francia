-- Rol contador: solo Contabilidad. Admin y empleado no cambian.
-- Rollback:
--   update tintoreria_francia.profiles set role = 'empleado' where role = 'contador';
--   alter table tintoreria_francia.profiles drop constraint if exists profiles_role_check;
--   alter table tintoreria_francia.profiles
--     add constraint profiles_role_check check (role in ('admin', 'empleado'));

begin;

do $mig$
declare
  cname text;
begin
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'tintoreria_francia.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table tintoreria_francia.profiles drop constraint %I', cname);
  end loop;
end
$mig$;

alter table tintoreria_francia.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'empleado', 'contador'));

commit;
