// Phase 1 placeholder: proves /data loads and validates on the server.
// Replaced by the real quote builder in Phase 4.
import { loadDataset } from "@/lib/data/load";

export default function Home() {
  const d = loadDataset();
  const counts = [
    ["Price book items", Object.keys(d.priceBook).length],
    ["Labor roles", Object.keys(d.laborRoles).length],
    ["Labor job codes", Object.keys(d.laborJobs).length],
    ["Multipliers", Object.keys(d.multipliers).length],
    ["Fees", Object.keys(d.fees).length],
    ["Cities in service area", d.rules.service_area.length],
    ["Tiered install job codes", Object.keys(d.tiers).length],
  ] as const;

  return (
    <main className="mx-auto max-w-xl p-10 text-lg">
      <h1 className="text-3xl font-bold text-[#1F3A5F]">Summit Peak HVAC Quote Builder</h1>
      <p className="mt-2 text-[#E07A2E]">Phase 1: data loaded and validated</p>
      <ul className="mt-6 space-y-2">
        {counts.map(([label, n]) => (
          <li key={label} className="flex justify-between border-b py-1">
            <span>{label}</span>
            <span className="font-mono">{n}</span>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-gray-500">Demo — fictional company and pricing.</p>
    </main>
  );
}
