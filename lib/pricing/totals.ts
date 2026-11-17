// Step 3 of pricing: minimum ticket, tax, total, deposit, and the margin check.
import type { Dataset } from "@/lib/data";
import { formatCents, multiplyRound } from "./money";
import type { JobKind, MarginCheck, QuoteLine, QuoteTotals, RuleTrace } from "./types";

const sum = (lines: QuoteLine[], pick: (l: QuoteLine) => number) =>
  lines.reduce((acc, l) => acc + pick(l), 0);

/**
 * Service only: if parts + labor + fees is under the minimum ticket ($189),
 * returns a "Minimum service charge" line that tops it up. Not taxed, no cost.
 */
export function minimumLine(
  data: Dataset,
  jobKind: JobKind,
  lines: QuoteLine[],
  rules: RuleTrace[],
): QuoteLine | null {
  if (jobKind !== "service") return null;
  const minimumCents = Math.round(data.rules.minimum_service_ticket * 100);
  const beforeCents = sum(lines, (l) => l.amountCents);
  if (beforeCents >= minimumCents) return null;

  const adjCents = minimumCents - beforeCents;
  rules.push({
    rule: "Minimum service ticket",
    effect: `Service subtotal ${formatCents(beforeCents)} is under the ${formatCents(minimumCents)} minimum, so ${formatCents(adjCents)} was added`,
    source: "pricing_rules.json",
  });
  return {
    id: "minimum",
    kind: "minimum",
    code: "MIN",
    description: "Minimum service charge",
    qty: 1,
    unit: "ea",
    unitPriceCents: adjCents,
    amountCents: adjCents,
    taxable: false,
    costCents: 0,
    edited: false,
    trace: {
      source: "pricing_rules.json (minimum_service_ticket)",
      formula: `${formatCents(minimumCents)} minimum − ${formatCents(beforeCents)} = ${formatCents(adjCents)}`,
      details: [],
    },
  };
}

export function computeTotals(
  data: Dataset,
  jobKind: JobKind,
  lines: QuoteLine[],
  rules: RuleTrace[],
): QuoteTotals {
  const byKind = (k: QuoteLine["kind"]) => sum(lines.filter((l) => l.kind === k), (l) => l.amountCents);
  const partsCents = byKind("part");
  const laborCents = byKind("labor");
  const feesCents = byKind("fee");
  const minAdjCents = byKind("minimum");
  const subtotalCents = partsCents + laborCents + feesCents + minAdjCents;

  // Tax: 7.25% on parts and equipment only, rounded to the cent.
  const taxableCents = sum(lines.filter((l) => l.taxable), (l) => l.amountCents);
  const taxCents = multiplyRound(taxableCents, [data.rules.tax_rate]);
  rules.push({
    rule: "Tax",
    effect: `${Number((data.rules.tax_rate * 100).toFixed(4))}% on parts & equipment only (${formatCents(taxableCents)}) = ${formatCents(taxCents)}. Labor and fees are not taxed.`,
    source: "pricing_rules.json",
  });
  const totalCents = subtotalCents + taxCents;

  // Deposit: installs only, a percentage of the total including tax.
  let depositCents: number | null = null;
  if (jobKind === "install") {
    const pct = data.rules.install_deposit_pct;
    depositCents = multiplyRound(totalCents, [pct]);
    rules.push({
      rule: "Deposit",
      effect: `${Math.round(pct * 100)}% of the ${formatCents(totalCents)} total = ${formatCents(depositCents)}`,
      source: "pricing_rules.json",
    });
  }

  return { partsCents, laborCents, feesCents, minAdjCents, subtotalCents, taxCents, totalCents, depositCents };
}

/**
 * Job cost = parts at unit_cost + labor at burdened cost + fees at internal cost
 *          + warranty reserve (installs: 3% of subtotal).
 * Margin = (subtotal before tax − job cost) / subtotal before tax.
 */
export function computeMargin(
  data: Dataset,
  jobKind: JobKind,
  lines: QuoteLine[],
  totals: QuoteTotals,
): MarginCheck {
  const costOf = (k: QuoteLine["kind"]) => sum(lines.filter((l) => l.kind === k), (l) => l.costCents);
  const partsCostCents = costOf("part");
  const laborCostCents = costOf("labor");
  const feesCostCents = costOf("fee");
  const warrantyReserveCents =
    jobKind === "install"
      ? multiplyRound(totals.subtotalCents, [data.rules.warranty_reserve_pct_of_install_price])
      : 0;
  const jobCostCents = partsCostCents + laborCostCents + feesCostCents + warrantyReserveCents;

  const margin =
    totals.subtotalCents > 0 ? (totals.subtotalCents - jobCostCents) / totals.subtotalCents : 0;
  const target = data.rules.target_margin[jobKind];

  // Lines whose own margin is below target are the ones pulling the job down.
  const lowMarginLines = lines
    .filter((l) => l.amountCents > 0)
    .map((l) => ({
      lineId: l.id,
      description: l.description,
      margin: (l.amountCents - l.costCents) / l.amountCents,
    }))
    .filter((l) => l.margin < target)
    .sort((a, b) => a.margin - b.margin);

  return {
    partsCostCents,
    laborCostCents,
    feesCostCents,
    warrantyReserveCents,
    jobCostCents,
    margin,
    target,
    passes: margin >= target,
    lowMarginLines,
  };
}
