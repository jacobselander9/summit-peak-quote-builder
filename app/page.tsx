// Loads /data on the server and hands it to the page, so the pricing engine
// can run in the browser for instant live edits.
import { QuoteBuilder } from "@/components/quote-builder/QuoteBuilder";
import { loadDataset } from "@/lib/data/load";

export default function Home() {
  return <QuoteBuilder data={loadDataset()} />;
}
