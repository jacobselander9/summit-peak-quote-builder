import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadDataset } from "@/lib/data/load";
import { DEMO_SCRIPTS } from "@/lib/demo/scripts";
import { feeId, laborId, partId } from "./drafts";
import { multiplyRound } from "./money";
import { buildQuote } from "./quote";
import { PricingError, type JobSpecInput } from "./types";

const data = loadDataset();
const logan = DEMO_SCRIPTS[0].spec!; // I-AC 3-ton, Logan
const capacitor = DEMO_SCRIPTS[2].spec!; // S-CAP, Peak Club

const good = (spec: JobSpecInput, edits = {}) => buildQuote(data, spec, { good: edits }).options[0];
const repair = (spec: JobSpecInput, edits = {}) => buildQuote(data, spec, { repair: edits }).options[0];

describe("rounding", () => {
  it("rounds half up at the cent, with no float drift", () => {
    expect(multiplyRound(14500, [0.5, 0.85])).toBe(6163); // $61.625 -> $61.63
    expect(multiplyRound(14500, [0.75, 1.75])).toBe(19031); // $190.3125 -> $190.31
    expect(multiplyRound(652500, [0.0725])).toBe(47306); // $473.0625 -> $473.06
    expect(multiplyRound(1, [0.5])).toBe(1);
    expect(multiplyRound(3, [0.5])).toBe(2);
    expect(multiplyRound(861306, [0.3])).toBe(258392);
  });
});

describe("manual edits", () => {
  it("qty change: REF-454B 4 -> 6 lb on Good", () => {
    const o = good(logan, { qty: { [partId("REF-454B")]: 6 } });
    expect(o.totals.partsCents).toBe(665700); // +2 lb × $66
    expect(o.totals.taxCents).toBe(48263); // 665,700 × 7.25% = 48,263.25
    expect(o.totals.subtotalCents).toBe(827200);
    expect(o.totals.totalCents).toBe(875463);
    expect(o.totals.depositCents).toBe(262639);
    expect(o.lines.find((l) => l.code === "REF-454B")!.edited).toBe(true);
    expect(o.edits).toEqual(["Changed qty of REF-454B from 4 to 6"]);
  });

  it("labor-hours change: Lead Installer 5 -> 6 hrs", () => {
    const o = good(logan, { hours: { [laborId("I-AC", "lead_installer")]: 6 } });
    expect(o.totals.laborCents).toBe(128500); // +1 hr × $135
    expect(o.totals.taxCents).toBe(47306); // labor isn't taxed
    expect(o.totals.totalCents).toBe(874806);
    expect(o.margin.laborCostCents).toBe(6 * 4800 + 5 * 3100);
    expect(o.edits).toEqual(["Changed Lead Installer (I-AC) hours from 5 to 6"]);
  });

  it("removed line: drop the thermostat from Good", () => {
    const o = good(logan, { removed: [partId("TS-PROG")] });
    expect(o.lines.some((l) => l.code === "TS-PROG")).toBe(false);
    expect(o.totals.partsCents).toBe(638700);
    expect(o.totals.taxCents).toBe(46306); // 46,305.75 rounds up
    expect(o.totals.totalCents).toBe(846506);
    expect(o.edits).toEqual(["Removed TS-PROG"]);
  });

  it("can remove a fee line", () => {
    const o = good(logan, { removed: [feeId("F-DISP")] });
    expect(o.totals.feesCents).toBe(46500 - 7500);
  });

  it("added part merges into the quote and is taxed", () => {
    const o = repair(capacitor, { addedParts: [{ sku: "CONT-2P30", qty: 1 }] });
    expect(o.totals.partsCents).toBe(5600 + 6300);
    expect(o.totals.taxCents).toBe(863); // 11,900 × 7.25% = 862.75
    expect(o.totals.minAdjCents).toBe(18900 - (11900 + 6163));
    expect(o.totals.totalCents).toBe(18900 + 863);
    expect(o.edits[0]).toMatch(/^Added part CONT-2P30/);
  });

  it("edits on one option don't change the others", () => {
    const q = buildQuote(data, logan, { good: { removed: [partId("TS-PROG")] } });
    expect(q.options[1].totals.totalCents).toBe(1156137); // Better unchanged
    expect(q.options[1].edits).toEqual([]);
  });

  it("ignores edits for lines that no longer exist", () => {
    const o = good(logan, { qty: { "part:NOPE": 3 }, hours: { "labor:X:y": 2 } });
    expect(o.totals.totalCents).toBe(861306);
    expect(o.edits).toEqual([]);
  });
});

describe("pricing rules", () => {
  it("Peak Club on an install gives no discount", () => {
    const o = good({ ...logan, peakClub: true });
    expect(o.totals.laborCents).toBe(115000);
    expect(o.totals.totalCents).toBe(861306);
    expect(o.lines.filter((l) => l.kind === "labor").every((l) => l.multiplier === 1)).toBe(true);
    expect(o.rules.find((r) => r.rule === "Peak Club")!.effect).toMatch(/does not apply to installs/);
  });

  it("$189 minimum is added when a service ticket is under it", () => {
    const o = repair(capacitor);
    const min = o.lines.find((l) => l.kind === "minimum")!;
    expect(min.description).toBe("Minimum service charge");
    expect(min.amountCents).toBe(7137);
    expect(min.taxable).toBe(false);
    expect(o.totals.subtotalCents).toBe(18900);
    expect(o.rules.some((r) => r.rule === "Minimum service ticket")).toBe(true);
  });

  it("$189 minimum is not added when the ticket is already over it", () => {
    // Same repair, not a Peak Club member: $56 part + $72.50 labor + $89 trip = $217.50
    const o = repair({ ...capacitor, peakClub: false });
    expect(o.lines.some((l) => l.kind === "minimum")).toBe(false);
    expect(o.totals.subtotalCents).toBe(21750);
    expect(o.totals.totalCents).toBe(22156);
  });

  it("minimum shrinks as the ticket grows", () => {
    const o = repair(capacitor, { qty: { [partId("CAP-45-5")]: 2 } });
    expect(o.totals.minAdjCents).toBe(18900 - (11200 + 6163));
    expect(o.totals.taxCents).toBe(812);
  });

  it("timing multiplier applies to install labor too, with no after-hours fee", () => {
    const o = good({ ...logan, timing: "weekend" });
    expect(o.totals.laborCents).toBe(201250); // 1,150 × 1.75
    expect(o.lines.some((l) => l.code === "F-AFTER")).toBe(false);
  });

  it("service has no deposit; installs have no trip charge", () => {
    expect(repair(capacitor).totals.depositCents).toBeNull();
    expect(good(logan).lines.some((l) => l.code === "F-TRIP")).toBe(false);
  });

  it("add-on labor (A-PUMP) and extra parts are priced", () => {
    const o = good({ ...logan, extraJobs: ["A-PUMP"], parts: [{ sku: "PUMP-CND", qty: 1 }] });
    expect(o.totals.laborCents).toBe(115000 + 13500);
    expect(o.totals.partsCents).toBe(652500 + 15000);
  });
});

describe("discount", () => {
  const friend = { pct: 10, reason: "Friends & family" };

  it("takes 10% off parts, labor and fees; tax on discounted parts; deposit on the new total", () => {
    const o = good({ ...logan, discount: friend });
    // base 6,525 + 1,150 + 465 = 8,140 → 10% = 814.00
    const line = o.lines.find((l) => l.kind === "discount")!;
    expect(line.description).toBe("Friends & family discount (10%)");
    expect(line.amountCents).toBe(-81400);
    expect(o.totals.discountCents).toBe(81400);
    expect(o.totals.subtotalCents).toBe(732600);
    expect(o.totals.taxCents).toBe(42576); // 7.25% × (6,525 − 652.50) = 425.76
    expect(o.totals.totalCents).toBe(775176);
    expect(o.totals.depositCents).toBe(232553);
  });

  it("comes out of margin and can fail the target", () => {
    const o = good({ ...logan, discount: friend });
    // cost 3,961 + warranty 3% × 7,326 = 219.78 → 4,180.78
    expect(o.margin.jobCostCents).toBe(418078);
    expect(Number(o.margin.margin.toFixed(4))).toBe(0.4293);
    expect(o.margin.passes).toBe(false);
    expect(o.rules.find((r) => r.rule === "Discount")!.effect).toMatch(/10% off parts, labor and fees \(\$8,140\.00\) = −\$814\.00/);
  });

  it("applies to every option", () => {
    const q = buildQuote(data, { ...logan, discount: friend });
    expect(q.options.every((o) => o.totals.discountCents > 0)).toBe(true);
  });

  it("can't take a repair below the $189 minimum", () => {
    const o = repair({ ...capacitor, discount: friend });
    // 56 + 61.63 = 117.63 → −11.76 → 105.87, minimum tops up to 189
    expect(o.totals.discountCents).toBe(1176);
    expect(o.totals.minAdjCents).toBe(8313);
    expect(o.totals.subtotalCents).toBe(18900);
    expect(o.totals.taxCents).toBe(365); // 7.25% × 50.40
  });

  it("discounts an after-hours repair", () => {
    const o = buildQuote(data, { ...DEMO_SCRIPTS[3].spec!, discount: friend }).options[0];
    expect(o.totals.discountCents).toBe(5663);
    expect(o.totals.totalCents).toBe(50968 + 731);
  });

  it("0% means no discount line", () => {
    const o = good({ ...logan, discount: { pct: 0, reason: "x" } });
    expect(o.lines.some((l) => l.kind === "discount")).toBe(false);
    expect(o.totals.totalCents).toBe(861306);
  });
});

describe("trace", () => {
  it("explains every line with its source", () => {
    const o = good(logan);
    const ac = o.lines.find((l) => l.code === "AC-36-14")!;
    expect(ac.trace.source).toBe("price_book.csv");
    expect(ac.trace.formula).toBe("AC-36-14: $4,275.00 × 1 ea = $4,275.00");
    expect(ac.trace.details[0]).toBe("Sell price $4,275.00 = cost $2,250.00 × 1.90 markup");

    const lead = o.lines.find((l) => l.id === laborId("I-AC", "lead_installer"))!;
    expect(lead.trace.formula).toBe("Lead Installer 5 hrs × $135.00/hr = $675.00");
    expect(lead.trace.source).toMatch(/job I-AC/);

    expect(o.rules.find((r) => r.rule === "Permit")!.effect).toBe("$145.00 because city = Logan");
    expect(o.rules.find((r) => r.rule === "Tax")!.effect).toBe(
      "7.25% on parts & equipment only ($6,525.00) = $473.06. Labor and fees are not taxed.",
    );
    for (const line of o.lines) {
      expect(line.trace.source).not.toBe("");
      expect(line.trace.formula).not.toBe("");
    }
  });

  it("shows multipliers in the labor math", () => {
    const igniter = buildQuote(data, DEMO_SCRIPTS[3].spec!).options[0];
    const labor = igniter.lines.find((l) => l.kind === "labor")!;
    expect(labor.trace.formula).toMatch(/0\.75 hrs × \$145\.00\/hr × 1\.75 .* = \$190\.31/);
  });

  it("lists the lines that pull margin down", () => {
    const o = good(logan);
    expect(o.margin.lowMarginLines[0].description).toMatch(/Permit/); // 0% margin
    expect(o.margin.lowMarginLines.every((l) => l.margin < 0.45)).toBe(true);
  });
});

describe("bad input fails clearly", () => {
  it.each([
    [{ jobCode: "X-NOPE" }, /Unknown job code/],
    [{ jobCode: "A-PUMP" }, /add-on/],
    [{ jobCode: "I-AC", city: "Logan" }, /Size is required/],
    [{ jobCode: "I-AC", size: "7", city: "Logan" }, /No I-AC package for size "7"/],
    [{ jobCode: "I-AC", size: "3" }, /City is required/],
    [{ jobCode: "I-AC", size: "3", city: "Salt Lake City" }, /not in the service area/],
    [{ jobCode: "I-HP", size: "3", city: "Logan" }, /No Good\/Better\/Best packages/],
    [{ jobCode: "S-CAP", extraJobs: ["A-PUMP"] }, /can't be added/],
    [{ jobCode: "S-CAP", parts: [{ sku: "ZZZ", qty: 1 }] }, /not in the price book/],
  ] as [JobSpecInput, RegExp][])("%j", (spec, message) => {
    expect(() => buildQuote(data, spec)).toThrow(PricingError);
    expect(() => buildQuote(data, spec)).toThrow(message);
  });
});

describe("runs in the browser", () => {
  it("lib/pricing has no Node-only imports", () => {
    const dir = path.join(process.cwd(), "lib", "pricing");
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    for (const file of sources) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src, file).not.toMatch(/from "node:|from "fs"|from "path"|lib\/data\/load/);
    }
  });
});
