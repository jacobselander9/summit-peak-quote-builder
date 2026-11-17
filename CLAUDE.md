# CLAUDE.md — Summit Peak HVAC Quote Builder (Demo)

## What this is
A demo web app built by Operate AI Solutions (Mason King and Jacob Sealander) to practice and to show future clients.
**Summit Peak HVAC is a fictional company in Logan, Utah. All prices, rates, and fees are fake demo data.**
Never use real client names, data, or prompts in this repo.

**The pitch in one line:** a tech types or dictates what they're fixing, and in under a minute gets a priced Good/Better/Best quote they can adjust live, a customer-ready PDF, and a margin check.

## Stack
- Next.js (App Router) + TypeScript, deployed on **Vercel**
- Claude API via the official Anthropic TypeScript SDK (`@anthropic-ai/sdk`), server-side only
- Tailwind CSS
- zod for validating everything the model returns
- Customer PDF generated with `@react-pdf/renderer`
- Vitest for tests
- GitHub org `operateaisolutions`, repo `summit-peak-quote-builder`

## Secrets
- `ANTHROPIC_API_KEY` lives in Vercel environment variables and `.env.local` for local dev.
- Never commit `.env*` files. Never call the Claude API from the browser.
- Model name lives in one constant in `lib/config.ts`.

## The core rule
**Claude reads the notes. Code does the math.**
1. **Interpret (Claude API):** notes → a structured `JobSpec` (job code, size, add-ons, extra parts, city, timing, Peak Club, customer info, clarifying questions). The model may only use job codes, SKUs, and cities that exist in `/data`. Each field it fills carries the snippet of notes it came from, or is marked as an assumption.
2. **Price (pure TypeScript in `lib/pricing/`, no AI):** builds every line item from `/data` and records a trace of every calculation.
3. **Present:** one page, live updates, Good/Better/Best, owner view, customer PDF.

If something needed to price the job is missing (size, city), the model returns questions and the UI shows them instead of guessing.

## Data (`/data`): the only source of prices
- `price_book.csv`: sku, description, category, unit, supplier, unit_cost, markup, sell_price, on_hand, reorder_at
- `labor_roles.csv`: role_id, role, base_wage, burdened_cost, bill_rate
- `labor_jobs.csv`: job_code, description, job_type (install | addon | service), hours_per_person, roles (`;`-separated role_ids, each works hours_per_person)
- `multipliers.csv`: labor multipliers (after-hours, weekend, holiday, attic/crawl, Peak Club)
- `fees.csv`: fee_code, name, price, internal_cost, job_type, when_it_applies
- `pricing_rules.json`: tax, margins, minimum ticket, deposit, permit-by-city map, Peak Club rules
- `tiers.json`: Good/Better/Best item lists per job code and size, plus units_removed and sealed_systems_opened

Source PDFs are in `/docs` for reference only. Never hardcode a price in code.

## Pricing rules
- Part line = sell_price × qty. Sell price is already in the price book: round(unit_cost × markup).
- Labor line = hours × bill_rate × multiplier, one line per role on the crew.
- Installs: permit by city + F-STARTUP + F-DISP per unit removed + F-RECOV per sealed system opened.
- Service: F-TRIP (waived for Peak Club) + F-AFTER for after-hours/weekend/holiday. F-DIAG only if the repair is declined (not on a normal quote).
- Peak Club: labor × 0.85 on service jobs only. Not on installs.
- Minimum service ticket: if the service subtotal is under $189, add a "Minimum service charge" line to reach $189.
- Tax: 7.25% on parts and equipment only, rounded to cents. Labor and fees are not taxed.
- Installs: 30% deposit on the total. Quote valid 30 days.
- Round money to cents (half up) at the line level: each labor line, tax, warranty reserve, deposit. Use integer cents internally to avoid float drift.

## Margin check (owner view only)
- Job cost = parts at unit_cost + labor hours × burdened_cost + fees at internal_cost + 3% warranty reserve on the install subtotal.
- Gross margin = (subtotal before tax − job cost) / subtotal before tax.
- Targets: installs at least 45%, service at least 55%. Show pass/fail and which lines pull margin down.
- **Cost, markup, margin, and the calculation trace never appear on anything the customer sees.**

## Screen flow (one page)
1. **Notes box** at the top with a mic button (browser Web Speech API; hide it if the browser doesn't support it). The tech describes the job, the repair, and any parts they think they'll need.
2. **Build estimate** → Good/Better/Best cards (one card for repairs).
3. **Live editing:** change quantities, labor hours, remove lines, add parts from a searchable price book, edit customer info, toggle Peak Club and timing. Totals update instantly in the browser using the same pricing engine, with no API call.
4. **Add more notes** → re-interprets all notes together. Warn before replacing manual edits.
5. **Owner view toggle:** margin check plus the "How we got this estimate" panel.
6. **Create PDF:** choose one option or all three.

## "How we got this estimate" panel
Shows, in plain language:
- **What the agent heard:** each thing it pulled from the notes, with the exact words it came from, and any assumption it made (flagged in orange).
- **Every line's math:** e.g. "AC-36-14: cost $2,250 × 1.90 markup = $4,275 (price_book.csv)", "Lead Installer 5.0 hrs × $135 (job I-AC)", "Permit $145 because city = Logan".
- **Rules applied:** multipliers, Peak Club, minimum ticket, tax base.
- **Manual edits:** anything the user changed after the agent's draft.
The pricing engine returns this trace with its result; don't rebuild it separately.

## Customer PDF
Navy #1F3A5F, orange #E07A2E. Customer info, option name, line items at sell price, tax, total, deposit, financing note (0% for 12 months available), 30-day validity, signature line. Footer: "Demo — fictional company and pricing."

## Demo scripts and tests
- `/demo/sample-notes.md` holds the pitch scripts. `/demo/expected_totals.json` holds the exact expected numbers.
- Vitest must prove the pricing engine matches `expected_totals.json` to the cent (subtotal, tax, total, margin).
- Run `npm run lint` and `npm test` before every commit.

## Code style
Small, readable files and plain names. Comment the pricing math. Keep the UI clean and large enough to read on a projector.

## Out of scope for now
Login, database, saving quotes, email/SMS, real supplier feeds. These go in the pitch as "what a real build adds."
