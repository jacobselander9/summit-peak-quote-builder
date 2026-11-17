// Proves nothing internal (cost, markup, margin, trace) reaches the customer.
import { describe, expect, it } from "vitest";
import { loadDataset } from "@/lib/data/load";
import { DEMO_SCRIPTS } from "@/lib/demo/scripts";
import { toCustomerQuote } from "./customer";
import { partId } from "./drafts";
import { buildQuote } from "./quote";

const data = loadDataset();
const FORBIDDEN_KEY = /cost|markup|margin|trace|rule|edit|multiplier|source|formula|detail|burden|warranty/i;

/** Every key anywhere in the object. */
function allKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      allKeys(v, out);
    }
  }
  return out;
}

describe("customer quote", () => {
  for (const script of DEMO_SCRIPTS.filter((s) => s.spec)) {
    it(`has no cost, markup, margin or trace fields: ${script.title}`, () => {
      // Include manual edits too, since those add "edited" flags internally.
      const quote = buildQuote(data, script.spec!, {
        good: { qty: { [partId("REF-454B")]: 5 } },
        repair: { addedParts: [{ sku: "CONT-2P30", qty: 1 }] },
      });
      const customer = toCustomerQuote(quote);
      const keys = allKeys(customer);
      expect(keys.filter((k) => FORBIDDEN_KEY.test(k))).toEqual([]);

      // No internal numbers or words hiding in values either.
      const json = JSON.stringify(customer);
      expect(json).not.toMatch(/markup|margin|burdened|price_book\.csv|unit_cost/i);
    });
  }

  it("keeps the totals the customer needs", () => {
    const quote = buildQuote(data, DEMO_SCRIPTS[0].spec!);
    const c = toCustomerQuote(quote, ["better"]);
    expect(c.options).toHaveLength(1);
    expect(c.options[0]).toMatchObject({ totalCents: 1156137, taxCents: 67237, depositCents: 346841 });
    expect(c.customer).toEqual({ name: "Mrs. Jensen" });
  });

  it("shows labor at one effective rate that includes multipliers", () => {
    const quote = buildQuote(data, DEMO_SCRIPTS[3].spec!); // Saturday igniter, 0.75 hr × $145 × 1.75
    const labor = toCustomerQuote(quote).options[0].lines.find((l) => l.kind === "labor")!;
    expect(labor.amountCents).toBe(19031);
    expect(labor.unitPriceCents).toBe(25375); // $253.75/hr
    expect(labor.sku).toBe("");
  });
});
