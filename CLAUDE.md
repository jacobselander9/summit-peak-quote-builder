# CLAUDE.md — Summit Peak HVAC Quote Builder (Demo)

## What this is
A demo web app built by Operate AI Solutions (Mason King and Jacob Sealander) to practice and to show future clients.
**Summit Peak HVAC is a fictional company in Logan, Utah. All prices, rates, and fees are fake demo data.**
Never use real client names, data, or prompts in this repo.

**The pitch in one line:** a tech types plain-English job notes, and in under a minute the owner gets a priced Good/Better/Best quote, a customer-ready PDF, and a margin check.

## Stack
- Next.js (App Router) + TypeScript, deployed on **Vercel**
- Claude API via the official Anthropic TypeScript SDK (`@anthropic-ai/sdk`)
- Tailwind CSS for styling
- PDF generation server-side (e.g. `@react-pdf/renderer`)
- Code lives in GitHub org `operateaisolutions`, repo `summit-peak-quote-builder`

## Secrets
- `ANTHROPIC_API_KEY` is set in Vercel environment variables and in `.env.local` for local dev.
- Never commit `.env*` files. Never call the Claude API from the browser; only from server routes.
- Keep the model name in one constant (`lib/config.ts`) so it is easy to change.

## How a quote works (the core rule)
**Claude reads the notes. Code does the math.**
1. **Interpret (Claude API):** Turn the tech's notes into structured JSON: job codes, equipment size, add-ons, city, after-hours flag, Peak Club member yes/no, and any questions the tech needs to answer. Use tool use / structured output and validate the result with a schema (zod). Claude may only pick SKUs and job codes that exist in `/data`.
2. **Price (plain TypeScript, no AI):** Build every line item from the data files. Never let the model calculate prices, totals, tax, or margin.
3. **Present:** Show Good/Better/Best side by side, a customer PDF, and an internal margin view.

If the notes are missing something needed to price the job (size, city), show a short question to the user instead of guessing.

## Data (`/data`)
Source of truth for all pricing. Converted from the three Summit Peak PDFs (kept in `/docs` for reference).
- `price_book.csv`: SKU, description, category, unit, supplier, unit_cost, markup, on_hand, reorder_at. Sell price = round(unit_cost × markup).
- `labor_roles.csv`: role, base_wage, burdened_cost, bill_rate
- `labor_jobs.csv`: job_code, description, crew_size, hours_per_person, roles
- `multipliers.csv`: after-hours 1.5x, overnight/weekend 1.75x, holiday 2.0x, attic/crawlspace 1.25x, Peak Club 0.85x (repair labor only)
- `fees.csv`: fee_code, name, price, when_it_applies (permits by city, haul-away, recovery, startup, trip, diagnostic)
- `pricing_rules.json`: margins, tax, deposit, minimum charge, warranty reserve, quote validity
- `tiers.json`: which SKUs make up Good, Better, and Best for each job type

Do not hardcode prices anywhere in the code. If data changes, only the files in `/data` change.

## Pricing rules
- Parts/equipment: sell price from the price book.
- Labor: hours_per_person × bill rate for each role on the crew, then apply multipliers.
- Fees: add every fee that applies. The permit depends on the city (Logan, Cache County, other Cache Valley cities). Equipment replacements always get haul-away, refrigerant recovery, and startup.
- Tax: 7.25% on parts and equipment only. Labor and fees are not taxed.
- Peak Club: 15% off repair labor and no trip charge. Does not apply to installs.
- Minimum service ticket: $189.
- Quote valid 30 days. Installs require a 30% deposit.

## Margin check (internal view only)
- Job cost = parts at unit cost + labor hours × burdened cost + fees at face value + 3% warranty reserve on install price.
- Gross margin = (price before tax − job cost) / price before tax.
- Targets: installs at least 45%, service at least 55%. Show pass/fail clearly, and show which line items drag margin down.
- **Never show cost, markup, or margin on anything the customer sees.**

## Good / Better / Best
- Every equipment replacement shows three options. Example for a 3-ton AC:
  - Good: AC-36-14 (14.3 SEER2) + CL-36 + programmable thermostat
  - Better: AC-36-17 (17 SEER2 two-stage) + CL-36 + smart thermostat
  - Best: HP-36-15 cold-climate heat pump + CL-36 + smart thermostat + 4" media filter
- Repairs show one option, not three.

## Customer PDF
- Summit Peak HVAC branding: navy #1F3A5F, orange #E07A2E.
- Includes the customer name/address (from the notes or entered by the user), line items at sell price, tax, total, deposit due, financing note, 30-day validity, and a signature line.
- Footer on every page: "Demo — fictional company and pricing."

## Demo scripts
Keep sample notes in `/demo/sample-notes.md` so a pitch always works. At minimum:
1. "Mrs. Jensen in Logan, 3-ton AC is dead, original 2009 unit, line set looks ok" → AC replacement, Good/Better/Best
2. "North Logan, furnace and AC both 20 years old, wants something efficient" → full system with heat pump option
3. "Bad capacitor on a Smithfield call, customer is Peak Club" → single repair, discounts applied
4. "Saturday night no heat, igniter cracked, Providence" → after-hours multiplier and dispatch fee

## Code style
- Small, readable files. Plain names. Comment the pricing math.
- Unit tests (Vitest) for the pricing engine: every demo script above must produce the expected totals.
- Run `npm run lint` and `npm test` before committing.

## Out of scope for now
Login, a database, saving quotes, sending email/SMS, and real supplier price feeds. Mention these as "what a real build adds" in the pitch.
