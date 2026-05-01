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

/** SPEC §11 — yield component max 30, ≥20% yield capped at 20 pts */
export function yieldPoints(y: number): number {
  if (y <= 0) return 0;
  if (y >= 0.20) return 20;
  if (y <= 0.03) return (y / 0.03) * 10;
  if (y <= 0.12) return 10 + ((y - 0.03) / (0.12 - 0.03)) * 20;
  return 30 - ((y - 0.12) / (0.20 - 0.12)) * 10;
}

/** Expense ratio as decimal fraction (e.g. 0.0035 = 0.35%) */
export function expenseRatioPoints(er: number | null): number {
  if (er == null) return 0;
  const e = er;
  if (e <= 0) return 15;
  if (e <= 0.002) return 13;
  if (e <= 0.0035) return 10;
  if (e <= 0.006) return 7;
  if (e <= 0.0075) return 4;
  if (e <= 0.01) return 1;
  return 0;
}

export function frequencyPoints(freq: string | null | undefined): number {
  const f = (freq ?? '').toLowerCase();
  if (f.includes('month')) return 15;
  if (f.includes('quarter')) return 8;
  return 0;
}

/** AUM in USD (full dollars). */
export function aumLiquidityPoints(aum: number | null): number {
  if (aum == null || aum <= 0) return 0;
  const b = aum / 1e9;
  if (b >= 10) return 10;
  if (b >= 1) return 7;
  if (b >= 0.1) return 4;
  return 0;
}

export function pillarFitPoints(etf: EtfRow): number {
  const p = etf.pillar.toLowerCase();
  const c = (etf.category ?? '').toLowerCase();
  if (p === 'income' && (c.includes('covered') || c.includes('premium') || c.includes('yield'))) return 10;
  if (p === 'income') return 7;
  if (p === 'stability' && (c.includes('dividend') || c.includes('aristocrat') || c.includes('growth'))) return 10;
  if (p === 'stability') return 7;
  if (p === 'growth' && (c.includes('total-return') || c.includes('growth') || c === 'total-return')) return 10;
  if (p === 'growth') return 7;
  if (p === 'mixed') return 6;
  return 5;
}

export function dividendConsistencyPoints(divs: DividendRow[]): number {
  if (divs.length < 4) return 10;
  const sorted = [...divs].sort(
    (a, b) => new Date(String(a.exDate)).getTime() - new Date(String(b.exDate)).getTime(),
  );
  let cuts = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = Number(sorted[i - 1]!.adjAmount ?? sorted[i - 1]!.amount);
    const curr = Number(sorted[i]!.adjAmount ?? sorted[i]!.amount);
    if (!(prev > 0) || !(curr >= 0)) continue;
    if (curr < prev * 0.99) cuts++;
  }
  if (cuts === 0) return 20;
  if (cuts === 1) return 10;
  return 0;
}

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

export function calculateYtfGrade(etf: EtfRow, dividends: DividendRow[]): GradeResult {
  const y = trailingYieldDecimal(etf);
  let score =
    yieldPoints(y) +
    dividendConsistencyPoints(dividends) +
    expenseRatioPoints(num(etf.expenseRatio)) +
    frequencyPoints(etf.dividendFrequency ?? null) +
    aumLiquidityPoints(num(etf.aum)) +
    pillarFitPoints(etf);
  score = Math.max(0, Math.min(100, Math.round(score * 100) / 100));
  return { score, grade: scoreToGrade(score) };
}
