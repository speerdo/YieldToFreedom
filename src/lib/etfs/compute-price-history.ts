/**
 * Compute price and total-return series from raw DB rows.
 *
 * pricePoints: raw closing price (e.g. 47.23)
 * totalReturnPoints: cumulative % return from start (0 = start date, +127 = up 127%)
 *   TR_t = TR_{t-1} × (close_t + div_t) / close_{t-1}
 */

export interface PricePoint {
  x: number; // ms since epoch (UTC noon)
  value: number; // pricePoints: close price; totalReturnPoints: % return from 0
}

export interface PriceHistoryResult {
  pricePoints: PricePoint[];
  totalReturnPoints: PricePoint[];
}

export function computePriceAndTotalReturn(
  pricesAsc: Array<{ date: string; close: string }>,
  dividends: Array<{ exDate: string; amount: string }>,
): PriceHistoryResult {
  if (!pricesAsc.length) return { pricePoints: [], totalReturnPoints: [] };

  const baseClose = Number(pricesAsc[0]!.close);
  if (!(baseClose > 0)) return { pricePoints: [], totalReturnPoints: [] };

  const divByDate = new Map<string, number>();
  for (const d of dividends) {
    const amt = Number(d.amount);
    if (Number.isFinite(amt) && amt > 0) {
      divByDate.set(String(d.exDate).slice(0, 10), (divByDate.get(String(d.exDate).slice(0, 10)) ?? 0) + amt);
    }
  }

  const pricePoints: PricePoint[] = [];
  const totalReturnPoints: PricePoint[] = [];

  let trValue = 100;
  let prevClose = baseClose;

  for (const row of pricesAsc) {
    const close = Number(row.close);
    if (!Number.isFinite(close) || close <= 0) continue;

    const dateStr = String(row.date).slice(0, 10);
    const ms = Date.parse(`${dateStr}T12:00:00Z`);
    if (!Number.isFinite(ms)) continue;

    pricePoints.push({ x: ms, value: close });

    const div = divByDate.get(dateStr) ?? 0;
    trValue = (trValue * (close + div)) / prevClose;
    prevClose = close;
    totalReturnPoints.push({ x: ms, value: trValue - 100 });
  }

  return { pricePoints, totalReturnPoints };
}
