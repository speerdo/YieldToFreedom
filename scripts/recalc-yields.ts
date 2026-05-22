/**
 * Recalculate trailing_12m_yield from the etf_dividends table (source of truth).
 *
 * The nightly sync computes yield from Tiingo API responses, which can miss
 * historical dividends (e.g. TOPW/WPAY ticker rename). This script uses the
 * dividend rows already stored in the DB plus last_price.
 *
 * Usage:
 *   npx tsx scripts/recalc-yields.ts          # apply updates
 *   npx tsx scripts/recalc-yields.ts --dry-run # report only
 */
import 'dotenv/config';

import { sql } from 'drizzle-orm';

import { db } from '../src/lib/db';

const dryRun = process.argv.includes('--dry-run');

type YieldChange = {
  ticker: string;
  old_pct: string;
  new_pct: string;
  diff_pp: string;
};

const changes = await db.execute<YieldChange>(sql`
  WITH calc AS (
    SELECT
      e.id,
      e.ticker,
      e.trailing_12m_yield AS old_yield,
      SUM(COALESCE(d.adj_amount, d.amount)) / e.last_price AS new_yield
    FROM etfs e
    JOIN etf_dividends d
      ON d.etf_id = e.id
      AND d.ex_date >= CURRENT_DATE - INTERVAL '1 year'
    WHERE e.is_active = true
      AND e.last_price > 0
    GROUP BY e.id, e.ticker, e.last_price, e.trailing_12m_yield
    HAVING SUM(COALESCE(d.adj_amount, d.amount)) > 0
  )
  SELECT
    ticker,
    ROUND((COALESCE(old_yield, 0) * 100)::numeric, 2)::text || '%' AS old_pct,
    ROUND((new_yield * 100)::numeric, 2)::text || '%' AS new_pct,
    ROUND((ABS(new_yield - COALESCE(old_yield, 0)) * 100)::numeric, 2)::text || 'pp' AS diff_pp
  FROM calc
  WHERE ABS(new_yield - COALESCE(old_yield, 0)) > 0.0001
  ORDER BY ABS(new_yield - COALESCE(old_yield, 0)) DESC
`);

const rows = changes.rows ?? [];

if (!dryRun && rows.length > 0) {
  const result = await db.execute(sql`
    WITH calc AS (
      SELECT
        e.id,
        SUM(COALESCE(d.adj_amount, d.amount)) / e.last_price AS new_yield
      FROM etfs e
      JOIN etf_dividends d
        ON d.etf_id = e.id
        AND d.ex_date >= CURRENT_DATE - INTERVAL '1 year'
      WHERE e.is_active = true
        AND e.last_price > 0
      GROUP BY e.id, e.last_price, e.trailing_12m_yield
      HAVING SUM(COALESCE(d.adj_amount, d.amount)) > 0
        AND ABS(SUM(COALESCE(d.adj_amount, d.amount)) / e.last_price - COALESCE(e.trailing_12m_yield, 0)) > 0.0001
    )
    UPDATE etfs e
    SET
      last_yield = calc.new_yield,
      trailing_12m_yield = calc.new_yield,
      updated_at = NOW()
    FROM calc
    WHERE e.id = calc.id
  `);
  console.log(`Applied updates (${result.rowCount ?? rows.length} rows)\n`);
} else {
  console.log(dryRun ? 'DRY RUN — no changes written\n' : 'No changes needed\n');
}

console.log(`ETFs needing correction: ${rows.length}\n`);

if (rows.length === 0) {
  console.log('All yields already match dividend table.');
} else {
  console.log('Changes:');
  for (const c of rows) {
    console.log(`  ${c.ticker.padEnd(6)} ${c.old_pct.padStart(8)} → ${c.new_pct.padStart(8)}  (${c.diff_pp})`);
  }
}
