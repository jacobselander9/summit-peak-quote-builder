import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Interpretation } from "@/lib/ai/to-spec";

// Replace the Claude call with a stand-in each test controls; keep the real error helper.
const fake = vi.hoisted(() => ({
  calls: 0,
  impl: (async () => ({ spec: null, questions: [], heard: [] })) as () => Promise<Interpretation>,
}));
vi.mock("@/lib/ai/interpret", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/interpret")>();
  return {
    ...actual,
    interpretNotes: () => {
      fake.calls++;
      return fake.impl();
    },
  };
});

import { InterpretError } from "@/lib/ai/interpret";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/interpret", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("POST /api/interpret", () => {
  beforeEach(() => {
    fake.calls = 0;
  });

  it("rejects empty notes without calling Claude", async () => {
    const res = await post({ notes: "   " });
    expect(res.status).toBe(400);
    expect(fake.calls).toBe(0);
  });

  it("rejects a body that isn't JSON", async () => {
    expect((await post("not json")).status).toBe(400);
  });

  it("returns the interpretation", async () => {
    fake.impl = async () => ({ spec: null, questions: ["What city?"], heard: [] });
    const res = await post({ notes: "AC not cooling" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ spec: null, questions: ["What city?"], heard: [] });
  });

  it("returns a friendly error when the AI call fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fake.impl = async () => {
      throw new InterpretError("The AI declined to read these notes.");
    };
    const res = await post({ notes: "x" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "The AI declined to read these notes." });
    log.mockRestore();
  });
});
