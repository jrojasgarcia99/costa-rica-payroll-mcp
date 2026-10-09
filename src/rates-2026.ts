/** Costa Rica payroll rates and brackets, effective 2026-01-01.
 *
 *  Income tax brackets: Decreto Ejecutivo N.° 45333-H (La Gaceta N.° 229,
 *  2025-12-05). CCSS and employer-cost rates: Ley de Protección al
 *  Trabajador (Ley 7983) and CCSS/INA/IMAS contribution schedule.
 *
 *  Neither Hacienda nor CCSS publish a machine-readable rate API — only an
 *  annual decree — so update this file by hand every January when the
 *  brackets change. Nothing outside this file should contain a rate or
 *  bracket value.
 */

export const EFFECTIVE_YEAR = 2026;

export const INCOME_TAX_BRACKETS_CRC_2026 = [
  { upTo: 918_000, ratePct: 0 },
  { upTo: 1_347_000, ratePct: 10 },
  { upTo: 2_364_000, ratePct: 15 },
  { upTo: 4_727_000, ratePct: 20 },
  { upTo: null, ratePct: 25 },
] as const;

export const CCSS_EMPLOYEE_COMPONENTS_PCT_2026 = {
  sem: 5.5,
  ivm: 4.33,
  bancoPopular: 1.0,
} as const;

export const CCSS_EMPLOYEE_TOTAL_PCT_2026 =
  CCSS_EMPLOYEE_COMPONENTS_PCT_2026.sem +
  CCSS_EMPLOYEE_COMPONENTS_PCT_2026.ivm +
  CCSS_EMPLOYEE_COMPONENTS_PCT_2026.bancoPopular; // 10.83

export const TAX_CREDIT_PER_CHILD_CRC_2026 = 1_710; // Art. 34 Ley 7092
export const TAX_CREDIT_SPOUSE_CRC_2026 = 2_590;

export const VOLUNTARY_PENSION_EXEMPTION_CAP_PCT = 10; // Art. 71 Ley 7983

export const EMPLOYER_COST_PCT_2026 = {
  general: 26.83,
  smallNonAgricultural: 25.33, // non-agricultural employers with < 5 employees
} as const;

export const LEGAL_SOURCES_2026 = [
  "Decreto Ejecutivo N.° 45333-H, La Gaceta N.° 229 (2025-12-05) — tramos de renta al salario",
  "Ley de Protección al Trabajador, Ley N.° 7983 — CCSS, pensión voluntaria (art. 71), carga patronal",
  "Ley del Impuesto sobre la Renta, Ley N.° 7092, art. 34 — créditos fiscales por hijo y cónyuge",
] as const;
