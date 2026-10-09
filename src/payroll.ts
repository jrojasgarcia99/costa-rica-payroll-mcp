/** Costa Rica payroll calculations: net salary and employer cost.
 *
 *  Ported faithfully from the calculation logic behind Fineticap's public
 *  net-salary calculator (https://fineticap.com/calculadora-salario-neto).
 *  Only the calculation rules were ported — no other code, types, or UI
 *  from that project. All rates/brackets live in ./rates-2026.ts.
 */

import {
  CCSS_EMPLOYEE_COMPONENTS_PCT_2026,
  CCSS_EMPLOYEE_TOTAL_PCT_2026,
  EFFECTIVE_YEAR,
  EMPLOYER_COST_PCT_2026,
  INCOME_TAX_BRACKETS_CRC_2026,
  TAX_CREDIT_PER_CHILD_CRC_2026,
  TAX_CREDIT_SPOUSE_CRC_2026,
  VOLUNTARY_PENSION_EXEMPTION_CAP_PCT,
} from "./rates-2026.js";

/** Fineticap's calculator keeps every intermediate value as an unrounded
 *  float and rounds only at display time, independently per field (see
 *  `crc()` in `CalculadoraSalario.tsx`: `Math.round(n)` applied to each
 *  displayed amount on its own, never to a sum of already-rounded parts).
 *  This mirrors that: every monetary field below is rounded independently
 *  from its own unrounded value. */
const roundCRC = (n: number) => Math.round(n);

export type NetSalaryInput = {
  grossMonthlySalary: number;
  children?: number;
  hasDependentSpouse?: boolean;
  voluntaryPension?: number;
  solidarityAssociationPct?: number;
};

export type IncomeTaxBracketResult = {
  upTo: number | null;
  ratePct: number;
  amountInBracket: number;
  taxInBracket: number;
};

export type NetSalaryResult = {
  year: number;
  grossMonthlySalary: number;
  ccss: {
    sem: number;
    ivm: number;
    bancoPopular: number;
    total: number;
    ratePct: number;
  };
  voluntaryPension: {
    requested: number;
    exempt: number;
    cappedPct: number;
    wasCapped: boolean;
  };
  incomeTax: {
    taxableBase: number;
    brackets: IncomeTaxBracketResult[];
    grossTax: number;
    credits: {
      children: number;
      spouse: number;
      total: number;
    };
    netTax: number;
    marginalRatePct: number;
    effectiveRatePct: number;
  };
  solidarityAssociationDeduction: number;
  netSalary: number;
  notes: string[];
};

export function calculateNetSalary(input: NetSalaryInput): NetSalaryResult {
  const grossMonthlySalary = Math.max(0, input.grossMonthlySalary);
  const children = input.children ?? 0;
  const hasDependentSpouse = input.hasDependentSpouse ?? false;
  const requestedPension = Math.max(0, input.voluntaryPension ?? 0);
  const solidarityAssociationPct = Math.max(0, input.solidarityAssociationPct ?? 0);

  const notes: string[] = [
    `Rates and brackets effective ${EFFECTIVE_YEAR} (Decreto Ejecutivo N.° 45333-H, La Gaceta N.° 229, 2025-12-05; Ley 7983; Ley 7092).`,
    "Christmas bonus (aguinaldo) is exempt from CCSS and income tax and is not part of this calculation.",
  ];

  // Art. 71, Ley 7983: voluntary pension contributions up to 10% of gross
  // salary are exempt from both CCSS and income tax.
  const pensionCap = grossMonthlySalary * (VOLUNTARY_PENSION_EXEMPTION_CAP_PCT / 100);
  const exemptPension = Math.min(requestedPension, pensionCap);
  const wasCapped = requestedPension > pensionCap;
  if (wasCapped) {
    notes.push(
      `Voluntary pension capped: requested ₡${requestedPension.toLocaleString("es-CR")} exceeds the ${VOLUNTARY_PENSION_EXEMPTION_CAP_PCT}% exemption cap (₡${pensionCap.toLocaleString("es-CR")}). Only the capped amount is exempt; the full requested amount is still deducted from net salary.`,
    );
  }

  const ccssBase = grossMonthlySalary - exemptPension;
  const sem = ccssBase * (CCSS_EMPLOYEE_COMPONENTS_PCT_2026.sem / 100);
  const ivm = ccssBase * (CCSS_EMPLOYEE_COMPONENTS_PCT_2026.ivm / 100);
  const bancoPopular = ccssBase * (CCSS_EMPLOYEE_COMPONENTS_PCT_2026.bancoPopular / 100);
  const ccssTotal = sem + ivm + bancoPopular;

  // Income tax base also only subtracts the exempt pension amount — it is
  // not computed net of CCSS.
  const taxableBase = Math.max(0, grossMonthlySalary - exemptPension);

  const brackets: IncomeTaxBracketResult[] = [];
  let grossTax = 0;
  let marginalRatePct = 0;
  let from = 0;
  for (const bracket of INCOME_TAX_BRACKETS_CRC_2026) {
    const upTo = bracket.upTo ?? Infinity;
    if (taxableBase <= from) break;
    const amountInBracket = Math.min(taxableBase, upTo) - from;
    let taxInBracket = 0;
    if (amountInBracket > 0) {
      taxInBracket = amountInBracket * (bracket.ratePct / 100);
      grossTax += taxInBracket;
      marginalRatePct = bracket.ratePct;
    }
    brackets.push({ upTo: bracket.upTo, ratePct: bracket.ratePct, amountInBracket: Math.max(0, amountInBracket), taxInBracket });
    from = upTo;
  }

  const childrenCredit = children * TAX_CREDIT_PER_CHILD_CRC_2026;
  const spouseCredit = hasDependentSpouse ? TAX_CREDIT_SPOUSE_CRC_2026 : 0;
  const totalCredits = childrenCredit + spouseCredit;
  const netTax = Math.max(0, grossTax - totalCredits);
  const effectiveRatePct = taxableBase > 0 ? (netTax / taxableBase) * 100 : 0;

  const solidarityAssociationDeduction = grossMonthlySalary * (solidarityAssociationPct / 100);
  if (solidarityAssociationPct > 0) {
    notes.push(
      "Solidarity association contributions have no legal CCSS/income-tax exemption, so they reduce net salary only, not the taxable base.",
    );
  }

  const netSalary =
    grossMonthlySalary - ccssTotal - netTax - requestedPension - solidarityAssociationDeduction;

  return {
    year: EFFECTIVE_YEAR,
    grossMonthlySalary: roundCRC(grossMonthlySalary),
    ccss: {
      sem: roundCRC(sem),
      ivm: roundCRC(ivm),
      bancoPopular: roundCRC(bancoPopular),
      total: roundCRC(ccssTotal),
      ratePct: CCSS_EMPLOYEE_TOTAL_PCT_2026,
    },
    voluntaryPension: {
      requested: roundCRC(requestedPension),
      exempt: roundCRC(exemptPension),
      cappedPct: VOLUNTARY_PENSION_EXEMPTION_CAP_PCT,
      wasCapped,
    },
    incomeTax: {
      taxableBase: roundCRC(taxableBase),
      brackets: brackets.map((b) => ({
        ...b,
        amountInBracket: roundCRC(b.amountInBracket),
        taxInBracket: roundCRC(b.taxInBracket),
      })),
      grossTax: roundCRC(grossTax),
      credits: {
        children: roundCRC(childrenCredit),
        spouse: roundCRC(spouseCredit),
        total: roundCRC(totalCredits),
      },
      netTax: roundCRC(netTax),
      marginalRatePct,
      effectiveRatePct,
    },
    solidarityAssociationDeduction: roundCRC(solidarityAssociationDeduction),
    netSalary: roundCRC(netSalary),
    notes,
  };
}

export type EmployerCostInput = {
  grossMonthlySalary: number;
  smallNonAgriculturalEmployer?: boolean;
};

export type EmployerCostResult = {
  year: number;
  grossMonthlySalary: number;
  appliedRatePct: number;
  employerBurden: number;
  totalEmployerCost: number;
  notes: string[];
};

export function calculateEmployerCost(input: EmployerCostInput): EmployerCostResult {
  const grossMonthlySalary = Math.max(0, input.grossMonthlySalary);
  const isSmall = input.smallNonAgriculturalEmployer ?? false;
  const appliedRatePct = isSmall ? EMPLOYER_COST_PCT_2026.smallNonAgricultural : EMPLOYER_COST_PCT_2026.general;
  const employerBurden = grossMonthlySalary * (appliedRatePct / 100);
  const totalEmployerCost = grossMonthlySalary + employerBurden;

  return {
    year: EFFECTIVE_YEAR,
    grossMonthlySalary: roundCRC(grossMonthlySalary),
    appliedRatePct,
    employerBurden: roundCRC(employerBurden),
    totalEmployerCost: roundCRC(totalEmployerCost),
    notes: [
      `Rate effective ${EFFECTIVE_YEAR}: ${EMPLOYER_COST_PCT_2026.general}% general, ${EMPLOYER_COST_PCT_2026.smallNonAgricultural}% for non-agricultural employers with fewer than 5 employees.`,
      "Christmas bonus (aguinaldo) is excluded from this calculation.",
    ],
  };
}
