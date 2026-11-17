import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { loadDataset } from "@/lib/data/load";
import { DEMO_SCRIPTS } from "@/lib/demo/scripts";
import { buildQuote, toCustomerQuote } from "@/lib/pricing";
import { pdfFileName } from "./file-name";
import { QuotePdf } from "./QuotePdf";

const data = loadDataset();
const date = new Date("2026-11-17T12:00:00");

describe("customer PDF", () => {
  it("renders all three options for an install", async () => {
    const quote = toCustomerQuote(buildQuote(data, DEMO_SCRIPTS[0].spec!));
    const buf = await renderToBuffer(<QuotePdf quote={quote} date={date} />);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
  });

  it("renders a single repair option with a discount", async () => {
    const spec = { ...DEMO_SCRIPTS[2].spec!, discount: { pct: 10, reason: "Friends & family" } };
    const quote = toCustomerQuote(buildQuote(data, spec));
    const buf = await renderToBuffer(<QuotePdf quote={quote} date={date} />);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("names the file after the customer and date", () => {
    const quote = toCustomerQuote(buildQuote(data, DEMO_SCRIPTS[0].spec!));
    expect(pdfFileName(quote, date)).toBe("summit-peak-quote-mrs-jensen-2026-11-17.pdf");
  });
});
