// POST /api/interpret  { notes: string }  ->  { spec, questions, heard }  or  { error }
// Runs on the server only, so the Claude API key never reaches the browser.
import { NextResponse } from "next/server";
import { z } from "zod";
import { loadDataset } from "@/lib/data/load";
import { friendlyApiError, interpretNotes } from "@/lib/ai/interpret";

export const runtime = "nodejs";

const BodySchema = z.object({ notes: z.string().trim().min(1).max(10_000) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send JSON like { \"notes\": \"...\" }." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Type or dictate some notes first." }, { status: 400 });
  }

  try {
    const result = await interpretNotes(parsed.data.notes, loadDataset());
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/interpret]", err);
    return NextResponse.json({ error: friendlyApiError(err) }, { status: 502 });
  }
}
