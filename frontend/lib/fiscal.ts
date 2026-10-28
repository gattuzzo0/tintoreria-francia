/** Catálogo CFDI 4.0. Las claves válidas también están en backend/api/validation.py. */

export const TAX_REGIMES: { id: string; label: string }[] = [
  { id: "626", label: "626 Régimen Simplificado de Confianza" },
  { id: "612", label: "612 Personas físicas con actividades empresariales y profesionales" },
  { id: "601", label: "601 General de Ley Personas Morales" },
  { id: "616", label: "616 Sin obligaciones fiscales" },
  { id: "605", label: "605 Sueldos y salarios e ingresos asimilados a salarios" },
  { id: "606", label: "606 Arrendamiento" },
  { id: "603", label: "603 Personas morales con fines no lucrativos" },
  { id: "607", label: "607 Régimen de enajenación o adquisición de bienes" },
  { id: "608", label: "608 Demás ingresos" },
  { id: "610", label: "610 Residentes en el extranjero sin establecimiento permanente en México" },
  { id: "611", label: "611 Ingresos por dividendos (socios y accionistas)" },
  { id: "614", label: "614 Ingresos por intereses" },
  { id: "615", label: "615 Régimen de los ingresos por obtención de premios" },
  { id: "620", label: "620 Sociedades cooperativas de producción que optan por diferir sus ingresos" },
  { id: "621", label: "621 Incorporación fiscal" },
  { id: "622", label: "622 Actividades agrícolas, ganaderas, silvícolas y pesqueras" },
  { id: "623", label: "623 Opcional para grupos de sociedades" },
  { id: "624", label: "624 Coordinados" },
  { id: "625", label: "625 Régimen de las actividades empresariales con ingresos a través de plataformas tecnológicas" },
];

export const CFDI_USES: { id: string; label: string }[] = [
  { id: "G03", label: "G03 Gastos en general" },
  { id: "S01", label: "S01 Sin efectos fiscales" },
  { id: "G01", label: "G01 Adquisición de mercancías" },
  { id: "G02", label: "G02 Devoluciones, descuentos o bonificaciones" },
  { id: "I01", label: "I01 Construcciones" },
  { id: "I02", label: "I02 Mobiliario y equipo de oficina por inversiones" },
  { id: "I03", label: "I03 Equipo de transporte" },
  { id: "I04", label: "I04 Equipo de cómputo y accesorios" },
  { id: "I05", label: "I05 Dados, troqueles, moldes, matrices y herramental" },
  { id: "I06", label: "I06 Comunicaciones telefónicas" },
  { id: "I07", label: "I07 Comunicaciones satelitales" },
  { id: "I08", label: "I08 Otra maquinaria y equipo" },
  { id: "D01", label: "D01 Honorarios médicos, dentales y gastos hospitalarios" },
  { id: "D02", label: "D02 Gastos médicos por incapacidad o discapacidad" },
  { id: "D03", label: "D03 Gastos funerales" },
  { id: "D04", label: "D04 Donativos" },
  { id: "D05", label: "D05 Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)" },
  { id: "D06", label: "D06 Aportaciones voluntarias al SAR" },
  { id: "D07", label: "D07 Primas por seguros de gastos médicos" },
  { id: "D08", label: "D08 Gastos de transportación escolar obligatoria" },
  { id: "D09", label: "D09 Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones" },
  { id: "D10", label: "D10 Pagos por servicios educativos (colegiaturas)" },
  { id: "CP01", label: "CP01 Pagos" },
  { id: "CN01", label: "CN01 Nómina" },
];

const regimeLabel = new Map(TAX_REGIMES.map((item) => [item.id, item.label]));
const useLabel = new Map(CFDI_USES.map((item) => [item.id, item.label]));

export const taxRegimeLabel = (code: string | null | undefined) => (code ? (regimeLabel.get(code) ?? code) : "Sin régimen");
export const cfdiUseLabel = (code: string | null | undefined) => (code ? (useLabel.get(code) ?? code) : "Sin uso de CFDI");
