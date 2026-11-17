"use client";
// The notes box at the top, plus "Add more notes" once there's a draft.
import { useState } from "react";
import { MicButton } from "./MicButton";

const EXAMPLE =
  "e.g. Mrs. Jensen in Logan, 3 ton AC is dead, original 2009 unit. Coil is rusted out. Pad is cracked. Standard hours.";

/** Appends dictated text to whatever is already typed. */
const append = (existing: string, text: string) => (existing.trim() ? `${existing.trimEnd()} ${text}` : text);

export function NotesPanel({
  notes,
  onNotesChange,
  onBuild,
  onAddMore,
  hasDraft,
  loading,
}: {
  notes: string;
  onNotesChange: (notes: string) => void;
  onBuild: () => void;
  onAddMore: (more: string) => void;
  hasDraft: boolean;
  loading: boolean;
}) {
  const [more, setMore] = useState("");

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-navy-100">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor="notes" className="text-xl font-bold text-navy">
          Job notes
        </label>
        <MicButton disabled={loading} onText={(t) => onNotesChange(append(notes, t))} />
      </div>
      <textarea
        id="notes"
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && notes.trim() && !loading) onBuild();
        }}
        placeholder={EXAMPLE}
        rows={4}
        className="w-full resize-y rounded-xl border-2 border-navy-100 p-3 text-lg leading-relaxed focus:border-navy"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBuild}
          disabled={!notes.trim() || loading}
          className="inline-flex items-center gap-2 rounded-xl bg-orange px-6 py-3 text-lg font-bold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading && <Spinner />}
          {loading ? "Reading your notes…" : hasDraft ? "Rebuild estimate" : "Build estimate"}
        </button>
        <span className="text-sm text-slate-500">Ctrl/⌘ + Enter</span>
      </div>

      {hasDraft && (
        <div className="mt-5 border-t border-navy-100 pt-4">
          <label htmlFor="more-notes" className="mb-2 block font-semibold text-navy">
            Add more notes
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="more-notes"
              value={more}
              onChange={(e) => setMore(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && more.trim() && !loading) {
                  onAddMore(more.trim());
                  setMore("");
                }
              }}
              placeholder="e.g. also needs a condensate pump"
              className="flex-1 rounded-xl border-2 border-navy-100 px-3 py-2 text-lg focus:border-navy"
            />
            <MicButton disabled={loading} onText={(t) => setMore((m) => append(m, t))} />
            <button
              type="button"
              disabled={!more.trim() || loading}
              onClick={() => {
                onAddMore(more.trim());
                setMore("");
              }}
              className="rounded-xl border-2 border-navy bg-white px-5 py-2 font-bold text-navy transition hover:bg-navy hover:text-white disabled:opacity-50"
            >
              Add &amp; rebuild
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function Spinner() {
  return (
    <svg aria-hidden className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
