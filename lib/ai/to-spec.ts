// Turns the model's answer into a pricing-engine JobSpec, plus the
// "What the agent heard" list for the owner view.
import type { Dataset } from "@/lib/data";
import type { JobSpecInput } from "@/lib/pricing/types";
import type { Catalog } from "./catalog";
import type { ToolInput } from "./schema";

/** One thing the agent pulled from the notes. */
export type HeardItem = {
  field: string;
  /** Plain-language value, e.g. "I-AC: AC condenser + coil replacement". */
  value: string;
  /** Exact words from the notes, or null for an assumption. */
  sourceText: string | null;
  assumption: boolean;
  reason: string | null;
};

export type Interpretation = {
  /** Ready to price, or null if questions must be answered first. */
  spec: JobSpecInput | null;
  questions: string[];
  heard: HeardItem[];
};

type Sourced = { source_text: string | null; assumption: boolean; assumption_reason: string | null };

/** Lowercase, straight quotes, single spaces: so "3 ton" matches "3  Ton". */
const normalize = (s: string) =>
  s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

export function toInterpretation(
  data: Dataset,
  catalog: Catalog,
  notes: string,
  input: ToolInput,
): Interpretation {
  const heard: HeardItem[] = [];
  const questions = [...input.questions];
  const notesNorm = normalize(notes);

  /** Records a heard item. Quoted text that isn't in the notes is downgraded to an assumption. */
  function hear(field: string, value: string, f: Sourced) {
    let { source_text: sourceText, assumption, assumption_reason: reason } = f;
    if (sourceText && !notesNorm.includes(normalize(sourceText))) {
      reason = `Quoted words "${sourceText}" are not in the notes${reason ? `; ${reason}` : ""}`;
      sourceText = null;
      assumption = true;
    }
    heard.push({ field, value, sourceText: sourceText || null, assumption, reason });
  }

  const job = input.job ? data.laborJobs[input.job.value] : null;
  if (input.job && job) hear("Job", `${job.jobCode}: ${job.description}`, input.job);
  if (input.size) hear("Size", input.size.value, input.size);
  if (input.city) hear("City", input.city.value, input.city);
  hear("Timing", input.timing.value.replace("_", "-"), input.timing);
  hear("Peak Club", input.peak_club.value ? "Member" : "Not a member", input.peak_club);
  for (const e of input.extra_jobs) {
    hear("Extra job", `${e.job_code}: ${data.laborJobs[e.job_code].description}`, e);
  }
  for (const p of input.parts) {
    hear("Part", `${p.sku} × ${p.qty}: ${data.priceBook[p.sku].description}`, p);
  }
  if (input.units_removed) hear("Units removed", String(input.units_removed.value), input.units_removed);
  const customer = {
    name: input.customer_name?.value,
    address: input.customer_address?.value,
    phone: input.customer_phone?.value,
    email: input.customer_email?.value,
  };
  for (const key of ["name", "address", "phone", "email"] as const) {
    const f = input[`customer_${key}`];
    if (f) hear(`Customer ${key}`, f.value, f);
  }

  // Code double-checks what the schema can't: required fields and size-for-job.
  // Only add our own question if the model didn't already ask about that topic.
  const askedAbout = (topic: RegExp) => questions.some((q) => topic.test(q));
  const SIZE = /size|ton|kbtu|btu/i;
  const CITY = /city|where|location|town|address/i;
  const ask = (q: string, topic: RegExp) => {
    if (!askedAbout(topic)) questions.push(q);
  };
  if (!job) {
    if (questions.length === 0) ask("What job is this: which repair, or what equipment is being replaced?", /./);
  } else if (job.jobType === "install") {
    const validSizes = catalog.sizesByJob[job.jobCode] ?? [];
    if (!input.size) ask(sizeQuestion(catalog, job.jobCode), SIZE);
    else if (!validSizes.includes(input.size.value)) {
      questions.push(`${input.size.value} isn't a size we package for ${job.jobCode}. ${sizeQuestion(catalog, job.jobCode)}`);
    }
    if (!input.city) ask("What city is the job in?", CITY);
  } else if (!input.city) {
    ask("What city is the job in?", CITY);
  }

  const isInstall = job?.jobType === "install";
  const ready =
    job !== null &&
    input.city !== null &&
    (!isInstall || (input.size !== null && (catalog.sizesByJob[job.jobCode] ?? []).includes(input.size.value)));

  const spec: JobSpecInput | null = ready
    ? {
        jobCode: job!.jobCode,
        ...(isInstall ? { size: input.size!.value } : {}),
        city: input.city!.value,
        timing: input.timing.value,
        peakClub: input.peak_club.value,
        extraJobs: input.extra_jobs.map((e) => e.job_code),
        parts: input.parts.map((p) => ({ sku: p.sku, qty: p.qty })),
        ...(isInstall && input.units_removed ? { unitsRemoved: input.units_removed.value } : {}),
        ...(Object.values(customer).some(Boolean) ? { customer: stripEmpty(customer) } : {}),
      }
    : null;

  return { spec, questions, heard };
}

function sizeQuestion(catalog: Catalog, jobCode: string): string {
  const sizes = (catalog.sizesByJob[jobCode] ?? []).join(", ");
  if (jobCode === "I-FN") return `What size is the furnace in kBTU (${sizes})?`;
  if (jobCode === "I-SYS") return `What size are the AC (tons) and furnace (kBTU)? Packages: ${sizes}.`;
  return `What size is the AC in tons (${sizes})?`;
}

function stripEmpty<T extends Record<string, string | undefined>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as Partial<T>;
}
