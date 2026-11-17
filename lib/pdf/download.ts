// Builds the customer PDF in the browser and starts a download.
// Loaded only when "Create PDF" is clicked, so the PDF library doesn't slow down the page.
import { pdf } from "@react-pdf/renderer";
import { createElement } from "react";
import type { CustomerQuote } from "@/lib/pricing/customer";
import { pdfFileName } from "./file-name";
import { QuotePdf } from "./QuotePdf";

export async function downloadQuotePdf(quote: CustomerQuote): Promise<void> {
  const date = new Date();
  const element = createElement(QuotePdf, { quote, date }) as Parameters<typeof pdf>[0];
  const blob = await pdf(element).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = pdfFileName(quote, date);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
