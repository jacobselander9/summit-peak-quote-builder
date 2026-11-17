// Small pure helpers the page uses to record manual edits.
// Each returns a NEW EditsByOption (React state must not be mutated).
import type { EditsByOption, JobSpecInput, OptionKey, QuoteEditsInput } from "@/lib/pricing/types";

type Edits = Required<{ [K in keyof QuoteEditsInput]-?: NonNullable<QuoteEditsInput[K]> }>;

function current(all: EditsByOption, key: OptionKey): Edits {
  const e = all[key] ?? {};
  return {
    qty: { ...(e.qty ?? {}) },
    hours: { ...(e.hours ?? {}) },
    removed: [...(e.removed ?? [])],
    addedParts: [...(e.addedParts ?? [])],
  };
}

const update = (all: EditsByOption, key: OptionKey, change: (e: Edits) => void): EditsByOption => {
  const e = current(all, key);
  change(e);
  return { ...all, [key]: e };
};

export const setQty = (all: EditsByOption, key: OptionKey, lineId: string, qty: number) =>
  update(all, key, (e) => {
    e.qty[lineId] = qty;
  });

export const setHours = (all: EditsByOption, key: OptionKey, lineId: string, hours: number) =>
  update(all, key, (e) => {
    e.hours[lineId] = hours;
  });

export const removeLine = (all: EditsByOption, key: OptionKey, lineId: string) =>
  update(all, key, (e) => {
    if (!e.removed.includes(lineId)) e.removed.push(lineId);
  });

export const restoreLine = (all: EditsByOption, key: OptionKey, lineId: string) =>
  update(all, key, (e) => {
    e.removed = e.removed.filter((id) => id !== lineId);
  });

/** Adds a part from the price book. Re-adding a removed SKU restores it instead. */
export const addPart = (all: EditsByOption, key: OptionKey, sku: string, qty = 1) =>
  update(all, key, (e) => {
    const lineId = `part:${sku}`;
    if (e.removed.includes(lineId)) {
      e.removed = e.removed.filter((id) => id !== lineId);
      return;
    }
    e.addedParts.push({ sku, qty });
  });

/** Number of manual line edits across all options. */
export function countLineEdits(all: EditsByOption): number {
  return Object.values(all).reduce(
    (n, e) =>
      n +
      Object.keys(e?.qty ?? {}).length +
      Object.keys(e?.hours ?? {}).length +
      (e?.removed?.length ?? 0) +
      (e?.addedParts?.length ?? 0),
    0,
  );
}

/** Plain-language list of job-level changes made after the agent's draft. */
export function describeSpecChanges(draft: JobSpecInput | null, now: JobSpecInput | null): string[] {
  if (!draft || !now) return [];
  const out: string[] = [];
  if ((draft.timing ?? "standard") !== (now.timing ?? "standard")) {
    out.push(`Changed timing from ${label(draft.timing)} to ${label(now.timing)}`);
  }
  if (Boolean(draft.peakClub) !== Boolean(now.peakClub)) {
    out.push(now.peakClub ? "Turned Peak Club on" : "Turned Peak Club off");
  }
  const pctBefore = draft.discount?.pct ?? 0;
  const pctNow = now.discount?.pct ?? 0;
  if (pctBefore !== pctNow) {
    out.push(pctNow > 0 ? `Set discount to ${pctNow}% (${now.discount?.reason || "Discount"})` : "Removed the discount");
  } else if (pctNow > 0 && (draft.discount?.reason ?? "") !== (now.discount?.reason ?? "")) {
    out.push(`Changed discount reason to "${now.discount?.reason}"`);
  }
  for (const field of ["name", "address", "phone", "email"] as const) {
    const before = draft.customer?.[field] ?? "";
    const after = now.customer?.[field] ?? "";
    if (before !== after) out.push(`Changed customer ${field}${after ? ` to "${after}"` : " (cleared)"}`);
  }
  return out;
}

const label = (timing?: string) => (timing ?? "standard").replace("_", "-");
