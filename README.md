# Summit Peak HVAC — Quote Builder (demo)

A demo web app by **Operate AI Solutions**. A technician types or dictates what they're fixing, and in seconds gets a priced Good/Better/Best quote they can adjust live, a margin check for the owner, and a customer-ready PDF.

> **Summit Peak HVAC is a fictional company in Logan, Utah. Every price, rate and fee is fake demo data.**

**The core rule: Claude reads the notes. Code does the math.**

1. **Interpret (Claude API):** the notes become a structured job spec (job code, size, city, timing, Peak Club, parts, discount, customer). Claude can only use the job codes, SKUs and cities in `/data`, and every field it fills quotes the words it came from or is flagged as an assumption. If the size or city is missing, it asks instead of guessing.
2. **Price (plain TypeScript, no AI):** `lib/pricing/` builds every line from `/data` in whole cents and records how each number was worked out.
3. **Present:** one page with live edits, an owner view and a customer PDF.

## Run it locally

You need [Node.js](https://nodejs.org) 20 or newer and an [Anthropic API key](https://platform.claude.com).

```bash
npm install
cp .env.example .env.local   # then paste your key after ANTHROPIC_API_KEY=
npm run dev                  # open http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the app at http://localhost:3000 |
| `npm test` | Runs all tests (no API key needed; Claude is mocked) |
| `npm run lint` | Checks the code for mistakes |
| `npm run quote -- 1` | Prints demo script 1's quote with its full calculation trace (1–4) |
| `npm run try-notes` | Sends all five demo scripts to the real Claude API and compares with the expected answer (costs a few cents) |
| `npm run pdfs` | Saves sample customer PDFs to `demo/output/` |

Run `npm run lint` and `npm test` before every commit.

## Deploy to Vercel

1. In [Vercel](https://vercel.com), **Add New → Project** and import this GitHub repository. Vercel detects Next.js automatically.
2. Before deploying, open **Environment Variables** and add `ANTHROPIC_API_KEY` with your key (Production and Preview).
3. Click **Deploy**. Pushes to the production branch redeploy automatically.

The key only lives on the server (`app/api/interpret/route.ts`); the browser never sees it. A public URL lets anyone use your Claude credits, so set a monthly spend limit in the Anthropic Console.

## The five demo scripts

Full text in `demo/sample-notes.md`; exact expected numbers in `demo/expected_totals.json` (tests enforce them to the cent). The empty page has buttons that fill these in.

| # | Script | What it shows | Expected total |
| --- | --- | --- | --- |
| 1 | Logan, 3-ton AC is dead | Good / Better / Best install | $8,613.06 · $11,561.37 · $12,057.93 |
| 2 | North Logan, furnace + AC | Full system install | $13,784.17 · $16,732.47 · $19,374.04 |
| 3 | Smithfield capacitor, Peak Club | 15% off labor, no trip charge, $189 minimum | $193.06 |
| 4 | Providence, Saturday night igniter | Weekend 1.75× labor + after-hours dispatch | $574.43 |
| 5 | "AC not cooling, probably needs a new unit" | The agent asks for city and size instead of guessing | no quote |

## 2-minute pitch

1. **Script 1 (30 s).** Click demo button 1 → **Build estimate**. "A tech just types what they see. Fifteen seconds later: three priced options from the real price book." Point at Good / Better / Best and the deposit.
2. **Live edits (30 s).** Change the refrigerant from 4 to 6 lb, remove the thermostat, search "pump" and add it. "Totals update instantly, no waiting." Set **Discount %** to 10 for a family friend.
3. **Owner view (30 s).** Flip **Owner view**. "The owner sees what the customer never does: cost, margin, and that 10% discount just dropped this job below the 45% target." Scroll to **How we got this estimate**: the exact words the agent heard, every line's math, every rule.
4. **PDF (15 s).** Choose **All three options → Create PDF**. "Branded, signed on the spot, no cost or margin on it."
5. **Script 5 (15 s).** "When info is missing, it asks instead of guessing." Then answer: type "Logan, 3 ton" in **Add more notes**.

**What a real build adds:** login, saving quotes, the customer's real price book and supplier feeds, email/SMS delivery, and e-signatures.

## Project layout

```
data/               The only source of prices (price book, labor, fees, rules, tiers)
demo/               Pitch scripts and the expected numbers the tests check
docs/               Source PDFs (reference only)
app/                Next.js page and the /api/interpret route
components/         The one-page UI
lib/data/           Loads and validates /data with zod
lib/pricing/        Pricing engine, trace, customer-safe quote
lib/ai/             Claude prompt, tool schema, notes → job spec
lib/pdf/            Customer PDF
scripts/            quote, try-notes, pdfs commands
```

`CLAUDE.md` has the full pricing rules and project conventions.
