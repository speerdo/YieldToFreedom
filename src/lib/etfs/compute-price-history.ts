/**
 * Compute price and total-return series from raw DB rows.
 *
 * pricePoints: adjusted closing price when available, falling back to raw close.
 * totalReturnPoints: cumulative % return from start (0 = start date, +127 = up 127%).
 *
 * Tiingo's adjusted close is the most reliable stored series for charting across
 * splits. Raw close creates false cliffs for split ETFs such as SCHD.
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
  pricesAsc: Array<{ date: string; close: string; adjClose?: string | null }>,
  dividends: Array<{ exDate: string; amount: string }>,
): PriceHistoryResult {
  if (!pricesAsc.length) return { pricePoints: [], totalReturnPoints: [] };

  const firstClose = usableClose(pricesAsc[0]!);
  if (!(firstClose > 0)) return { pricePoints: [], totalReturnPoints: [] };

  const divByDate = new Map<string, number>();
  for (const d of dividends) {
    const amt = Number(d.amount);
    if (Number.isFinite(amt) && amt > 0) {
      divByDate.set(String(d.exDate).slice(0, 10), (divByDate.get(String(d.exDate).slice(0, 10)) ?? 0) + amt);
    }
  }

  const pricePoints: PricePoint[] = [];
  const totalReturnPoints: PricePoint[] = [];

  const hasAdjustedClose = pricesAsc.some((row) => usableAdjustedClose(row) != null);
  const firstAdjustedClose = hasAdjustedClose ? usableAdjustedClose(pricesAsc[0]!) : null;
  let trValue = 100;
  let prevClose = firstClose;

  for (const row of pricesAsc) {
    const close = usableClose(row);
    if (!Number.isFinite(close) || close <= 0) continue;

    const dateStr = String(row.date).slice(0, 10);
    const ms = Date.parse(`${dateStr}T12:00:00Z`);
    if (!Number.isFinite(ms)) continue;

    pricePoints.push({ x: ms, value: close });

    const adjustedClose = hasAdjustedClose ? usableAdjustedClose(row) : null;
    if (adjustedClose != null && firstAdjustedClose != null && firstAdjustedClose > 0) {
      totalReturnPoints.push({ x: ms, value: (adjustedClose / firstAdjustedClose - 1) * 100 });
    } else {
      const div = divByDate.get(dateStr) ?? 0;
      trValue = (trValue * (close + div)) / prevClose;
      totalReturnPoints.push({ x: ms, value: trValue - 100 });
    }
    prevClose = close;
  }

  return { pricePoints, totalReturnPoints };
}

function usableClose(row: { close: string; adjClose?: string | null }): number {
  const adjusted = usableAdjustedClose(row);
  if (adjusted != null) return adjusted;
  return Number(row.close);
}

function usableAdjustedClose(row: { adjClose?: string | null }): number | null {
  if (row.adjClose == null) return null;
  const value = Number(row.adjClose);
  return Number.isFinite(value) && value > 0 ? value : null;
}
