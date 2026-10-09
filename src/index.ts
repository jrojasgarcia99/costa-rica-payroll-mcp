#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { calculateEmployerCost, calculateNetSalary } from "./payroll.js";
import {
  CCSS_EMPLOYEE_COMPONENTS_PCT_2026,
  CCSS_EMPLOYEE_TOTAL_PCT_2026,
  EFFECTIVE_YEAR,
  EMPLOYER_COST_PCT_2026,
  INCOME_TAX_BRACKETS_CRC_2026,
  LEGAL_SOURCES_2026,
  TAX_CREDIT_PER_CHILD_CRC_2026,
  TAX_CREDIT_SPOUSE_CRC_2026,
  VOLUNTARY_PENSION_EXEMPTION_CAP_PCT,
} from "./rates-2026.js";

const server = new McpServer({
  name: "costa-rica-payroll-mcp",
  version: "1.0.0",
});

const money = (n: number) => `₡${Math.round(n).toLocaleString("es-CR")}`;

server.registerTool(
  "calculate_net_salary",
  {
    title: "Calculate net salary (Costa Rica)",
    description:
      "Calculates Costa Rica net monthly salary from a gross monthly salary in CRC: employee CCSS contributions (SEM, IVM, Banco Popular), progressive income tax by bracket, child/spouse tax credits, and voluntary pension exemption (capped at 10% of gross). Returns a full breakdown. This is an estimate based on current rates, not tax advice.",
    inputSchema: {
      gross_monthly_salary: z.number().positive().describe("Gross monthly salary in CRC. Must be greater than 0."),
      children: z.number().int().nonnegative().default(0).describe("Number of dependent children for the tax credit."),
      has_dependent_spouse: z.boolean().default(false).describe("Whether the taxpayer has a dependent spouse tax credit."),
      voluntary_pension: z
        .number()
        .nonnegative()
        .default(0)
        .describe("Voluntary pension contribution in CRC/month. Exempt from CCSS/tax up to 10% of gross; excess is capped and flagged in the response."),
      solidarity_association_pct: z
        .number()
        .min(0)
        .max(8)
        .default(0)
        .describe("Solidarity association (asociación solidarista) contribution as a percentage of gross salary, 0-8."),
    },
  },
  async (args) => {
    const result = calculateNetSalary({
      grossMonthlySalary: args.gross_monthly_salary,
      children: args.children,
      hasDependentSpouse: args.has_dependent_spouse,
      voluntaryPension: args.voluntary_pension,
      solidarityAssociationPct: args.solidarity_association_pct,
    });

    const bracketLines = result.incomeTax.brackets
      .filter((b) => b.amountInBracket > 0)
      .map((b) => `  - ${b.ratePct}% on ${money(b.amountInBracket)} = ${money(b.taxInBracket)}`)
      .join("\n");

    const text = [
      `Net salary estimate (${EFFECTIVE_YEAR} rates)`,
      `Gross monthly salary: ${money(result.grossMonthlySalary)}`,
      ``,
      `CCSS (employee, ${result.ccss.ratePct}%): ${money(result.ccss.total)}`,
      `  - SEM: ${money(result.ccss.sem)}`,
      `  - IVM: ${money(result.ccss.ivm)}`,
      `  - Banco Popular: ${money(result.ccss.bancoPopular)}`,
      ``,
      `Income tax base: ${money(result.incomeTax.taxableBase)}`,
      bracketLines || "  (no tax, base is within the exempt bracket)",
      `Gross tax: ${money(result.incomeTax.grossTax)}`,
      `Tax credits: ${money(result.incomeTax.credits.total)} (children: ${money(result.incomeTax.credits.children)}, spouse: ${money(result.incomeTax.credits.spouse)})`,
      `Net tax: ${money(result.incomeTax.netTax)} (marginal rate ${result.incomeTax.marginalRatePct}%, effective rate ${result.incomeTax.effectiveRatePct.toFixed(2)}%)`,
      ``,
      result.voluntaryPension.requested > 0
        ? `Voluntary pension: requested ${money(result.voluntaryPension.requested)}, exempt ${money(result.voluntaryPension.exempt)}${result.voluntaryPension.wasCapped ? " (capped at 10% of gross)" : ""}`
        : "",
      result.solidarityAssociationDeduction > 0
        ? `Solidarity association deduction: ${money(result.solidarityAssociationDeduction)}`
        : "",
      ``,
      `Net salary: ${money(result.netSalary)}`,
      ``,
      ...result.notes,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      content: [{ type: "text", text }],
      structuredContent: result,
    };
  },
);

server.registerTool(
  "calculate_employer_cost",
  {
    title: "Calculate employer payroll cost (Costa Rica)",
    description:
      "Calculates the total employer cost of a Costa Rica employee from a gross monthly salary in CRC: applies the 26.83% general employer social-charge rate, or 25.33% for non-agricultural employers with fewer than 5 employees. Returns the employer burden and total cost. This is an estimate, not tax advice.",
    inputSchema: {
      gross_monthly_salary: z.number().positive().describe("Gross monthly salary in CRC. Must be greater than 0."),
      small_non_agricultural_employer: z
        .boolean()
        .default(false)
        .describe("Whether the employer is a non-agricultural business with fewer than 5 employees (lower rate applies)."),
    },
  },
  async (args) => {
    const result = calculateEmployerCost({
      grossMonthlySalary: args.gross_monthly_salary,
      smallNonAgriculturalEmployer: args.small_non_agricultural_employer,
    });

    const text = [
      `Employer cost estimate (${EFFECTIVE_YEAR} rates)`,
      `Gross monthly salary: ${money(result.grossMonthlySalary)}`,
      `Applied employer rate: ${result.appliedRatePct}%`,
      `Employer social-charge burden: ${money(result.employerBurden)}`,
      `Total employer cost: ${money(result.totalEmployerCost)}`,
      ``,
      ...result.notes,
    ].join("\n");

    return {
      content: [{ type: "text", text }],
      structuredContent: result,
    };
  },
);

server.registerTool(
  "get_payroll_rates",
  {
    title: "Get current Costa Rica payroll rates",
    description:
      "Returns the Costa Rica payroll rates, income tax brackets, tax credits, and employer-cost rates currently in effect, along with the legal sources they come from.",
    inputSchema: {},
  },
  async () => {
    const rates = {
      year: EFFECTIVE_YEAR,
      incomeTaxBrackets: INCOME_TAX_BRACKETS_CRC_2026,
      ccssEmployee: {
        components: CCSS_EMPLOYEE_COMPONENTS_PCT_2026,
        totalPct: CCSS_EMPLOYEE_TOTAL_PCT_2026,
      },
      taxCredits: {
        perChildCrc: TAX_CREDIT_PER_CHILD_CRC_2026,
        spouseCrc: TAX_CREDIT_SPOUSE_CRC_2026,
      },
      voluntaryPensionExemptionCapPct: VOLUNTARY_PENSION_EXEMPTION_CAP_PCT,
      employerCostPct: EMPLOYER_COST_PCT_2026,
      legalSources: LEGAL_SOURCES_2026,
    };

    const bracketLines = INCOME_TAX_BRACKETS_CRC_2026.map((b, i, arr) => {
      const from = i === 0 ? 0 : (arr[i - 1].upTo as number) + 1;
      const to = b.upTo === null ? "and above" : money(b.upTo);
      return `  - ${money(from)} to ${to}: ${b.ratePct}%`;
    }).join("\n");

    const text = [
      `Costa Rica payroll rates — effective ${EFFECTIVE_YEAR}`,
      ``,
      `Income tax brackets (monthly salary, progressive):`,
      bracketLines,
      ``,
      `CCSS employee contribution: ${CCSS_EMPLOYEE_TOTAL_PCT_2026}% (SEM ${CCSS_EMPLOYEE_COMPONENTS_PCT_2026.sem}% + IVM ${CCSS_EMPLOYEE_COMPONENTS_PCT_2026.ivm}% + Banco Popular ${CCSS_EMPLOYEE_COMPONENTS_PCT_2026.bancoPopular}%)`,
      `Tax credits: ${money(TAX_CREDIT_PER_CHILD_CRC_2026)}/month per child, ${money(TAX_CREDIT_SPOUSE_CRC_2026)}/month for dependent spouse`,
      `Voluntary pension exemption cap: ${VOLUNTARY_PENSION_EXEMPTION_CAP_PCT}% of gross salary`,
      `Employer cost rate: ${EMPLOYER_COST_PCT_2026.general}% general, ${EMPLOYER_COST_PCT_2026.smallNonAgricultural}% for small non-agricultural employers (<5 employees)`,
      ``,
      `Legal sources:`,
      ...LEGAL_SOURCES_2026.map((s) => `  - ${s}`),
    ].join("\n");

    return {
      content: [{ type: "text", text }],
      structuredContent: rates,
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error starting costa-rica-payroll-mcp:", error);
  process.exit(1);
});
