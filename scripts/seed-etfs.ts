import 'dotenv/config';

import { db } from '../src/lib/db';
import { etfs } from '../src/lib/db/schema';

const ETF_UNIVERSE = [
  { ticker: 'JEPI', name: 'JPMorgan Equity Premium Income ETF', pillar: 'income', category: 'covered-call' },
  { ticker: 'JEPQ', name: 'JPMorgan Nasdaq Equity Premium ETF', pillar: 'income', category: 'covered-call' },
  { ticker: 'DIVO', name: 'Amplify CWP Enhanced Dividend ETF', pillar: 'income', category: 'covered-call' },
  { ticker: 'QYLD', name: 'Global X NASDAQ 100 Covered Call ETF', pillar: 'income', category: 'covered-call' },
  { ticker: 'XYLD', name: 'Global X S&P 500 Covered Call ETF', pillar: 'income', category: 'covered-call' },
  { ticker: 'RYLD', name: 'Global X Russell 2000 Covered Call', pillar: 'income', category: 'covered-call' },
  { ticker: 'SVOL', name: 'Simplify Volatility Premium ETF', pillar: 'income', category: 'high-yield' },
  { ticker: 'SPYI', name: 'NEOS S&P 500 High Income ETF', pillar: 'income', category: 'covered-call' },
  { ticker: 'FEPI', name: 'REX FANG & Innovation Equity ETF', pillar: 'income', category: 'covered-call' },
  { ticker: 'PBDC', name: 'Putnam BDC Income ETF', pillar: 'income', category: 'high-yield' },
  {
    ticker: 'CSHI',
    name: 'NEOS Enhanced Income Cash Alternative',
    pillar: 'income',
    category: 'high-yield',
  },
  {
    ticker: 'GPIQ',
    name: 'Goldman Sachs Nasdaq 100 Core Premium',
    pillar: 'income',
    category: 'covered-call',
  },
  { ticker: 'TOPW', name: 'Tidal ETF Trust', pillar: 'income', category: 'high-yield' },
  { ticker: 'GOOW', name: 'GOOW ETF', pillar: 'income', category: 'high-yield' },
  { ticker: 'NVII', name: 'NorthStar Income ETF', pillar: 'income', category: 'high-yield' },
  {
    ticker: 'IDVO',
    name: 'Amplify International Div Income ETF',
    pillar: 'income',
    category: 'dividend-growth',
  },
  {
    ticker: 'QDVO',
    name: 'Amplify Dividend Income ETF',
    pillar: 'income',
    category: 'dividend-growth',
  },
  {
    ticker: 'SCHD',
    name: 'Schwab US Dividend Equity ETF',
    pillar: 'stability',
    category: 'dividend-growth',
  },
  {
    ticker: 'VIG',
    name: 'Vanguard Dividend Appreciation ETF',
    pillar: 'stability',
    category: 'dividend-growth',
  },
  { ticker: 'HDV', name: 'iShares Core High Dividend ETF', pillar: 'stability', category: 'high-yield' },
  { ticker: 'DVY', name: 'iShares Select Dividend ETF', pillar: 'stability', category: 'high-yield' },
  { ticker: 'SDY', name: 'SPDR S&P Dividend ETF', pillar: 'stability', category: 'dividend-growth' },
  { ticker: 'DGRO', name: 'iShares Core Dividend Growth ETF', pillar: 'stability', category: 'dividend-growth' },
  {
    ticker: 'NOBL',
    name: 'ProShares S&P 500 Dividend Aristocrats',
    pillar: 'stability',
    category: 'dividend-growth',
  },
  {
    ticker: 'VYM',
    name: 'Vanguard High Dividend Yield ETF',
    pillar: 'stability',
    category: 'high-yield',
  },
  { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', pillar: 'growth', category: 'total-return' },
  { ticker: 'SCHG', name: 'Schwab US Large-Cap Growth ETF', pillar: 'growth', category: 'total-return' },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', pillar: 'growth', category: 'total-return' },
  {
    ticker: 'VGT',
    name: 'Vanguard Information Technology ETF',
    pillar: 'growth',
    category: 'total-return',
  },
  { ticker: 'IBIT', name: 'iShares Bitcoin Trust ETF', pillar: 'growth', category: 'total-return' },
  { ticker: 'FBTC', name: 'Fidelity Wise Origin Bitcoin Fund', pillar: 'growth', category: 'total-return' },
] as const;

for (const etf of ETF_UNIVERSE) {
  await db
    .insert(etfs)
    .values(etf)
    .onConflictDoNothing({ target: etfs.ticker });
  console.log(`Seeded ${etf.ticker}`);
}
