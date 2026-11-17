"use client";
// "Create PDF": choose the selected option or all of them, then download.
// Uses toCustomerQuote(), so nothing from the owner view can reach the PDF.
import { useState } from "react";
import { toCustomerQuote } from "@/lib/pricing/customer";
import type { OptionKey, Quote } from "@/lib/pricing/types";
import { Spinner } from "./NotesPanel";

const TIER: Record<OptionKey, string> = { good: "Good", better: "Better", best: "Best", repair: "Repair" };

export function CreatePdf({ quote, selected }: { quote: Quote; selected: OptionKey }) {
  const multi = quote.options.length > 1;
  const [scope, setScope] = useState<"selected" | "all">("selected");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const customerQuote = toCustomerQuote(quote, multi && scope === "all" ? undefined : [selected]);
      const { downloadQuotePdf } = await import("@/lib/pdf/download");
      await downloadQuotePdf(customerQuote);
    } catch (err) {
      console.error(err);
      setError("Couldn't create the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border-2 border-navy-100 p-4">
      <h3 className="font-bold text-navy">Customer PDF</h3>
      {multi && (
        <fieldset className="mt-2 space-y-1">
          <legend className="sr-only">Which options to include</legend>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="pdf-scope"
              checked={scope === "selected"}
              onChange={() => setScope("selected")}
              className="h-5 w-5 accent-orange"
            />
            {TIER[selected]} only
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="pdf-scope"
              checked={scope === "all"}
              onChange={() => setScope("all")}
              className="h-5 w-5 accent-orange"
            />
            All three options
          </label>
        </fieldset>
      )}
      <button
        type="button"
        onClick={create}
        disabled={busy}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy px-5 py-3 font-bold text-white transition hover:bg-navy-700 disabled:opacity-60"
      >
        {busy && <Spinner />}
        {busy ? "Creating PDF…" : "Create PDF"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
