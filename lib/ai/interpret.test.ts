// The Claude API is mocked here: npm test never needs an API key.
import { describe, expect, it, vi } from "vitest";
import { loadDataset } from "@/lib/data/load";
import { DEMO_SCRIPTS } from "@/lib/demo/scripts";
import { CLAUDE_MODEL } from "@/lib/config";
import { buildCatalog } from "./catalog";
import { InterpretError, interpretNotes, type MessagesClient } from "./interpret";
import { TOOL_NAME, buildToolInputSchema, type ToolInput } from "./schema";

const data = loadDataset();
const catalog = buildCatalog(data);

// Fields as the model sends them: "" means "not given".
const heard = (value: unknown, source_text: string) => ({
  value,
  source_text,
  assumption: false,
  assumption_reason: "",
});
const assumed = (value: unknown, reason: string) => ({
  value,
  source_text: "",
  assumption: true,
  assumption_reason: reason,
});
const notGiven = (value: "" | 0 = "") => ({ value, source_text: "", assumption: false, assumption_reason: "" });

/** A complete, valid tool input; override what each test needs. */
function toolInput(overrides: Partial<Record<keyof ToolInput, unknown>> = {}) {
  return {
    job: notGiven(),
    size: notGiven(),
    city: notGiven(),
    timing: assumed("standard", "no time mentioned"),
    peak_club: assumed(false, "not mentioned"),
    extra_jobs: [],
    parts: [],
    units_removed: notGiven(0),
    customer_name: notGiven(),
    customer_address: notGiven(),
    customer_phone: notGiven(),
    customer_email: notGiven(),
    questions: [],
    ...overrides,
  };
}

const toolResponse = (input: unknown) => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id: "toolu_1", name: TOOL_NAME, input }],
});
const textResponse = { stop_reason: "end_turn", content: [{ type: "text", text: "Here you go" }] };

/** Fake client that returns the given responses in order. */
function fakeClient(...responses: unknown[]) {
  const create = vi.fn();
  for (const r of responses) create.mockResolvedValueOnce(r);
  return { client: { beta: { messages: { create } } } as unknown as MessagesClient, create };
}

const script1 = DEMO_SCRIPTS[0];
const script1Input = toolInput({
  job: heard("I-AC", "3 ton AC is dead"),
  size: heard("3", "3 ton"),
  city: heard("Logan", "in Logan"),
  timing: heard("standard", "Standard hours"),
  customer_name: heard("Mrs. Jensen", "Mrs. Jensen"),
});

describe("interpretNotes", () => {
  it("turns a good answer into the JobSpec the demo expects", async () => {
    const { client } = fakeClient(toolResponse(script1Input));
    const result = await interpretNotes(script1.notes, data, client);
    expect(result.questions).toEqual([]);
    expect(result.spec).toEqual({ ...script1.spec, extraJobs: [], parts: [] });
    const city = result.heard.find((h) => h.field === "City")!;
    expect(city).toMatchObject({ value: "Logan", sourceText: "in Logan", assumption: false });
    const peak = result.heard.find((h) => h.field === "Peak Club")!;
    expect(peak).toMatchObject({ assumption: true, reason: "not mentioned" });
  });

  it("sample 5: returns questions, not a quote", async () => {
    const notes = DEMO_SCRIPTS[4].notes;
    const { client } = fakeClient(
      toolResponse(
        toolInput({
          job: heard("I-AC", "probably needs a new unit"),
          questions: ["What city is the job in?", "What size is the AC in tons?"],
        }),
      ),
    );
    const result = await interpretNotes(notes, data, client);
    expect(result.spec).toBeNull();
    expect(result.questions).toHaveLength(2);
  });

  it("asks for size and city even if the model forgot to", async () => {
    const { client } = fakeClient(toolResponse(toolInput({ job: heard("I-AC", "AC") })));
    const result = await interpretNotes("AC dead", data, client);
    expect(result.spec).toBeNull();
    expect(result.questions.join(" ")).toMatch(/size is the AC in tons \(2, 3, 4, 5\)/);
    expect(result.questions.join(" ")).toMatch(/What city/);
  });

  it("rejects a size that doesn't exist for the job", async () => {
    const input = { ...script1Input, size: heard("80", "3 ton") }; // 80 is a furnace size
    const { client } = fakeClient(toolResponse(input));
    const result = await interpretNotes(script1.notes, data, client);
    expect(result.spec).toBeNull();
    expect(result.questions[0]).toMatch(/80 isn't a size we package for I-AC/);
  });

  it("flags quoted text that isn't really in the notes as an assumption", async () => {
    const input = { ...script1Input, city: heard("Logan", "Logan, Utah 84321") };
    const { client } = fakeClient(toolResponse(input));
    const result = await interpretNotes(script1.notes, data, client);
    const city = result.heard.find((h) => h.field === "City")!;
    expect(city.assumption).toBe(true);
    expect(city.sourceText).toBeNull();
    expect(city.reason).toMatch(/not in the notes/);
  });

  it("matches quotes regardless of case and spacing", async () => {
    const input = { ...script1Input, size: heard("3", "3  TON") };
    const { client } = fakeClient(toolResponse(input));
    const result = await interpretNotes(script1.notes, data, client);
    expect(result.heard.find((h) => h.field === "Size")!.assumption).toBe(false);
  });

  it("extra parts and add-ons become line items", async () => {
    const notes = `${script1.notes} Also needs a condensate pump.`;
    const input = {
      ...script1Input,
      extra_jobs: [{ job_code: "A-PUMP", source_text: "needs a condensate pump", assumption: false, assumption_reason: "" }],
      parts: [{ sku: "PUMP-CND", qty: 1, source_text: "condensate pump", assumption: false, assumption_reason: "" }],
    };
    const { client } = fakeClient(toolResponse(input));
    const result = await interpretNotes(notes, data, client);
    expect(result.spec!.extraJobs).toEqual(["A-PUMP"]);
    expect(result.spec!.parts).toEqual([{ sku: "PUMP-CND", qty: 1 }]);
  });

  it("retries once when a field has neither source_text nor assumption", async () => {
    const bad = { ...script1Input, city: { value: "Logan", source_text: "", assumption: false, assumption_reason: "" } };
    const { client, create } = fakeClient(toolResponse(bad), toolResponse(script1Input));
    const result = await interpretNotes(script1.notes, data, client);
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.spec).not.toBeNull();
  });

  it("gives up with a friendly error after two bad answers", async () => {
    const bad = { ...script1Input, city: heard("Salt Lake City", "SLC") };
    const { client } = fakeClient(toolResponse(bad), toolResponse(bad));
    await expect(interpretNotes(script1.notes, data, client)).rejects.toThrow(InterpretError);
  });

  it("retries when the model answers in text instead of calling the tool", async () => {
    const { client, create } = fakeClient(textResponse, toolResponse(script1Input));
    const result = await interpretNotes(script1.notes, data, client);
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.spec!.jobCode).toBe("I-AC");
  });

  it('treats "" and 0 as not given, and needs no source for them', async () => {
    const { client } = fakeClient(toolResponse(script1Input));
    const result = await interpretNotes(script1.notes, data, client);
    expect(result.heard.map((h) => h.field)).not.toContain("Units removed");
    expect(result.heard.map((h) => h.field)).not.toContain("Customer phone");
    expect(result.spec!.unitsRemoved).toBeUndefined();
  });

  it("reports a refusal in plain words", async () => {
    const { client } = fakeClient({ stop_reason: "refusal", content: [] });
    await expect(interpretNotes("x", data, client)).rejects.toThrow(/declined/);
  });

  it("sends a strict tool built from /data, with the model from config", async () => {
    const { client, create } = fakeClient(toolResponse(script1Input));
    await interpretNotes(script1.notes, data, client);
    const req = create.mock.calls[0][0];
    expect(req.model).toBe(CLAUDE_MODEL);
    expect(req.tool_choice).toBeUndefined(); // forced tool choice isn't allowed on this model
    expect(req.tools[0]).toMatchObject({ name: TOOL_NAME, strict: true });
    const props = req.tools[0].input_schema.properties;
    expect(props.city.properties.value.enum).toEqual([...data.rules.service_area, ""]);
    expect(props.parts.items.properties.sku.enum).toHaveLength(40);
    expect(props.job.properties.value.enum).not.toContain("I-HP"); // no packages to price it
    const system = req.system[0].text as string;
    expect(system).toContain("CAP-45-5: Dual run capacitor, 45/5 uF, 440V");
    expect(system).toContain("- North Logan");
    expect(req.messages[0].content).toContain(script1.notes);
  });
});

describe("tool schema", () => {
  it("meets strict-mode rules: every object closed, every property required, no unsupported keywords", () => {
    const visit = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object") {
        expect(n.additionalProperties).toBe(false);
        expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
      }
      // The API allows at most 16 union-typed fields in strict mode; we use none.
      expect(n, "no anyOf/oneOf unions").not.toHaveProperty("anyOf");
      expect(n, "no oneOf unions").not.toHaveProperty("oneOf");
      expect(Array.isArray(n.type), "no type arrays").toBe(false);
      for (const bad of ["minimum", "maximum", "minLength", "maxLength", "multipleOf"]) {
        expect(n).not.toHaveProperty(bad);
      }
      Object.values(n).forEach(visit);
    };
    visit(buildToolInputSchema(catalog));
  });
});
