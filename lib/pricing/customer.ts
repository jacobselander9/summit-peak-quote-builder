// The customer-facing version of a quote. Anything the customer sees (the PDF)
// is built from THIS object only. It copies fields in on purpose (an allow-list),
// so cost, markup, margin and the calculation trace can never slip through.
import type { Customer, OptionKey, Quote, QuoteLine } from "./types";

export type CustomerLine = {
  description: string;
  /** SKU for parts; empty for labor, fees and the minimum charge. */
  sku: string;
  kind: QuoteLine["kind"];
  qty: number;
  unit: string;
  /** Effective sell price per unit (labor includes timing and Peak Club). */
  unitPriceCents: number;
  amountCents: number;
};

export type CustomerOption = {
  key: OptionKey;
  name: string;
  lines: CustomerLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number | null;
};

export type CustomerQuote = {
  jobKind: "install" | "service";
  jobDescription: string;
  city?: string;
  customer: Customer;
  validDays: number;
  /** Fraction of the total due as a deposit on installs (e.g. 0.3). */
  depositPct: number;
  financing: { termMonths: number; apr: number };
  options: CustomerOption[];
};

/** Labor shows one rate per hour that already includes multipliers. */
function customerLine(l: QuoteLine): CustomerLine {
  const unitPriceCents =
    l.kind === "labor" && l.qty > 0 ? Math.round(l.amountCents / l.qty) : l.unitPriceCents;
  return {
    description: l.description,
    sku: l.kind === "part" ? l.code : "",
    kind: l.kind,
    qty: l.qty,
    unit: l.unit,
    unitPriceCents,
    amountCents: l.amountCents,
  };
}

/** Builds the customer quote. Pass option keys to include only some options. */
export function toCustomerQuote(quote: Quote, only?: OptionKey[]): CustomerQuote {
  return {
    jobKind: quote.jobKind,
    jobDescription: quote.jobDescription,
    city: quote.city,
    customer: { ...(quote.customer ?? {}) },
    validDays: quote.validDays,
    depositPct: quote.depositPct,
    financing: { termMonths: quote.financing.termMonths, apr: quote.financing.apr },
    options: quote.options
      .filter((o) => !only || only.includes(o.key))
      .map((o) => ({
        key: o.key,
        name: o.name,
        lines: o.lines.map(customerLine),
        subtotalCents: o.totals.subtotalCents,
        taxCents: o.totals.taxCents,
        totalCents: o.totals.totalCents,
        depositCents: o.totals.depositCents,
      })),
  };
}
