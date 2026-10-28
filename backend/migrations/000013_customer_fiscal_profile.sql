-- Datos fiscales del cliente para facturar fuera del sistema. Aplicar en SQL Editor.
-- Rollback: alter table tintoreria_francia.customers
--   drop constraint if exists customers_fiscal_zip_check,
--   drop constraint if exists customers_legal_name_check,
--   drop constraint if exists customers_tax_regime_check,
--   drop constraint if exists customers_cfdi_use_check,
--   drop column if exists legal_name,
--   drop column if exists fiscal_zip,
--   drop column if exists tax_regime,
--   drop column if exists cfdi_use;

alter table tintoreria_francia.customers
  add column if not exists legal_name text,
  add column if not exists fiscal_zip text,
  add column if not exists tax_regime text,
  add column if not exists cfdi_use text;

alter table tintoreria_francia.customers
  drop constraint if exists customers_legal_name_check,
  add constraint customers_legal_name_check
    check (legal_name is null or char_length(legal_name) between 1 and 254),
  drop constraint if exists customers_fiscal_zip_check,
  add constraint customers_fiscal_zip_check
    check (fiscal_zip is null or fiscal_zip ~ '^[0-9]{5}$'),
  drop constraint if exists customers_tax_regime_check,
  add constraint customers_tax_regime_check
    check (tax_regime is null or tax_regime in (
      '601', '603', '605', '606', '607', '608', '610', '611', '612', '614', '615', '616',
      '620', '621', '622', '623', '624', '625', '626'
    )),
  drop constraint if exists customers_cfdi_use_check,
  add constraint customers_cfdi_use_check
    check (cfdi_use is null or cfdi_use in (
      'G01', 'G02', 'G03', 'I01', 'I02', 'I03', 'I04', 'I05', 'I06', 'I07', 'I08',
      'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10',
      'S01', 'CP01', 'CN01'
    ));
