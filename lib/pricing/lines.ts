// Step 2 of pricing: turn each draft into a priced line with its trace.
import type { Dataset } from "@/lib/data";
import { formatCents, formatNumber, multiplyRound } from "./money";
import type { FeeDraft, LaborDraft, LineDraft, PartDraft } from "./drafts";
import type { QuoteLine } from "./types";

/** A labor multiplier in effect for this quote (timing, Peak Club). */
export type AppliedMultiplier = { value: number; label: string };

/** Part line = sell_price × qty. Taxable. Cost = unit_cost × qty. */
function pricePart(data: Dataset, d: PartDraft): QuoteLine {
  const item = data.priceBook[d.sku];
  const amountCents = multiplyRound(item.sellPriceCents, [d.qty]);
  const costCents = multiplyRound(item.unitCostCents, [d.qty]);
  return {
    id: d.id,
    kind: "part",
    code: d.sku,
    description: item.description,
    qty: d.qty,
    unit: item.unit,
    unitPriceCents: item.sellPriceCents,
    amountCents,
    taxable: true, // tax applies to parts and equipment
    costCents,
    edited: d.edited,
    trace: {
      source: "price_book.csv",
      formula: `${d.sku}: ${formatCents(item.sellPriceCents)} × ${formatNumber(d.qty)} ${item.unit} = ${formatCents(amountCents)}`,
      details: [
        `Sell price ${formatCents(item.sellPriceCents)} = cost ${formatCents(item.unitCostCents)} × ${item.markup.toFixed(2)} markup`,
        `Our cost: ${formatCents(item.unitCostCents)} × ${formatNumber(d.qty)} = ${formatCents(costCents)}`,
        `Source: ${d.origins.join("; ")}`,
      ],
    },
  };
}

/**
 * Labor line = hours × bill_rate × multipliers, rounded once at the line.
 * Cost = hours × burdened_cost (multipliers change the price, not our cost).
 */
function priceLabor(data: Dataset, d: LaborDraft, multipliers: AppliedMultiplier[]): QuoteLine {
  const role = data.laborRoles[d.roleId];
  const factors = multipliers.map((m) => m.value);
  const amountCents = multiplyRound(role.billRateCents, [d.hours, ...factors]);
  const costCents = multiplyRound(role.burdenedCostCents, [d.hours]);
  const multiplier = factors.reduce((a, b) => a * b, 1);
  const multText = multipliers.map((m) => ` × ${m.value} (${m.label})`).join("");
  return {
    id: d.id,
    kind: "labor",
    code: d.jobCode,
    description: role.role,
    qty: d.hours,
    unit: "hr",
    unitPriceCents: role.billRateCents,
    multiplier,
    amountCents,
    taxable: false, // labor is not taxed
    costCents,
    edited: d.edited,
    trace: {
      source: `labor_jobs.csv (job ${d.jobCode}), labor_roles.csv${multipliers.length ? ", multipliers.csv" : ""}`,
      formula: `${role.role} ${formatNumber(d.hours)} hrs × ${formatCents(role.billRateCents)}/hr${multText} = ${formatCents(amountCents)}`,
      details: [
        `Job ${d.jobCode}: ${data.laborJobs[d.jobCode].description}`,
        `Our cost: ${formatNumber(d.hours)} hrs × ${formatCents(role.burdenedCostCents)} burdened = ${formatCents(costCents)}`,
      ],
    },
  };
}

/** Fee line = price × qty. Not taxed. Cost = internal_cost × qty. */
function priceFee(data: Dataset, d: FeeDraft): QuoteLine {
  const fee = data.fees[d.feeCode];
  const amountCents = multiplyRound(fee.priceCents, [d.qty]);
  const costCents = multiplyRound(fee.internalCostCents, [d.qty]);
  return {
    id: d.id,
    kind: "fee",
    code: d.feeCode,
    description: fee.name,
    qty: d.qty,
    unit: "ea",
    unitPriceCents: fee.priceCents,
    amountCents,
    taxable: false, // fees are not taxed
    costCents,
    edited: d.edited,
    trace: {
      source: "fees.csv, pricing_rules.json",
      formula: `${fee.name}: ${formatCents(fee.priceCents)} × ${formatNumber(d.qty)} = ${formatCents(amountCents)}`,
      details: [`Why: ${d.reason}`, `Our cost: ${formatCents(costCents)}`],
    },
  };
}

export function priceDrafts(
  data: Dataset,
  drafts: LineDraft[],
  multipliers: AppliedMultiplier[],
): QuoteLine[] {
  return drafts.map((d) =>
    d.kind === "part"
      ? pricePart(data, d)
      : d.kind === "labor"
        ? priceLabor(data, d, multipliers)
        : priceFee(data, d),
  );
}
