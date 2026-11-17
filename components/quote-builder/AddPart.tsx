"use client";
// Search the price book by SKU or description and add a part.
import { useMemo, useState } from "react";
import type { PriceBookItem } from "@/lib/data";
import { formatCents } from "@/lib/pricing";

const MAX_RESULTS = 8;

export function AddPart({ priceBook, onAdd }: { priceBook: Record<string, PriceBookItem>; onAdd: (sku: string) => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return Object.values(priceBook)
      .filter((p) => {
        const haystack = `${p.sku} ${p.description} ${p.category}`.toLowerCase();
        return words.every((w) => haystack.includes(w));
      })
      .slice(0, MAX_RESULTS);
  }, [priceBook, query]);

  function add(sku: string) {
    onAdd(sku);
    setQuery("");
    setActive(0);
  }

  return (
    <div className="relative">
      <label htmlFor="add-part" className="mb-1 block font-semibold text-navy">
        Add a part
      </label>
      <input
        id="add-part"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="add-part-results"
        aria-activedescendant={results[active] ? `part-opt-${results[active].sku}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            add(results[active].sku);
          } else if (e.key === "Escape") {
            setQuery("");
          }
        }}
        placeholder="Search: capacitor, pump, CAP-35…"
        autoComplete="off"
        className="w-full rounded-xl border-2 border-navy-100 px-3 py-2 text-lg focus:border-navy"
      />
      {results.length > 0 && (
        <ul
          id="add-part-results"
          role="listbox"
          className="absolute z-10 mt-1 max-h-80 w-full overflow-auto rounded-xl border-2 border-navy-100 bg-white shadow-lg"
        >
          {results.map((p, i) => (
            <li
              key={p.sku}
              id={`part-opt-${p.sku}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus in the input
                add(p.sku);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-4 px-3 py-2 ${
                i === active ? "bg-navy-50" : ""
              }`}
            >
              <span>
                <span className="font-mono text-sm font-semibold text-navy">{p.sku}</span>{" "}
                <span className="text-slate-700">{p.description}</span>
              </span>
              <span className="whitespace-nowrap tabular-nums text-slate-600">
                {formatCents(p.sellPriceCents)} / {p.unit}
              </span>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && results.length === 0 && (
        <p className="mt-1 text-sm text-slate-500">No parts match &ldquo;{query}&rdquo;.</p>
      )}
    </div>
  );
}
