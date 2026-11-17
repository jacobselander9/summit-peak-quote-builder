"use client";
// Editable line items for the selected option, plus its totals.
import { formatCents, formatNumber } from "@/lib/pricing";
import type { QuoteLine, QuoteOption } from "@/lib/pricing/types";
import { NumberField } from "./NumberField";

const KIND_LABEL: Record<QuoteLine["kind"], string> = {
  part: "Parts & equipment",
  labor: "Labor",
  fee: "Fees",
  discount: "Discount",
  minimum: "Minimum charge",
};

export function LineItems({
  option,
  removed,
  onQty,
  onHours,
  onRemove,
  onRestore,
}: {
  option: QuoteOption;
  /** Lines removed by hand, so they can be put back. */
  removed: { id: string; label: string }[];
  onQty: (lineId: string, qty: number) => void;
  onHours: (lineId: string, hours: number) => void;
  onRemove: (lineId: string) => void;
  onRestore: (lineId: string) => void;
}) {
  const groups = (["part", "labor", "fee", "discount", "minimum"] as const)
    .map((kind) => ({ kind, lines: option.lines.filter((l) => l.kind === kind) }))
    .filter((g) => g.lines.length > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b-2 border-navy text-sm uppercase tracking-wide text-slate-500">
            <th className="py-2 font-semibold">Item</th>
            <th className="py-2 text-right font-semibold">Qty / hrs</th>
            <th className="hidden py-2 text-right font-semibold sm:table-cell">Each</th>
            <th className="py-2 text-right font-semibold">Amount</th>
            <th className="w-10 py-2">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.kind}>
            <tr>
              <th colSpan={5} className="pt-4 pb-1 text-sm font-bold uppercase tracking-wide text-navy">
                {KIND_LABEL[g.kind]}
              </th>
            </tr>
            {g.lines.map((l) => (
              <tr key={l.id} className={`border-b border-navy-100 ${l.edited ? "bg-orange-100/50" : ""}`}>
                <td className="py-2 pr-2">
                  <div className="font-medium">{l.description}</div>
                  <div className="text-sm text-slate-500">
                    {l.kind === "part" && <span className="font-mono">{l.code}</span>}
                    {l.kind === "labor" && <span>Job {l.code}</span>}
                    {l.multiplier !== undefined && l.multiplier !== 1 && (
                      <span className="ml-2 font-semibold text-orange-700">× {formatNumber(l.multiplier)}</span>
                    )}
                    {l.edited && <span className="ml-2 font-semibold text-orange-700">edited</span>}
                  </div>
                </td>
                <td className="py-2 pl-2 text-right">
                  {l.kind === "labor" ? (
                    <NumberField label={`Hours for ${l.description}`} value={l.qty} step={0.25} onChange={(n) => onHours(l.id, n)} />
                  ) : l.kind === "minimum" || l.kind === "discount" ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <NumberField label={`Quantity of ${l.description}`} value={l.qty} onChange={(n) => onQty(l.id, n)} />
                  )}
                </td>
                <td className="hidden py-2 pl-3 text-right tabular-nums text-slate-600 sm:table-cell">
                  {l.kind === "minimum" || l.kind === "discount" ? "" : `${formatCents(l.unitPriceCents)}${l.kind === "labor" ? "/hr" : ""}`}
                </td>
                <td
                  className={`py-2 pl-3 text-right font-semibold tabular-nums ${l.kind === "discount" ? "text-emerald-700" : ""}`}
                >
                  {l.amountCents < 0 ? `−${formatCents(-l.amountCents)}` : formatCents(l.amountCents)}
                </td>
                <td className="py-2 text-right">
                  {l.kind !== "minimum" && l.kind !== "discount" && (
                    <button
                      type="button"
                      onClick={() => onRemove(l.id)}
                      aria-label={`Remove ${l.description}`}
                      title="Remove"
                      className="h-9 w-9 rounded-full text-xl leading-none text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>

      {removed.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Removed:</span>
          {removed.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onRestore(r.id)}
              className="rounded-full border border-slate-300 px-3 py-1 text-slate-600 line-through decoration-slate-400 hover:border-navy hover:text-navy hover:no-underline"
              title="Put back"
            >
              {r.label} ↺
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Totals({ option, validDays }: { option: QuoteOption; validDays: number }) {
  const t = option.totals;
  const row = (label: string, cents: number, strong = false) => (
    <div className={`flex justify-between gap-4 py-1 ${strong ? "text-2xl font-extrabold text-navy" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{formatCents(cents)}</span>
    </div>
  );
  return (
    <div className="rounded-xl bg-navy-50 p-4">
      {row("Parts & equipment", t.partsCents)}
      {row("Labor", t.laborCents)}
      {t.feesCents > 0 && row("Fees", t.feesCents)}
      {t.discountCents > 0 && (
        <div className="flex justify-between gap-4 py-1 font-semibold text-emerald-700">
          <span>Discount</span>
          <span className="tabular-nums">−{formatCents(t.discountCents)}</span>
        </div>
      )}
      {t.minAdjCents > 0 && row("Minimum service charge", t.minAdjCents)}
      <div className="my-1 border-t border-navy-100" />
      {row("Subtotal", t.subtotalCents)}
      {row("Tax (parts & equipment)", t.taxCents)}
      <div className="my-1 border-t-2 border-navy" />
      {row("Total", t.totalCents, true)}
      {t.depositCents !== null && (
        <div className="mt-1 flex justify-between gap-4 font-semibold text-orange-700">
          <span>Deposit due to schedule</span>
          <span className="tabular-nums">{formatCents(t.depositCents)}</span>
        </div>
      )}
      <p className="mt-2 text-sm text-slate-500">Quote valid {validDays} days.</p>
    </div>
  );
}
