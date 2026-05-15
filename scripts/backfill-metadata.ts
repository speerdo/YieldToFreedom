/**
 * Backfill missing ETF metadata:
 *   - inception_date  (165 ETFs): from Tiingo /tiingo/daily/<ticker> startDate
 *   - return_1y/3y/5y (most ETFs): computed from adj_close in 5-year EOD history
 *
 * Only touches rows where the field is currently NULL — safe to re-run.
 *
 * Usage:
 *   npm run backfill:metadata
 */
import 'dotenv/config';

import { and, eq, isNull, or } from 'drizzle-orm';

import { db } from '../src/lib/db';
import { etfs } from '../src/lib/db/schema';
import { tiingoMeta, tiingoPrices } from '../src/lib/tiingo/client';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function dateYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/** Find the adj_close closest to a target date in a sorted-asc price array. */
function adjCloseNear(
  rows: Array<{ date: string; adjClose: number | null; close: number | null }>,
  targetDate: string,
): number | null {
  if (!rows.length) return null;
  let lo = 0, hi = rows.length - 1, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid]!.date <= targetDate) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  const row = rows[best]!;
  const v = row.adjClose ?? row.close;
  return v != null ? Number(v) : null;
}

function calcReturn(current: number, past: number | null): string | null {
  if (past == null || past <= 0) return null;
  return ((current - past) / past).toFixed(6);
}

const fiveYearsAgo = dateYearsAgo(5);
const date1yAgo = dateYearsAgo(1);
const date3yAgo = dateYearsAgo(3);
const date5yAgo = dateYearsAgo(5);

const targets = await db
  .select({
    id: etfs.id,
    ticker: etfs.ticker,
    inceptionDate: etfs.inceptionDate,
    return1y: etfs.return1y,
    return3y: etfs.return3y,
    return5y: etfs.return5y,
  })
  .from(etfs)
  .where(
    and(
      eq(etfs.isActive, true),
      or(
        isNull(etfs.inceptionDate),
        isNull(etfs.return1y),
        isNull(etfs.return3y),
        isNull(etfs.return5y),
      ),
    ),
  )
  .orderBy(etfs.ticker);

console.log(`Backfilling metadata for ${targets.length} ETFs…\n`);

let done = 0;
let skipped = 0;

for (const etf of targets) {
  try {
    const updates: Partial<{
      inceptionDate: string;
      return1y: string;
      return3y: string;
      return5y: string;
    }> = {};

    // ── Inception date from Tiingo metadata ───────────────────────────────────
    if (etf.inceptionDate == null) {
      try {
        const meta = await tiingoMeta(etf.ticker);
        if (meta.startDate) {
          const d = meta.startDate.slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(d)) updates.inceptionDate = d;
        }
      } catch {
        // metadata call failed — price history fallback will set inception date
      }
      await sleep(120);
    }

    // ── Returns from 5-year EOD history ──────────────────────────────────────
    const needReturns = etf.return1y == null || etf.return3y == null || etf.return5y == null;

    if (needReturns) {
      let priceRows: Array<{ date: string; adjClose: number | null; close: number | null }> = [];

      try {
        const raw = await tiingoPrices(etf.ticker, { startDate: fiveYearsAgo });
        priceRows = raw
          .map((r) => ({
            date: r.date.slice(0, 10),
            adjClose: r.adjClose != null ? Number(r.adjClose) : null,
            close: r.close != null ? Number(r.close) : null,
          }))
          .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
          .sort((a, b) => a.date.localeCompare(b.date));
      } catch (inner) {
        const msg = inner instanceof Error ? inner.message : String(inner);
        if (msg.includes('429')) throw inner;
      }

      if (priceRows.length > 0) {
        const latest = priceRows[priceRows.length - 1]!;
        const currentPrice = Number(latest.adjClose ?? latest.close);

        // Resolve the inception date we'll use for guards (may not be in DB yet)
        const knownInception = updates.inceptionDate ?? etf.inceptionDate ?? priceRows[0]!.date;

        if (currentPrice > 0) {
          // Only compute a return period if the ETF was alive before that lookback date
          if (etf.return1y == null && knownInception <= date1yAgo) {
            const r = calcReturn(currentPrice, adjCloseNear(priceRows, date1yAgo));
            if (r) updates.return1y = r;
          }
          if (etf.return3y == null && knownInception <= date3yAgo) {
            const r = calcReturn(currentPrice, adjCloseNear(priceRows, date3yAgo));
            if (r) updates.return3y = r;
          }
          if (etf.return5y == null && knownInception <= date5yAgo) {
            const r = calcReturn(currentPrice, adjCloseNear(priceRows, date5yAgo));
            if (r) updates.return5y = r;
          }
        }

        // Fallback: use first price row date as inception if metadata didn't give us one
        if (updates.inceptionDate == null && etf.inceptionDate == null && priceRows[0]) {
          updates.inceptionDate = priceRows[0].date;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      skipped++;
      continue;
    }

    await db.update(etfs).set(updates).where(eq(etfs.id, etf.id));

    const parts = [
      updates.inceptionDate ? `inception=${updates.inceptionDate}` : null,
      updates.return1y  ? `1y=${(Number(updates.return1y)  * 100).toFixed(1)}%` : null,
      updates.return3y  ? `3y=${(Number(updates.return3y)  * 100).toFixed(1)}%` : null,
      updates.return5y  ? `5y=${(Number(updates.return5y)  * 100).toFixed(1)}%` : null,
    ].filter(Boolean).join('  ');

    console.log(`  ✓ ${etf.ticker.padEnd(6)} ${parts}`);
    done++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('429')) {
      console.error(`\n  ⛔ Rate limit hit after ${done} ETFs. Re-run to resume.\n`);
      process.exit(1);
    }
    console.error(`  ✗ ${etf.ticker}: ${msg}`);
    skipped++;
  }

  await sleep(250);
}

console.log(`\nDone. ${done} ETFs updated, ${skipped} unchanged/skipped.`);
