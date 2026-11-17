// Step 1 of pricing: decide WHICH lines a quote option has and their quantities,
// before any money math. Manual edits are applied to these drafts, so a changed
// quantity or hours flows through the normal pricing math.
import type { Dataset, TierName } from "@/lib/data";
import { formatNumber } from "./money";
import type { JobKind, JobSpec, QuoteEdits } from "./types";

export type PartDraft = {
  kind: "part";
  id: string;
  sku: string;
  qty: number;
  /** Where the part came from, for the trace. */
  origins: string[];
  edited: boolean;
};
export type LaborDraft = {
  kind: "labor";
  id: string;
  jobCode: string;
  roleId: string;
  hours: number;
  edited: boolean;
};
export type FeeDraft = {
  kind: "fee";
  id: string;
  feeCode: string;
  qty: number;
  /** Plain-language reason the fee is on the quote. */
  reason: string;
  edited: boolean;
};
export type LineDraft = PartDraft | LaborDraft | FeeDraft;

export const partId = (sku: string) => `part:${sku}`;
export const laborId = (jobCode: string, roleId: string) => `labor:${jobCode}:${roleId}`;
export const feeId = (feeCode: string) => `fee:${feeCode}`;

/** Adds a part, or adds to the qty if the SKU is already on the quote. */
function addPart(drafts: LineDraft[], sku: string, qty: number, origin: string, edited = false) {
  const existing = drafts.find((d): d is PartDraft => d.kind === "part" && d.sku === sku);
  if (existing) {
    existing.qty += qty;
    existing.origins.push(origin);
    existing.edited ||= edited;
  } else {
    drafts.push({ kind: "part", id: partId(sku), sku, qty, origins: [origin], edited });
  }
}

/** One labor line per role on the crew; each role works the job's hours_per_person. */
function addLaborJob(drafts: LineDraft[], data: Dataset, jobCode: string) {
  const job = data.laborJobs[jobCode];
  for (const roleId of job.roleIds) {
    drafts.push({
      kind: "labor",
      id: laborId(jobCode, roleId),
      jobCode,
      roleId,
      hours: job.hoursPerPerson,
      edited: false,
    });
  }
}

function addFee(drafts: LineDraft[], feeCode: string, qty: number, reason: string) {
  if (qty <= 0) return;
  drafts.push({ kind: "fee", id: feeId(feeCode), feeCode, qty, reason, edited: false });
}

/** The lines an option starts with, straight from the spec and /data. */
export function baseDrafts(
  data: Dataset,
  spec: JobSpec,
  jobKind: JobKind,
  tierName: TierName | null,
): LineDraft[] {
  const drafts: LineDraft[] = [];

  if (jobKind === "install") {
    const sizeEntry = data.tiers[spec.jobCode][spec.size!];
    const tier = sizeEntry.tiers[tierName!];

    // Parts: the tier's item list, then anything extra from the notes.
    for (const item of tier.items) {
      addPart(drafts, item.sku, item.qty, `${tier.name} package (tiers.json ${spec.jobCode} / ${spec.size})`);
    }
    for (const p of spec.parts) addPart(drafts, p.sku, p.qty, "from the notes");

    // Labor: the tier's labor job plus any add-ons.
    addLaborJob(drafts, data, tier.laborJob);
    for (const code of spec.extraJobs) addLaborJob(drafts, data, code);

    // Install fees (pricing_rules.json): permit by city + startup always,
    // haul-away per unit removed, refrigerant recovery per sealed system opened.
    const city = spec.city!;
    addFee(drafts, data.rules.permit_by_city[city], 1, `Permit because city = ${city}`);
    addFee(drafts, "F-STARTUP", 1, "Every equipment install");
    const unitsRemoved = spec.unitsRemoved ?? sizeEntry.unitsRemoved;
    const sealed = spec.sealedSystemsOpened ?? sizeEntry.sealedSystemsOpened;
    for (const code of data.rules.install_fees_per_unit_removed) {
      addFee(drafts, code, unitsRemoved, `${unitsRemoved} old unit(s) removed`);
    }
    for (const code of data.rules.install_fees_per_sealed_system_opened) {
      addFee(drafts, code, sealed, `${sealed} sealed system(s) opened`);
    }
  } else {
    // Service: parts only come from the notes; repairs never use tiers.
    for (const p of spec.parts) addPart(drafts, p.sku, p.qty, "from the notes");
    addLaborJob(drafts, data, spec.jobCode);
    for (const code of spec.extraJobs) addLaborJob(drafts, data, code);

    // Service fees: trip charge unless Peak Club; after-hours dispatch off standard hours.
    // F-DIAG is only charged when a repair is declined, so it never goes on a quote.
    const waiveTrip = spec.peakClub && data.rules.peak_club.waive_trip_charge;
    if (!waiveTrip) addFee(drafts, "F-TRIP", 1, "All service calls");
    if (spec.timing !== "standard") {
      addFee(drafts, "F-AFTER", 1, `Call is ${spec.timing.replace("_", "-")}`);
    }
  }

  return drafts;
}

/** Applies manual edits to drafts. Returns the new drafts and a plain-language log. */
export function applyEdits(
  data: Dataset,
  drafts: LineDraft[],
  edits: QuoteEdits,
): { drafts: LineDraft[]; log: string[] } {
  const out = drafts.map((d) => ({ ...d, ...(d.kind === "part" ? { origins: [...d.origins] } : {}) }));
  const log: string[] = [];
  const label = (d: LineDraft) =>
    d.kind === "part"
      ? d.sku
      : d.kind === "fee"
        ? data.fees[d.feeCode].name
        : `${data.laborRoles[d.roleId].role} (${d.jobCode})`;

  for (const p of edits.addedParts) {
    addPart(out, p.sku, p.qty, "added by hand", true);
    log.push(`Added part ${p.sku} (${data.priceBook[p.sku].description}) × ${formatNumber(p.qty)}`);
  }

  for (const [id, qty] of Object.entries(edits.qty)) {
    const d = out.find((x) => x.id === id);
    if (!d || d.kind === "labor" || d.qty === qty) continue;
    log.push(`Changed qty of ${label(d)} from ${formatNumber(d.qty)} to ${formatNumber(qty)}`);
    d.qty = qty;
    d.edited = true;
  }

  for (const [id, hours] of Object.entries(edits.hours)) {
    const d = out.find((x) => x.id === id);
    if (!d || d.kind !== "labor" || d.hours === hours) continue;
    log.push(`Changed ${label(d)} hours from ${formatNumber(d.hours)} to ${formatNumber(hours)}`);
    d.hours = hours;
    d.edited = true;
  }

  const removed = new Set(edits.removed);
  for (const d of out) {
    if (removed.has(d.id)) log.push(`Removed ${label(d)}`);
  }

  return { drafts: out.filter((d) => !removed.has(d.id)), log };
}
