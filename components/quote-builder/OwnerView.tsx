"use client";
// Owner-only panels: the margin check and "How we got this estimate".
// Everything here comes from the pricing engine's result and trace; nothing is
// recalculated. None of it is used by the customer PDF.
import type { HeardItem } from "@/lib/ai/to-spec";
import { formatCents, formatPct } from "@/lib/pricing";
import type { QuoteOption } from "@/lib/pricing/types";

export function MarginCheck({ option }: { option: QuoteOption }) {
  const m = option.margin;
  const row = (label: string, cents: number) => (
    <div className="flex justify-between gap-4 py-0.5">
      <span>{label}</span>
      <span className="tabular-nums">{formatCents(cents)}</span>
    </div>
  );
  return (
    <section className="rounded-2xl border-2 border-navy bg-white p-5" aria-label="Margin check">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-navy">Margin check · {option.name}</h2>
        <span
          className={`rounded-full px-4 py-1 text-lg font-extrabold ${
            m.passes ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
          }`}
        >
          {formatPct(m.margin)} {m.passes ? "PASS" : "FAIL"}
          <span className="ml-2 text-sm font-semibold">target {formatPct(m.target).replace(".0", "")}</span>
        </span>
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          {row("Subtotal (before tax)", option.totals.subtotalCents)}
          {option.totals.discountCents > 0 && (
            <div className="flex justify-between gap-4 py-0.5 text-sm text-slate-600">
              <span>includes discount given</span>
              <span className="tabular-nums">−{formatCents(option.totals.discountCents)}</span>
            </div>
          )}
          <div className="my-1 border-t border-navy-100" />
          {row("Parts at our cost", m.partsCostCents)}
          {row("Labor at burdened cost", m.laborCostCents)}
          {row("Fees at internal cost", m.feesCostCents)}
          {m.warrantyReserveCents > 0 && row("Warranty reserve (3% of subtotal)", m.warrantyReserveCents)}
          <div className="my-1 border-t-2 border-navy" />
          <div className="flex justify-between gap-4 font-bold text-navy">
            <span>Job cost</span>
            <span className="tabular-nums">{formatCents(m.jobCostCents)}</span>
          </div>
          <div className="flex justify-between gap-4 font-bold text-navy">
            <span>Gross profit</span>
            <span className="tabular-nums">{formatCents(option.totals.subtotalCents - m.jobCostCents)}</span>
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-navy">Lines pulling margin down</h3>
          {m.lowMarginLines.length === 0 ? (
            <p className="mt-1 text-slate-600">Every line is at or above the target.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {m.lowMarginLines.map((l) => (
                <li key={l.lineId} className="flex justify-between gap-4">
                  <span>{l.description}</span>
                  <span className="tabular-nums font-semibold text-red-700">{formatPct(l.margin)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export function HowWeGotThis({
  option,
  heard,
  jobEdits,
}: {
  option: QuoteOption;
  heard: HeardItem[];
  /** Timing / Peak Club / customer changes made after the draft. */
  jobEdits: string[];
}) {
  const edits = [...jobEdits, ...option.edits];
  return (
    <section className="rounded-2xl border-2 border-navy bg-white p-5" aria-label="How we got this estimate">
      <h2 className="text-xl font-bold text-navy">How we got this estimate</h2>

      <Section title="What the agent heard">
        {heard.length === 0 ? (
          <p className="text-slate-600">Nothing yet.</p>
        ) : (
          <ul className="space-y-2">
            {heard.map((h, i) => (
              <li
                key={`${h.field}-${i}`}
                className={`rounded-lg border-l-4 px-3 py-2 ${
                  h.assumption ? "border-orange bg-orange-100" : "border-navy-100 bg-navy-50"
                }`}
              >
                <span className="font-semibold text-navy">{h.field}:</span> {h.value}
                <div className="text-sm">
                  {h.assumption ? (
                    <span className="font-semibold text-orange-700">Assumption: {h.reason}</span>
                  ) : (
                    <span className="text-slate-600">
                      From the notes: <q className="italic">{h.sourceText}</q>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Every line's math">
        <ul className="space-y-2">
          {option.lines.map((l) => (
            <li key={l.id} className="border-b border-navy-100 pb-2">
              <div className="font-mono text-[0.95rem] text-navy">{l.trace.formula}</div>
              <div className="text-sm text-slate-600">
                {[...l.trace.details, `(${l.trace.source})`].join(" · ")}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Rules applied">
        <ul className="space-y-1">
          {option.rules.map((r, i) => (
            <li key={`${r.rule}-${i}`}>
              <span className="font-semibold text-navy">{r.rule}:</span> {r.effect}{" "}
              <span className="text-sm text-slate-500">({r.source})</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Manual edits">
        {edits.length === 0 ? (
          <p className="text-slate-600">None. This is the agent&apos;s draft as built.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-6">
            {edits.map((e, i) => (
              <li key={`${e}-${i}`}>{e}</li>
            ))}
          </ul>
        )}
      </Section>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </div>
  );
}
