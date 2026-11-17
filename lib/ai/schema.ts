// The shape the model must return (the input of the submit_job_spec tool).
//
// Two copies of the same shape:
//  - JSON Schema sent to the API. Its enums (job codes, sizes, SKUs, cities from
//    /data) steer the model. It is NOT sent in strict mode: with every SKU listed,
//    the schema is bigger than strict mode's grammar limit.
//  - zod schema that validates every answer, so nothing outside /data gets through.
//    Validation errors are sent back to the model to fix (see interpret.ts).
//
// "Not given" is written as an empty string "" (or 0 for units_removed and
// discount_pct) rather than null, which keeps the schema simple; zod turns those
// back into null for the rest of the code.
import { z } from "zod";
import { TIMINGS } from "@/lib/pricing/types";
import type { Catalog } from "./catalog";

export const TOOL_NAME = "submit_job_spec";

/** How the model says "not in the notes / unknown". */
export const EMPTY = "";

// ---------- JSON Schema (sent to the API) ----------

type JsonSchema = Record<string, unknown>;

const SOURCE_FIELDS = {
  source_text: {
    type: "string",
    description: 'Exact words copied from the notes that this came from. "" only if assumption is true or the value is "".',
  },
  assumption: {
    type: "boolean",
    description: "true if this was not stated in the notes and you filled in a default or inferred it.",
  },
  assumption_reason: {
    type: "string",
    description: 'Short reason for the assumption, e.g. "no time of day mentioned". "" if not an assumption.',
  },
};

function object(properties: Record<string, JsonSchema>, description?: string): JsonSchema {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

/** { value, source_text, assumption, assumption_reason } */
const sourced = (value: JsonSchema, description?: string) =>
  object({ value, ...SOURCE_FIELDS }, description);

/** A string from a fixed list, or "" for unknown. */
const enumOrEmpty = (values: string[]) => ({ type: "string", enum: [...values, EMPTY] });

export function buildToolInputSchema(c: Catalog): JsonSchema {
  const unknownHint = 'Use value "" if the notes don\'t say.';
  return object({
    job: sourced(enumOrEmpty(c.mainJobCodes), `Main job code. ${unknownHint}`),
    size: sourced(enumOrEmpty(c.allSizes), `Installs only. ${unknownHint} Always "" for service.`),
    city: sourced(enumOrEmpty(c.cities), unknownHint),
    timing: sourced({ type: "string", enum: [...TIMINGS] }),
    peak_club: sourced({ type: "boolean" }),
    extra_jobs: {
      type: "array",
      description: "Add-on labor (installs) or additional repairs (service).",
      items: object({
        job_code: { type: "string", enum: [...c.addonJobCodes, ...c.serviceJobCodes] },
        ...SOURCE_FIELDS,
      }),
    },
    parts: {
      type: "array",
      description: "Parts the notes call for. For installs, only parts NOT already in the package.",
      items: object({
        sku: { type: "string", enum: c.skus },
        qty: { type: "number", description: "Positive quantity in the price book unit." },
        ...SOURCE_FIELDS,
      }),
    },
    units_removed: sourced(
      { type: "integer" },
      "Installs only: old units removed, if the notes clearly differ from the package. Use 0 to keep the package default.",
    ),
    discount_pct: sourced(
      { type: "number" },
      "Percent off the whole job if the notes give one (e.g. 10 for 10% off). Use 0 if no discount is mentioned.",
    ),
    discount_reason: {
      type: "string",
      description: 'Short label for the discount, e.g. "Friends & family". "" if no discount.',
    },
    customer_name: sourced({ type: "string" }, unknownHint),
    customer_address: sourced({ type: "string" }, unknownHint),
    customer_phone: sourced({ type: "string" }, unknownHint),
    customer_email: sourced({ type: "string" }, unknownHint),
    questions: {
      type: "array",
      items: { type: "string" },
      description: "Questions for the tech when something needed to price the job is missing. Empty if none.",
    },
  });
}

// ---------- zod (validates what comes back) ----------

/** "" -> null, otherwise the trimmed text. */
const textOrNull = z.string().transform((s) => s.trim() || null);

const sourceFields = {
  source_text: textOrNull,
  assumption: z.boolean(),
  assumption_reason: textOrNull,
};

type SourceFields = { source_text: string | null; assumption: boolean };

/** Every filled field needs quoted notes text, or must be flagged as an assumption. */
function checkSource(f: SourceFields, ctx: z.RefinementCtx) {
  if (!f.assumption && !f.source_text) {
    ctx.addIssue({ code: "custom", message: "needs source_text or assumption: true" });
  }
}

/** A sourced field that is always filled (timing, peak club). */
const sourcedZ = <T extends z.ZodType>(value: T) =>
  z.object({ value, ...sourceFields }).superRefine(checkSource);

/**
 * A sourced field that may be "not given" ("" or 0). Returns null when not given,
 * so the rest of the code can treat it as missing.
 */
const sourcedOrNull = <T extends z.ZodType>(value: T, isEmpty: (v: unknown) => boolean) =>
  z
    .object({ value, ...sourceFields })
    .superRefine((f, ctx) => {
      if (!isEmpty((f as { value: unknown }).value)) checkSource(f, ctx);
    })
    .transform((f) => (isEmpty((f as { value: unknown }).value) ? null : f));

const isEmptyText = (v: unknown) => typeof v === "string" && v.trim() === "";

export function buildToolInputZod(c: Catalog) {
  const oneOfOrEmpty = (values: string[]) => z.enum([EMPTY, ...values] as [string, ...string[]]);
  const oneOf = (values: string[]) => z.enum(values as [string, ...string[]]);
  return z.object({
    job: sourcedOrNull(oneOfOrEmpty(c.mainJobCodes), isEmptyText),
    size: sourcedOrNull(oneOfOrEmpty(c.allSizes), isEmptyText),
    city: sourcedOrNull(oneOfOrEmpty(c.cities), isEmptyText),
    timing: sourcedZ(z.enum(TIMINGS)),
    peak_club: sourcedZ(z.boolean()),
    extra_jobs: z.array(
      z
        .object({ job_code: oneOf([...c.addonJobCodes, ...c.serviceJobCodes]), ...sourceFields })
        .superRefine(checkSource),
    ),
    parts: z.array(
      z.object({ sku: oneOf(c.skus), qty: z.number().positive(), ...sourceFields }).superRefine(checkSource),
    ),
    units_removed: sourcedOrNull(z.number().int().nonnegative(), (v) => v === 0),
    discount_pct: sourcedOrNull(z.number().min(0).max(100), (v) => v === 0),
    discount_reason: textOrNull,
    customer_name: sourcedOrNull(z.string(), isEmptyText),
    customer_address: sourcedOrNull(z.string(), isEmptyText),
    customer_phone: sourcedOrNull(z.string(), isEmptyText),
    customer_email: sourcedOrNull(z.string(), isEmptyText),
    questions: z.array(z.string()).transform((qs) => qs.map((q) => q.trim()).filter(Boolean)),
  });
}

export type ToolInput = z.output<ReturnType<typeof buildToolInputZod>>;
