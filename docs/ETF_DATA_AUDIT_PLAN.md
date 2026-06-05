# ETF Data Audit And Historical Backfill Plan

Updated: 2026-06-04

## Live Neon Findings

- Neon project: `YieldToFreedom` (`wandering-cake-27721670`).
- Active ETF rows: 229.
- Price coverage: 229/229 active ETFs have at least one `etf_prices` row.
- Current stored price window after backfill: earliest `2016-06-06`, latest `2026-06-03`.
- Dividend coverage: 227/229 active ETFs have at least one `etf_dividends` row.
- Adjusted dividend coverage: 418 `adj_amount` rows are populated for known split-affected tickers.
- Placeholder price rows: 744 rows still have no OHLC/volume, caused by older sync jobs writing "today" even when Tiingo's newest row was an older trading day.

## Root Causes Found

1. Raw close was used for app charts.
   - `etf_prices.close` is raw, so split ETFs show false chart cliffs.
   - SCHD drops from about `$84` to `$28` on `2024-10-11` in raw close, while `adj_close` remains continuous.
   - Similar split cliffs appear for HDV, VGT, VUG, XLK, SCHG, SCHP, SCHV, and SCHH.

2. Dividend history did not store adjusted amounts.
   - SCHD pre-split dividends are stored as raw pre-split amounts, e.g. `$0.7545` in 2024.
   - After the 3-for-1 split, newer SCHD dividends are around `$0.26`.
   - This makes long dividend charts and payment-change calculations look wrong unless `adj_amount` is populated and used.

3. Historical backfill windows were too short.
   - Prices were capped at 5 years.
   - Dividends were capped at 3 years and only targeted ETFs with zero dividend rows.
   - Older ETFs therefore cannot show long-lived history even when Tiingo has it.

4. Sync jobs synthesized non-trading-day price rows.
   - Local sync, Vercel cron sync, and the missing-data filler inserted a row for the current UTC date even when that date was not present in Tiingo's EOD response.

## Code Changes Made

- Performance charts now use `adj_close` when available.
- `/api/etfs/[ticker]/price-history` accepts `range=1y|3y|5y|10y|max`.
- ETF detail and compare charts now expose `1Y`, `3Y`, `5Y`, `10Y`, and `Max` controls.
- Price backfill now supports:
  - `npm run backfill:prices -- --years=10`
  - `npm run backfill:prices -- --start=2010-01-01`
  - re-runnable upserts that refresh existing OHLC/adjusted-close rows.
- Dividend backfill now supports the same range arguments, refreshes all active dividend-paying ETFs, accepts targeted `--tickers=...` runs, and calculates split-adjusted `adj_amount` from Tiingo split factors.
- Sync scripts now write the latest actual Tiingo trading date instead of creating weekend/holiday placeholders.
- ETF detail dividend stats/charts/tables now prefer `adj_amount` when it exists.

## Recommended Execution Order

Completed on 2026-06-04 against Neon:

```bash
npm run backfill:prices -- --years=10
npm run backfill:dividends -- --years=10
npm run backfill:dividends -- --years=10 --tickers=SCHD,HDV,VGT,VUG,XLK,SCHG,SCHP,SCHV,SCHH
npx tsx scripts/recalc-yields.ts
npm run run-grader
```

Final verification:

- 229/229 active ETFs have price rows.
- 227/229 active ETFs have dividend rows.
- `npx tsx scripts/recalc-yields.ts --dry-run` reports no remaining yield corrections.
- 229 ETFs were regraded.

If this needs to be repeated in another environment:

1. Deploy or run the code changes locally against the target DB.
2. Backfill longer price history:

```bash
npm run backfill:prices -- --years=10
```

3. Backfill longer adjusted dividend history:

```bash
npm run backfill:dividends -- --years=10
```

4. Backfill split-adjusted dividend amounts for known split-affected ETFs:

```bash
npm run backfill:dividends -- --years=10 --tickers=SCHD,HDV,VGT,VUG,XLK,SCHG,SCHP,SCHV,SCHH
```

5. Recalculate yields and re-run grading after market data changes:

```bash
npx tsx scripts/recalc-yields.ts
npm run run-grader
```

6. Smoke test:
   - `/etfs/SCHD`
   - `/compare?t=SCHD,VIG,VOO`
   - split-affected tickers: `HDV`, `VGT`, `VUG`, `XLK`, `SCHG`, `SCHV`.

## Production Cleanup Requiring Approval

Do not run this automatically without approval because it deletes production rows.

Potential cleanup target: placeholder price rows where `open`, `high`, `low`, and `volume` are all null and the date is not an actual Tiingo trading row. Current count from Neon audit: 744.

Safer approach:

1. Run a read-only count grouped by ticker/date.
2. Delete only placeholder rows that duplicate the previous market close and have no OHLC/volume.
3. Re-run `npm run backfill:prices -- --years=10` to restore any valid rows.

## Open Follow-Ups

- Consider adding a first-class `split_factor` column to `etf_prices`; the current dividend backfill computes split adjustment from Tiingo during the run but does not persist the split factor itself.
- Consider adding a data-quality job that alerts on raw close jumps over 40% where `adj_close` is continuous.
- Consider adding `source` / `source_synced_at` columns if the project later mixes Tiingo, FMP, and issuer factsheets.
