// Inputs and outputs of the pricing engine.
import { z } from "zod";

// ---------- Inputs ----------

export const TIMINGS = ["standard", "after_hours", "weekend", "holiday"] as const;
export const TimingSchema = z.enum(TIMINGS);
export type Timing = z.infer<typeof TimingSchema>;

/** Which row of multipliers.csv each timing uses. */
export const TIMING_MULTIPLIER_ID: Record<Timing, string> = {
  standard: "standard",
  after_hours: "after_hours",
  weekend: "overnight_weekend",
  holiday: "holiday",
};

export const PartRefSchema = z.object({
  sku: z.string().min(1),
  qty: z.number().positive(),
});
export type PartRef = z.infer<typeof PartRefSchema>;

export const CustomerSchema = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
});
export type Customer = z.infer<typeof CustomerSchema>;

/**
 * What the job is. Produced by the AI from the notes (Phase 3) or built by hand.
 * The engine only reads these plain values; the AI's source_text lives alongside.
 */
export const JobSpecSchema = z.object({
  /** Main job: an install code (I-AC, I-FN, I-SYS) or a service code (S-CAP, ...). */
  jobCode: z.string().min(1),
  /** Installs only: size key from tiers.json, e.g. "3" (tons), "80" (kBTU), "3-80" (system). */
  size: z.string().optional(),
  /** Must be in pricing_rules.json service_area. Required for installs (decides the permit). */
  city: z.string().optional(),
  timing: TimingSchema.default("standard"),
  peakClub: z.boolean().default(false),
  /** Extra labor jobs: add-ons (A-*) for installs, more repairs (S-*) for service. */
  extraJobs: z.array(z.string()).default([]),
  /** Parts from the notes. For installs these are on top of the tier's items. */
  parts: z.array(PartRefSchema).default([]),
  /** Installs: override tiers.json counts if the notes say otherwise. */
  unitsRemoved: z.number().int().nonnegative().optional(),
  sealedSystemsOpened: z.number().int().nonnegative().optional(),
  customer: CustomerSchema.optional(),
  /** Job-wide discount, e.g. { pct: 10, reason: "Friends & family" }. */
  discount: z
    .object({
      pct: z.number().min(0).max(100),
      reason: z.string().trim().default("Discount"),
    })
    .optional(),
});
export type JobSpecInput = z.input<typeof JobSpecSchema>;
export type JobSpec = z.output<typeof JobSpecSchema>;

/** Manual changes made in the UI after the draft. Keys are line ids, e.g. "part:CL-36". */
export const QuoteEditsSchema = z.object({
  /** New quantity for a part or fee line. */
  qty: z.record(z.string(), z.number().nonnegative()).default({}),
  /** New hours for a labor line. */
  hours: z.record(z.string(), z.number().nonnegative()).default({}),
  /** Line ids to drop. */
  removed: z.array(z.string()).default([]),
  /** Parts picked from the price book. */
  addedParts: z.array(PartRefSchema).default([]),
});
export type QuoteEditsInput = z.input<typeof QuoteEditsSchema>;
export type QuoteEdits = z.output<typeof QuoteEditsSchema>;

export const OPTION_KEYS = ["good", "better", "best", "repair"] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];

/** Edits are kept per option, so changing Good doesn't change Best. */
export type EditsByOption = Partial<Record<OptionKey, QuoteEditsInput>>;

// ---------- Outputs ----------

export type JobKind = "install" | "service";
export type LineKind = "part" | "labor" | "fee" | "discount" | "minimum";

/** Why a line has the number it has. Owner view only. */
export type LineTrace = {
  /** Data file(s) the numbers came from. */
  source: string;
  /** The math in words, e.g. "Lead Installer 5 hrs × $135.00/hr = $675.00". */
  formula: string;
  /** Extra notes: where the line came from, cost, markup. */
  details: string[];
};

export type QuoteLine = {
  /** Stable id used by edits: "part:SKU", "labor:JOB:ROLE", "fee:CODE", "discount", "minimum". */
  id: string;
  kind: LineKind;
  /** SKU, fee code, or job code. */
  code: string;
  description: string;
  /** Units for parts and fees, hours for labor. */
  qty: number;
  unit: string;
  /** Sell price per unit, or bill rate per hour before multipliers. */
  unitPriceCents: number;
  /** Labor only: product of timing and Peak Club multipliers. */
  multiplier?: number;
  amountCents: number;
  taxable: boolean;
  /** What the job costs us for this line (owner only). */
  costCents: number;
  /** True if a manual edit changed or added this line. */
  edited: boolean;
  trace: LineTrace;
};

/** A pricing rule that affected the quote, in plain words. */
export type RuleTrace = {
  rule: string;
  effect: string;
  source: string;
};

export type QuoteTotals = {
  partsCents: number;
  laborCents: number;
  feesCents: number;
  /** "Minimum service charge" top-up, 0 if not needed. */
  minAdjCents: number;
  /** Amount taken off by the discount, as a positive number (0 if none). */
  discountCents: number;
  /** Before tax. */
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  /** Installs only, otherwise null. */
  depositCents: number | null;
};

export type MarginCheck = {
  partsCostCents: number;
  laborCostCents: number;
  feesCostCents: number;
  /** Installs only: 3% of subtotal. */
  warrantyReserveCents: number;
  jobCostCents: number;
  /** (subtotal - job cost) / subtotal, unrounded. */
  margin: number;
  target: number;
  passes: boolean;
  /** Lines whose own margin is under the target, worst first. */
  lowMarginLines: { lineId: string; description: string; margin: number }[];
};

export type QuoteOption = {
  key: OptionKey;
  name: string;
  lines: QuoteLine[];
  totals: QuoteTotals;
  margin: MarginCheck;
  /** Rules applied to this option (multipliers, Peak Club, fees, minimum, tax, deposit). */
  rules: RuleTrace[];
  /** Manual edits applied after the draft, in plain words. */
  edits: string[];
};

export type Quote = {
  jobKind: JobKind;
  jobCode: string;
  jobDescription: string;
  size?: string;
  city?: string;
  timing: Timing;
  peakClub: boolean;
  customer?: Customer;
  validDays: number;
  /** Customer financing offer from pricing_rules.json. */
  financing: { termMonths: number; apr: number };
  options: QuoteOption[];
};

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}
