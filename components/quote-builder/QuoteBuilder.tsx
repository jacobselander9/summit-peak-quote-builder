"use client";
// The whole one-page app. Holds the state; every edit re-runs the pricing
// engine right here in the browser (no API call). Only reading notes calls the server.
import { useMemo, useState } from "react";
import type { Dataset } from "@/lib/data";
import type { HeardItem, Interpretation } from "@/lib/ai/to-spec";
import { buildQuote } from "@/lib/pricing";
import { PricingError, type EditsByOption, type JobSpecInput, type OptionKey, type Quote } from "@/lib/pricing/types";
import {
  addPart,
  countLineEdits,
  describeSpecChanges,
  removeLine,
  restoreLine,
  setHours,
  setQty,
} from "@/lib/ui/edits";
import { AddPart } from "./AddPart";
import { JobControls } from "./JobControls";
import { LineItems, Totals } from "./LineItems";
import { NotesPanel, Spinner } from "./NotesPanel";
import { OptionCards } from "./OptionCards";

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string };

export function QuoteBuilder({ data }: { data: Dataset }) {
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [questions, setQuestions] = useState<string[]>([]);
  // What the agent heard; shown in the owner view (Phase 5).
  const [, setHeard] = useState<HeardItem[]>([]);
  /** The agent's draft, kept to show what changed by hand. */
  const [draftSpec, setDraftSpec] = useState<JobSpecInput | null>(null);
  /** The live spec: the draft plus timing / Peak Club / customer changes. */
  const [spec, setSpec] = useState<JobSpecInput | null>(null);
  const [edits, setEdits] = useState<EditsByOption>({});
  const [selected, setSelected] = useState<OptionKey>("good");
  /** Notes waiting for the user to confirm that their manual edits will be replaced. */
  const [pendingNotes, setPendingNotes] = useState<string | null>(null);

  // Live pricing: same engine as the server, runs on every edit.
  const priced = useMemo((): { quote: Quote | null; error: string | null } => {
    if (!spec) return { quote: null, error: null };
    try {
      return { quote: buildQuote(data, spec, edits), error: null };
    } catch (err) {
      return { quote: null, error: err instanceof PricingError ? err.message : "Couldn't price this job." };
    }
  }, [data, spec, edits]);
  const quote = priced.quote;
  const option = quote?.options.find((o) => o.key === selected) ?? quote?.options[0] ?? null;

  const manualChanges = countLineEdits(edits) + describeSpecChanges(draftSpec, spec).length;
  const loading = status.kind === "loading";

  /** Re-reads notes, but first asks before throwing away manual edits. */
  function requestInterpret(allNotes: string) {
    if (manualChanges > 0) setPendingNotes(allNotes);
    else void interpret(allNotes);
  }

  async function interpret(allNotes: string) {
    setPendingNotes(null);
    setStatus({ kind: "loading" });
    try {
      const res = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: allNotes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ kind: "error", message: body.error ?? "Something went wrong reading the notes." });
        return;
      }
      const result = body as Interpretation;
      setQuestions(result.questions);
      setHeard(result.heard);
      setDraftSpec(result.spec);
      setSpec(result.spec);
      setEdits({});
      if (result.spec) {
        // Installs open on "Better", the middle option; repairs have one option.
        const isInstall = Boolean(data.tiers[result.spec.jobCode]);
        setSelected(isInstall ? "better" : "repair");
      }
      setStatus({ kind: "idle" });
    } catch {
      setStatus({ kind: "error", message: "Couldn't reach the server. Check the connection and try again." });
    }
  }

  function addMoreNotes(more: string) {
    const combined = `${notes.trimEnd()}\n${more}`;
    setNotes(combined);
    requestInterpret(combined);
  }

  /** Readable name for a line id, for the "Removed" chips. */
  function lineLabel(id: string): string {
    const [kind, a, b] = id.split(":");
    if (kind === "part") return data.priceBook[a]?.description ?? a;
    if (kind === "fee") return data.fees[a]?.name ?? a;
    if (kind === "labor") return `${data.laborRoles[b]?.role ?? b} (${a})`;
    return id;
  }

  const hasDraft = spec !== null || questions.length > 0;
  const job = spec ? data.laborJobs[spec.jobCode] : null;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-navy px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Summit Peak HVAC</h1>
            <p className="text-navy-100">Quote Builder</p>
          </div>
        </div>
        <span className="rounded-full bg-orange px-3 py-1 text-sm font-bold">DEMO</span>
      </header>

      <NotesPanel
        notes={notes}
        onNotesChange={setNotes}
        onBuild={() => requestInterpret(notes)}
        onAddMore={addMoreNotes}
        hasDraft={hasDraft}
        loading={loading}
      />

      {pendingNotes !== null && (
        <div role="alertdialog" aria-live="assertive" className="rounded-2xl border-2 border-orange bg-orange-100 p-4">
          <p className="text-lg font-semibold text-navy">
            Rebuilding will replace your {manualChanges} manual edit{manualChanges > 1 ? "s" : ""}.
          </p>
          <p className="text-slate-700">The agent will re-read all the notes and start a fresh draft.</p>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              autoFocus
              onClick={() => void interpret(pendingNotes)}
              className="rounded-xl bg-orange px-5 py-2 font-bold text-white hover:bg-orange-700"
            >
              Rebuild anyway
            </button>
            <button
              type="button"
              onClick={() => setPendingNotes(null)}
              className="rounded-xl border-2 border-navy bg-white px-5 py-2 font-bold text-navy hover:bg-navy-50"
            >
              Keep my edits
            </button>
          </div>
        </div>
      )}

      {status.kind === "error" && (
        <div role="alert" className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-lg text-red-800">
          <strong>Couldn&apos;t build the estimate.</strong> {status.message}
        </div>
      )}

      {loading && (
        <div aria-live="polite" className="flex items-center gap-3 rounded-2xl bg-white p-5 text-lg text-navy ring-1 ring-navy-100">
          <Spinner /> The agent is reading your notes and picking parts from the price book…
        </div>
      )}

      {!loading && questions.length > 0 && (
        <section aria-live="polite" className="rounded-2xl border-2 border-orange bg-white p-5">
          <h2 className="text-xl font-bold text-navy">
            {spec ? "The agent has a question" : "The agent needs a bit more before it can price this"}
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-lg">
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="mt-2 text-slate-600">Answer in &ldquo;Add more notes&rdquo; above and it will rebuild.</p>
        </section>
      )}

      {!loading && priced.error && (
        <div role="alert" className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-red-800">
          {priced.error}
        </div>
      )}

      {!loading && !hasDraft && status.kind !== "error" && <EmptyState />}

      {spec && quote && option && job && (
        <>
          <JobControls
            spec={spec}
            onChange={setSpec}
            jobLabel={`${job.jobCode} · ${job.description}`}
            isInstall={quote.jobKind === "install"}
          />
          <OptionCards options={quote.options} selected={option.key} onSelect={setSelected} />
          <section className="grid gap-5 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-navy-100 sm:p-5 lg:grid-cols-[1fr_20rem]">
            <div className="min-w-0">
              <h2 className="mb-1 text-xl font-bold text-navy">
                Line items · <span className="text-orange-700">{option.name}</span>
              </h2>
              <LineItems
                option={option}
                removed={(edits[option.key]?.removed ?? []).map((id) => ({ id, label: lineLabel(id) }))}
                onQty={(id, n) => setEdits((e) => setQty(e, option.key, id, n))}
                onHours={(id, n) => setEdits((e) => setHours(e, option.key, id, n))}
                onRemove={(id) => setEdits((e) => removeLine(e, option.key, id))}
                onRestore={(id) => setEdits((e) => restoreLine(e, option.key, id))}
              />
              <div className="mt-5 max-w-xl">
                <AddPart priceBook={data.priceBook} onAdd={(sku) => setEdits((e) => addPart(e, option.key, sku))} />
              </div>
            </div>
            <aside className="lg:sticky lg:top-4 lg:self-start">
              <Totals option={option} validDays={quote.validDays} />
            </aside>
          </section>
        </>
      )}

      <footer className="pb-4 text-center text-sm text-slate-500">Demo — fictional company and pricing.</footer>
    </main>
  );
}

function EmptyState() {
  return (
    <section className="rounded-2xl border-2 border-dashed border-navy-100 p-8 text-center text-lg text-slate-600">
      <p className="font-semibold text-navy">Type or dictate what you&apos;re fixing, then press Build estimate.</p>
      <p className="mt-1">You&apos;ll get a priced quote in seconds. Adjust anything and the totals update instantly.</p>
    </section>
  );
}

function Logo() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="h-11 w-11">
      <path d="M4 40 L18 14 L26 28 L32 20 L44 40 Z" fill="#E07A2E" />
      <path d="M18 14 L22 21 L18 19 L14 21 Z" fill="#fff" />
    </svg>
  );
}
