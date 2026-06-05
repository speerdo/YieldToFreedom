/**
 * Backfill ETF description, top holdings, and sector weights.
 *
 *   description       – from Tiingo /tiingo/daily/<ticker> (description field)
 *   holdingsJson      – top 15 holdings from FMP /stable/etf-holder
 *   sectorWeightsJson – from FMP /stable/etf-sector-weighting
 *
 * Only fills rows where the column is currently NULL – safe to re-run.
 * Pass --force to overwrite all rows.
 *
 * Usage:
 *   npx tsx scripts/backfill-etf-descriptions.ts
 *   npx tsx scripts/backfill-etf-descriptions.ts --force
 */
import 'dotenv/config';

import { eq, isNull, or } from 'drizzle-orm';

import { db } from '../src/lib/db';
import { etfs } from '../src/lib/db/schema';
import { fmpGet } from '../src/lib/fmp/client';
import { tiingoGet } from '../src/lib/tiingo/client';

const FORCE = process.argv.includes('--force');
const TOP_HOLDINGS = 15;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ── FMP response shapes ──────────────────────────────────────────────────────

interface FmpHolder {
  symbol?: string;
  asset?: string;
  name?: string;
  weightPercentage?: number | string;
}

interface FmpSectorWeight {
  sector?: string;
  weightPercentage?: number | string;
}

interface TiingoMetaDescription {
  description?: string;
}

function parseWeight(v: number | string | undefined): number {
  if (v == null) return 0;
  const s = String(v).replace('%', '').trim();
  return parseFloat(s) || 0;
}

async function fetchDescription(ticker: string): Promise<string | null> {
  try {
    const meta = await tiingoGet<TiingoMetaDescription>(`/tiingo/daily/${ticker.toLowerCase()}`);
    const desc = meta.description?.trim();
    return desc && desc.length > 20 ? desc : null;
  } catch {
    return null;
  }
}

async function fetchHoldings(ticker: string): Promise<Array<{ ticker: string; name: string; weightPercentage: number }> | null> {
  try {
    const rows = await fmpGet<FmpHolder[]>('/etf-holder', { symbol: ticker });
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows
      .slice(0, TOP_HOLDINGS)
      .map((r) => ({
        ticker: (r.asset ?? r.symbol ?? '').toUpperCase(),
        name: r.name ?? '',
        weightPercentage: parseWeight(r.weightPercentage),
      }))
      .filter((r) => r.ticker);
  } catch {
    return null;
  }
}

async function fetchSectorWeights(ticker: string): Promise<Array<{ sector: string; weightPercentage: number }> | null> {
  try {
    const rows = await fmpGet<FmpSectorWeight[]>('/etf-sector-weightings', { symbol: ticker });
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows
      .map((r) => ({
        sector: r.sector ?? '',
        weightPercentage: parseWeight(r.weightPercentage),
      }))
      .filter((r) => r.sector)
      .sort((a, b) => b.weightPercentage - a.weightPercentage);
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const targets = await db
  .select({
    id: etfs.id,
    ticker: etfs.ticker,
    description: etfs.description,
    holdingsJson: etfs.holdingsJson,
    sectorWeightsJson: etfs.sectorWeightsJson,
  })
  .from(etfs)
  .where(
    FORCE
      ? eq(etfs.isActive, true)
      : or(
          isNull(etfs.description),
          isNull(etfs.holdingsJson),
          isNull(etfs.sectorWeightsJson),
        ),
  )
  .orderBy(etfs.ticker);

console.log(`Backfilling descriptions for ${targets.length} ETFs (force=${FORCE})…\n`);

let done = 0;
let skipped = 0;

for (const etf of targets) {
  try {
    const updates: {
      description?: string;
      holdingsJson?: Array<{ ticker: string; name: string; weightPercentage: number }>;
      sectorWeightsJson?: Array<{ sector: string; weightPercentage: number }>;
    } = {};

    // Description from Tiingo
    if (FORCE || etf.description == null) {
      const desc = await fetchDescription(etf.ticker);
      if (desc) updates.description = desc;
      await sleep(150);
    }

    // Holdings from FMP
    if (FORCE || etf.holdingsJson == null) {
      const holdings = await fetchHoldings(etf.ticker);
      if (holdings && holdings.length > 0) updates.holdingsJson = holdings;
      await sleep(200);
    }

    // Sector weights from FMP
    if (FORCE || etf.sectorWeightsJson == null) {
      const sectors = await fetchSectorWeights(etf.ticker);
      if (sectors && sectors.length > 0) updates.sectorWeightsJson = sectors;
      await sleep(200);
    }

    if (Object.keys(updates).length === 0) {
      skipped++;
      continue;
    }

    await db.update(etfs).set(updates).where(eq(etfs.id, etf.id));

    const parts = [
      updates.description ? `desc(${updates.description.length}ch)` : null,
      updates.holdingsJson ? `${updates.holdingsJson.length} holdings` : null,
      updates.sectorWeightsJson ? `${updates.sectorWeightsJson.length} sectors` : null,
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
}

console.log(`\nDone. ${done} updated, ${skipped} unchanged/skipped.`);
