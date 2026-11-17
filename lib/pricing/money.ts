// Money helpers. All money is integer cents.
//
// Every multiply-then-round goes through multiplyRound(), which does the math
// with BigInt so there is no float drift (e.g. 145 x 0.5 x 0.85 = 61.625 must
// round to 61.63, never 61.62).

/** Factors are converted to millionths, so up to 6 decimal places are exact. */
const FACTOR_SCALE = 1_000_000n;

/**
 * cents x factor1 x factor2 x ..., rounded half up to a whole cent.
 * Example: multiplyRound(14500, [0.5, 0.85]) -> 6163 ($145 x 0.5 hr x 0.85 = $61.625 -> $61.63)
 */
export function multiplyRound(cents: number, factors: number[]): number {
  if (!Number.isInteger(cents)) throw new Error(`cents must be an integer, got ${cents}`);
  let numerator = BigInt(cents);
  let denominator = 1n;
  for (const f of factors) {
    if (!Number.isFinite(f) || f < 0) throw new Error(`factor must be a non-negative number, got ${f}`);
    numerator *= BigInt(Math.round(f * Number(FACTOR_SCALE)));
    denominator *= FACTOR_SCALE;
  }
  return divideRoundHalfUp(numerator, denominator);
}

/** n / d rounded half up (n >= 0, d > 0). */
function divideRoundHalfUp(n: bigint, d: bigint): number {
  if (n < 0n) throw new Error("negative amounts are not supported");
  return Number((2n * n + d) / (2n * d));
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** 861306 -> "$8,613.06" */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** 0.4834 -> "48.3%" */
export function formatPct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/** 5 -> "5", 0.75 -> "0.75", 1.5 -> "1.5" */
export function formatNumber(n: number): string {
  return String(Number(n.toFixed(2)));
}
