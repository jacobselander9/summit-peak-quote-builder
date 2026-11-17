import { describe, expect, it } from "vitest";
import { loadDataset, readRawDataFiles } from "./load";
import { DataError, parseDataset } from "./parse";

describe("loading /data", () => {
  const d = loadDataset();

  it("loads every file with the expected counts", () => {
    expect(Object.keys(d.priceBook)).toHaveLength(40);
    expect(Object.keys(d.laborRoles)).toHaveLength(5);
    expect(Object.keys(d.laborJobs)).toHaveLength(20);
    expect(Object.keys(d.multipliers)).toHaveLength(6);
    expect(Object.keys(d.fees)).toHaveLength(10);
    expect(d.rules.service_area).toHaveLength(6);
  });

  it("has tier sets for the install job codes and sizes", () => {
    expect(Object.keys(d.tiers).sort()).toEqual(["I-AC", "I-FN", "I-SYS"]);
    expect(Object.keys(d.tiers["I-AC"]).sort()).toEqual(["2", "3", "4", "5"]);
    expect(Object.keys(d.tiers["I-FN"]).sort()).toEqual(["100", "60", "80"]);
    expect(Object.keys(d.tiers["I-SYS"])).toHaveLength(12); // 4 tonnages x 3 furnace sizes
    expect(d.tiers["I-SYS"]["3-80"].unitsRemoved).toBe(2);
  });

  it("every SKU used in tiers.json exists in price_book.csv", () => {
    for (const sizes of Object.values(d.tiers)) {
      for (const size of Object.values(sizes)) {
        for (const tier of Object.values(size.tiers)) {
          for (const { sku } of tier.items) {
            expect(d.priceBook[sku], `missing SKU ${sku}`).toBeDefined();
          }
        }
      }
    }
  });

  it("stores money as integer cents", () => {
    const ac = d.priceBook["AC-36-14"];
    expect(ac.unitCostCents).toBe(225000);
    expect(ac.sellPriceCents).toBe(427500);
    expect(ac.markup).toBe(1.9);
    expect(d.laborRoles.lead_installer.billRateCents).toBe(13500);
    expect(d.laborRoles.lead_installer.burdenedCostCents).toBe(4800);
    expect(d.fees["F-TRIP"].priceCents).toBe(8900);
    expect(d.fees["F-TRIP"].internalCostCents).toBe(3000);
  });

  it("parses empty stock cells as null and role lists as arrays", () => {
    expect(d.priceBook["DUCT-TRN"].onHand).toBeNull();
    expect(d.laborJobs["I-AC"].roleIds).toEqual(["lead_installer", "install_helper"]);
    expect(d.laborJobs["S-CAP"].hoursPerPerson).toBe(0.5);
  });
});

describe("fails loudly on bad data", () => {
  const raw = readRawDataFiles();

  it("rejects a tier SKU that is not in the price book", () => {
    const tiers = raw["tiers.json"].replace('"AC-36-14"', '"AC-36-XX"');
    expect(() => parseDataset({ ...raw, "tiers.json": tiers })).toThrow(DataError);
    expect(() => parseDataset({ ...raw, "tiers.json": tiers })).toThrow(/AC-36-XX.*price_book\.csv/);
  });

  it("rejects a non-numeric cost", () => {
    const pb = raw["price_book.csv"].replace("1850.00", "abc");
    expect(() => parseDataset({ ...raw, "price_book.csv": pb })).toThrow(/price_book\.csv/);
  });

  it("rejects a labor job that uses an unknown role", () => {
    const jobs = raw["labor_jobs.csv"].replace("S-CAP,Replace capacitor,service,0.5,service_tech", "S-CAP,Replace capacitor,service,0.5,wizard");
    expect(() => parseDataset({ ...raw, "labor_jobs.csv": jobs })).toThrow(/wizard/);
  });

  it("rejects a permit city mapped to an unknown fee", () => {
    const rules = raw["pricing_rules.json"].replace('"Logan": "F-PRM-LOG"', '"Logan": "F-NOPE"');
    expect(() => parseDataset({ ...raw, "pricing_rules.json": rules })).toThrow(/F-NOPE/);
  });
});
