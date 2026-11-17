"use client";
// Good / Better / Best cards (or one card for a repair). Click a card to edit it.
import { formatCents } from "@/lib/pricing";
import type { OptionKey, QuoteOption } from "@/lib/pricing/types";

const TIER_LABEL: Record<OptionKey, string> = { good: "Good", better: "Better", best: "Best", repair: "Repair" };

export function OptionCards({
  options,
  selected,
  onSelect,
}: {
  options: QuoteOption[];
  selected: OptionKey;
  onSelect: (key: OptionKey) => void;
}) {
  return (
    <div className={`grid gap-4 ${options.length > 1 ? "md:grid-cols-3" : ""}`} role="tablist" aria-label="Options">
      {options.map((o) => {
        const active = o.key === selected;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(o.key)}
            className={`flex flex-col rounded-2xl border-4 bg-white p-5 text-left shadow-sm transition ${
              active ? "border-orange" : "border-transparent ring-1 ring-navy-100 hover:border-navy-100"
            }`}
          >
            <span
              className={`self-start rounded-full px-3 py-0.5 text-sm font-bold uppercase tracking-wide ${
                active ? "bg-orange text-white" : "bg-navy-100 text-navy"
              }`}
            >
              {TIER_LABEL[o.key]}
            </span>
            <span className="mt-2 min-h-[3rem] text-lg font-semibold leading-snug text-navy">{o.name}</span>
            <span className="mt-3 text-4xl font-extrabold tabular-nums text-navy">
              {formatCents(o.totals.totalCents)}
            </span>
            <span className="text-sm text-slate-500">total incl. tax</span>
            {o.totals.depositCents !== null && (
              <span className="mt-2 text-slate-700">
                Deposit <strong className="tabular-nums">{formatCents(o.totals.depositCents)}</strong>
              </span>
            )}
            {o.edits.length > 0 && (
              <span className="mt-2 text-sm font-semibold text-orange-700">
                {o.edits.length} manual edit{o.edits.length > 1 ? "s" : ""}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
