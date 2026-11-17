// zod schemas for every file in /data.
// CSV values arrive as strings, so numbers are coerced here.
// Money is converted to integer cents at load time so the pricing
// engine never does float math on dollars.
import { z } from "zod";

/** "1850.00" -> 185000. Safe for values with at most 2 decimals. */
const dollarsToCents = z.coerce
  .number()
  .nonnegative()
  .transform((dollars) => Math.round(dollars * 100));

/** Empty CSV cell -> null, otherwise a whole number. */
const optionalInt = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.coerce.number().int().nonnegative().nullable(),
);

const nonEmpty = z.string().trim().min(1);

// ---------- price_book.csv ----------
export const PriceBookRowSchema = z
  .object({
    sku: nonEmpty,
    description: nonEmpty,
    category: nonEmpty,
    unit: nonEmpty,
    supplier: nonEmpty,
    unit_cost: dollarsToCents,
    markup: z.coerce.number().positive(),
    sell_price: dollarsToCents,
    on_hand: optionalInt,
    reorder_at: optionalInt,
  })
  .transform((r) => ({
    sku: r.sku,
    description: r.description,
    category: r.category,
    unit: r.unit,
    supplier: r.supplier,
    unitCostCents: r.unit_cost,
    markup: r.markup,
    sellPriceCents: r.sell_price,
    onHand: r.on_hand,
    reorderAt: r.reorder_at,
  }));
export type PriceBookItem = z.output<typeof PriceBookRowSchema>;

// ---------- labor_roles.csv ----------
export const LaborRoleRowSchema = z
  .object({
    role_id: nonEmpty,
    role: nonEmpty,
    base_wage: dollarsToCents,
    burdened_cost: dollarsToCents,
    bill_rate: dollarsToCents,
  })
  .transform((r) => ({
    roleId: r.role_id,
    role: r.role,
    baseWageCents: r.base_wage,
    burdenedCostCents: r.burdened_cost,
    billRateCents: r.bill_rate,
  }));
export type LaborRole = z.output<typeof LaborRoleRowSchema>;

// ---------- labor_jobs.csv ----------
export const JobTypeSchema = z.enum(["install", "addon", "service"]);
export type JobType = z.infer<typeof JobTypeSchema>;

export const LaborJobRowSchema = z
  .object({
    job_code: nonEmpty,
    description: nonEmpty,
    job_type: JobTypeSchema,
    hours_per_person: z.coerce.number().positive(),
    // "lead_installer;install_helper" -> ["lead_installer", "install_helper"]
    roles: nonEmpty.transform((s) =>
      s.split(";").map((x) => x.trim()).filter(Boolean),
    ),
  })
  .transform((r) => ({
    jobCode: r.job_code,
    description: r.description,
    jobType: r.job_type,
    hoursPerPerson: r.hours_per_person,
    roleIds: r.roles,
  }));
export type LaborJob = z.output<typeof LaborJobRowSchema>;

// ---------- multipliers.csv ----------
export const MultiplierRowSchema = z
  .object({
    id: nonEmpty,
    condition: nonEmpty,
    multiplier: z.coerce.number().positive(),
    applies_to: nonEmpty,
    notes: z.string(),
  })
  .transform((r) => ({
    id: r.id,
    condition: r.condition,
    multiplier: r.multiplier,
    appliesTo: r.applies_to,
    notes: r.notes,
  }));
export type Multiplier = z.output<typeof MultiplierRowSchema>;

/** Multiplier ids the pricing engine depends on. */
export const REQUIRED_MULTIPLIER_IDS = [
  "standard",
  "after_hours",
  "overnight_weekend",
  "holiday",
  "attic_crawl",
  "peak_club",
] as const;

// ---------- fees.csv ----------
export const FeeRowSchema = z
  .object({
    fee_code: nonEmpty,
    name: nonEmpty,
    price: dollarsToCents,
    internal_cost: dollarsToCents,
    job_type: z.enum(["install", "service"]),
    when_it_applies: nonEmpty,
  })
  .transform((r) => ({
    feeCode: r.fee_code,
    name: r.name,
    priceCents: r.price,
    internalCostCents: r.internal_cost,
    jobType: r.job_type,
    whenItApplies: r.when_it_applies,
  }));
export type Fee = z.output<typeof FeeRowSchema>;

/** Fee codes the pricing engine depends on. */
export const REQUIRED_FEE_CODES = [
  "F-TRIP",
  "F-DIAG",
  "F-AFTER",
  "F-DISP",
  "F-RECOV",
  "F-STARTUP",
] as const;

// ---------- pricing_rules.json ----------
const fraction = z.number().min(0).max(1);

export const PricingRulesSchema = z.object({
  effective_date: z.string(),
  sell_price_rounding: z.string(),
  tax_rate: fraction,
  tax_applies_to: z.array(z.string()),
  target_margin: z.object({ install: fraction, service: fraction }),
  minimum_service_ticket: z.number().positive(),
  warranty_reserve_pct_of_install_price: fraction,
  install_deposit_pct: fraction,
  card_surcharge: z.object({ pct: fraction, over: z.number() }),
  financing: z.object({
    term_months: z.number().int().positive(),
    apr: z.number().min(0),
    dealer_fee_pct: fraction,
  }),
  quote_valid_days: z.number().int().positive(),
  peak_club: z.object({
    monthly_price: z.number(),
    service_labor_discount: fraction,
    waive_trip_charge: z.boolean(),
    applies_to_installs: z.boolean(),
  }),
  permit_by_city: z.record(z.string(), z.string()),
  service_area: z.array(z.string()).min(1),
  install_fees_always: z.array(z.string()),
  install_fees_per_unit_removed: z.array(z.string()),
  install_fees_per_sealed_system_opened: z.array(z.string()),
  service_fees: z.string(),
});
export type PricingRules = z.infer<typeof PricingRulesSchema>;

// ---------- tiers.json ----------
export const TierNameSchema = z.enum(["good", "better", "best"]);
export type TierName = z.infer<typeof TierNameSchema>;

const TierItemSchema = z
  .tuple([nonEmpty, z.number().positive()])
  .transform(([sku, qty]) => ({ sku, qty }));

const TierSchema = z
  .object({
    name: nonEmpty,
    labor_job: nonEmpty,
    items: z.array(TierItemSchema).min(1),
  })
  .transform((t) => ({ name: t.name, laborJob: t.labor_job, items: t.items }));
export type Tier = z.output<typeof TierSchema>;

const TierSizeSchema = z
  .object({
    units_removed: z.number().int().nonnegative(),
    sealed_systems_opened: z.number().int().nonnegative(),
    tiers: z.object({
      good: TierSchema,
      better: TierSchema,
      best: TierSchema,
    }),
  })
  .transform((s) => ({
    unitsRemoved: s.units_removed,
    sealedSystemsOpened: s.sealed_systems_opened,
    tiers: s.tiers,
  }));
export type TierSize = z.output<typeof TierSizeSchema>;

/** job code -> size key -> tier set. Keys starting with "_" (like "_notes") are comments and dropped. */
export const TiersFileSchema = z
  .record(z.string(), z.unknown())
  .transform((obj) =>
    Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith("_"))),
  )
  .pipe(z.record(z.string(), z.record(z.string(), TierSizeSchema)));
export type Tiers = z.output<typeof TiersFileSchema>;
