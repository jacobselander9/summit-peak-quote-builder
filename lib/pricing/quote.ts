// The pricing engine entry point. Pure function: same inputs -> same quote.
// Runs in the browser (live edits) and on the server.
//
//   buildQuote(data, spec, edits)
//     for each option (Good/Better/Best, or one Repair):
//       1. baseDrafts   which lines, which quantities      (drafts.ts)
//       2. applyEdits   manual changes from the UI          (drafts.ts)
//       3. priceDrafts  money math + trace for every line   (lines.ts)
//       4. minimum, tax, total, deposit, margin             (totals.ts)
import type { Dataset, TierName } from "@/lib/data";
import { applyEdits, baseDrafts } from "./drafts";
import { priceDrafts, type AppliedMultiplier } from "./lines";
import { formatCents } from "./money";
import { computeMargin, computeTotals, discountLine, minimumLine } from "./totals";
import {
  JobSpecSchema,
  PricingError,
  QuoteEditsSchema,
  TIMING_MULTIPLIER_ID,
  type EditsByOption,
  type JobKind,
  type JobSpec,
  type JobSpecInput,
  type OptionKey,
  type Quote,
  type QuoteOption,
  type RuleTrace,
} from "./types";

const TIER_NAMES: TierName[] = ["good", "better", "best"];

export function buildQuote(data: Dataset, specInput: JobSpecInput, edits: EditsByOption = {}): Quote {
  const parsed = JobSpecSchema.safeParse(specInput);
  if (!parsed.success) throw new PricingError(`Invalid job spec: ${parsed.error.message}`);
  const spec = parsed.data;
  const jobKind = validateSpec(data, spec);

  const optionKeys: OptionKey[] = jobKind === "install" ? TIER_NAMES : ["repair"];
  const options = optionKeys.map((key) =>
    priceOption(data, spec, jobKind, key, edits[key]),
  );

  return {
    jobKind,
    jobCode: spec.jobCode,
    jobDescription: data.laborJobs[spec.jobCode].description,
    size: spec.size,
    city: spec.city,
    timing: spec.timing,
    peakClub: spec.peakClub,
    customer: spec.customer,
    validDays: data.rules.quote_valid_days,
    depositPct: data.rules.install_deposit_pct,
    financing: { termMonths: data.rules.financing.term_months, apr: data.rules.financing.apr },
    options,
  };
}

function priceOption(
  data: Dataset,
  spec: JobSpec,
  jobKind: JobKind,
  key: OptionKey,
  editsInput: EditsByOption[OptionKey],
): QuoteOption {
  const tierName = key === "repair" ? null : key;
  const rules: RuleTrace[] = [];

  // Validate added parts here so a bad SKU from the UI gives a clear error.
  const edits = QuoteEditsSchema.parse(editsInput ?? {});
  for (const p of edits.addedParts) {
    if (!data.priceBook[p.sku]) throw new PricingError(`Added part ${p.sku} is not in the price book`);
  }

  const multipliers = laborMultipliers(data, spec, jobKind, rules);
  const { drafts, log } = applyEdits(data, baseDrafts(data, spec, jobKind, tierName), edits);
  addFeeRules(data, spec, jobKind, rules);

  const lines = priceDrafts(data, drafts, multipliers);
  const discLine = discountLine(spec.discount, lines, rules);
  if (discLine) lines.push(discLine);
  const minLine = minimumLine(data, jobKind, lines, rules);
  if (minLine) lines.push(minLine);

  const totals = computeTotals(data, jobKind, lines, rules, discLine ? spec.discount!.pct : 0);
  const margin = computeMargin(data, jobKind, lines, totals);

  const name =
    tierName === null
      ? data.laborJobs[spec.jobCode].description
      : data.tiers[spec.jobCode][spec.size!].tiers[tierName].name;

  return { key, name, lines, totals, margin, rules, edits: log };
}

/** Timing multiplier for all labor; Peak Club discount for service labor only. */
function laborMultipliers(
  data: Dataset,
  spec: JobSpec,
  jobKind: JobKind,
  rules: RuleTrace[],
): AppliedMultiplier[] {
  const out: AppliedMultiplier[] = [];

  const timing = data.multipliers[TIMING_MULTIPLIER_ID[spec.timing]];
  if (timing.multiplier !== 1) out.push({ value: timing.multiplier, label: timing.condition });
  rules.push({
    rule: "Labor timing",
    effect: `${timing.condition}: labor × ${timing.multiplier}`,
    source: "multipliers.csv",
  });

  if (spec.peakClub) {
    const peak = data.multipliers.peak_club;
    const appliesToInstalls = data.rules.peak_club.applies_to_installs;
    if (jobKind === "service" || appliesToInstalls) {
      out.push({ value: peak.multiplier, label: "Peak Club" });
      rules.push({
        rule: "Peak Club",
        effect: `Member: repair labor × ${peak.multiplier}${data.rules.peak_club.waive_trip_charge ? ", trip charge waived" : ""}`,
        source: "multipliers.csv, pricing_rules.json",
      });
    } else {
      rules.push({
        rule: "Peak Club",
        effect: "Member, but the Peak Club discount does not apply to installs, so no discount",
        source: "pricing_rules.json",
      });
    }
  }
  return out;
}

/** Plain-language summary of which fees were added and why. */
function addFeeRules(data: Dataset, spec: JobSpec, jobKind: JobKind, rules: RuleTrace[]) {
  if (jobKind === "install") {
    const permit = data.fees[data.rules.permit_by_city[spec.city!]];
    rules.push({
      rule: "Permit",
      effect: `${formatCents(permit.priceCents)} because city = ${spec.city}`,
      source: "pricing_rules.json (permit_by_city), fees.csv",
    });
    rules.push({
      rule: "Install fees",
      effect: "Startup on every install, haul-away per old unit removed, refrigerant recovery per sealed system opened",
      source: "pricing_rules.json, tiers.json",
    });
  } else {
    if (!(spec.peakClub && data.rules.peak_club.waive_trip_charge)) {
      rules.push({ rule: "Trip charge", effect: "Added to every service call", source: "fees.csv" });
    }
    if (spec.timing !== "standard") {
      rules.push({
        rule: "After-hours dispatch",
        effect: `Added because the call is ${spec.timing.replace("_", "-")}`,
        source: "fees.csv",
      });
    }
  }
}

/** Checks every code in the spec exists in /data. Returns install or service. */
function validateSpec(data: Dataset, spec: JobSpec): JobKind {
  const job = data.laborJobs[spec.jobCode];
  if (!job) throw new PricingError(`Unknown job code "${spec.jobCode}"`);
  if (job.jobType === "addon") {
    throw new PricingError(`${spec.jobCode} is an add-on, not a main job`);
  }
  const jobKind: JobKind = job.jobType;

  if (spec.city !== undefined && !data.rules.service_area.includes(spec.city)) {
    throw new PricingError(`"${spec.city}" is not in the service area`);
  }

  if (jobKind === "install") {
    const sizes = data.tiers[spec.jobCode];
    if (!sizes) throw new PricingError(`No Good/Better/Best packages for ${spec.jobCode} in tiers.json`);
    if (!spec.size) throw new PricingError(`Size is required for ${spec.jobCode}`);
    if (!sizes[spec.size]) {
      throw new PricingError(
        `No ${spec.jobCode} package for size "${spec.size}". Sizes: ${Object.keys(sizes).join(", ")}`,
      );
    }
    if (!spec.city) throw new PricingError("City is required for installs (it decides the permit)");
  }

  const allowedExtra = jobKind === "install" ? "addon" : "service";
  for (const code of spec.extraJobs) {
    const extra = data.laborJobs[code];
    if (!extra) throw new PricingError(`Unknown job code "${code}"`);
    if (extra.jobType !== allowedExtra) {
      throw new PricingError(`${code} can't be added to a ${jobKind} job`);
    }
  }

  for (const p of spec.parts) {
    if (!data.priceBook[p.sku]) throw new PricingError(`Part ${p.sku} is not in the price book`);
  }
  return jobKind;
}
