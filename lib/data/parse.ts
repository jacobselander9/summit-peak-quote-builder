// Turns the raw text of every /data file into one validated, typed Dataset.
// Pure (no file system), so it runs on the server and in the browser.
import Papa from "papaparse";
import { z } from "zod";
import {
  FeeRowSchema,
  LaborJobRowSchema,
  LaborRoleRowSchema,
  MultiplierRowSchema,
  PriceBookRowSchema,
  PricingRulesSchema,
  REQUIRED_FEE_CODES,
  REQUIRED_MULTIPLIER_IDS,
  TiersFileSchema,
  type Fee,
  type LaborJob,
  type LaborRole,
  type Multiplier,
  type PriceBookItem,
  type PricingRules,
  type Tiers,
} from "./schemas";

/** Raw contents of each file in /data, keyed by file name. */
export type RawDataFiles = {
  "price_book.csv": string;
  "labor_roles.csv": string;
  "labor_jobs.csv": string;
  "multipliers.csv": string;
  "fees.csv": string;
  "pricing_rules.json": string;
  "tiers.json": string;
};
export const DATA_FILE_NAMES = [
  "price_book.csv",
  "labor_roles.csv",
  "labor_jobs.csv",
  "multipliers.csv",
  "fees.csv",
  "pricing_rules.json",
  "tiers.json",
] as const satisfies readonly (keyof RawDataFiles)[];

export type Dataset = {
  priceBook: Record<string, PriceBookItem>; // by sku
  laborRoles: Record<string, LaborRole>; // by role_id
  laborJobs: Record<string, LaborJob>; // by job_code
  multipliers: Record<string, Multiplier>; // by id
  fees: Record<string, Fee>; // by fee_code
  rules: PricingRules;
  tiers: Tiers;
};

export class DataError extends Error {
  constructor(file: string, message: string) {
    super(`[data/${file}] ${message}`);
    this.name = "DataError";
  }
}

function parseCsv<S extends z.ZodType>(
  file: string,
  text: string,
  schema: S,
): z.output<S>[] {
  const result = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    const e = result.errors[0];
    throw new DataError(file, `CSV error on row ${e.row}: ${e.message}`);
  }
  return result.data.map((row, i) => {
    const parsed = schema.safeParse(row);
    if (!parsed.success) {
      // +2: one for the header line, one because rows are 1-based in editors
      throw new DataError(file, `row ${i + 2} is invalid: ${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
  });
}

function parseJson<S extends z.ZodType>(file: string, text: string, schema: S): z.output<S> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new DataError(file, `not valid JSON: ${(err as Error).message}`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new DataError(file, `invalid: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** Array -> object keyed by `key`. Throws on duplicate keys. */
function indexBy<T>(file: string, rows: T[], key: (r: T) => string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const row of rows) {
    const k = key(row);
    if (k in out) throw new DataError(file, `duplicate key "${k}"`);
    out[k] = row;
  }
  return out;
}

export function parseDataset(raw: RawDataFiles): Dataset {
  const priceBook = indexBy(
    "price_book.csv",
    parseCsv("price_book.csv", raw["price_book.csv"], PriceBookRowSchema),
    (r) => r.sku,
  );
  const laborRoles = indexBy(
    "labor_roles.csv",
    parseCsv("labor_roles.csv", raw["labor_roles.csv"], LaborRoleRowSchema),
    (r) => r.roleId,
  );
  const laborJobs = indexBy(
    "labor_jobs.csv",
    parseCsv("labor_jobs.csv", raw["labor_jobs.csv"], LaborJobRowSchema),
    (r) => r.jobCode,
  );
  const multipliers = indexBy(
    "multipliers.csv",
    parseCsv("multipliers.csv", raw["multipliers.csv"], MultiplierRowSchema),
    (r) => r.id,
  );
  const fees = indexBy(
    "fees.csv",
    parseCsv("fees.csv", raw["fees.csv"], FeeRowSchema),
    (r) => r.feeCode,
  );
  const rules = parseJson("pricing_rules.json", raw["pricing_rules.json"], PricingRulesSchema);
  const tiers = parseJson("tiers.json", raw["tiers.json"], TiersFileSchema);

  const dataset: Dataset = { priceBook, laborRoles, laborJobs, multipliers, fees, rules, tiers };
  checkCrossReferences(dataset);
  return dataset;
}

/** Every id one file uses must exist in the file that defines it. Fails loudly. */
function checkCrossReferences(d: Dataset): void {
  // labor_jobs -> labor_roles
  for (const job of Object.values(d.laborJobs)) {
    for (const roleId of job.roleIds) {
      if (!d.laborRoles[roleId]) {
        throw new DataError("labor_jobs.csv", `job ${job.jobCode} uses unknown role "${roleId}"`);
      }
    }
  }

  // engine-required multipliers and fees
  for (const id of REQUIRED_MULTIPLIER_IDS) {
    if (!d.multipliers[id]) throw new DataError("multipliers.csv", `missing required multiplier "${id}"`);
  }
  for (const code of REQUIRED_FEE_CODES) {
    if (!d.fees[code]) throw new DataError("fees.csv", `missing required fee "${code}"`);
  }

  // pricing_rules -> fees
  for (const [city, feeCode] of Object.entries(d.rules.permit_by_city)) {
    if (!d.fees[feeCode]) {
      throw new DataError("pricing_rules.json", `permit for "${city}" uses unknown fee "${feeCode}"`);
    }
  }
  const feeLists = [
    ...d.rules.install_fees_always.filter((f) => f !== "permit"), // "permit" = city permit, resolved above
    ...d.rules.install_fees_per_unit_removed,
    ...d.rules.install_fees_per_sealed_system_opened,
  ];
  for (const feeCode of feeLists) {
    if (!d.fees[feeCode]) throw new DataError("pricing_rules.json", `unknown fee "${feeCode}"`);
  }
  for (const city of d.rules.service_area) {
    if (!d.rules.permit_by_city[city]) {
      throw new DataError("pricing_rules.json", `service-area city "${city}" has no permit fee`);
    }
  }

  // tiers -> labor_jobs and price_book
  for (const [jobCode, sizes] of Object.entries(d.tiers)) {
    if (!d.laborJobs[jobCode]) throw new DataError("tiers.json", `unknown job code "${jobCode}"`);
    for (const [size, sizeEntry] of Object.entries(sizes)) {
      for (const [tierName, tier] of Object.entries(sizeEntry.tiers)) {
        const where = `${jobCode} / ${size} / ${tierName}`;
        if (!d.laborJobs[tier.laborJob]) {
          throw new DataError("tiers.json", `${where} uses unknown labor job "${tier.laborJob}"`);
        }
        for (const { sku } of tier.items) {
          if (!d.priceBook[sku]) {
            throw new DataError(
              "tiers.json",
              `${where} uses SKU "${sku}", which is not in price_book.csv`,
            );
          }
        }
      }
    }
  }
}
