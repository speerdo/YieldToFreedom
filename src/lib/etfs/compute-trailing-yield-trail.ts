/**
 * Reconstruct approximate trailing-twelve-month cash yield % at each ex-date:
 * TTMSUM(ex) = sum(dividend amounts with ex strictly after ex−365d and ≤ ex),
 * denominator = closing price from etfPrices on or before `ex`, else ETF last price fallback.
 * All dates are UTC calendar YYYY-MM-DD strings.
 */

export interface DividendExAmount {
  exDate: string;
  amount: string;
}

export interface PriceDateClose {
  date: string;
  close: string;
}

export interface YieldTrailPoint {
  exDate: string;
  yieldPct: number;
}

export function utcTodayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function subtractCalendarDaysUtc(isoYmd: string, days: number): string {
  const [y, m, d] = isoYmd.split('-').map(Number);
  const dt = Date.UTC(y!, m! - 1, d!, 12, 0, 0, 0);
  const shifted = dt - days * 86_400_000;
  return new Date(shifted).toISOString().slice(0, 10);
}

function num(dec: string): number {
  const n = Number(dec);
  return Number.isFinite(n) ? n : NaN;
}

function closeOnOrBefore(pricesAsc: PriceDateClose[], exDate: string): number | null {
  if (!pricesAsc.length) return null;
  let lo = 0;
  let hi = pricesAsc.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const cmp = pricesAsc[mid]!.date.localeCompare(exDate);
    if (cmp <= 0) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (best < 0) return null;
  const raw = num(pricesAsc[best]!.close);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function computeTrailingYieldTrail(
  dividends: DividendExAmount[],
  pricesAsc: PriceDateClose[],
  lastPriceFallback: number | null,
): YieldTrailPoint[] {
  const divs = [...dividends].sort((a, b) => a.exDate.localeCompare(b.exDate));
  const today = utcTodayISODate();
  const horizonStart = subtractCalendarDaysUtc(today, 420);
  const divsWindow = divs.filter((d) => d.exDate.localeCompare(horizonStart) >= 0);

  const out: YieldTrailPoint[] = [];
  for (let i = 0; i < divsWindow.length; i++) {
    const ex = divsWindow[i]!.exDate;
    const winStartExclusive = subtractCalendarDaysUtc(ex, 365);

    let ttmSum = 0;
    for (let k = 0; k <= i; k++) {
      const d = divsWindow[k]!;
      if (d.exDate.localeCompare(winStartExclusive) <= 0) continue;
      if (d.exDate.localeCompare(ex) > 0) continue;
      const a = num(d.amount);
      if (!Number.isFinite(a)) continue;
      ttmSum += a;
    }

    if (!(ttmSum > 0)) continue;

    const px = closeOnOrBefore(pricesAsc, ex) ?? lastPriceFallback;
    if (!(px != null && px > 0)) continue;

    out.push({
      exDate: ex,
      yieldPct: (ttmSum / px) * 100,
    });
  }

  return out;
}
