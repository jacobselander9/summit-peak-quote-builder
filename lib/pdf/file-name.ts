// "summit-peak-quote-mrs-jensen-2026-11-17.pdf"
import type { CustomerQuote } from "@/lib/pricing/customer";

export function pdfFileName(quote: CustomerQuote, date: Date): string {
  const who = (quote.customer.name || quote.jobDescription)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const day = date.toISOString().slice(0, 10);
  return `summit-peak-quote-${who}-${day}.pdf`;
}
