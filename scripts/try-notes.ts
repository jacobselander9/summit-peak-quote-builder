// Runs each demo script from /demo/sample-notes.md through POST /api/interpret
// (the real route, real Claude API) and compares the JobSpec with what's expected.
// Needs ANTHROPIC_API_KEY in .env.local.   Usage: npm run try-notes   (or: npm run try-notes -- 3)
import { existsSync } from "node:fs";
import { POST } from "../app/api/interpret/route";
import type { Interpretation } from "../lib/ai/to-spec";
import { loadDataset } from "../lib/data/load";
import { DEMO_SCRIPTS } from "../lib/demo/scripts";
import { buildQuote, formatCents, JobSpecSchema, type JobSpecInput } from "../lib/pricing";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Put it in .env.local (see .env.example).");
  process.exit(1);
}

const data = loadDataset();
const only = process.argv[2] ? Number(process.argv[2]) : null;

/** The fields that decide the price, in a form that's easy to compare. */
function keyFields(spec: JobSpecInput) {
  const s = JobSpecSchema.parse(spec);
  return {
    jobCode: s.jobCode,
    size: s.size ?? "-",
    city: s.city ?? "-",
    timing: s.timing,
    peakClub: s.peakClub,
    extraJobs: [...s.extraJobs].sort().join(", ") || "-",
    parts: s.parts.map((p) => `${p.sku}×${p.qty}`).sort().join(", ") || "-",
  };
}

const totals = (spec: JobSpecInput) =>
  buildQuote(data, spec).options.map((o) => `${o.key} ${formatCents(o.totals.totalCents)}`).join(" · ");

async function main() {
  let failures = 0;
  for (const [i, script] of DEMO_SCRIPTS.entries()) {
    const n = i + 1;
    if (only && only !== n) continue;
    console.log(`\n━━━ #${n} ${script.title}\nNotes: ${script.notes}`);

    const started = Date.now();
    const res = await POST(
      new Request("http://localhost/api/interpret", { method: "POST", body: JSON.stringify({ notes: script.notes }) }),
    );
    const body = await res.json();
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (!res.ok) {
      console.log(`  ✗ API error after ${seconds}s: ${body.error}`);
      failures++;
      continue;
    }
    const result = body as Interpretation;
    console.log(`  (${seconds}s)`);

    console.log("  What the agent heard:");
    for (const h of result.heard) {
      const from = h.assumption ? `ASSUMED: ${h.reason}` : `"${h.sourceText}"`;
      console.log(`    ${h.field.padEnd(14)} ${h.value.padEnd(48)} ${from}`);
    }
    if (result.questions.length) console.log(`  Questions: ${result.questions.join(" | ")}`);

    if (script.spec === null) {
      const ok = result.spec === null && result.questions.length > 0;
      console.log(ok ? "  ✓ Asked questions instead of quoting" : "  ✗ Expected questions, got a quote");
      if (!ok) failures++;
      continue;
    }
    if (!result.spec) {
      console.log("  ✗ Expected a quote, got questions only");
      failures++;
      continue;
    }

    const got = keyFields(result.spec);
    const want = keyFields(script.spec);
    console.log(`  ${"field".padEnd(10)} ${"agent".padEnd(26)} expected`);
    let match = true;
    for (const key of Object.keys(want) as (keyof typeof want)[]) {
      const same = String(got[key]) === String(want[key]);
      match &&= same;
      console.log(`  ${same ? " " : "≠"} ${key.padEnd(9)} ${String(got[key]).padEnd(26)} ${want[key]}`);
    }
    console.log(`  Agent's totals:    ${totals(result.spec)}`);
    console.log(`  Expected totals:   ${totals(script.spec)}`);
    console.log(match ? "  ✓ Matches" : "  ✗ Differs from expected");
    if (!match) failures++;
  }

  console.log(failures === 0 ? "\nAll scripts behaved as expected." : `\n${failures} script(s) differed. See ≠ above.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
