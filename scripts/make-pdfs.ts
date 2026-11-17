// Builds customer PDFs for demo scripts 1 and 3 into demo/output/ (gitignored).
// Usage: npm run pdfs
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToFile } from "@react-pdf/renderer";
import { loadDataset } from "../lib/data/load";
import { DEMO_SCRIPTS } from "../lib/demo/scripts";
import { QuotePdf } from "../lib/pdf/QuotePdf";
import { buildQuote, toCustomerQuote } from "../lib/pricing";

const OUT = path.join(process.cwd(), "demo", "output");

async function main() {
  mkdirSync(OUT, { recursive: true });
  const data = loadDataset();
  const date = new Date();
  const jobs = [
    { file: "script-1-logan-ac-all-options.pdf", spec: DEMO_SCRIPTS[0].spec!, only: undefined },
    { file: "script-1-logan-ac-better-only.pdf", spec: DEMO_SCRIPTS[0].spec!, only: ["better" as const] },
    { file: "script-3-smithfield-repair.pdf", spec: DEMO_SCRIPTS[2].spec!, only: undefined },
  ];
  for (const job of jobs) {
    const quote = toCustomerQuote(buildQuote(data, job.spec), job.only);
    const file = path.join(OUT, job.file);
    await renderToFile(createElement(QuotePdf, { quote, date }) as Parameters<typeof renderToFile>[0], file);
    console.log(`Saved ${path.relative(process.cwd(), file)}`);
  }
}

main();
