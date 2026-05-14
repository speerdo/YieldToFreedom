import 'dotenv/config';

import { db } from '../src/lib/db';
import { etfs } from '../src/lib/db/schema';

// ─────────────────────────────────────────────────────────────────────────────
// ETF UNIVERSE  (~165 hand-curated income-relevant US ETFs)
//
// Pillars:  income | stability | growth
// Categories:
//   income     → covered-call | option-income | high-yield | preferred-stock
//                reit | mlp | bond-income
//   stability  → dividend-growth | bond
//   growth     → total-return
//
// incomeSynthetic: true for ETFs that generate distributions via options
// strategies rather than from underlying dividends (covered-call, YieldMax, etc.)
//
// Add new ETFs here; re-running the script is safe (ON CONFLICT DO NOTHING).
// After seeding, run: npx tsx scripts/seed-etf-statics.ts  to fill ER / AUM.
// ─────────────────────────────────────────────────────────────────────────────

const ETF_UNIVERSE = [
  // ── Income / Covered-call ────────────────────────────────────────────────
  // JPMorgan
  { ticker: 'JEPI',  name: 'JPMorgan Equity Premium Income ETF',                    pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'JEPQ',  name: 'JPMorgan Nasdaq Equity Premium ETF',                    pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // Amplify
  { ticker: 'DIVO',  name: 'Amplify CWP Enhanced Dividend ETF',                     pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'IDVO',  name: 'Amplify International Dividend Income ETF',             pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'QDVO',  name: 'Amplify Dividend Income ETF',                           pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // Global X
  { ticker: 'QYLD',  name: 'Global X NASDAQ 100 Covered Call ETF',                  pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'XYLD',  name: 'Global X S&P 500 Covered Call ETF',                     pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'RYLD',  name: 'Global X Russell 2000 Covered Call ETF',                pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // NEOS
  { ticker: 'SPYI',  name: 'NEOS S&P 500 High Income ETF',                          pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'QQQI',  name: 'NEOS Nasdaq-100 High Income ETF',                       pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'IWMI',  name: 'NEOS Russell 2000 High Income ETF',                     pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'BTCI',  name: 'NEOS Bitcoin High Income ETF',                          pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'QQQH',  name: 'NEOS Nasdaq-100 Hedged Equity Income ETF',              pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'SPYH',  name: 'NEOS S&P 500 Hedged Equity Income ETF',                 pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'IYRI',  name: 'NEOS Real Estate High Income ETF',                       pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'IAUI',  name: 'NEOS Gold High Income ETF',                              pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'NIHI',  name: 'NEOS MSCI EAFE High Income ETF',                         pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'XSPI',  name: 'NEOS Boosted S&P 500 High Income ETF',                   pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'XQQI',  name: 'NEOS Boosted Nasdaq-100 High Income ETF',                pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'XBCI',  name: 'NEOS Boosted Bitcoin High Income ETF',                   pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // Goldman Sachs
  { ticker: 'GPIQ',  name: 'Goldman Sachs Nasdaq 100 Core Premium Income ETF',      pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'GPIX',  name: 'Goldman Sachs S&P 500 Core Premium Income ETF',         pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // REX Shares
  { ticker: 'FEPI',  name: 'REX FANG & Innovation Equity Premium ETF',              pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'AIPI',  name: 'REX AI Equity Premium Income ETF',                      pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'CEPI',  name: 'REX Crypto Equity Premium Income ETF',                  pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'COII',  name: 'REX COIN Growth And Income ETF',                        pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'MSII',  name: 'REX MSTR Growth And Income ETF',                        pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'TSII',  name: 'REX TSLA Growth And Income ETF',                        pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'ULTI',  name: 'REX IncomeMax Option Strategy ETF',                     pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'WMTI',  name: 'REX WMT Growth And Income ETF',                         pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // Defiance
  { ticker: 'IWMY',  name: 'Defiance R2000 Enhanced Options Income ETF',            pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'WDTE',  name: 'Defiance S&P 500 Enhanced Options Income ETF',          pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'QQQY',  name: 'Defiance Nasdaq-100 Enhanced Options Income ETF',       pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'SPYT',  name: 'Defiance S&P 500 Target Income ETF',                    pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // Roundhill — index 0DTE
  { ticker: 'XDTE',  name: 'Roundhill S&P 500 0DTE Covered Call Strategy ETF',      pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'QDTE',  name: 'Roundhill NASDAQ-100 0DTE Covered Call Strategy ETF',   pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'RDTE',  name: 'Roundhill Russell 2000 0DTE Covered Call Strategy ETF', pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'MAGY',  name: 'Roundhill Magnificent Seven Covered Call Strategy ETF', pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'YBTC',  name: 'Roundhill Bitcoin Covered Call Strategy ETF',           pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },

  // ── Income / Option-income (single-stock & basket) ───────────────────────
  // Simplify
  { ticker: 'SVOL',  name: 'Simplify Volatility Premium ETF',                       pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  // YieldMax — Magnificent 7 & basket funds
  { ticker: 'YMAG',  name: 'YieldMax Magnificent 7 Fund of Option Income ETFs',     pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'YMAX',  name: 'YieldMax Universe Fund of Option Income ETFs',          pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'ULTY',  name: 'YieldMax Ultra Option Income Strategy ETF',             pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  // YieldMax — mega-cap single-stock
  { ticker: 'TSLY',  name: 'YieldMax TSLA Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'NVDY',  name: 'YieldMax NVDA Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'AMZY',  name: 'YieldMax AMZN Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'MSFO',  name: 'YieldMax MSFT Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'GOOY',  name: 'YieldMax GOOGL Option Income Strategy ETF',             pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'APLY',  name: 'YieldMax AAPL Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'MSTY',  name: 'YieldMax MSTR Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'CONY',  name: 'YieldMax COIN Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'PLTY',  name: 'YieldMax PLTR Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  // YieldMax — large-cap single-stock
  { ticker: 'AMDY',  name: 'YieldMax AMD Option Income Strategy ETF',               pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'FBY',   name: 'YieldMax META Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'NFLY',  name: 'YieldMax NFLX Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'PYPY',  name: 'YieldMax PYPL Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'XOMO',  name: 'YieldMax XOM Option Income Strategy ETF',               pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'BRKC',  name: 'YieldMax BRK Option Income Strategy ETF',               pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'DISO',  name: 'YieldMax DIS Option Income Strategy ETF',               pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'SMCY',  name: 'YieldMax SMCI Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'CRCO',  name: 'YieldMax CRWD Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'SNOY',  name: 'YieldMax SNOW Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'RDYY',  name: 'YieldMax RDDT Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'DRAY',  name: 'YieldMax DKNG Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'CVNY',  name: 'YieldMax CVNA Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'HIYY',  name: 'YieldMax HIMS Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'ABNY',  name: 'YieldMax ABNB Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'BABO',  name: 'YieldMax BABA Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'GMEY',  name: 'YieldMax GME Option Income Strategy ETF',               pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'RBLY',  name: 'YieldMax RBLX Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'HOOY',  name: 'YieldMax HOOD Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'TSMY',  name: 'YieldMax TSM Option Income Strategy ETF',               pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'MRNY',  name: 'YieldMax MRNA Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'MARO',  name: 'YieldMax MARA Option Income Strategy ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  // YieldMax — sector / portfolio
  { ticker: 'GDXY',  name: 'YieldMax Gold Miners Option Income Strategy ETF',       pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'CHPY',  name: 'YieldMax Semiconductor Option Income Strategy ETF',     pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'GPTY',  name: 'YieldMax AI & Tech Option Income Strategy ETF',         pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'AIYY',  name: 'YieldMax AI Option Income Strategy ETF',                pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'LFGY',  name: 'YieldMax Crypto & Tech Option Income Strategy ETF',     pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'MINY',  name: 'YieldMax Mining Option Income Strategy ETF',            pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'OARK',  name: 'YieldMax Innovation Option Income Strategy ETF',        pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'YBIT',  name: 'YieldMax Bitcoin Option Income Strategy ETF',           pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  // YieldMax — short / inverse income
  { ticker: 'CRSH',  name: 'YieldMax Short TSLA Option Income Strategy ETF',        pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'DIPS',  name: 'YieldMax Short NVDA Option Income Strategy ETF',        pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'WNTR',  name: 'YieldMax Short MSTR Option Income Strategy ETF',        pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'FIAT',  name: 'YieldMax Short COIN Option Income Strategy ETF',        pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'YQQQ',  name: 'YieldMax Short NASDAQ-100 Option Income Strategy ETF',  pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  // YieldMax — 0DTE / target-distribution
  { ticker: 'QDTY',  name: 'YieldMax Nasdaq-100 Target Distribution ETF',           pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'SDTY',  name: 'YieldMax S&P 500 Target Distribution ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'RDTY',  name: 'YieldMax Russell 2000 Target Distribution ETF',         pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'MSST',  name: 'YieldMax MSTR 2x Option Income Strategy ETF',           pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'NVIT',  name: 'YieldMax NVDA 2x Option Income Strategy ETF',           pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  // YieldMax — Target 12 sector
  { ticker: 'SOXY',  name: 'YieldMax Target 12 Semiconductor Option Income ETF',    pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  // GraniteShares YieldBOOST — single-stock & basket
  { ticker: 'YBST',  name: 'GraniteShares YieldBOOST Single Stock Universe ETF',   pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'YBTY',  name: 'GraniteShares YieldBOOST TopYielders ETF',              pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'AMYY',  name: 'GraniteShares YieldBOOST AMD ETF',                      pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'XBTY',  name: 'GraniteShares YieldBOOST Bitcoin ETF',                  pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'COYY',  name: 'GraniteShares YieldBOOST COIN ETF',                     pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'HOYY',  name: 'GraniteShares YieldBOOST HOOD ETF',                     pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'NVYY',  name: 'GraniteShares YieldBOOST NVDA ETF',                     pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'TQQY',  name: 'GraniteShares YieldBOOST QQQ ETF',                      pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'SMYY',  name: 'GraniteShares YieldBOOST SMCI ETF',                     pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'YSPY',  name: 'GraniteShares YieldBOOST SPY ETF',                      pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'TSYY',  name: 'GraniteShares YieldBOOST TSLA ETF',                     pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  // VistaShares Target 15
  { ticker: 'ACKY',  name: 'VistaShares Target 15 ACKtivist Distribution ETF',      pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'OMAH',  name: 'VistaShares Target 15 Berkshire Select Income ETF',     pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'DRKY',  name: 'VistaShares Target 15 DRUKMacro Distribution ETF',      pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'QUSA',  name: 'VistaShares Target 15 USA Quality Income ETF',          pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'SIOO',  name: 'VistaShares Target 15 S&P 100 Distribution ETF',        pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  // Simplify
  { ticker: 'MAXI',  name: 'Simplify Bitcoin Strategy PLUS Income ETF',             pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  // Roundhill — WeeklyPay single-stock
  { ticker: 'NVDW',  name: 'Roundhill NVDA WeeklyPay ETF',                          pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'TSLW',  name: 'Roundhill TSLA WeeklyPay ETF',                          pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'AAPW',  name: 'Roundhill AAPL WeeklyPay ETF',                          pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'AMDW',  name: 'Roundhill AMD WeeklyPay ETF',                           pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'AMZW',  name: 'Roundhill AMZN WeeklyPay ETF',                          pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'ARMW',  name: 'Roundhill ARM WeeklyPay ETF',                           pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'METW',  name: 'Roundhill META WeeklyPay ETF',                          pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'MSFW',  name: 'Roundhill MSFT WeeklyPay ETF',                          pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'MSTW',  name: 'Roundhill MSTR WeeklyPay ETF',                          pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'NFLW',  name: 'Roundhill NFLX WeeklyPay ETF',                          pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'PLTW',  name: 'Roundhill PLTR WeeklyPay ETF',                          pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'GLDW',  name: 'Roundhill Gold WeeklyPay ETF',                          pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'COIW',  name: 'Roundhill COIN WeeklyPay ETF',                          pillar: 'income',    category: 'option-income',  incomeSynthetic: true  },
  { ticker: 'YETH',  name: 'Roundhill Ether Covered Call Strategy ETF',             pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },

  // Amplify — covered-call income
  { ticker: 'BITY',  name: 'Amplify Bitcoin 2% Monthly Option Income ETF',          pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'BAGY',  name: 'Amplify Bitcoin Max Income Covered Call ETF',           pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'HCOW',  name: 'Amplify COWS Covered Call ETF',                         pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // iShares
  { ticker: 'BALI',  name: 'iShares US Large Cap Premium Income Active ETF',        pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // TappAlpha
  { ticker: 'TSPY',  name: 'TappAlpha S&P 500 Growth & Daily Income ETF',           pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'TDAQ',  name: 'TappAlpha Innovation 100 Growth & Daily Income ETF',    pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'TSYX',  name: 'TSPY LIFT ETF',                                         pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'TDAX',  name: 'TDAQ LIFT ETF',                                         pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // ProShares
  { ticker: 'ISPY',  name: 'ProShares S&P 500 High Income ETF',                     pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // Kurv
  { ticker: 'KQQQ',  name: 'Kurv Technology Titans Select ETF',                     pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'KGLD',  name: 'Kurv Gold Enhanced Income ETF',                         pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // First Trust
  { ticker: 'FTHI',  name: 'First Trust BuyWrite Income ETF',                       pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // Main
  { ticker: 'BUYW',  name: 'Main BuyWrite ETF',                                     pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // State Street Premium Income
  { ticker: 'XLEI',  name: 'State Street Energy Select Sector SPDR Premium Income ETF',      pillar: 'income', category: 'covered-call', incomeSynthetic: true },
  { ticker: 'XLKI',  name: 'State Street Technology Select Sector SPDR Premium Income ETF',  pillar: 'income', category: 'covered-call', incomeSynthetic: true },
  // FT Vest
  { ticker: 'KNG',   name: 'FT Vest S&P 500 Dividend Aristocrats Target Income ETF', pillar: 'income',   category: 'covered-call',   incomeSynthetic: true  },
  // Overlay Shares
  { ticker: 'OVL',   name: 'Overlay Shares Large Cap Equity ETF',                   pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // Kensington
  { ticker: 'KHPI',  name: 'Kensington Hedged Premium Income ETF',                  pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // Global X
  { ticker: 'TYLG',  name: 'Global X Information Technology Covered Call & Growth ETF', pillar: 'income', category: 'covered-call',  incomeSynthetic: true  },
  // Nicholas
  { ticker: 'BLOX',  name: 'Nicholas Crypto Income ETF',                             pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  { ticker: 'GIAX',  name: 'Nicholas Global Equity and Income ETF',                  pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },
  // NestYield
  { ticker: 'EGGY',  name: 'NestYield Dynamic Income ETF',                           pillar: 'income',    category: 'covered-call',   incomeSynthetic: true  },

  // ── Income / High-yield (BDC, CLO, multi-asset income) ───────────────────
  { ticker: 'PBDC',  name: 'Putnam BDC Income ETF',                                 pillar: 'income',    category: 'high-yield',     incomeSynthetic: false },
  { ticker: 'BIZD',  name: 'VanEck BDC Income ETF',                                 pillar: 'income',    category: 'high-yield',     incomeSynthetic: false },
  { ticker: 'KLIP',  name: 'KFA CLO ETF',                                           pillar: 'income',    category: 'high-yield',     incomeSynthetic: false },
  { ticker: 'CSHI',  name: 'NEOS Enhanced Income Cash Alternative ETF',             pillar: 'income',    category: 'high-yield',     incomeSynthetic: true  },
  { ticker: 'HNDL',  name: 'Nationwide 7HANDL Index ETF',                           pillar: 'income',    category: 'high-yield',     incomeSynthetic: false },
  { ticker: 'MDIV',  name: 'First Trust Multi-Asset Diversified Income Index ETF',  pillar: 'income',    category: 'high-yield',     incomeSynthetic: false },
  { ticker: 'TOPW',  name: 'Tidal ETF Trust — Income ETF',                          pillar: 'income',    category: 'high-yield',     incomeSynthetic: false },
  { ticker: 'GOOW',  name: 'Goose Hollow Tactical Allocation ETF',                  pillar: 'income',    category: 'high-yield',     incomeSynthetic: false },
  { ticker: 'NVII',  name: 'NorthStar Income ETF',                                  pillar: 'income',    category: 'high-yield',     incomeSynthetic: false },
  { ticker: 'YYY',   name: 'Amplify High Income ETF',                               pillar: 'income',    category: 'high-yield',     incomeSynthetic: false },
  { ticker: 'QDPL',  name: 'Pacer Metaurus US Large Cap Dividend Multiplier 400 ETF', pillar: 'income',  category: 'high-yield',     incomeSynthetic: false },
  { ticker: 'QSIX',  name: 'Pacer Metaurus Nasdaq 100 Dividend Multiplier 600 ETF', pillar: 'income',   category: 'high-yield',     incomeSynthetic: false },
  { ticker: 'BITO',  name: 'ProShares Bitcoin Strategy ETF',                         pillar: 'income',    category: 'high-yield',     incomeSynthetic: false },

  // ── Income / Preferred stock ──────────────────────────────────────────────
  { ticker: 'PFF',   name: 'iShares Preferred and Income Securities ETF',           pillar: 'income',    category: 'preferred-stock', incomeSynthetic: false },
  { ticker: 'PGX',   name: 'Invesco Preferred ETF',                                 pillar: 'income',    category: 'preferred-stock', incomeSynthetic: false },
  { ticker: 'PFFD',  name: 'Global X US Preferred ETF',                             pillar: 'income',    category: 'preferred-stock', incomeSynthetic: false },
  { ticker: 'FPE',   name: 'First Trust Preferred Securities and Income ETF',       pillar: 'income',    category: 'preferred-stock', incomeSynthetic: false },
  { ticker: 'PFXF',  name: 'VanEck Preferred Securities ex Financials ETF',        pillar: 'income',    category: 'preferred-stock', incomeSynthetic: false },
  { ticker: 'SPFF',  name: 'Global X SuperIncome Preferred ETF',                   pillar: 'income',    category: 'preferred-stock', incomeSynthetic: false },

  // ── Income / REIT ─────────────────────────────────────────────────────────
  { ticker: 'VNQ',   name: 'Vanguard Real Estate ETF',                              pillar: 'income',    category: 'reit',            incomeSynthetic: false },
  { ticker: 'IYR',   name: 'iShares US Real Estate ETF',                            pillar: 'income',    category: 'reit',            incomeSynthetic: false },
  { ticker: 'SCHH',  name: 'Schwab US REIT ETF',                                    pillar: 'income',    category: 'reit',            incomeSynthetic: false },
  { ticker: 'XLRE',  name: 'Real Estate Select Sector SPDR Fund',                   pillar: 'income',    category: 'reit',            incomeSynthetic: false },
  { ticker: 'REM',   name: 'iShares Mortgage Real Estate ETF',                      pillar: 'income',    category: 'reit',            incomeSynthetic: false },
  { ticker: 'MORT',  name: 'VanEck Mortgage REIT Income ETF',                       pillar: 'income',    category: 'reit',            incomeSynthetic: false },
  { ticker: 'KBWY',  name: 'Invesco KBW Premium Yield Equity REIT ETF',             pillar: 'income',    category: 'reit',            incomeSynthetic: false },

  // ── Income / MLP & energy infrastructure ─────────────────────────────────
  { ticker: 'AMLP',  name: 'Alerian MLP ETF',                                       pillar: 'income',    category: 'mlp',             incomeSynthetic: false },
  { ticker: 'MLPA',  name: 'Global X MLP ETF',                                      pillar: 'income',    category: 'mlp',             incomeSynthetic: false },
  { ticker: 'MLPX',  name: 'Global X MLP & Energy Infrastructure ETF',              pillar: 'income',    category: 'mlp',             incomeSynthetic: false },
  { ticker: 'ENFR',  name: 'Alerian Energy Infrastructure ETF',                     pillar: 'income',    category: 'mlp',             incomeSynthetic: false },

  // ── Income / High-yield bonds & senior loans ──────────────────────────────
  { ticker: 'HYG',   name: 'iShares iBoxx High Yield Corporate Bond ETF',           pillar: 'income',    category: 'bond-income',     incomeSynthetic: false },
  { ticker: 'JNK',   name: 'SPDR Bloomberg High Yield Bond ETF',                    pillar: 'income',    category: 'bond-income',     incomeSynthetic: false },
  { ticker: 'USHY',  name: 'iShares Broad USD High Yield Corporate Bond ETF',       pillar: 'income',    category: 'bond-income',     incomeSynthetic: false },
  { ticker: 'BKLN',  name: 'Invesco Senior Loan ETF',                               pillar: 'income',    category: 'bond-income',     incomeSynthetic: false },
  { ticker: 'SRLN',  name: 'SPDR Blackstone Senior Loan ETF',                       pillar: 'income',    category: 'bond-income',     incomeSynthetic: false },
  { ticker: 'LQD',   name: 'iShares iBoxx Investment Grade Corporate Bond ETF',     pillar: 'income',    category: 'bond-income',     incomeSynthetic: false },
  { ticker: 'BNDI',  name: 'NEOS Core Plus Bond Income ETF',                        pillar: 'income',    category: 'bond-income',     incomeSynthetic: true  },
  { ticker: 'HYBI',  name: 'NEOS High Yield Corporate Bond High Income ETF',        pillar: 'income',    category: 'bond-income',     incomeSynthetic: true  },

  // ── Stability / Dividend-growth ───────────────────────────────────────────
  { ticker: 'SCHD',  name: 'Schwab US Dividend Equity ETF',                         pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'VIG',   name: 'Vanguard Dividend Appreciation ETF',                    pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'HDV',   name: 'iShares Core High Dividend ETF',                        pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'DVY',   name: 'iShares Select Dividend ETF',                           pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'SDY',   name: 'SPDR S&P Dividend ETF',                                 pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'DGRO',  name: 'iShares Core Dividend Growth ETF',                      pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'NOBL',  name: 'ProShares S&P 500 Dividend Aristocrats ETF',            pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'VYM',   name: 'Vanguard High Dividend Yield ETF',                      pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'DGRW',  name: 'WisdomTree US Quality Dividend Growth Fund',            pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'SCHY',  name: 'Schwab International Dividend Equity ETF',              pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'SPHD',  name: 'Invesco S&P 500 High Div Low Volatility ETF',           pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'FVD',   name: 'First Trust Value Line Dividend Index Fund',            pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'IDV',   name: 'iShares International Select Dividend ETF',             pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'VYMI',  name: 'Vanguard International High Dividend Yield ETF',        pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'PEY',   name: 'Invesco High Yield Equity Dividend Achievers ETF',      pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'FDL',   name: 'First Trust Morningstar Dividend Leaders Index Fund',   pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'DIVB',  name: 'iShares US Dividend and Buyback ETF',                   pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'PFM',   name: 'Invesco Dividend Achievers ETF',                        pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'SPYD',  name: 'SPDR Portfolio S&P 500 High Dividend ETF',              pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'SCHV',  name: 'Schwab US Large-Cap Value ETF',                         pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'FDVV',  name: 'Fidelity High Dividend ETF',                            pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },
  { ticker: 'COWS',  name: 'Amplify Cash Flow Dividend Leaders ETF',                pillar: 'stability', category: 'dividend-growth', incomeSynthetic: false },

  // ── Stability / Investment-grade bonds ────────────────────────────────────
  { ticker: 'AGG',   name: 'iShares Core US Aggregate Bond ETF',                    pillar: 'stability', category: 'bond',            incomeSynthetic: false },
  { ticker: 'BND',   name: 'Vanguard Total Bond Market ETF',                        pillar: 'stability', category: 'bond',            incomeSynthetic: false },
  { ticker: 'TLT',   name: 'iShares 20+ Year Treasury Bond ETF',                   pillar: 'stability', category: 'bond',            incomeSynthetic: false },
  { ticker: 'TIP',   name: 'iShares TIPS Bond ETF',                                 pillar: 'stability', category: 'bond',            incomeSynthetic: false },
  { ticker: 'VCIT',  name: 'Vanguard Intermediate-Term Corporate Bond ETF',         pillar: 'stability', category: 'bond',            incomeSynthetic: false },
  { ticker: 'TLTI',  name: 'NEOS 20+ Year Treasury Bond High Income ETF',           pillar: 'stability', category: 'bond',            incomeSynthetic: true  },
  { ticker: 'SCHP',  name: 'Schwab US TIPS ETF',                                    pillar: 'stability', category: 'bond',            incomeSynthetic: false },
  { ticker: 'WEEK',  name: 'Roundhill Weekly T-Bill ETF',                            pillar: 'stability', category: 'bond',            incomeSynthetic: false },

  // ── Growth / Total-return ─────────────────────────────────────────────────
  { ticker: 'VOO',   name: 'Vanguard S&P 500 ETF',                                  pillar: 'growth',    category: 'total-return',    incomeSynthetic: false },
  { ticker: 'IVV',   name: 'iShares Core S&P 500 ETF',                              pillar: 'growth',    category: 'total-return',    incomeSynthetic: false },
  { ticker: 'SPY',   name: 'SPDR S&P 500 ETF Trust',                                pillar: 'growth',    category: 'total-return',    incomeSynthetic: false },
  { ticker: 'VTI',   name: 'Vanguard Total Stock Market ETF',                       pillar: 'growth',    category: 'total-return',    incomeSynthetic: false },
  { ticker: 'SCHG',  name: 'Schwab US Large-Cap Growth ETF',                        pillar: 'growth',    category: 'total-return',    incomeSynthetic: false },
  { ticker: 'QQQ',   name: 'Invesco QQQ Trust',                                     pillar: 'growth',    category: 'total-return',    incomeSynthetic: false },
  { ticker: 'QQQM',  name: 'Invesco NASDAQ 100 ETF',                                pillar: 'growth',    category: 'total-return',    incomeSynthetic: false },
  { ticker: 'VUG',   name: 'Vanguard Growth ETF',                                   pillar: 'growth',    category: 'total-return',    incomeSynthetic: false },
  { ticker: 'VGT',   name: 'Vanguard Information Technology ETF',                   pillar: 'growth',    category: 'total-return',    incomeSynthetic: false },
  { ticker: 'XLK',   name: 'Technology Select Sector SPDR Fund',                    pillar: 'growth',    category: 'total-return',    incomeSynthetic: false },
  { ticker: 'IWM',   name: 'iShares Russell 2000 ETF',                              pillar: 'growth',    category: 'total-return',    incomeSynthetic: false },
  { ticker: 'ARKK',  name: 'ARK Innovation ETF',                                    pillar: 'growth',    category: 'total-return',    incomeSynthetic: false },
  { ticker: 'IBIT',  name: 'iShares Bitcoin Trust ETF',                             pillar: 'growth',    category: 'total-return',    incomeSynthetic: false },
  { ticker: 'FBTC',  name: 'Fidelity Wise Origin Bitcoin Fund',                     pillar: 'growth',    category: 'total-return',    incomeSynthetic: false },
  { ticker: 'BATT',  name: 'Amplify Lithium & Battery Technology ETF',              pillar: 'growth',    category: 'total-return',    incomeSynthetic: false },
] as const;

for (const etf of ETF_UNIVERSE) {
  await db
    .insert(etfs)
    .values(etf)
    .onConflictDoNothing({ target: etfs.ticker });
  console.log(`  seeded ${etf.ticker}`);
}

console.log(`\nDone — ${ETF_UNIVERSE.length} ETFs in universe.`);
