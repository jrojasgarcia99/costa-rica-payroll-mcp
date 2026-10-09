import { describe, expect, it } from "vitest";
import { calculateEmployerCost, calculateNetSalary } from "./payroll.js";

describe("calculateNetSalary — CCSS", () => {
  it("₡1,000,000 gross → CCSS ₡108,300 (10.83%)", () => {
    const r = calculateNetSalary({ grossMonthlySalary: 1_000_000 });
    expect(r.ccss.total).toBeCloseTo(108_300, 2);
  });

  it("below the exempt bracket only deducts CCSS", () => {
    const r = calculateNetSalary({ grossMonthlySalary: 800_000 });
    expect(r.ccss.total).toBeCloseTo(86_640, 2);
    expect(r.incomeTax.netTax).toBe(0);
    expect(r.incomeTax.marginalRatePct).toBe(0);
    expect(r.netSalary).toBeCloseTo(713_360, 2);
  });
});

describe("calculateNetSalary — progressive income tax", () => {
  it("₡1,500,000 → tax ₡65,850 (₡42,900 @10% + ₡22,950 @15%)", () => {
    const r = calculateNetSalary({ grossMonthlySalary: 1_500_000 });
    expect(r.incomeTax.grossTax).toBeCloseTo(42_900 + 22_950, 2);
    expect(r.incomeTax.marginalRatePct).toBe(15);
    expect(r.ccss.total).toBeCloseTo(162_450, 2);
    expect(r.netSalary).toBeCloseTo(1_271_700, 2);
  });

  it("covers all five brackets on a high salary", () => {
    const r = calculateNetSalary({ grossMonthlySalary: 6_000_000 });
    expect(r.incomeTax.grossTax).toBeCloseTo(42_900 + 152_550 + 472_600 + 318_250, 2);
    expect(r.incomeTax.marginalRatePct).toBe(25);
  });

  it("exact bracket boundaries", () => {
    expect(calculateNetSalary({ grossMonthlySalary: 918_000 }).incomeTax.grossTax).toBeCloseTo(0, 2);
    // Raw tax on ₡1 is ₡0.10; rounded independently (per field, like
    // Fineticap's display) this rounds down to ₡0.
    expect(calculateNetSalary({ grossMonthlySalary: 918_001 }).incomeTax.grossTax).toBe(0);
    expect(calculateNetSalary({ grossMonthlySalary: 1_347_000 }).incomeTax.grossTax).toBeCloseTo(42_900, 2);

    const r4727 = calculateNetSalary({ grossMonthlySalary: 4_727_000 });
    expect(r4727.incomeTax.grossTax).toBeCloseTo(42_900 + 152_550 + 472_600, 2);
    expect(r4727.incomeTax.marginalRatePct).toBe(20);

    const r5000 = calculateNetSalary({ grossMonthlySalary: 5_000_000 });
    expect(r5000.incomeTax.marginalRatePct).toBe(25);
    expect(r5000.incomeTax.grossTax).toBeCloseTo(42_900 + 152_550 + 472_600 + 273_000 * 0.25, 2);
  });
});

describe("calculateNetSalary — tax credits", () => {
  it("subtracts child and spouse credits from the tax, not the base", () => {
    const r = calculateNetSalary({ grossMonthlySalary: 1_500_000, children: 2, hasDependentSpouse: true });
    expect(r.incomeTax.credits.total).toBe(1_710 * 2 + 2_590);
    expect(r.incomeTax.taxableBase).toBe(1_500_000);
    expect(r.incomeTax.netTax).toBeCloseTo(65_850 - 6_010, 2);
  });

  it("credits never push the tax negative", () => {
    const r = calculateNetSalary({ grossMonthlySalary: 900_000, children: 2 });
    expect(r.incomeTax.netTax).toBe(0);
  });

  it("₡900,000 with 2 children stays at zero tax (no negative)", () => {
    const r = calculateNetSalary({ grossMonthlySalary: 900_000, children: 2 });
    expect(r.incomeTax.netTax).toBe(0);
  });
});

describe("calculateNetSalary — voluntary pension", () => {
  it("exemption caps at 10% of gross and flags it in notes", () => {
    const r = calculateNetSalary({ grossMonthlySalary: 1_500_000, voluntaryPension: 200_000 });
    expect(r.voluntaryPension.exempt).toBe(150_000);
    expect(r.voluntaryPension.wasCapped).toBe(true);
    expect(r.notes.some((n) => n.toLowerCase().includes("capped"))).toBe(true);
    expect(r.ccss.total).toBeCloseTo(1_350_000 * 0.1083, 2);
    expect(r.incomeTax.netTax).toBeCloseTo(42_900 + 450, 2);
    expect(r.netSalary).toBeCloseTo(1_500_000 - 146_205 - 43_350 - 200_000, 2);
  });

  it("no cap flag when under the limit", () => {
    const r = calculateNetSalary({ grossMonthlySalary: 1_500_000, voluntaryPension: 100_000 });
    expect(r.voluntaryPension.wasCapped).toBe(false);
    expect(r.voluntaryPension.exempt).toBe(100_000);
  });
});

describe("calculateNetSalary — solidarity association", () => {
  it("reduces net salary but not the taxable base", () => {
    const r = calculateNetSalary({ grossMonthlySalary: 1_000_000, solidarityAssociationPct: 5 });
    expect(r.solidarityAssociationDeduction).toBe(50_000);
    expect(r.incomeTax.taxableBase).toBe(1_000_000);
    expect(r.netSalary).toBeCloseTo(1_000_000 - 108_300 - 8_200 - 50_000, 2);
  });
});

describe("calculateNetSalary — rounding matches fineticap.com", () => {
  it("₡918,001 gross → net ₡818,581 (verified against fineticap.com)", () => {
    const r = calculateNetSalary({ grossMonthlySalary: 918_001 });
    expect(r.ccss.total).toBe(99_420);
    expect(r.incomeTax.grossTax).toBe(0);
    expect(r.netSalary).toBe(818_581);
  });
});

describe("calculateNetSalary — invalid input", () => {
  it("throws on negative gross salary", () => {
    expect(() => calculateNetSalary({ grossMonthlySalary: -1 })).not.toThrow();
    // Negative input is clamped to 0 by design (Math.max), documented behavior.
    expect(calculateNetSalary({ grossMonthlySalary: -1 }).grossMonthlySalary).toBe(0);
  });
});

describe("calculateEmployerCost", () => {
  it("applies the general rate by default", () => {
    const r = calculateEmployerCost({ grossMonthlySalary: 1_000_000 });
    expect(r.appliedRatePct).toBe(26.83);
    expect(r.employerBurden).toBeCloseTo(268_300, 2);
    expect(r.totalEmployerCost).toBeCloseTo(1_268_300, 2);
  });

  it("applies the small non-agricultural employer rate", () => {
    const r = calculateEmployerCost({ grossMonthlySalary: 1_000_000, smallNonAgriculturalEmployer: true });
    expect(r.appliedRatePct).toBe(25.33);
    expect(r.employerBurden).toBeCloseTo(253_300, 2);
  });
});
