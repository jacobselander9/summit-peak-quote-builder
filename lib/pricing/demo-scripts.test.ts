// Proves the engine matches /demo/expected_totals.json to the cent.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadDataset } from "@/lib/data/load";
import { DEMO_SCRIPTS } from "@/lib/demo/scripts";
import { buildQuote } from "./quote";
import type { QuoteOption } from "./types";

type Expected = {
  parts: number;
  labor: number;
  fees: number;
  min_adj: number;
  subtotal: number;
  tax: number;
  total: number;
  job_cost: number;
  margin: number;
  passes: boolean;
  deposit: number | null;
};

const expectedTotals = JSON.parse(
  readFileSync(path.join(process.cwd(), "demo", "expected_totals.json"), "utf8"),
) as Record<string, Expected | Record<string, Expected>>;

const data = loadDataset();
const toCents = (dollars: number) => Math.round(dollars * 100);

function expectMatches(option: QuoteOption, e: Expected) {
  const t = option.totals;
  expect(t.partsCents, "parts").toBe(toCents(e.parts));
  expect(t.laborCents, "labor").toBe(toCents(e.labor));
  expect(t.feesCents, "fees").toBe(toCents(e.fees));
  expect(t.minAdjCents, "min_adj").toBe(toCents(e.min_adj));
  expect(t.subtotalCents, "subtotal").toBe(toCents(e.subtotal));
  expect(t.taxCents, "tax").toBe(toCents(e.tax));
  expect(t.totalCents, "total").toBe(toCents(e.total));
  expect(t.depositCents, "deposit").toBe(e.deposit === null ? null : toCents(e.deposit));
  expect(option.margin.jobCostCents, "job_cost").toBe(toCents(e.job_cost));
  // expected_totals.json stores margin rounded to 4 decimals
  expect(Number(option.margin.margin.toFixed(4)), "margin").toBe(e.margin);
  expect(option.margin.passes, "passes").toBe(e.passes);
}

describe("demo scripts match expected_totals.json to the cent", () => {
  for (const script of DEMO_SCRIPTS.filter((s) => s.expectedKey)) {
    const expected = expectedTotals[script.expectedKey!];

    it(script.expectedKey!, () => {
      const quote = buildQuote(data, script.spec!);
      if (quote.jobKind === "install") {
        const tiers = expected as Record<string, Expected>;
        expect(quote.options.map((o) => o.key)).toEqual(["good", "better", "best"]);
        for (const option of quote.options) expectMatches(option, tiers[option.key]);
      } else {
        expect(quote.options).toHaveLength(1);
        expectMatches(quote.options[0], expected as Expected);
      }
    });
  }

  it("covers every scenario in expected_totals.json", () => {
    const tested = DEMO_SCRIPTS.map((s) => s.expectedKey).filter(Boolean);
    expect(tested.sort()).toEqual(Object.keys(expectedTotals).sort());
  });
});
