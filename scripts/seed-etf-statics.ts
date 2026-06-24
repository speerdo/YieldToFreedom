/**
 * Seed static ETF data that Tiingo's free/standard tier does not provide:
 * expense ratio, AUM, issuer name, and dividend frequency.
 *
 * Values are sourced from fund issuers' official fact sheets (as of May 2026).
 * Re-run whenever these change materially (ER changes rarely; AUM ~ quarterly).
 *
 * Usage:
 *   npx tsx scripts/seed-etf-statics.ts
 */
import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { db } from '../src/lib/db';
import { etfs } from '../src/lib/db/schema';

// expenseRatio stored as decimal fraction (0.0035 = 0.35%)
// aum stored in full USD (37_000_000_000 = $37B)
const STATICS: Record<
  string,
  {
    expenseRatio: string;
    aum: string;
    issuer: string;
    dividendFrequency: string;
  }
> = {
  // ── Covered-call - JPMorgan ───────────────────────────────────────────────
  JEPI:  { expenseRatio: '0.0035', aum: '37000000000',   issuer: 'JPMorgan',        dividendFrequency: 'monthly'  },
  JEPQ:  { expenseRatio: '0.0035', aum: '22000000000',   issuer: 'JPMorgan',        dividendFrequency: 'monthly'  },
  // ── Covered-call - Amplify ────────────────────────────────────────────────
  DIVO:  { expenseRatio: '0.0055', aum: '3400000000',    issuer: 'Amplify',         dividendFrequency: 'monthly'  },
  IDVO:  { expenseRatio: '0.0055', aum: '350000000',     issuer: 'Amplify',         dividendFrequency: 'monthly'  },
  QDVO:  { expenseRatio: '0.0059', aum: '80000000',      issuer: 'Amplify',         dividendFrequency: 'monthly'  },
  // ── Covered-call - Global X ───────────────────────────────────────────────
  QYLD:  { expenseRatio: '0.0060', aum: '7300000000',    issuer: 'Global X',        dividendFrequency: 'monthly'  },
  XYLD:  { expenseRatio: '0.0060', aum: '2600000000',    issuer: 'Global X',        dividendFrequency: 'monthly'  },
  RYLD:  { expenseRatio: '0.0060', aum: '1400000000',    issuer: 'Global X',        dividendFrequency: 'monthly'  },
  // ── Covered-call - NEOS ───────────────────────────────────────────────────
  SPYI:  { expenseRatio: '0.0068', aum: '3200000000',    issuer: 'NEOS',            dividendFrequency: 'monthly'  },
  QQQI:  { expenseRatio: '0.0068', aum: '2000000000',    issuer: 'NEOS',            dividendFrequency: 'monthly'  },
  IWMI:  { expenseRatio: '0.0068', aum: '300000000',     issuer: 'NEOS',            dividendFrequency: 'monthly'  },
  BTCI:  { expenseRatio: '0.0068', aum: '200000000',     issuer: 'NEOS',            dividendFrequency: 'monthly'  },
  QQQH:  { expenseRatio: '0.0068', aum: '150000000',     issuer: 'NEOS',            dividendFrequency: 'monthly'  },
  SPYH:  { expenseRatio: '0.0068', aum: '150000000',     issuer: 'NEOS',            dividendFrequency: 'monthly'  },
  // ── Covered-call - Goldman Sachs ──────────────────────────────────────────
  GPIQ:  { expenseRatio: '0.0029', aum: '2500000000',    issuer: 'Goldman Sachs',   dividendFrequency: 'monthly'  },
  // ── Covered-call - REX Shares ─────────────────────────────────────────────
  FEPI:  { expenseRatio: '0.0065', aum: '500000000',     issuer: 'REX Shares',      dividendFrequency: 'monthly'  },
  AIPI:  { expenseRatio: '0.0065', aum: '500000000',     issuer: 'REX Shares',      dividendFrequency: 'monthly'  },
  // ── Covered-call - Nationwide ─────────────────────────────────────────────
  NUSI:  { expenseRatio: '0.0068', aum: '800000000',     issuer: 'Nationwide',      dividendFrequency: 'monthly'  },
  // ── Covered-call - Defiance ───────────────────────────────────────────────
  IWMY:  { expenseRatio: '0.0099', aum: '200000000',     issuer: 'Defiance',        dividendFrequency: 'monthly'  },
  WDTE:  { expenseRatio: '0.0099', aum: '800000000',     issuer: 'Defiance',        dividendFrequency: 'weekly'   },
  QQQY:  { expenseRatio: '0.0099', aum: '500000000',     issuer: 'Defiance',        dividendFrequency: 'weekly'   },
  SPYT:  { expenseRatio: '0.0099', aum: '200000000',     issuer: 'Defiance',        dividendFrequency: 'monthly'  },
  // ── Covered-call - Roundhill ──────────────────────────────────────────────
  XDTE:  { expenseRatio: '0.0095', aum: '600000000',     issuer: 'Roundhill',       dividendFrequency: 'weekly'   },
  QDTE:  { expenseRatio: '0.0095', aum: '400000000',     issuer: 'Roundhill',       dividendFrequency: 'weekly'   },
  RDTE:  { expenseRatio: '0.0095', aum: '300000000',     issuer: 'Roundhill',       dividendFrequency: 'weekly'   },
  MAGY:  { expenseRatio: '0.0095', aum: '200000000',     issuer: 'Roundhill',       dividendFrequency: 'weekly'   },
  YBTC:  { expenseRatio: '0.0095', aum: '200000000',     issuer: 'Roundhill',       dividendFrequency: 'weekly'   },

  // ── Option-income - Simplify ──────────────────────────────────────────────
  SVOL:  { expenseRatio: '0.0104', aum: '900000000',     issuer: 'Simplify',        dividendFrequency: 'monthly'  },
  // ── Option-income - YieldMax basket funds ─────────────────────────────────
  YMAG:  { expenseRatio: '0.0129', aum: '800000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  YMAX:  { expenseRatio: '0.0129', aum: '2000000000',    issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  ULTY:  { expenseRatio: '0.0099', aum: '700000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  // ── Option-income - YieldMax single-stock ─────────────────────────────────
  TSLY:  { expenseRatio: '0.0099', aum: '1500000000',    issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  NVDY:  { expenseRatio: '0.0099', aum: '1400000000',    issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  AMZY:  { expenseRatio: '0.0099', aum: '500000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  MSFO:  { expenseRatio: '0.0099', aum: '400000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  GOOY:  { expenseRatio: '0.0099', aum: '300000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  APLY:  { expenseRatio: '0.0099', aum: '400000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  MSTY:  { expenseRatio: '0.0099', aum: '4000000000',    issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  CONY:  { expenseRatio: '0.0099', aum: '1200000000',    issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  PLTY:  { expenseRatio: '0.0099', aum: '2000000000',    issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  AMDY:  { expenseRatio: '0.0099', aum: '300000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  FBY:   { expenseRatio: '0.0099', aum: '500000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  NFLY:  { expenseRatio: '0.0099', aum: '200000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  PYPY:  { expenseRatio: '0.0099', aum: '150000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  XOMO:  { expenseRatio: '0.0099', aum: '200000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  BRKC:  { expenseRatio: '0.0099', aum: '100000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  DISO:  { expenseRatio: '0.0099', aum: '100000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  SMCY:  { expenseRatio: '0.0099', aum: '200000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  CRCO:  { expenseRatio: '0.0099', aum: '100000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  SNOY:  { expenseRatio: '0.0099', aum: '100000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  RDYY:  { expenseRatio: '0.0099', aum: '100000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  DRAY:  { expenseRatio: '0.0099', aum: '80000000',      issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  CVNY:  { expenseRatio: '0.0099', aum: '100000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  HIYY:  { expenseRatio: '0.0099', aum: '80000000',      issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  ABNY:  { expenseRatio: '0.0099', aum: '80000000',      issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  BABO:  { expenseRatio: '0.0099', aum: '80000000',      issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  GMEY:  { expenseRatio: '0.0099', aum: '80000000',      issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  RBLY:  { expenseRatio: '0.0099', aum: '80000000',      issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  HOOY:  { expenseRatio: '0.0099', aum: '80000000',      issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  TSMY:  { expenseRatio: '0.0099', aum: '80000000',      issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  MRNY:  { expenseRatio: '0.0099', aum: '100000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  MARO:  { expenseRatio: '0.0099', aum: '100000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  // ── Option-income - YieldMax sector / portfolio ───────────────────────────
  GDXY:  { expenseRatio: '0.0099', aum: '200000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  CHPY:  { expenseRatio: '0.0099', aum: '150000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  GPTY:  { expenseRatio: '0.0099', aum: '150000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  AIYY:  { expenseRatio: '0.0099', aum: '100000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  LFGY:  { expenseRatio: '0.0099', aum: '100000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  MINY:  { expenseRatio: '0.0099', aum: '80000000',      issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  OARK:  { expenseRatio: '0.0099', aum: '200000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  YBIT:  { expenseRatio: '0.0099', aum: '300000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  // ── Option-income - YieldMax short / inverse ──────────────────────────────
  CRSH:  { expenseRatio: '0.0099', aum: '200000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  DIPS:  { expenseRatio: '0.0099', aum: '150000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  WNTR:  { expenseRatio: '0.0099', aum: '100000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  FIAT:  { expenseRatio: '0.0099', aum: '80000000',      issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  YQQQ:  { expenseRatio: '0.0099', aum: '100000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  // ── Option-income - YieldMax 0DTE / target-distribution ───────────────────
  QDTY:  { expenseRatio: '0.0099', aum: '200000000',     issuer: 'YieldMax',        dividendFrequency: 'weekly'   },
  SDTY:  { expenseRatio: '0.0099', aum: '300000000',     issuer: 'YieldMax',        dividendFrequency: 'weekly'   },
  RDTY:  { expenseRatio: '0.0099', aum: '150000000',     issuer: 'YieldMax',        dividendFrequency: 'weekly'   },
  MSST:  { expenseRatio: '0.0099', aum: '300000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  NVIT:  { expenseRatio: '0.0099', aum: '200000000',     issuer: 'YieldMax',        dividendFrequency: 'monthly'  },
  // ── Option-income - Roundhill WeeklyPay ───────────────────────────────────
  NVDW:  { expenseRatio: '0.0099', aum: '200000000',     issuer: 'Roundhill',       dividendFrequency: 'weekly'   },
  TSLW:  { expenseRatio: '0.0099', aum: '150000000',     issuer: 'Roundhill',       dividendFrequency: 'weekly'   },
  AAPW:  { expenseRatio: '0.0099', aum: '100000000',     issuer: 'Roundhill',       dividendFrequency: 'weekly'   },
  AMDW:  { expenseRatio: '0.0099', aum: '80000000',      issuer: 'Roundhill',       dividendFrequency: 'weekly'   },
  AMZW:  { expenseRatio: '0.0099', aum: '80000000',      issuer: 'Roundhill',       dividendFrequency: 'weekly'   },
  ARMW:  { expenseRatio: '0.0099', aum: '50000000',      issuer: 'Roundhill',       dividendFrequency: 'weekly'   },
  METW:  { expenseRatio: '0.0099', aum: '100000000',     issuer: 'Roundhill',       dividendFrequency: 'weekly'   },
  MSFW:  { expenseRatio: '0.0099', aum: '80000000',      issuer: 'Roundhill',       dividendFrequency: 'weekly'   },
  MSTW:  { expenseRatio: '0.0099', aum: '150000000',     issuer: 'Roundhill',       dividendFrequency: 'weekly'   },
  NFLW:  { expenseRatio: '0.0099', aum: '60000000',      issuer: 'Roundhill',       dividendFrequency: 'weekly'   },
  PLTW:  { expenseRatio: '0.0099', aum: '80000000',      issuer: 'Roundhill',       dividendFrequency: 'weekly'   },
  GLDW:  { expenseRatio: '0.0099', aum: '50000000',      issuer: 'Roundhill',       dividendFrequency: 'weekly'   },

  // ── High-yield ────────────────────────────────────────────────────────────
  PBDC:  { expenseRatio: '0.0050', aum: '150000000',     issuer: 'Putnam',          dividendFrequency: 'monthly'  },
  BIZD:  { expenseRatio: '0.0040', aum: '800000000',     issuer: 'VanEck',          dividendFrequency: 'quarterly'},
  KLIP:  { expenseRatio: '0.0050', aum: '400000000',     issuer: 'KraneShares',     dividendFrequency: 'monthly'  },
  CSHI:  { expenseRatio: '0.0058', aum: '800000000',     issuer: 'NEOS',            dividendFrequency: 'monthly'  },
  HNDL:  { expenseRatio: '0.0072', aum: '500000000',     issuer: 'Strategy Shares', dividendFrequency: 'monthly'  },
  MDIV:  { expenseRatio: '0.0068', aum: '300000000',     issuer: 'First Trust',     dividendFrequency: 'monthly'  },
  TOPW:  { expenseRatio: '0.0099', aum: '50000000',      issuer: 'Roundhill',       dividendFrequency: 'monthly'  },
  GOOW:  { expenseRatio: '0.0099', aum: '30000000',      issuer: 'Roundhill',       dividendFrequency: 'monthly'  },
  NVII:  { expenseRatio: '0.0075', aum: '40000000',      issuer: 'REX Shares',      dividendFrequency: 'monthly'  },

  // ── Preferred stock ───────────────────────────────────────────────────────
  PFF:   { expenseRatio: '0.0046', aum: '13000000000',   issuer: 'iShares',         dividendFrequency: 'monthly'  },
  PGX:   { expenseRatio: '0.0052', aum: '4000000000',    issuer: 'Invesco',         dividendFrequency: 'monthly'  },
  PFFD:  { expenseRatio: '0.0023', aum: '2500000000',    issuer: 'Global X',        dividendFrequency: 'monthly'  },
  FPE:   { expenseRatio: '0.0085', aum: '7000000000',    issuer: 'First Trust',     dividendFrequency: 'monthly'  },
  PFXF:  { expenseRatio: '0.0047', aum: '1200000000',    issuer: 'VanEck',          dividendFrequency: 'monthly'  },
  SPFF:  { expenseRatio: '0.0058', aum: '300000000',     issuer: 'Global X',        dividendFrequency: 'monthly'  },

  // ── REIT ──────────────────────────────────────────────────────────────────
  VNQ:   { expenseRatio: '0.0012', aum: '37000000000',   issuer: 'Vanguard',        dividendFrequency: 'quarterly'},
  IYR:   { expenseRatio: '0.0039', aum: '5000000000',    issuer: 'iShares',         dividendFrequency: 'quarterly'},
  SCHH:  { expenseRatio: '0.0007', aum: '6000000000',    issuer: 'Charles Schwab',  dividendFrequency: 'quarterly'},
  XLRE:  { expenseRatio: '0.0010', aum: '5000000000',    issuer: 'SPDR',            dividendFrequency: 'quarterly'},
  REM:   { expenseRatio: '0.0048', aum: '1000000000',    issuer: 'iShares',         dividendFrequency: 'quarterly'},
  MORT:  { expenseRatio: '0.0043', aum: '500000000',     issuer: 'VanEck',          dividendFrequency: 'monthly'  },
  KBWY:  { expenseRatio: '0.0035', aum: '300000000',     issuer: 'Invesco',         dividendFrequency: 'monthly'  },

  // ── MLP ───────────────────────────────────────────────────────────────────
  AMLP:  { expenseRatio: '0.0087', aum: '9000000000',    issuer: 'ALPS',            dividendFrequency: 'quarterly'},
  MLPA:  { expenseRatio: '0.0045', aum: '1500000000',    issuer: 'Global X',        dividendFrequency: 'quarterly'},
  MLPX:  { expenseRatio: '0.0045', aum: '900000000',     issuer: 'Global X',        dividendFrequency: 'quarterly'},
  ENFR:  { expenseRatio: '0.0035', aum: '500000000',     issuer: 'ALPS',            dividendFrequency: 'quarterly'},

  // ── Bond-income ───────────────────────────────────────────────────────────
  HYG:   { expenseRatio: '0.0048', aum: '14000000000',   issuer: 'iShares',         dividendFrequency: 'monthly'  },
  JNK:   { expenseRatio: '0.0040', aum: '6000000000',    issuer: 'SPDR',            dividendFrequency: 'monthly'  },
  USHY:  { expenseRatio: '0.0008', aum: '12000000000',   issuer: 'iShares',         dividendFrequency: 'monthly'  },
  BKLN:  { expenseRatio: '0.0065', aum: '4000000000',    issuer: 'Invesco',         dividendFrequency: 'monthly'  },
  SRLN:  { expenseRatio: '0.0070', aum: '2000000000',    issuer: 'SPDR',            dividendFrequency: 'monthly'  },
  LQD:   { expenseRatio: '0.0014', aum: '35000000000',   issuer: 'iShares',         dividendFrequency: 'monthly'  },
  BNDI:  { expenseRatio: '0.0058', aum: '300000000',     issuer: 'NEOS',            dividendFrequency: 'monthly'  },
  HYBI:  { expenseRatio: '0.0058', aum: '200000000',     issuer: 'NEOS',            dividendFrequency: 'monthly'  },

  // ── Dividend-growth ───────────────────────────────────────────────────────
  SCHD:  { expenseRatio: '0.0006', aum: '65000000000',   issuer: 'Charles Schwab',  dividendFrequency: 'quarterly'},
  VIG:   { expenseRatio: '0.0006', aum: '90000000000',   issuer: 'Vanguard',        dividendFrequency: 'quarterly'},
  HDV:   { expenseRatio: '0.0008', aum: '10000000000',   issuer: 'iShares',         dividendFrequency: 'quarterly'},
  DVY:   { expenseRatio: '0.0038', aum: '19000000000',   issuer: 'iShares',         dividendFrequency: 'quarterly'},
  SDY:   { expenseRatio: '0.0035', aum: '20000000000',   issuer: 'SPDR',            dividendFrequency: 'quarterly'},
  DGRO:  { expenseRatio: '0.0008', aum: '29000000000',   issuer: 'iShares',         dividendFrequency: 'quarterly'},
  NOBL:  { expenseRatio: '0.0035', aum: '11000000000',   issuer: 'ProShares',       dividendFrequency: 'quarterly'},
  VYM:   { expenseRatio: '0.0006', aum: '55000000000',   issuer: 'Vanguard',        dividendFrequency: 'quarterly'},
  DGRW:  { expenseRatio: '0.0028', aum: '12000000000',   issuer: 'WisdomTree',      dividendFrequency: 'monthly'  },
  SCHY:  { expenseRatio: '0.0014', aum: '4000000000',    issuer: 'Charles Schwab',  dividendFrequency: 'quarterly'},
  SPHD:  { expenseRatio: '0.0030', aum: '3000000000',    issuer: 'Invesco',         dividendFrequency: 'monthly'  },
  FVD:   { expenseRatio: '0.0070', aum: '2500000000',    issuer: 'First Trust',     dividendFrequency: 'monthly'  },
  IDV:   { expenseRatio: '0.0049', aum: '4000000000',    issuer: 'iShares',         dividendFrequency: 'quarterly'},
  VYMI:  { expenseRatio: '0.0022', aum: '6000000000',    issuer: 'Vanguard',        dividendFrequency: 'quarterly'},
  PEY:   { expenseRatio: '0.0054', aum: '1000000000',    issuer: 'Invesco',         dividendFrequency: 'monthly'  },
  FDL:   { expenseRatio: '0.0045', aum: '2000000000',    issuer: 'First Trust',     dividendFrequency: 'quarterly'},
  DIVB:  { expenseRatio: '0.0005', aum: '700000000',     issuer: 'iShares',         dividendFrequency: 'quarterly'},
  PFM:   { expenseRatio: '0.0054', aum: '1000000000',    issuer: 'Invesco',         dividendFrequency: 'quarterly'},
  SPYD:  { expenseRatio: '0.0007', aum: '7000000000',    issuer: 'SPDR',            dividendFrequency: 'quarterly'},
  SCHV:  { expenseRatio: '0.0004', aum: '10000000000',   issuer: 'Charles Schwab',  dividendFrequency: 'quarterly'},

  // ── Bond ──────────────────────────────────────────────────────────────────
  AGG:   { expenseRatio: '0.0003', aum: '115000000000',  issuer: 'iShares',         dividendFrequency: 'monthly'  },
  BND:   { expenseRatio: '0.0003', aum: '130000000000',  issuer: 'Vanguard',        dividendFrequency: 'monthly'  },
  TLT:   { expenseRatio: '0.0015', aum: '60000000000',   issuer: 'iShares',         dividendFrequency: 'monthly'  },
  TIP:   { expenseRatio: '0.0019', aum: '16000000000',   issuer: 'iShares',         dividendFrequency: 'monthly'  },
  VCIT:  { expenseRatio: '0.0004', aum: '45000000000',   issuer: 'Vanguard',        dividendFrequency: 'monthly'  },
  TLTI:  { expenseRatio: '0.0058', aum: '100000000',     issuer: 'NEOS',            dividendFrequency: 'monthly'  },

  // ── Growth / Total-return ─────────────────────────────────────────────────
  VOO:   { expenseRatio: '0.0003', aum: '550000000000',  issuer: 'Vanguard',        dividendFrequency: 'quarterly'},
  IVV:   { expenseRatio: '0.0003', aum: '525000000000',  issuer: 'iShares',         dividendFrequency: 'quarterly'},
  SPY:   { expenseRatio: '0.0009', aum: '550000000000',  issuer: 'SPDR',            dividendFrequency: 'quarterly'},
  VTI:   { expenseRatio: '0.0003', aum: '450000000000',  issuer: 'Vanguard',        dividendFrequency: 'quarterly'},
  SCHG:  { expenseRatio: '0.0004', aum: '35000000000',   issuer: 'Charles Schwab',  dividendFrequency: 'quarterly'},
  QQQ:   { expenseRatio: '0.0020', aum: '270000000000',  issuer: 'Invesco',         dividendFrequency: 'quarterly'},
  QQQM:  { expenseRatio: '0.0015', aum: '35000000000',   issuer: 'Invesco',         dividendFrequency: 'quarterly'},
  VUG:   { expenseRatio: '0.0004', aum: '140000000000',  issuer: 'Vanguard',        dividendFrequency: 'quarterly'},
  VGT:   { expenseRatio: '0.0010', aum: '90000000000',   issuer: 'Vanguard',        dividendFrequency: 'quarterly'},
  XLK:   { expenseRatio: '0.0009', aum: '65000000000',   issuer: 'SPDR',            dividendFrequency: 'quarterly'},
  IWM:   { expenseRatio: '0.0019', aum: '58000000000',   issuer: 'iShares',         dividendFrequency: 'quarterly'},
  ARKK:  { expenseRatio: '0.0075', aum: '6000000000',    issuer: 'ARK Invest',      dividendFrequency: 'n/a'      },
  IBIT:  { expenseRatio: '0.0012', aum: '55000000000',   issuer: 'iShares',         dividendFrequency: 'n/a'      },
  FBTC:  { expenseRatio: '0.0025', aum: '20000000000',   issuer: 'Fidelity',        dividendFrequency: 'n/a'      },
};

let updated = 0;
let skipped = 0;

for (const [ticker, vals] of Object.entries(STATICS)) {
  const dripEligible = vals.dividendFrequency !== 'n/a';
  const result = await db
    .update(etfs)
    .set({
      expenseRatio: vals.expenseRatio,
      aum: vals.aum,
      issuer: vals.issuer,
      dividendFrequency: vals.dividendFrequency,
      dripEligible,
    })
    .where(eq(etfs.ticker, ticker));

  if ((result as unknown as { rowCount?: number }).rowCount ?? 1) {
    console.log(`  ✓ ${ticker} (DRIP: ${dripEligible ? 'yes' : 'no'})`);
    updated++;
  } else {
    console.log(`  - ${ticker} (not found in DB)`);
    skipped++;
  }
}

console.log(`\nDone - ${updated} updated, ${skipped} skipped.`);
