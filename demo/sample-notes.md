# Demo Scripts — Summit Peak HVAC

Paste these into the notes box during a pitch. Expected totals are in `expected_totals.json`
and must match the pricing engine exactly (tests enforce this).

## 1. AC replacement — Good / Better / Best
> Mrs. Jensen in Logan, 3 ton AC is dead, original 2009 unit. Line set looks ok, coil is rusted out. Pad is cracked. Standard hours.

Expected: job I-AC, 3-ton, city Logan, 1 unit removed, 1 sealed system opened.
Good $8,613.06 · Better $11,561.37 · Best $12,057.93 (totals incl. tax)

## 2. Full system — Good / Better / Best
> North Logan, furnace and AC both about 20 years old. 80k furnace and 3 ton AC. Customer wants something efficient and quiet, asked about heat pumps.

Expected: job I-SYS, size 3-80, city North Logan, 2 units removed, 1 sealed system opened.
Good $13,784.17 · Better $16,732.47 · Best $19,374.04

## 3. Repair — Peak Club member
> Smithfield service call, outdoor unit humming but fan not spinning. Bad 45/5 capacitor. Customer is a Peak Club member.

Expected: one option. No trip charge, 15% off labor, then the $189 minimum ticket applies.
Total $193.06

## 4. After-hours repair
> Saturday night no heat call in Providence. Hot surface igniter is cracked, replaced it.

Expected: one option. Weekend 1.75x labor, trip charge + after-hours dispatch.
Total $574.43

## 5. Missing info (the agent should ask, not guess)
> AC not cooling, probably needs a new unit.

Expected: no quote yet. The agent asks for the city and the AC size (tons).
