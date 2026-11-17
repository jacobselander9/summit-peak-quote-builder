// Prints the quote for one demo script, with the owner-view trace.
// Usage: npm run quote -- 1        (script number 1-4)
import { loadDataset } from "../lib/data/load";
import { DEMO_SCRIPTS } from "../lib/demo/scripts";
import { buildQuote, formatCents, formatPct } from "../lib/pricing";

const n = Number(process.argv[2] ?? "1");
const script = DEMO_SCRIPTS[n - 1];
if (!script?.spec) {
  console.log("Pick a demo script with a quote: npm run quote -- 1   (1 to 4)");
  process.exit(1);
}

const quote = buildQuote(loadDataset(), script.spec);
console.log(`\n#${n} ${script.title}\nNotes: ${script.notes}\n`);

for (const o of quote.options) {
  console.log(`=== ${o.key.toUpperCase()}: ${o.name}`);
  for (const l of o.lines) {
    console.log(`  ${formatCents(l.amountCents).padStart(11)}  ${l.trace.formula}`);
  }
  const t = o.totals;
  console.log(`  ${"-".repeat(11)}`);
  console.log(`  Subtotal ${formatCents(t.subtotalCents)} | Tax ${formatCents(t.taxCents)} | TOTAL ${formatCents(t.totalCents)}` +
    (t.depositCents !== null ? ` | Deposit ${formatCents(t.depositCents)}` : ""));
  console.log(`  Margin ${formatPct(o.margin.margin)} (target ${formatPct(o.margin.target)}) ${o.margin.passes ? "PASS" : "FAIL"}, job cost ${formatCents(o.margin.jobCostCents)}`);
  console.log("  Rules:");
  for (const r of o.rules) console.log(`    - ${r.rule}: ${r.effect}`);
  console.log();
}
