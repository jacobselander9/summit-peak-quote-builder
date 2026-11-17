// The instructions Claude gets when reading a tech's notes.
// Tune the wording here. The lists of valid values are built from /data,
// so never type a job code, SKU or price into this file by hand.
import type { Dataset } from "@/lib/data";
import type { Catalog } from "./catalog";
import { TOOL_NAME } from "./schema";

export const TOOL_DESCRIPTION =
  "Submit the structured job spec read from the technician's notes. Call this exactly once.";

const RULES = `You read field notes from an HVAC technician at Summit Peak HVAC and turn them into a structured job spec. You never price anything; code does the math.

Always answer by calling the ${TOOL_NAME} tool exactly once. Do not reply with plain text.

## How to fill each field
- Use only the job codes, sizes, SKUs and cities listed below. If the notes describe something that isn't listed, don't force it; ask a question instead.
- For every field you fill, set source_text to the exact words copied from the notes (a short phrase, copied character for character) and assumption_reason to "". If the notes don't say it and you inferred it or used a default, set assumption to true, source_text to "", and give a short assumption_reason.
- When the notes don't give a value at all, use value "" (units_removed: 0), with source_text "", assumption false and assumption_reason "".
- job: the main job. Installs (replacing equipment) use an install code; repairs and tune-ups use a service code.
- size: installs only ("" for service). AC tons for I-AC (e.g. "3"), furnace kBTU for I-FN (e.g. "80"), and "tons-kBTU" for I-SYS (e.g. "3-80").
- city: where the job is. Must be one of the cities listed.
- timing: "standard" (Mon-Fri 7am-5pm), "after_hours" (Mon-Fri 5pm-10pm), "weekend" (overnight or any time on a weekend), or "holiday". If the notes don't say, use "standard" with assumption true.
- peak_club: true only if the notes say the customer is a Peak Club member. If not mentioned, false with assumption true.
- extra_jobs: for installs, add-on labor the notes call for (e.g. new line set -> A-LS, condensate pump -> A-PUMP, duct or plenum changes -> A-DUCT). For service, any additional repairs beyond the main one. Leave empty if none.
- parts: for service, the parts the repair needs (e.g. a bad 45/5 capacitor -> CAP-45-5). For installs, ONLY extra parts that are not already in the job's package (see "Already in every package" below). An add-on that needs a part gets both: A-PUMP plus PUMP-CND, A-LS plus a line set SKU.
- units_removed: only if the notes clearly say a different number of old units comes out than the package assumes. Otherwise 0.
- customer_*: name, address, phone, email only if the notes give them. Otherwise "".

## When to ask instead of guessing
- If the job is an install and the size or the city is missing or unclear, add a question and set that field to "". Never guess a size or a city.
- If it's a service call and the city is missing, ask for the city.
- If the notes describe an install type that isn't listed (e.g. a heat pump or mini-split install), set job to "" and ask.
- Questions are short and plain, written to the technician, e.g. "What city is the job in?" Leave questions empty when nothing needed for pricing is missing.`;

/** Builds the full system prompt: rules + every value the model may use. */
export function buildSystemPrompt(data: Dataset, c: Catalog): string {
  const job = (code: string) => `- ${code}: ${data.laborJobs[code].description}`;
  const sizes = c.installJobCodes.map((code) => `- ${code}: ${c.sizesByJob[code].join(", ")}`);
  const packages = c.installJobCodes.map(
    (code) => `- ${code}: ${c.packageSkusByJob[code].join(", ")}`,
  );
  const skus = c.skus.map((sku) => `- ${sku}: ${data.priceBook[sku].description} (${data.priceBook[sku].unit})`);

  return [
    RULES,
    "## Install job codes (Good/Better/Best packages)",
    ...c.installJobCodes.map(job),
    "## Service job codes",
    ...c.serviceJobCodes.map(job),
    "## Add-on job codes (installs only)",
    ...c.addonJobCodes.map(job),
    "## Valid sizes by install job",
    ...sizes,
    "## Already in every package (don't add these as parts for that install)",
    ...packages,
    "## Price book SKUs",
    ...skus,
    "## Cities in the service area",
    ...c.cities.map((city) => `- ${city}`),
  ].join("\n");
}

export function buildUserMessage(notes: string): string {
  return `Technician's notes:\n<notes>\n${notes}\n</notes>`;
}
