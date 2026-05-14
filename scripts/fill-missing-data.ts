/**
 * One-shot backfill for ETFs missing market data or static metadata.
 *
 * Phase 1 — Static patch:
 *   Writes expense ratio, AUM, issuer, and dividend frequency for the 65 ETFs
 *   added in May 2026. Skips tickers that already have an expenseRatio set.
 *
 * Phase 2 — Tiingo market data:
 *   Fetches price, trailing yield, returns, and inferred frequency for every
 *   ETF where lastPrice is NULL. Same logic as the sync-etfs cron.
 *
 * Usage:
 *   npx tsx scripts/fill-missing-data.ts
 */
import 'dotenv/config';

import { and, eq, isNull } from 'drizzle-orm';

import { db } from '../src/lib/db';
import { etfDividends, etfPrices, etfs } from '../src/lib/db/schema';
import {
  tiingoDividends,
  tiingoMeta,
  tiingoPrices,
  type TiingoDividendRow,
  type TiingoEodRow,
} from '../src/lib/tiingo/client';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — STATIC METADATA
// expenseRatio: decimal fraction  (0.0068 = 0.68%)
// aum: full USD                   (259_000_000 = $259M)
// ─────────────────────────────────────────────────────────────────────────────
const NEW_STATICS: Record<
  string,
  { expenseRatio: string; aum: string; issuer: string; dividendFrequency: string }
> = {
  // ── GraniteShares YieldBOOST ──────────────────────────────────────────────
  YBST: { expenseRatio: '0.0099', aum:    '3000000', issuer: 'GraniteShares', dividendFrequency: 'monthly'  },
  YBTY: { expenseRatio: '0.0099', aum:  '259000000', issuer: 'GraniteShares', dividendFrequency: 'monthly'  },
  AMYY: { expenseRatio: '0.0099', aum:   '22000000', issuer: 'GraniteShares', dividendFrequency: 'monthly'  },
  XBTY: { expenseRatio: '0.0099', aum:   '10000000', issuer: 'GraniteShares', dividendFrequency: 'monthly'  },
  COYY: { expenseRatio: '0.0099', aum:   '59000000', issuer: 'GraniteShares', dividendFrequency: 'monthly'  },
  HOYY: { expenseRatio: '0.0099', aum:   '78000000', issuer: 'GraniteShares', dividendFrequency: 'monthly'  },
  NVYY: { expenseRatio: '0.0099', aum:   '60000000', issuer: 'GraniteShares', dividendFrequency: 'monthly'  },
  TQQY: { expenseRatio: '0.0099', aum:    '8000000', issuer: 'GraniteShares', dividendFrequency: 'monthly'  },
  SMYY: { expenseRatio: '0.0099', aum:    '8000000', issuer: 'GraniteShares', dividendFrequency: 'monthly'  },
  YSPY: { expenseRatio: '0.0099', aum:   '19000000', issuer: 'GraniteShares', dividendFrequency: 'monthly'  },
  TSYY: { expenseRatio: '0.0099', aum:  '157000000', issuer: 'GraniteShares', dividendFrequency: 'monthly'  },

  // ── YieldMax Target 12 ────────────────────────────────────────────────────
  SOXY: { expenseRatio: '0.0099', aum:   '27000000', issuer: 'YieldMax',      dividendFrequency: 'monthly'  },

  // ── VistaShares Target 15 ─────────────────────────────────────────────────
  ACKY: { expenseRatio: '0.0085', aum:   '55000000', issuer: 'VistaShares',   dividendFrequency: 'monthly'  },
  OMAH: { expenseRatio: '0.0085', aum:  '675000000', issuer: 'VistaShares',   dividendFrequency: 'monthly'  },
  DRKY: { expenseRatio: '0.0085', aum:   '20000000', issuer: 'VistaShares',   dividendFrequency: 'monthly'  },
  QUSA: { expenseRatio: '0.0085', aum:   '17000000', issuer: 'VistaShares',   dividendFrequency: 'monthly'  },
  SIOO: { expenseRatio: '0.0085', aum:    '5000000', issuer: 'VistaShares',   dividendFrequency: 'monthly'  },

  // ── Simplify ──────────────────────────────────────────────────────────────
  MAXI: { expenseRatio: '0.0071', aum:   '42000000', issuer: 'Simplify',      dividendFrequency: 'monthly'  },

  // ── ProShares ─────────────────────────────────────────────────────────────
  BITO: { expenseRatio: '0.0095', aum:  '246000000', issuer: 'ProShares',     dividendFrequency: 'monthly'  },
  ISPY: { expenseRatio: '0.0050', aum:  '121000000', issuer: 'ProShares',     dividendFrequency: 'monthly'  },

  // ── NEOS (new) ────────────────────────────────────────────────────────────
  IYRI: { expenseRatio: '0.0068', aum:  '203000000', issuer: 'NEOS',          dividendFrequency: 'monthly'  },
  IAUI: { expenseRatio: '0.0068', aum:  '367000000', issuer: 'NEOS',          dividendFrequency: 'monthly'  },
  NIHI: { expenseRatio: '0.0068', aum:   '89000000', issuer: 'NEOS',          dividendFrequency: 'monthly'  },
  XSPI: { expenseRatio: '0.0068', aum:    '9000000', issuer: 'NEOS',          dividendFrequency: 'monthly'  },
  XQQI: { expenseRatio: '0.0068', aum:   '14000000', issuer: 'NEOS',          dividendFrequency: 'monthly'  },
  XBCI: { expenseRatio: '0.0068', aum:    '4000000', issuer: 'NEOS',          dividendFrequency: 'monthly'  },

  // ── Goldman Sachs (new) ───────────────────────────────────────────────────
  GPIX: { expenseRatio: '0.0029', aum:  '301000000', issuer: 'Goldman Sachs', dividendFrequency: 'monthly'  },

  // ── Amplify (new) ─────────────────────────────────────────────────────────
  BITY: { expenseRatio: '0.0065', aum:   '15000000', issuer: 'Amplify',       dividendFrequency: 'monthly'  },
  BAGY: { expenseRatio: '0.0075', aum:   '11000000', issuer: 'Amplify',       dividendFrequency: 'monthly'  },
  HCOW: { expenseRatio: '0.0055', aum:   '14000000', issuer: 'Amplify',       dividendFrequency: 'monthly'  },
  YYY:  { expenseRatio: '0.0054', aum:  '694000000', issuer: 'Amplify',       dividendFrequency: 'monthly'  },
  COWS: { expenseRatio: '0.0029', aum:   '33000000', issuer: 'Amplify',       dividendFrequency: 'quarterly'},
  BATT: { expenseRatio: '0.0059', aum:  '120000000', issuer: 'Amplify',       dividendFrequency: 'quarterly'},

  // ── Roundhill (new) ───────────────────────────────────────────────────────
  YETH: { expenseRatio: '0.0095', aum:   '97000000', issuer: 'Roundhill',     dividendFrequency: 'weekly'   },
  COIW: { expenseRatio: '0.0099', aum:   '53000000', issuer: 'Roundhill',     dividendFrequency: 'weekly'   },
  WEEK: { expenseRatio: '0.0025', aum:  '144000000', issuer: 'Roundhill',     dividendFrequency: 'weekly'   },

  // ── iShares (new) ─────────────────────────────────────────────────────────
  BALI: { expenseRatio: '0.0033', aum:  '788000000', issuer: 'iShares',       dividendFrequency: 'monthly'  },

  // ── REX Shares (new) ──────────────────────────────────────────────────────
  CEPI: { expenseRatio: '0.0065', aum:   '91000000', issuer: 'REX Shares',    dividendFrequency: 'monthly'  },
  COII: { expenseRatio: '0.0065', aum:    '4000000', issuer: 'REX Shares',    dividendFrequency: 'monthly'  },
  MSII: { expenseRatio: '0.0065', aum:    '4000000', issuer: 'REX Shares',    dividendFrequency: 'monthly'  },
  TSII: { expenseRatio: '0.0065', aum:   '46000000', issuer: 'REX Shares',    dividendFrequency: 'monthly'  },
  ULTI: { expenseRatio: '0.0099', aum:   '19000000', issuer: 'REX Shares',    dividendFrequency: 'monthly'  },
  WMTI: { expenseRatio: '0.0065', aum:    '5000000', issuer: 'REX Shares',    dividendFrequency: 'monthly'  },

  // ── TappAlpha ─────────────────────────────────────────────────────────────
  TSPY: { expenseRatio: '0.0099', aum:  '225000000', issuer: 'TappAlpha',     dividendFrequency: 'monthly'  },
  TDAQ: { expenseRatio: '0.0099', aum:  '110000000', issuer: 'TappAlpha',     dividendFrequency: 'monthly'  },
  TSYX: { expenseRatio: '0.0099', aum:   '10000000', issuer: 'TappAlpha',     dividendFrequency: 'monthly'  },
  TDAX: { expenseRatio: '0.0099', aum:   '12000000', issuer: 'TappAlpha',     dividendFrequency: 'monthly'  },

  // ── Kurv ──────────────────────────────────────────────────────────────────
  KQQQ: { expenseRatio: '0.0075', aum:  '101000000', issuer: 'Kurv',          dividendFrequency: 'monthly'  },
  KGLD: { expenseRatio: '0.0075', aum:   '89000000', issuer: 'Kurv',          dividendFrequency: 'monthly'  },

  // ── First Trust (new) ─────────────────────────────────────────────────────
  FTHI: { expenseRatio: '0.0085', aum: '2000000000', issuer: 'First Trust',   dividendFrequency: 'monthly'  },

  // ── Main Management ───────────────────────────────────────────────────────
  BUYW: { expenseRatio: '0.0079', aum: '1100000000', issuer: 'Main Management', dividendFrequency: 'monthly' },

  // ── State Street ──────────────────────────────────────────────────────────
  XLEI: { expenseRatio: '0.0024', aum:   '12000000', issuer: 'State Street',  dividendFrequency: 'monthly'  },
  XLKI: { expenseRatio: '0.0024', aum:    '5000000', issuer: 'State Street',  dividendFrequency: 'monthly'  },

  // ── FT Vest ───────────────────────────────────────────────────────────────
  KNG:  { expenseRatio: '0.0075', aum: '3599000000', issuer: 'First Trust',   dividendFrequency: 'monthly'  },

  // ── Overlay Shares ────────────────────────────────────────────────────────
  OVL:  { expenseRatio: '0.0095', aum:  '181000000', issuer: 'Overlay Shares', dividendFrequency: 'monthly' },

  // ── Kensington ────────────────────────────────────────────────────────────
  KHPI: { expenseRatio: '0.0085', aum:  '327000000', issuer: 'Kensington',    dividendFrequency: 'monthly'  },

  // ── Global X (new) ────────────────────────────────────────────────────────
  TYLG: { expenseRatio: '0.0065', aum:   '12500000', issuer: 'Global X',      dividendFrequency: 'monthly'  },

  // ── Nicholas ──────────────────────────────────────────────────────────────
  BLOX: { expenseRatio: '0.0085', aum:  '264000000', issuer: 'Nicholas',      dividendFrequency: 'monthly'  },
  GIAX: { expenseRatio: '0.0085', aum:   '90000000', issuer: 'Nicholas',      dividendFrequency: 'monthly'  },

  // ── NestYield ─────────────────────────────────────────────────────────────
  EGGY: { expenseRatio: '0.0099', aum:  '108000000', issuer: 'NestYield',     dividendFrequency: 'monthly'  },

  // ── Pacer ─────────────────────────────────────────────────────────────────
  QDPL: { expenseRatio: '0.0060', aum: '1500000000', issuer: 'Pacer',         dividendFrequency: 'quarterly'},
  QSIX: { expenseRatio: '0.0060', aum:   '18000000', issuer: 'Pacer',         dividendFrequency: 'quarterly'},

  // ── Fidelity ──────────────────────────────────────────────────────────────
  FDVV: { expenseRatio: '0.0016', aum: '8470000000', issuer: 'Fidelity',      dividendFrequency: 'quarterly'},

  // ── Charles Schwab (new) ─────────────────────────────────────────────────
  SCHP: { expenseRatio: '0.0003', aum:'15181000000', issuer: 'Charles Schwab', dividendFrequency: 'monthly' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (mirrored from sync-etfs cron)
// ─────────────────────────────────────────────────────────────────────────────

function asNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function parseIsoDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 10) return null;
  const d = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function dateYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function inferFrequency(rows: TiingoEodRow[]): string | null {
  const d = new Date();
  d.setMonth(d.getMonth() - 13);
  const cutoff = d.toISOString().slice(0, 10);
  const count = rows.filter((r) => r.date.slice(0, 10) >= cutoff && r.divCash > 0).length;
  if (count >= 10) return 'monthly';
  if (count >= 3) return 'quarterly';
  if (count >= 1) return 'annual';
  return null;
}

function computeReturns(sortedAsc: TiingoEodRow[], latest: number) {
  function makeReturn(yearsBack: number): string | null {
    const cutoff = dateYearsAgo(yearsBack);
    let lo = 0, hi = sortedAsc.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (sortedAsc[mid]!.date.slice(0, 10) <= cutoff) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (best < 0) return null;
    const anchor = asNumber(sortedAsc[best]!.adjClose ?? sortedAsc[best]!.close);
    if (!anchor || anchor <= 0) return null;
    const gapDays = (new Date(cutoff).getTime() - new Date(sortedAsc[best]!.date.slice(0, 10)).getTime()) / 86_400_000;
    if (gapDays > 10) return null;
    const ratio = latest / anchor;
    return (yearsBack === 1 ? ratio - 1 : Math.pow(ratio, 1 / yearsBack) - 1).toFixed(6);
  }
  return { return1y: makeReturn(1), return3y: makeReturn(3), return5y: makeReturn(5) };
}

function buildDivRows(
  rows: TiingoDividendRow[],
  etfId: number,
) {
  const out: Array<{
    etfId: number; exDate: string; paymentDate: string | null;
    declaredDate: string | null; recordDate: string | null;
    amount: string; yieldAtPayment: null; adjAmount: string | null;
  }> = [];

  for (const row of rows) {
    const exDate = parseIsoDate(row.exDate);
    const amount = asNumber(row.divCash);
    if (!exDate || amount == null || amount <= 0) continue;
    out.push({
      etfId, exDate,
      paymentDate: parseIsoDate(row.payDate ?? null),
      declaredDate: parseIsoDate(row.declaredDate ?? null),
      recordDate: parseIsoDate(row.recordDate ?? null),
      amount: amount.toFixed(6),
      yieldAtPayment: null,
      adjAmount: asNumber(row.adjDivCash ?? null)?.toFixed(6) ?? null,
    });
    if (out.length >= 48) break;
  }
  return out.sort((a, b) => b.exDate.localeCompare(a.exDate)).slice(0, 24);
}

function buildDivRowsFromEod(rows: TiingoEodRow[], etfId: number) {
  const out: Array<{
    etfId: number; exDate: string; paymentDate: string | null;
    declaredDate: string | null; recordDate: string | null;
    amount: string; yieldAtPayment: null; adjAmount: string | null;
  }> = [];
  for (const row of rows) {
    if (!row.divCash || row.divCash <= 0) continue;
    const exDate = parseIsoDate(row.date);
    if (!exDate) continue;
    out.push({ etfId, exDate, paymentDate: null, declaredDate: null, recordDate: null,
      amount: row.divCash.toFixed(6), yieldAtPayment: null, adjAmount: null });
    if (out.length >= 48) break;
  }
  return out.sort((a, b) => b.exDate.localeCompare(a.exDate)).slice(0, 24);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — apply statics for new ETFs missing expenseRatio
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══ Phase 1: static metadata ══');

let staticUpdated = 0, staticSkipped = 0;
for (const [ticker, vals] of Object.entries(NEW_STATICS)) {
  const existing = await db.select({ expenseRatio: etfs.expenseRatio })
    .from(etfs).where(eq(etfs.ticker, ticker)).limit(1);

  if (!existing.length) {
    console.log(`  ✗ ${ticker} not in DB — skipping`);
    staticSkipped++;
    continue;
  }

  if (existing[0]!.expenseRatio != null) {
    console.log(`  · ${ticker} already has ER — skipping`);
    staticSkipped++;
    continue;
  }

  await db.update(etfs).set({
    expenseRatio:      vals.expenseRatio,
    aum:               vals.aum,
    issuer:            vals.issuer,
    dividendFrequency: vals.dividendFrequency,
  }).where(eq(etfs.ticker, ticker));

  console.log(`  ✓ ${ticker}`);
  staticUpdated++;
}
console.log(`\nStatics: ${staticUpdated} updated, ${staticSkipped} skipped.\n`);

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — fetch Tiingo for ETFs missing price data
//
// ONE call per ETF: the EOD /prices endpoint includes divCash on each row,
// so we derive yield, frequency, and dividend history from it without needing
// the separate dividends or metadata endpoints.
// That means 500 req/hr free-tier budget covers ~500 ETFs per hour.
// ─────────────────────────────────────────────────────────────────────────────
console.log('══ Phase 2: Tiingo market data ══');

const missing = await db
  .select()
  .from(etfs)
  .where(and(eq(etfs.isActive, true), isNull(etfs.lastPrice)));

console.log(`Found ${missing.length} ETFs missing price data.\n`);

// 2-year window: enough for T12M yield, frequency inference, and 1-year return.
const twoYearsAgo = dateYearsAgo(2);
const todayUtc    = new Date().toISOString().slice(0, 10);

let marketUpdated = 0, marketFailed = 0;

for (const row of missing) {
  try {
    // Single Tiingo call — re-throw 429 so the outer catch can break cleanly.
    let historyRows: TiingoEodRow[];
    try {
      historyRows = await tiingoPrices(row.ticker, { startDate: twoYearsAgo });
    } catch (inner) {
      const msg = inner instanceof Error ? inner.message : String(inner);
      if (msg.includes('429')) throw inner; // bubble up to outer handler
      historyRows = [];
    }

    if (historyRows.length === 0) {
      console.log(`  – ${row.ticker.padEnd(6)} not in Tiingo`);
      continue; // don't count as updated, don't sleep-penalise
    }

    const sortedAsc = [...historyRows].sort((a, b) => a.date.localeCompare(b.date));
    const newest    = sortedAsc[sortedAsc.length - 1]!;
    const latestAdjClose = asNumber(newest.adjClose ?? newest.close);
    const latestPrice    = latestAdjClose;

    // Trailing 12m yield from EOD divCash
    const cutoff12m = dateYearsAgo(1);
    let trailing12mSum = 0;
    for (const r of historyRows) {
      const d = parseIsoDate(r.date);
      if (d && d >= cutoff12m && r.divCash > 0) trailing12mSum += r.divCash;
    }
    const trailingYield =
      latestPrice && latestPrice > 0 && trailing12mSum > 0
        ? (trailing12mSum / latestPrice).toFixed(6)
        : undefined;

    // 1-year return (only, from 2-year window)
    const returns = latestAdjClose && latestAdjClose > 0
      ? computeReturns(sortedAsc, latestAdjClose)
      : { return1y: null, return3y: null, return5y: null };

    // Frequency from divCash distribution pattern
    const freqInferred = inferFrequency(historyRows);

    // Upsert ETF row
    await db.update(etfs).set({
      lastPrice:        latestPrice ? latestPrice.toFixed(4) : undefined,
      lastYield:        trailingYield ?? undefined,
      trailing12mYield: trailingYield ?? undefined,
      ...(freqInferred && !row.dividendFrequency ? { dividendFrequency: freqInferred } : {}),
      ...(returns.return1y ? { return1y: returns.return1y } : {}),
      ...(returns.return3y ? { return3y: returns.return3y } : {}),
      ...(returns.return5y ? { return5y: returns.return5y } : {}),
      dataLastSynced: new Date(),
    }).where(eq(etfs.id, row.id));

    // Today's price row
    if (latestPrice && latestPrice > 0) {
      const todayRow = historyRows.find((r) => parseIsoDate(r.date) === todayUtc);
      await db.insert(etfPrices).values({
        etfId:    row.id,
        date:     todayUtc,
        open:     todayRow?.open     != null ? String(todayRow.open)     : null,
        high:     todayRow?.high     != null ? String(todayRow.high)     : null,
        low:      todayRow?.low      != null ? String(todayRow.low)      : null,
        close:    latestPrice.toFixed(4),
        adjClose: todayRow?.adjClose != null ? String(todayRow.adjClose) : latestPrice.toFixed(4),
        volume:   todayRow?.volume   ?? null,
      }).onConflictDoUpdate({
        target: [etfPrices.etfId, etfPrices.date],
        set: {
          close:    latestPrice.toFixed(4),
          adjClose: todayRow?.adjClose != null ? String(todayRow.adjClose) : latestPrice.toFixed(4),
        },
      });
    }

    // Dividend rows derived from EOD divCash
    const dbDivRows = buildDivRowsFromEod(historyRows, row.id);
    for (const dRow of dbDivRows) {
      await db.insert(etfDividends).values(dRow).onConflictDoUpdate({
        target: [etfDividends.etfId, etfDividends.exDate],
        set: { amount: dRow.amount, paymentDate: dRow.paymentDate,
               recordDate: dRow.recordDate, declaredDate: dRow.declaredDate },
      });
    }

    const yieldStr = trailingYield ? ` yield=${(Number(trailingYield) * 100).toFixed(1)}%` : '';
    console.log(`  ✓ ${row.ticker.padEnd(6)} price=$${latestPrice!.toFixed(2)}${yieldStr}`);
    marketUpdated++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('429')) {
      console.error(`\n  ⛔ Tiingo rate limit (429) after ${marketUpdated} ETFs.`);
      console.error(`  Wait ~1 hour for the quota to reset, then re-run: npm run fill:missing\n`);
      process.exit(1);
    }
    console.error(`  ✗ ${row.ticker}: ${msg}`);
    marketFailed++;
  }

  // 1 call per ETF → 500 req/hr free quota covers 500 ETFs/hr.
  // 250ms gap keeps bursts manageable while finishing in ~1 min for 168 ETFs.
  await sleep(250);
}

console.log(`\nMarket data: ${marketUpdated} fetched, ${marketFailed} failed.`);
console.log('\nDone. Refresh /etfs to see updated cards.');
