// The shape the model must return (the input of the submit_job_spec tool).
//
// Two copies of the same shape:
//  - JSON Schema sent to the API with strict: true, so the model can only pick
//    job codes, sizes, SKUs and cities from the enums (built from /data).
//  - zod schema we validate the answer with, plus checks JSON Schema can't do.
import { z } from "zod";
import { TIMINGS } from "@/lib/pricing/types";
import type { Catalog } from "./catalog";

export const TOOL_NAME = "submit_job_spec";

// ---------- JSON Schema (sent to the API) ----------

type JsonSchema = Record<string, unknown>;

const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: "null" }] });

const SOURCE_FIELDS = {
  source_text: nullable({
    type: "string",
    description: "Exact words copied from the notes that this came from. null only if assumption is true.",
  }),
  assumption: {
    type: "boolean",
    description: "true if this was not stated in the notes and you filled in a default or inferred it.",
  },
  assumption_reason: nullable({
    type: "string",
    description: "Short reason for the assumption, e.g. 'no time of day mentioned'. null if not an assumption.",
  }),
};
const SOURCE_KEYS = Object.keys(SOURCE_FIELDS);

/** { value, source_text, assumption, assumption_reason } */
function sourced(value: JsonSchema): JsonSchema {
  return {
    type: "object",
    properties: { value, ...SOURCE_FIELDS },
    required: ["value", ...SOURCE_KEYS],
    additionalProperties: false,
  };
}

function object(properties: Record<string, JsonSchema>, description?: string): JsonSchema {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

export function buildToolInputSchema(c: Catalog): JsonSchema {
  const str = { type: "string" };
  return object({
    job: nullable(sourced({ type: "string", enum: c.mainJobCodes })),
    size: nullable(sourced({ type: "string", enum: c.allSizes })),
    city: nullable(sourced({ type: "string", enum: c.cities })),
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
    units_removed: nullable(sourced({ type: "integer" })),
    customer_name: nullable(sourced(str)),
    customer_address: nullable(sourced(str)),
    customer_phone: nullable(sourced(str)),
    customer_email: nullable(sourced(str)),
    questions: {
      type: "array",
      items: str,
      description: "Questions for the tech when something needed to price the job is missing. Empty if none.",
    },
  });
}

// ---------- zod (validates what comes back) ----------

const sourceFields = {
  source_text: z.string().nullable(),
  assumption: z.boolean(),
  assumption_reason: z.string().nullable(),
};

/** Every filled field needs quoted notes text, or must be flagged as an assumption. */
function hasSourceOrAssumption(f: { source_text: string | null; assumption: boolean }) {
  return f.assumption || (f.source_text !== null && f.source_text.trim() !== "");
}
const SOURCE_MESSAGE = "needs source_text or assumption: true";

const sourcedZ = <T extends z.ZodType>(value: T) =>
  z.object({ value, ...sourceFields }).refine(hasSourceOrAssumption, SOURCE_MESSAGE);

export function buildToolInputZod(c: Catalog) {
  const oneOf = (values: string[]) => z.enum(values as [string, ...string[]]);
  return z.object({
    job: sourcedZ(oneOf(c.mainJobCodes)).nullable(),
    size: sourcedZ(oneOf(c.allSizes)).nullable(),
    city: sourcedZ(oneOf(c.cities)).nullable(),
    timing: sourcedZ(z.enum(TIMINGS)),
    peak_club: sourcedZ(z.boolean()),
    extra_jobs: z.array(
      z
        .object({ job_code: oneOf([...c.addonJobCodes, ...c.serviceJobCodes]), ...sourceFields })
        .refine(hasSourceOrAssumption, SOURCE_MESSAGE),
    ),
    parts: z.array(
      z
        .object({ sku: oneOf(c.skus), qty: z.number().positive(), ...sourceFields })
        .refine(hasSourceOrAssumption, SOURCE_MESSAGE),
    ),
    units_removed: sourcedZ(z.number().int().nonnegative()).nullable(),
    customer_name: sourcedZ(z.string()).nullable(),
    customer_address: sourcedZ(z.string()).nullable(),
    customer_phone: sourcedZ(z.string()).nullable(),
    customer_email: sourcedZ(z.string()).nullable(),
    questions: z.array(z.string()),
  });
}

export type ToolInput = z.infer<ReturnType<typeof buildToolInputZod>>;
