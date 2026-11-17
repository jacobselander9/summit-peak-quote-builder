// The JobSpec a correct reading of each demo script in /demo/sample-notes.md
// should produce. Used by the pricing tests and (Phase 3) to check the AI.
import type { JobSpecInput } from "@/lib/pricing/types";

export type DemoScript = {
  /** Key in /demo/expected_totals.json, or null if no quote is expected. */
  expectedKey: string | null;
  title: string;
  notes: string;
  spec: JobSpecInput | null;
};

export const DEMO_SCRIPTS: DemoScript[] = [
  {
    expectedKey: "1_logan_3ton_ac",
    title: "AC replacement — Good / Better / Best",
    notes:
      "Mrs. Jensen in Logan, 3 ton AC is dead, original 2009 unit. Line set looks ok, coil is rusted out. Pad is cracked. Standard hours.",
    // Coil and pad are already in every I-AC tier; line set is ok so no A-LS.
    spec: {
      jobCode: "I-AC",
      size: "3",
      city: "Logan",
      timing: "standard",
      peakClub: false,
      customer: { name: "Mrs. Jensen" },
    },
  },
  {
    expectedKey: "2_north_logan_full_system",
    title: "Full system — Good / Better / Best",
    notes:
      "North Logan, furnace and AC both about 20 years old. 80k furnace and 3 ton AC. Customer wants something efficient and quiet, asked about heat pumps.",
    spec: { jobCode: "I-SYS", size: "3-80", city: "North Logan", timing: "standard", peakClub: false },
  },
  {
    expectedKey: "3_smithfield_capacitor_peak_club",
    title: "Repair — Peak Club member",
    notes:
      "Smithfield service call, outdoor unit humming but fan not spinning. Bad 45/5 capacitor. Customer is a Peak Club member.",
    spec: {
      jobCode: "S-CAP",
      city: "Smithfield",
      timing: "standard",
      peakClub: true,
      parts: [{ sku: "CAP-45-5", qty: 1 }],
    },
  },
  {
    expectedKey: "4_providence_saturday_igniter",
    title: "After-hours repair",
    notes: "Saturday night no heat call in Providence. Hot surface igniter is cracked, replaced it.",
    spec: {
      jobCode: "S-IGN",
      city: "Providence",
      timing: "weekend",
      peakClub: false,
      parts: [{ sku: "IGN-HSI", qty: 1 }],
    },
  },
  {
    expectedKey: null,
    title: "Missing info (the agent should ask, not guess)",
    notes: "AC not cooling, probably needs a new unit.",
    spec: null, // agent must ask for city and AC size
  },
];
