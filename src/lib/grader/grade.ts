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
 * Yield curve scaled to [max]. Peaks near 12%, tapers above (elevated yield = cut risk).
 * Raw curve tops at 30; result is proportionally scaled to the requested max.
 */
function yieldPointsScaled(y: number, max: number): number {
  if (y <= 0) return 0;
  let raw: number;
  if (y <= 0.03) raw = (y / 0.03) * 10;
  else if (y <= 0.12) raw = 10 + ((y - 0.03) / 0.09) * 20;
  else if (y < 0.20) raw = 30 - ((y - 0.12) / 0.08) * 10;
  else raw = 20;
  return (raw / 30) * max;
}

/** Backward-compatible: yield scored out of 30 */
export function yieldPoints(y: number): number {
  return yieldPointsScaled(y, 30);
}

// ── Total Return ────────────────────────────────────────────────────────────────

/**
 * 1Y total return points. r is a decimal fraction (0.25 = 25%).
 * Full marks at ≥50% 1Y return; linear below, 0 for negative.
 */
function totalReturn1yPoints(r: number | null, max: number): number {
  if (r == null || r <= 0) return 0;
  return Math.min(r / 0.50, 1.0) * max;
}

/**
 * 3Y CAGR total return points. r is a decimal fraction (0.15 = 15% CAGR).
 * Full marks at ≥25% annualised; linear below, 0 for negative.
 */
function totalReturn3yPoints(r: number | null, max: number): number {
  if (r == null || r <= 0) return 0;
  return Math.min(r / 0.25, 1.0) * max;
}

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

// ── Dividend Consistency ────────────────────────────────────────────────────────

/**
 * Scores dividend payment consistency against [max] points.
 * A "real cut" is defined as a payment that drops >10% vs the prior payment.
 * Result: 0 cuts = full marks, 1 cut = 50%, 2+ cuts = 0.
 * Fewer than 4 payments = 0 (insufficient history to assess).
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

// ── Pillar scorers ─────────────────────────────────────────────────────────────

/**
 * Income (max 100):
 *   35 — 1Y total return (primary goal is compounding income)
 *   25 — trailing 12m yield
 *   20 — dividend consistency (10% cut tolerance)
 *   12 — expense ratio
 *    8 — AUM / liquidity
 */
function scoreIncome(etf: EtfRow, divs: DividendRow[]): number {
  return (
    totalReturn1yPoints(num(etf.return1y), 35) +
    yieldPointsScaled(trailingYieldDecimal(etf), 25) +
    dividendConsistencyPoints(divs, 20) +
    expenseRatioPointsScaled(num(etf.expenseRatio), 12) +
    aumPointsScaled(num(etf.aum), 8)
  );
}

/**
 * Growth (max 100):
 *   50 — 1Y total return
 *   20 — 3Y CAGR total return
 *   20 — expense ratio
 *   10 — AUM / liquidity
 */
function scoreGrowth(etf: EtfRow): number {
  return (
    totalReturn1yPoints(num(etf.return1y), 50) +
    totalReturn3yPoints(num(etf.return3y), 20) +
    expenseRatioPointsScaled(num(etf.expenseRatio), 20) +
    aumPointsScaled(num(etf.aum), 10)
  );
}

/**
 * Stability (max 100): SCHD-class funds should top this pillar.
 *   25 — dividend consistency (no cuts, long track record)
 *   25 — 1Y total return (growth still matters)
 *   20 — trailing 12m yield (moderate yield rewarded)
 *   20 — expense ratio
 *   10 — AUM / liquidity
 */
function scoreStability(etf: EtfRow, divs: DividendRow[]): number {
  return (
    dividendConsistencyPoints(divs, 25) +
    totalReturn1yPoints(num(etf.return1y), 25) +
    yieldPointsScaled(trailingYieldDecimal(etf), 20) +
    expenseRatioPointsScaled(num(etf.expenseRatio), 20) +
    aumPointsScaled(num(etf.aum), 10)
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
