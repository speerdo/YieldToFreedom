import type { InferSelectModel } from 'drizzle-orm';

import type { etfDividends, etfs } from '../db/schema';

export type EtfRow = InferSelectModel<typeof etfs>;
export type DividendRow = InferSelectModel<typeof etfDividends>;

function num(s: string | null | undefined): number | null {
  if (s == null || s === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** Decimal yield e.g. 0.065 = 6.5% */
export function trailingYieldDecimal(etf: EtfRow): number {
  return num(etf.trailing12mYield) ?? num(etf.lastYield) ?? 0;
}

// ── Yield ──────────────────────────────────────────────────────────────────────

/**
 * Income yield curve scaled to [max].
 * Peaks at 12%+ and stays there — the total-return component already penalises
 * ETFs that yield 20%+ by eroding NAV, so the yield curve should not double-count that risk.
 */
function yieldPointsScaled(y: number, max: number): number {
  if (y <= 0) return 0;
  let raw: number;
  if (y <= 0.03) raw = (y / 0.03) * 10;
  else if (y <= 0.12) raw = 10 + ((y - 0.03) / 0.09) * 20;
  else raw = 30; // no taper — total return score handles NAV erosion
  return (raw / 30) * max;
}

/** Backward-compatible: yield scored out of 30 */
export function yieldPoints(y: number): number {
  return yieldPointsScaled(y, 30);
}

// ── Total Return ────────────────────────────────────────────────────────────────

// ── Expense Ratio ───────────────────────────────────────────────────────────────

function expenseRatioPointsScaled(er: number | null, max: number): number {
  if (er == null) return 0;
  let raw: number;
  if (er <= 0) raw = 15;
  else if (er <= 0.002) raw = 13;
  else if (er <= 0.0035) raw = 10;
  else if (er <= 0.006) raw = 7;
  else if (er <= 0.0075) raw = 4;
  else if (er <= 0.01) raw = 1;
  else raw = 0;
  return (raw / 15) * max;
}

/** Backward-compatible: expense ratio scored out of 15 */
export function expenseRatioPoints(er: number | null): number {
  return expenseRatioPointsScaled(er, 15);
}

/**
 * Income-specific expense ratio curve. Options-overlay strategies (covered calls,
 * put-spread collars) legitimately cost 0.5–1.1% to run. The standard curve gives
 * near-zero credit to these funds even though the fee is appropriate for the strategy.
 */
function incomeExpenseRatioPointsScaled(er: number | null, max: number): number {
  if (er == null) return 0;
  let raw: number;
  if (er <= 0) raw = 15;
  else if (er <= 0.002) raw = 15;   // ≤0.20%: free tier
  else if (er <= 0.005) raw = 13;   // ≤0.50%: cheap
  else if (er <= 0.007) raw = 10;   // ≤0.70%: options-ETF normal (QQQI, SPYI)
  else if (er <= 0.009) raw = 7;    // ≤0.90%: acceptable
  else if (er <= 0.011) raw = 4;    // ≤1.10%: expensive but in range (CHPY, YieldMax)
  else if (er <= 0.015) raw = 1;    // ≤1.50%: high
  else raw = 0;
  return (raw / 15) * max;
}

// ── Frequency ──────────────────────────────────────────────────────────────────

/** Weekly and monthly payers are equally valued; quarterly gets partial credit. */
export function frequencyPoints(freq: string | null | undefined): number {
  const f = (freq ?? '').toLowerCase();
  if (f.includes('week')) return 15;
  if (f.includes('month')) return 15;
  if (f.includes('quarter')) return 8;
  return 0;
}

// ── AUM / Liquidity ─────────────────────────────────────────────────────────────

function aumPointsScaled(aum: number | null, max: number): number {
  if (aum == null || aum <= 0) return 0;
  const b = aum / 1e9;
  let raw: number;
  if (b >= 10) raw = 10;
  else if (b >= 1) raw = 7;
  else if (b >= 0.1) raw = 4;
  else raw = 0;
  return (raw / 10) * max;
}

/** Backward-compatible: AUM scored out of 10 */
export function aumLiquidityPoints(aum: number | null): number {
  return aumPointsScaled(aum, 10);
}

// ── Dividend Consistency (Income) ───────────────────────────────────────────────

/**
 * Sequential payment consistency for monthly/quarterly income ETFs.
 * A "cut" is a >10% drop vs the prior payment.
 * 0 cuts = full marks, 1 cut = 50%, 2+ = 0.
 */
export function dividendConsistencyPoints(divs: DividendRow[], max: number = 20): number {
  if (divs.length < 4) return 0;
  const sorted = [...divs].sort(
    (a, b) => new Date(String(a.exDate)).getTime() - new Date(String(b.exDate)).getTime(),
  );
  let cuts = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = Number(sorted[i - 1]!.adjAmount ?? sorted[i - 1]!.amount);
    const curr = Number(sorted[i]!.adjAmount ?? sorted[i]!.amount);
    if (!(prev > 0) || !(curr >= 0)) continue;
    if (curr < prev * 0.90) cuts++;
  }
  if (cuts === 0) return max;
  if (cuts === 1) return max * 0.50;
  return 0;
}

/**
 * Delivery-based consistency for weekly income ETFs.
 *
 * Weekly option-income ETFs (YieldMax, NEOS, etc.) have naturally volatile
 * per-payment amounts because option premium varies with market conditions.
 * Comparing sequential payments is meaningless — a 15% week-to-week swing is
 * perfectly normal. What matters is whether the fund kept paying every week.
 *
 * Scores by payment delivery rate vs expected weekly schedule.
 * ≥92% delivery = full marks; ≥75% = half marks; below = 0.
 */
function weeklyPaymentDeliveryPoints(divs: DividendRow[], max: number): number {
  if (divs.length < 4) return 0;
  const sorted = [...divs].sort(
    (a, b) => new Date(String(a.exDate)).getTime() - new Date(String(b.exDate)).getTime(),
  );
  const firstMs = new Date(String(sorted[0]!.exDate)).getTime();
  const lastMs = new Date(String(sorted[sorted.length - 1]!.exDate)).getTime();
  const weeksSpanned = (lastMs - firstMs) / (7 * 24 * 60 * 60 * 1000);
  const expected = Math.max(Math.round(weeksSpanned) + 1, divs.length);
  const deliveryRatio = divs.length / expected;
  if (deliveryRatio >= 0.92) return max;
  if (deliveryRatio >= 0.75) return max * 0.5;
  return 0;
}

/**
 * Income-specific consistency check. Detects actual payment cadence from the
 * dividend data rather than trusting the stored `dividend_frequency` field,
 * which can be mislabelled (e.g. weekly ETFs stored as "monthly").
 *
 * Routing:
 *  - Detected weekly (median gap ≤10 days) → delivery-rate scoring
 *  - Detected monthly/quarterly            → sequential cut check with 20% tolerance
 *
 * The 20% tolerance (vs 10% for the income sequential check) accounts for the
 * natural month-to-month variance of option premiums in covered-call / collar ETFs.
 * A real income cut is a sustained 20 %+ reduction, not a single volatile month.
 */
function incomeConsistencyPoints(
  divs: DividendRow[],
  _freq: string | null | undefined,
  max: number,
): number {
  if (divs.length < 4) return 0;

  const sorted = [...divs].sort(
    (a, b) => new Date(String(a.exDate)).getTime() - new Date(String(b.exDate)).getTime(),
  );

  // Compute median gap from the first 20 consecutive pairs (enough to be stable)
  const gaps: number[] = [];
  for (let i = 1; i < Math.min(sorted.length, 21); i++) {
    const ms = new Date(String(sorted[i]!.exDate)).getTime() - new Date(String(sorted[i - 1]!.exDate)).getTime();
    gaps.push(ms / (24 * 60 * 60 * 1000));
  }
  gaps.sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / 2)] ?? 30;

  if (medianGap <= 10) return weeklyPaymentDeliveryPoints(divs, max);

  // Monthly / quarterly: sequential check with 20% cut tolerance
  let cuts = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = Number(sorted[i - 1]!.adjAmount ?? sorted[i - 1]!.amount);
    const curr = Number(sorted[i]!.adjAmount ?? sorted[i]!.amount);
    if (!(prev > 0) || !(curr >= 0)) continue;
    if (curr < prev * 0.80) cuts++;
  }
  if (cuts === 0) return max;
  if (cuts === 1) return max * 0.5;
  return 0;
}

// ── Dividend Annual Growth (Stability) ─────────────────────────────────────────

/**
 * Normalises a single year's payment array for stock-split artifacts.
 *
 * If any payment is below 40% of the year's median payment, it's likely a
 * post-split per-share amount (e.g. SCHD's 3-for-1 split Oct 2024 made Q4
 * payments appear 66% lower). Estimate the split ratio and scale the outlier
 * upward so annual totals remain comparable across the split year.
 */
function normalizedAnnualTotal(payments: number[]): number {
  if (payments.length === 0) return 0;
  if (payments.length === 1) return payments[0]!;

  const sorted = [...payments].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;

  const threshold = median * 0.40;
  const normal = payments.filter((p) => p >= threshold);
  const outliers = payments.filter((p) => p < threshold);

  if (outliers.length === 0) return payments.reduce((s, p) => s + p, 0);

  const outlierAvg = outliers.reduce((s, p) => s + p, 0) / outliers.length;
  const splitRatio = Math.max(2, Math.round(median / outlierAvg));

  return normal.reduce((s, p) => s + p, 0) + outliers.reduce((s, p) => s + p * splitRatio, 0);
}

/**
 * Scores dividend annual growth consistency for the Stability pillar.
 *
 * Compares full-calendar-year dividend totals (normalised for intra-year stock
 * splits) rather than sequential payments. This fixes the quarterly sequential-
 * comparison flaw where a natural Q4→Q1 step-down registers as a "cut."
 *
 * A "cut" = normalised annual total drops >5% vs the prior complete year.
 * Comparisons where the total drops >50% are skipped as structural breaks
 * (post-split base years, fund mergers, etc.) — the next year starts fresh.
 * Partial years (first year of data, current calendar year) are excluded.
 * If fewer than 2 complete years are available, returns half marks.
 */
function dividendAnnualGrowthPoints(
  divs: DividendRow[],
  freq: string | null | undefined,
  max: number,
): number {
  if (divs.length < 4) return 0;

  const f = (freq ?? '').toLowerCase();
  const minPerYear = f.includes('month') ? 10 : f.includes('week') ? 40 : 4;

  const byYear: Record<number, number[]> = {};
  for (const d of divs) {
    const year = new Date(String(d.exDate)).getFullYear();
    const amt = Number(d.adjAmount ?? d.amount) || 0;
    if (!byYear[year]) byYear[year] = [];
    byYear[year]!.push(amt);
  }

  const currentYear = new Date().getFullYear();
  const completeYears = Object.keys(byYear)
    .map(Number)
    .filter((y) => y < currentYear && byYear[y]!.length >= minPerYear)
    .sort((a, b) => a - b);

  if (completeYears.length < 2) return max * 0.5;

  const totals = completeYears.map((y) => normalizedAnnualTotal(byYear[y]!));

  let cuts = 0;
  for (let i = 1; i < totals.length; i++) {
    const prev = totals[i - 1]!;
    const curr = totals[i]!;
    if (!(prev > 0)) continue;
    // >50% drop = structural break (share split base year, merger, etc.) — skip, don't penalise
    if (curr < prev * 0.50) continue;
    if (curr < prev * 0.95) cuts++;
  }

  if (cuts === 0) return max;
  if (cuts === 1) return max * 0.5;
  return 0;
}

// ── Grade / Score ───────────────────────────────────────────────────────────────

export function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

export interface GradeResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
}

// ── Stability-specific yield curve ─────────────────────────────────────────────

/**
 * Yield curve tuned for the Stability pillar. Peaks around 4–5% — the typical range
 * for quality dividend-growth funds. Does not penalise VIG/DGRO-style low-yield funds
 * the way the income curve (which peaks at 12%) does.
 */
function stabilityYieldPointsScaled(y: number, max: number): number {
  if (y <= 0) return 0;
  let raw: number;
  if (y <= 0.02) raw = (y / 0.02) * 10;                         // 0–2 %: 0 → 10
  else if (y <= 0.05) raw = 10 + ((y - 0.02) / 0.03) * 5;      // 2–5 %: 10 → 15 (peak)
  else if (y <= 0.10) raw = 15 - ((y - 0.05) / 0.05) * 5;      // 5–10 %: 15 → 10
  else raw = 10;                                                   // 10 %+: floor
  return (raw / 15) * max;
}

// ── Pillar scorers ─────────────────────────────────────────────────────────────

/**
 * Income (max 100):
 *   35 — 1Y total return         (full marks at ≥30%; income ETFs rarely hit 50%)
 *   25 — trailing 12m yield      (no taper above 12% — total return handles NAV erosion)
 *   20 — dividend consistency    (sequential cut-check for monthly/quarterly;
 *                                  delivery-rate check for weekly option-income ETFs)
 *   12 — expense ratio           (income-specific curve; options strategies cost more to run)
 *    8 — AUM / liquidity
 */
function scoreIncome(etf: EtfRow, divs: DividendRow[]): number {
  const r1 = num(etf.return1y);
  return (
    (r1 != null && r1 > 0 ? Math.min(r1 / 0.30, 1.0) * 35 : 0) +
    yieldPointsScaled(trailingYieldDecimal(etf), 25) +
    incomeConsistencyPoints(divs, etf.dividendFrequency, 20) +
    incomeExpenseRatioPointsScaled(num(etf.expenseRatio), 12) +
    aumPointsScaled(num(etf.aum), 8)
  );
}

/**
 * Growth (max 100):
 *   50 — 1Y total return         (full marks at ≥30%; S&P 500 at 25–30% is a great year)
 *   20 — 3Y CAGR total return    (full marks at ≥15%)
 *   20 — expense ratio
 *   10 — AUM / liquidity
 */
function scoreGrowth(etf: EtfRow): number {
  const r1 = num(etf.return1y);
  const r3 = num(etf.return3y);
  return (
    (r1 != null && r1 > 0 ? Math.min(r1 / 0.30, 1.0) * 50 : 0) +
    (r3 != null && r3 > 0 ? Math.min(r3 / 0.15, 1.0) * 20 : 0) +
    expenseRatioPointsScaled(num(etf.expenseRatio), 20) +
    aumPointsScaled(num(etf.aum), 10)
  );
}

/**
 * Stability (max 100): dividend-growth ETFs (SCHD, VIG, DGRO, NOBL) should lead.
 *
 *   28 — dividend annual growth (YoY full-year totals; split-normalised; fixes quarterly bias)
 *   22 — 1Y total return         (full marks at ≥20%; steady growers rarely hit 50%)
 *   18 — 3Y CAGR total return    (full marks at ≥12%)
 *   14 — trailing 12m yield      (stability curve, peaks at 4–5%)
 *   10 — expense ratio
 *    8 — AUM / liquidity
 */
function scoreStability(etf: EtfRow, divs: DividendRow[]): number {
  const r1 = num(etf.return1y);
  const r3 = num(etf.return3y);
  return (
    dividendAnnualGrowthPoints(divs, etf.dividendFrequency, 28) +
    (r1 != null && r1 > 0 ? Math.min(r1 / 0.20, 1.0) * 22 : 0) +
    (r3 != null && r3 > 0 ? Math.min(r3 / 0.12, 1.0) * 18 : 0) +
    stabilityYieldPointsScaled(trailingYieldDecimal(etf), 14) +
    expenseRatioPointsScaled(num(etf.expenseRatio), 10) +
    aumPointsScaled(num(etf.aum), 8)
  );
}

/** Mixed: simple average of all three pillar scores. */
function scoreMixed(etf: EtfRow, divs: DividendRow[]): number {
  return (scoreIncome(etf, divs) + scoreGrowth(etf) + scoreStability(etf, divs)) / 3;
}

export function calculateYtfGrade(etf: EtfRow, dividends: DividendRow[]): GradeResult {
  const p = etf.pillar.toLowerCase();
  let score: number;
  if (p === 'income') score = scoreIncome(etf, dividends);
  else if (p === 'growth') score = scoreGrowth(etf);
  else if (p === 'stability') score = scoreStability(etf, dividends);
  else score = scoreMixed(etf, dividends);

  score = Math.max(0, Math.min(100, Math.round(score * 100) / 100));
  return { score, grade: scoreToGrade(score) };
}
