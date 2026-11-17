// Step 3 of pricing: minimum ticket, tax, total, deposit, and the margin check.
import type { Dataset } from "@/lib/data";
import { formatCents, formatNumber, multiplyRound } from "./money";
import type { JobKind, MarginCheck, QuoteLine, QuoteTotals, RuleTrace } from "./types";

const sum = (lines: QuoteLine[], pick: (l: QuoteLine) => number) =>
  lines.reduce((acc, l) => acc + pick(l), 0);

/**
 * Job-wide discount: pct × (parts + labor + fees), shown as one negative line.
 * Applied before the minimum ticket, so a repair never drops below the minimum.
 */
export function discountLine(
  discount: { pct: number; reason: string } | undefined,
  lines: QuoteLine[],
  rules: RuleTrace[],
): QuoteLine | null {
  if (!discount || discount.pct <= 0) return null;
  const baseCents = sum(lines, (l) => l.amountCents);
  const offCents = multiplyRound(baseCents, [discount.pct / 100]);
  if (offCents === 0) return null;
  const label = `${discount.reason} discount (${formatNumber(discount.pct)}%)`;
  rules.push({
    rule: "Discount",
    effect: `${label}: ${formatNumber(discount.pct)}% off parts, labor and fees (${formatCents(baseCents)}) = −${formatCents(offCents)}. Tax is charged on parts after the discount.`,
    source: "entered for this quote",
  });
  return {
    id: "discount",
    kind: "discount",
    code: "DISC",
    description: label,
    qty: 1,
    unit: "ea",
    unitPriceCents: -offCents,
    amountCents: -offCents,
    taxable: false,
    costCents: 0,
    edited: false,
    trace: {
      source: "entered for this quote",
      formula: `${formatNumber(discount.pct)}% × ${formatCents(baseCents)} = −${formatCents(offCents)}`,
      details: ["Lowers the price, not our cost, so it comes straight out of margin"],
    },
  };
}

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
  discountPct = 0,
): QuoteTotals {
  const byKind = (k: QuoteLine["kind"]) => sum(lines.filter((l) => l.kind === k), (l) => l.amountCents);
  const partsCents = byKind("part");
  const laborCents = byKind("labor");
  const feesCents = byKind("fee");
  const minAdjCents = byKind("minimum");
  const discountCents = -byKind("discount");
  const subtotalCents = partsCents + laborCents + feesCents + minAdjCents - discountCents;

  // Tax: 7.25% on parts and equipment only, rounded to the cent.
  // A discount lowers the taxable parts by the same percentage.
  const partsBeforeDiscount = sum(lines.filter((l) => l.taxable), (l) => l.amountCents);
  const taxableCents = partsBeforeDiscount - multiplyRound(partsBeforeDiscount, [discountPct / 100]);
  const taxCents = multiplyRound(taxableCents, [data.rules.tax_rate]);
  rules.push({
    rule: "Tax",
    effect: `${Number((data.rules.tax_rate * 100).toFixed(4))}% on parts & equipment only (${formatCents(taxableCents)}${discountPct > 0 ? " after discount" : ""}) = ${formatCents(taxCents)}. Labor and fees are not taxed.`,
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

  return {
    partsCents,
    laborCents,
    feesCents,
    minAdjCents,
    discountCents,
    subtotalCents,
    taxCents,
    totalCents,
    depositCents,
  };
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
