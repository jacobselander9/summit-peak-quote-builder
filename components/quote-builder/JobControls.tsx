"use client";
// Job-level settings the tech can change live: timing, Peak Club, customer info.
import type { Customer, JobSpecInput, Timing } from "@/lib/pricing/types";
import { NumberField } from "./NumberField";

const TIMING_LABELS: Record<Timing, string> = {
  standard: "Standard",
  after_hours: "After-hours",
  weekend: "Weekend",
  holiday: "Holiday",
};

export function JobControls({
  spec,
  onChange,
  jobLabel,
  isInstall,
}: {
  spec: JobSpecInput;
  onChange: (spec: JobSpecInput) => void;
  jobLabel: string;
  isInstall: boolean;
}) {
  const timing = spec.timing ?? "standard";
  const customer = spec.customer ?? {};
  const discount = spec.discount;
  const setCustomer = (field: keyof Customer, value: string) =>
    onChange({ ...spec, customer: { ...customer, [field]: value } });

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-navy-100">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-navy">{jobLabel}</h2>
        <p className="text-slate-600">
          {spec.city}
          {spec.size ? ` · size ${spec.size}` : ""}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-4">
        <fieldset>
          <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Timing</legend>
          <div className="grid grid-cols-2 overflow-hidden rounded-xl border-2 border-navy sm:inline-flex" role="radiogroup">
            {(Object.keys(TIMING_LABELS) as Timing[]).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={timing === t}
                onClick={() => onChange({ ...spec, timing: t })}
                className={`px-4 py-2 font-semibold transition ${
                  timing === t ? "bg-navy text-white" : "bg-white text-navy hover:bg-navy-50"
                }`}
              >
                {TIMING_LABELS[t]}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex cursor-pointer items-center gap-3 pt-5">
          <input
            type="checkbox"
            checked={Boolean(spec.peakClub)}
            onChange={(e) => onChange({ ...spec, peakClub: e.target.checked })}
            className="h-6 w-6 accent-orange"
          />
          <span className="text-lg font-semibold text-navy">Peak Club member</span>
          {isInstall && spec.peakClub && (
            <span className="text-sm text-slate-500">(discount applies to repairs, not installs)</span>
          )}
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">Discount %</span>
            <NumberField
              label="Discount percent"
              value={discount?.pct ?? 0}
              onChange={(pct) =>
                onChange({
                  ...spec,
                  discount: pct > 0 ? { pct: Math.min(pct, 100), reason: discount?.reason ?? "Friends & family" } : undefined,
                })
              }
              className="text-lg"
            />
          </label>
          {discount && discount.pct > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">Reason</span>
              <input
                value={discount.reason ?? ""}
                onChange={(e) => onChange({ ...spec, discount: { ...discount, reason: e.target.value } })}
                className="w-48 rounded-md border-2 border-navy-100 px-2 py-1 focus:border-navy"
              />
            </label>
          )}
        </div>
      </div>

      <details className="group mt-5" open={Boolean(customer.name)}>
        <summary className="cursor-pointer font-semibold text-navy">Customer info</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["name", "Name", "text"],
              ["phone", "Phone", "tel"],
              ["address", "Address", "text"],
              ["email", "Email", "email"],
            ] as const
          ).map(([field, label, type]) => (
            <label key={field} className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-600">{label}</span>
              <input
                type={type}
                value={customer[field] ?? ""}
                onChange={(e) => setCustomer(field, e.target.value)}
                className="rounded-lg border-2 border-navy-100 px-3 py-2 focus:border-navy"
              />
            </label>
          ))}
        </div>
      </details>
    </section>
  );
}
