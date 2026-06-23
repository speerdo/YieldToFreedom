/**
 * Fix spaces in ETF descriptions where the upstream data source (Tiingo)
 * stripped spaces at word boundaries, fusing words together. Two fusion
 * patterns occur in the data:
 *   - lowercase→uppercase seam: "theFund", "ofBitcoin", "SyntheticExposure"
 *   - lowercase→lowercase:     "fromoptions", "trackthe", "alsogain",
 *                              "periodsof", "onaweekly", "investmentgains"
 *
 * Strategy:
 *   1. PRE_SPLIT table: rewrite known multi-word proper nouns and finance
 *      terms to a fixed spaced form (e.g. "YieldMax" -> "Yield Max",
 *      "BitcoinETFs" -> "Bitcoin ETFs", "BuyWrite" -> "Buy Write"). This
 *      catches compounds a generic dictionary lookup can't validate.
 *   2. Generic camelCase splitter: for any remaining tokens with a
 *      [a-z][A-Z] seam, split at every seam and accept only when every piece
 *      is a known word (from /usr/share/dict/words ∪ a finance glossary).
 *   3. Lowercase splitter: for tokens with no uppercase seam, try 2-way and
 *      3-way splits. To avoid false-splitting legitimate non-dict words
 *      (e.g. "Bloomberg", "Coinbase", "reinvestment", "investable",
 *      "opportunistically"), we either (a) require at least one piece to be a
 *      function/connector word ("the", "of", "on", "a", ...), or (b) for
 *      noun+noun splits allow two non-function pieces only when both are
 *      >= 4 chars and the joined token is >= 10 chars and not in a blocklist
 *      of known legitimate non-dictionary words (FINANCE_TERMS).
 *   4. Collapse any double spaces introduced.
 *
 *   npx tsx scripts/fix-etf-description-spacing.ts          # dry run
 *   npx tsx scripts/fix-etf-description-spacing.ts --write  # persist to DB
 *
 * Safe to re-run: rows whose normalised description is unchanged are skipped,
 * and the normaliser is idempotent (running it on already-fixed text yields
 * the same text). Verified: a second dry-run after --write reports 0 changes.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { db } from '../src/lib/db';
import { etfs } from '../src/lib/db/schema';
import { and, eq, isNotNull, ne } from 'drizzle-orm';

const WRITE = process.argv.includes('--write');

// ── 1. Finance glossary ────────────────────────────────────────────────────
// Tickers, common ETF/fund terms, regulator initials, and other tokens the
// system dictionary does not know. Lower-cased for comparison.
const FINANCE_TERMS = new Set([
  // tickers (single & multi)
  'aapl', 'amzn', 'googl', 'meta', 'msft', 'nvda', 'tsla', 'mstr', 'coin',
  'pltr', 'amd', 'snow', 'dis', 'xom', 'pypl', 'rut', 'spx', 'baba', 'abnb',
  'dkng', 'gme', 'hood', 'rblx', 'rdt', 'brk', 'cvna', 'hims', 'mara', 'mrna',
  'nflx', 'snwo', 'smci', 'tsm', 'crwd', 'arm', 'baba',
  // ETF / fund terms
  'etf', 'etfs', 'etp', 'etps', 'etfs', 'nav', 'roc', 'aum', 'cboe', 'otm',
  'itm', 'mbs', 'sm', 'smci', 'plc', 'baas', 'defi',
  // suffixes seen fused onto names
  'inc', 'llc', 'co', 'tm',
  // fund-family / index-provider proper-noun second halves
  'yieldmax', 'buywrite', 'buyw', 'proshares', 'powershares', 'graniteshares',
  'kraneshares', 'vistashares', 'tidal', 'van', 'eck', 'vettafi', 'merqube',
  'wisdom', 'tree', 'factset', 'fitch', 'moat', 'nest', 'egg', 'bofa',
  // option strategy words
  'put', 'puts', 'call', 'calls', 'spread', 'spreads', 'overlay', 'buywrite',
  'covered', 'uncovered', 'short', 'long', 'leveraged', 'swap', 'swaps',
  // finance / legal proper nouns
  'berkshire', 'hathaway', 'walmart', 'roblox', 'snowflake', 'coinbase',
  'paypal', 'carvana', 'draftkings', 'nvidia', 'taiwan', 'exxon', 'mobil',
  'micro', 'apple', 'microsoft', 'alphabet', 'blackrock', 'cayman',
  // descriptive halves seen in the dataset
  'securities', 'security', 'exchange', 'commission', 'corporation', 'act',
  'index', 'indices', 'bitcoin', 'ether', 'crypto', 'assets', 'industry',
  'equities', 'equity', 'futures', 'options', 'strategies', 'strategy',
  'portfolio', 'portfolios', 'rebalance', 'agreements', 'characteristics',
  'construction', 'clearing', 'receipts', 'depositary', 'concentrates',
  'holdings', 'trusts', 'shares', 'underlying', 'securities',
  'yielders', 'weekly', 'pay', 'boost', 'spot', 'mining', 'metals',
  'strategic', 'nuclear', 'energy', 'safety', 'preferred', 'benchmark',
  'distribution', 'diversification', 'applicable', 'commodity', 'european',
  'american', 'global', 'international', 'domestic', 'direct', 'indirect',
  'management', 'reference', 'seeking', 'premiums', 'premium', 'return',
  'blockchain', 'description', 'overview', 'information', 'additional',
  'adviser', 'product', 'relationship', 'russell', 'solactive', 'sec',
  'corp', 'usa', 'us', 'u',
  // known single-word proper nouns / brand names that should never be split
  'bloomberg', 'morningstar', 'solactive', 'sustain', 'sustainable',
  'reinvestment', 'overweight', 'underweight', 'macroeconomic', 'subadvisor',
  'rehypothecation', 'recharacterised', 'recharacterized', 'reweighting',
  'unaffiliated', 'underperformance', 'outperformance', 'nondiversified',
  'nonfundamental', 'nonfundamental', 'unaudited', 'rebalanced',
  'overcollateralization', 'unsecured', 'underlying', 'coinbase', 'buyback',
  'payouts', 'payout', 'blockchain', 'cryptocurrency', 'unaudited',
  'rebalancing', 'rehypothecation', 'subadvisor', 'subadviser',
  'macroeconomics', 'overcollateralised', 'overcollateralized',
  'recharacterisation', 'recharacterization', 'outperformed',
  'underperformed', 'unaffiliated', 'unaudited', 'unsecured',
  'depository', 'depositary', 'reinvestment', 'reinvestments',
  'redemptions', 'redemption', 'benchmark', 'benchmarks',
  'outperforming', 'underperforming', 'rebalanced', 'rebalancing',
  // additional legitimate non-dict words that must NEVER be split
  'investable', 'delisted', 'delisting', 'opportunistically', 'opportunistic',
  'synchronised', 'synchronized', 'securitized', 'securitised',
]);

// Common function / connector words. Lowercase-lowercase fusions in the
// source data almost always involve one of these (e.g. "fromoptions",
// "trackthe", "alsogain", "onaweekly"). Restricting the lowercase splitter
// to only splits where one half is a function word avoids false-splitting
// real proper nouns like "Bloomberg" (bloom+berg) or "Coinbase" (coin+base).
const FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'on', 'in', 'by', 'to', 'from',
  'as', 'at', 'be', 'is', 'its', 'also', 'will', 'may', 'can', 'has', 'have',
  'had', 'was', 'were', 'are', 'that', 'this', 'which', 'with', 'not', 'but',
  'if', 'so', 'do', 'does', 'did', 'than', 'then', 'such', 'any', 'all', 'no',
  'more', 'most', 'other', 'particular', 'owning', 'concerning', 'regarding',
  'potential', 'reference', 'similar', 'on', 'under', 'over', 'into', 'onto',
  'per', 'via', 'than', 'there', 'their', 'these', 'those', 'being', 'been',
]);

// Pre-split dictionary: tokens that should always be rewritten to a fixed
// spaced form before the generic splitter runs. This catches multi-word
// proper nouns (e.g. "YieldMax" -> "Yield Max", "IndexOverview" -> "Index
// Overview", "BuyWrite" -> "Buy Write" -> "Buy-Write") and avoids relying on
// the dictionary for compound brand names.
const PRE_SPLIT: Array<[RegExp, string]> = [
  // brand / fund-family names
  [/YieldMax/g, 'Yield Max'],
  [/YieldBOOST/g, 'Yield BOOST'],
  [/YieldBoost/g, 'Yield Boost'],
  [/ProShares/g, 'ProShares'], // keep; handled below
  [/PowerShares/g, 'PowerShares'],
  [/GraniteShares/g, 'GraniteShares'],
  [/KraneShares/g, 'KraneShares'],
  [/VistaShares/g, 'VistaShares'],
  [/WisdomTree/g, 'Wisdom Tree'],
  [/VanEck/g, 'Van Eck'],
  [/BlackRock/g, 'Black Rock'],
  [/FactSet/g, 'Fact Set'],
  [/MerQube/g, 'Mer Qube'],
  [/NestEgg/g, 'Nest Egg'],
  [/VettaFi/g, 'Vetta Fi'],
  [/MarketVector/g, 'Market Vector'],
  [/TidalInvestments/g, 'Tidal Investments'],
  [/SnowflakeInc/g, 'Snowflake Inc'],
  [/CoinbaseGlobal/g, 'Coinbase Global'],
  [/PayPalHoldings/g, 'PayPal Holdings'],
  [/RobinhoodMarkets/g, 'Robinhood Markets'],
  [/DraftKingsInc/g, 'DraftKings Inc'],
  [/CarvanaCo/g, 'Carvana Co'],
  [/WalmartInc/g, 'Walmart Inc'],
  [/AlphabetInc/g, 'Alphabet Inc'],
  [/AppleInc/g, 'Apple Inc'],
  [/MicrosoftCorporation/g, 'Microsoft Corporation'],
  [/NvidiaCorporation/g, 'Nvidia Corporation'],
  [/BerkshireHathaway/g, 'Berkshire Hathaway'],
  [/HathawayInc/g, 'Hathaway Inc'],
  [/TaiwanSemiconductor/g, 'Taiwan Semiconductor'],
  [/ExxonMobil/g, 'Exxon Mobil'],
  [/AdvancedMicro/g, 'Advanced Micro'],
  [/SuperMicro/g, 'Super Micro'],
  [/RobloxCorporation/g, 'Roblox Corporation'],
  // common compound finance terms
  [/BuyWrite/g, 'Buy Write'],
  [/CoveredCall/g, 'Covered Call'],
  [/CoveredCalls/g, 'Covered Calls'],
  [/CoveredPut/g, 'Covered Put'],
  [/CallOptions/g, 'Call Options'],
  [/CallSpread/g, 'Call Spread'],
  [/CallSpreads/g, 'Call Spreads'],
  [/PutSpread/g, 'Put Spread'],
  [/PutSpreads/g, 'Put Spreads'],
  [/ShortPuts/g, 'Short Puts'],
  [/LongPut/g, 'Long Put'],
  [/LongPuts/g, 'Long Puts'],
  [/IndexOverview/g, 'Index Overview'],
  [/IndexOptions/g, 'Index Options'],
  [/IndexETFs/g, 'Index ETFs'],
  [/SpotBitcoin/g, 'Spot Bitcoin'],
  [/BitcoinETF/g, 'Bitcoin ETF'],
  [/BitcoinETFs/g, 'Bitcoin ETFs'],
  [/BitcoinETPs/g, 'Bitcoin ETPs'],
  [/BitcoinFutures/g, 'Bitcoin Futures'],
  [/BitcoinBlockchain/g, 'Bitcoin Blockchain'],
  [/BitcoinDescription/g, 'Bitcoin Description'],
  [/EtherETF/g, 'Ether ETF'],
  [/EtherETFs/g, 'Ether ETFs'],
  [/GoldETF/g, 'Gold ETF'],
  [/GoldETPs/g, 'Gold ETPs'],
  [/SemiconductorETF/g, 'Semiconductor ETF'],
  [/SemiconductorETFs/g, 'Semiconductor ETFs'],
  [/TechnologyETF/g, 'Technology ETF'],
  [/TechnologyETFs/g, 'Technology ETFs'],
  [/LeveragedETF/g, 'Leveraged ETF'],
  [/LeveragedETFs/g, 'Leveraged ETFs'],
  [/UnderlyingETFs/g, 'Underlying ETFs'],
  [/UnderlyingETP/g, 'Underlying ETP'],
  [/UnderlyingYieldMax/g, 'Underlying Yield Max'],
  [/UnderlyingSecurity/g, 'Underlying Security'],
  [/UnderlyingSecurities/g, 'Underlying Securities'],
  [/UnderlyingStock/g, 'Underlying Stock'],
  [/UnderlyingFund/g, 'Underlying Fund'],
  [/UnderlyingFunds/g, 'Underlying Funds'],
  [/UnderlyingInvestments/g, 'Underlying Investments'],
  [/UnderlyingReference/g, 'Underlying Reference'],
  [/UnderlyingLeveraged/g, 'Underlying Leveraged'],
  [/EachYieldMax/g, 'Each Yield Max'],
  [/SevenETF/g, 'Seven ETF'],
  [/WeeklyPay/g, 'Weekly Pay'],
  [/WeeklyPayFunds/g, 'Weekly Pay Funds'],
  [/TopYielders/g, 'Top Yielders'],
  [/DistributionPolicy/g, 'Distribution Policy'],
  [/AnnualDistribution/g, 'Annual Distribution'],
  [/RebalanceDate/g, 'Rebalance Date'],
  [/SwapAgreements/g, 'Swap Agreements'],
  [/ClearingCorporation/g, 'Clearing Corporation'],
  [/OptionsClearing/g, 'Options Clearing'],
  [/OptionsContracts/g, 'Options Contracts'],
  [/OptionsStrategies/g, 'Options Strategies'],
  [/OptionsStrategy/g, 'Options Strategy'],
  [/OptionIncome/g, 'Option Income'],
  [/OptionOverlay/g, 'Option Overlay'],
  [/OptionStrategy/g, 'Option Strategy'],
  [/EquityStrategy/g, 'Equity Strategy'],
  [/IncomeStrategy/g, 'Income Strategy'],
  [/SpreadStrategy/g, 'Spread Strategy'],
  [/StrategyInc/g, 'Strategy Inc'],
  [/AssetManagement/g, 'Asset Management'],
  [/ManagementLLC/g, 'Management LLC'],
  [/InvestmentsLLC/g, 'Investments LLC'],
  [/InvestmentCompany/g, 'Investment Company'],
  [/CompanyAct/g, 'Company Act'],
  [/CompanyLimited/g, 'Company Limited'],
  [/CorporationNone/g, 'Corporation None'],
  [/SecuritiesExchange/g, 'Securities Exchange'],
  [/ExchangeAct/g, 'Exchange Act'],
  [/ExchangeCommission/g, 'Exchange Commission'],
  [/ExchangeTraded/g, 'Exchange Traded'],
  [/TradingCommission/g, 'Trading Commission'],
  [/InternalRevenue/g, 'Internal Revenue'],
  [/UnitedStates/g, 'United States'],
  [/StatesDepartment/g, 'States Department'],
  [/NewYork/g, 'New York'],
  [/YorkStock/g, 'York Stock'],
  [/NasdaqStock/g, 'Nasdaq Stock'],
  [/CaymanSubsidiary/g, 'Cayman Subsidiary'],
  [/DomesticSubsidiary/g, 'Domestic Subsidiary'],
  [/BenchmarkIndex/g, 'Benchmark Index'],
  [/ReferenceIndex/g, 'Reference Index'],
  [/InternationalEquities/g, 'International Equities'],
  [/InternationalIndex/g, 'International Index'],
  [/InternationalUnderlying/g, 'International Underlying'],
  [/GlobalEquity/g, 'Global Equity'],
  [/GlobalGold/g, 'Global Gold'],
  [/IndustryCompanies/g, 'Industry Companies'],
  [/SemiconductorCompanies/g, 'Semiconductor Companies'],
  [/TechnologyCompanies/g, 'Technology Companies'],
  [/TechnologyCompany/g, 'Technology Company'],
  [/PortfolioCFC/g, 'Portfolio CFC'],
  [/PortfolioCharacteristics/g, 'Portfolio Characteristics'],
  [/PortfolioConstruction/g, 'Portfolio Construction'],
  [/FundAttributes/g, 'Fund Attributes'],
  [/FundPortfolio/g, 'Fund Portfolio'],
  [/FundShares/g, 'Fund Shares'],
  [/NoFund/g, 'No Fund'],
  [/AmericanStyle/g, 'American Style'],
  [/EuropeanStyle/g, 'European Style'],
  [/AddedExposure/g, 'Added Exposure'],
  [/AdditionalFund/g, 'Additional Fund'],
  [/AdditionalInformation/g, 'Additional Information'],
  [/InformationAbout/g, 'Information About'],
  [/SeekingPremiums/g, 'Seeking Premiums'],
  [/TaxLoss/g, 'Tax Loss'],
  [/DiversificationTest/g, 'Diversification Test'],
  [/EquitiesDirect/g, 'Equities Direct'],
  [/EquitiesIndirect/g, 'Equities Indirect'],
  [/CryptoAssets/g, 'Crypto Assets'],
  [/CryptoIndustry/g, 'Crypto Industry'],
  [/DevelopingStrategic/g, 'Developing Strategic'],
  [/StrategicMetals/g, 'Strategic Metals'],
  [/MetalsMining/g, 'Metals Mining'],
  [/MiningCompany/g, 'Mining Company'],
  [/SafetyTM/g, 'Safety TM'],
  [/PreferredTM/g, 'Preferred TM'],
  [/SecurityTM/g, 'Security TM'],
  [/MoatTM/g, 'Moat TM'],
  [/BenchmarkTM/g, 'Benchmark TM'],
  [/TrustsTM/g, 'Trusts TM'],
  [/AchieversTM/g, 'Achievers TM'],
  [/DepositaryReceipts/g, 'Depositary Receipts'],
  [/SyntheticCovered/g, 'Synthetic Covered'],
  [/SyntheticExposure/g, 'Synthetic Exposure'],
  [/SyntheticLong/g, 'Synthetic Long'],
  [/SyntheticShort/g, 'Synthetic Short'],
  [/SyntheticOptions/g, 'Synthetic Options'],
  [/DirectLong/g, 'Direct Long'],
  [/NuclearEnergy/g, 'Nuclear Energy'],
  [/CommodityExchange/g, 'Commodity Exchange'],
  [/FitchRatings/g, 'Fitch Ratings'],
  [/ApplicableSecurity/g, 'Applicable Security'],
  [/PerPYPL/g, 'Per PYPL'],
  [/PerSMCI/g, 'Per SMCI'],
  [/IndexSM/g, 'Index SM'],
  // "theXXX" / "ofXXX" / "andXXX" / "forXXX" patterns
  [/TheAdviser/g, 'The Adviser'],
  [/TheAmerican/g, 'The American'],
  [/TheBitcoin/g, 'The Bitcoin'],
  [/TheCore/g, 'The Core'],
  [/TheCorporations/g, 'The Corporations'],
  [/TheEther/g, 'The Ether'],
  [/TheExplore/g, 'The Explore'],
  [/TheFund/g, 'The Fund'],
  [/TheIndex/g, 'The Index'],
  [/TheNasdaq/g, 'The Nasdaq'],
  [/TheProduct/g, 'The Product'],
  [/TheRelationship/g, 'The Relationship'],
  [/TheRussell/g, 'The Russell'],
  [/TheS\b/g, 'The S'],
  [/TheSolactive/g, 'The Solactive'],
  [/TheUnderlying/g, 'The Underlying'],
  [/TheWalt/g, 'The Walt'],
  [/TheUS/g, 'The US'],
  [/theAdviser/g, 'the Adviser'],
  [/theApplicable/g, 'the Applicable'],
  [/theBitcoin/g, 'the Bitcoin'],
  [/theCore/g, 'the Core'],
  [/theCorporations/g, 'the Corporations'],
  [/theCovered/g, 'the Covered'],
  [/theETF/g, 'the ETF'],
  [/theExchange/g, 'the Exchange'],
  [/theFund/g, 'the Fund'],
  [/theFunds/g, 'the Funds'],
  [/theGold/g, 'the Gold'],
  [/theIndex/g, 'the Index'],
  [/theNasdaq/g, 'the Nasdaq'],
  [/theProduct/g, 'the Product'],
  [/theRUT/g, 'the RUT'],
  [/theReference/g, 'the Reference'],
  [/theS\b/g, 'the S'],
  [/theSEC/g, 'the SEC'],
  [/theSPX/g, 'the SPX'],
  [/theSection/g, 'the Section'],
  [/theSecurities/g, 'the Securities'],
  [/theSpot/g, 'the Spot'],
  [/theSub/g, 'the Sub'],
  [/theTrust/g, 'the Trust'],
  [/theU\b/g, 'the U'],
  [/theUnderlying/g, 'the Underlying'],
  [/theYieldMax/g, 'the Yield Max'],
  [/anUnderlying/g, 'an Underlying'],
  [/AnInvestment/g, 'An Investment'],
  [/andBitcoin/g, 'and Bitcoin'],
  [/andExchange/g, 'and Exchange'],
  [/andGlobal/g, 'and Global'],
  [/andROC/g, 'and ROC'],
  [/andYieldMax/g, 'and Yield Max'],
  [/anyUnderlying/g, 'any Underlying'],
  [/concerningSNOW/g, 'concerning SNOW'],
  [/coveredOptions/g, 'covered Options'],
  [/createdGPU/g, 'created GPU'],
  [/domesticU\b/g, 'domestic U'],
  [/forUnderlying/g, 'for Underlying'],
  [/ForUnderlying/g, 'For Underlying'],
  [/inFLEX/g, 'in FLEX'],
  [/itsIndex/g, 'its Index'],
  [/itsUnderlying/g, 'its Underlying'],
  [/leadingU\b/g, 'leading U'],
  [/listedETF/g, 'listed ETF'],
  [/moreInternational/g, 'more International'],
  [/ofAMZN/g, 'of AMZN'],
  [/ofBitcoin/g, 'of Bitcoin'],
  [/ofCOIN/g, 'of COIN'],
  [/ofGOOGL/g, 'of GOOGL'],
  [/ofMETA/g, 'of META'],
  [/ofMSFT/g, 'of MSFT'],
  [/ofNVDA/g, 'of NVDA'],
  [/ofPLTR/g, 'of PLTR'],
  [/ofTSLA/g, 'of TSLA'],
  [/onUnderlying/g, 'on Underlying'],
  [/orFLEX/g, 'or FLEX'],
  [/orFLexible/g, 'or Flexible'],
  [/otherETFs/g, 'other ETFs'],
  [/owningBitcoin/g, 'owning Bitcoin'],
  [/particularBitcoin/g, 'particular Bitcoin'],
  [/particularUnderlying/g, 'particular Underlying'],
  [/potentialIndex/g, 'potential Index'],
  [/premiumsThe/g, 'premiums The'],
  [/purchasedOTM/g, 'purchased OTM'],
  [/purchasedSPX/g, 'purchased SPX'],
  [/recentForm/g, 'recent Form'],
  [/referenceBitcoin/g, 'reference Bitcoin'],
  [/referenceIndex/g, 'reference Index'],
  [/regardingAMD/g, 'regarding AMD'],
  [/regardingAlphabet/g, 'regarding Alphabet'],
  [/regardingDIS/g, 'regarding DIS'],
  [/regardingSNOW/g, 'regarding SNOW'],
  [/regardingTesla/g, 'regarding Tesla'],
  [/regardingXOM/g, 'regarding XOM'],
  [/regulatedU\b/g, 'regulated U'],
  [/returnBitcoin/g, 'return Bitcoin'],
  [/sevenUnderlying/g, 'seven Underlying'],
  [/similarUnderlying/g, 'similar Underlying'],
  [/termU\b/g, 'term U'],
  [/utilizingTreasuries/g, 'utilizing Treasuries'],
  [/yieldMBS/g, 'yield MBS'],
  [/StrategyThe/g, 'Strategy The'],
  [/StrategyCall/g, 'Strategy Call'],
  [/StrategyPut/g, 'Strategy Put'],
  [/ContractsThe/g, 'Contracts The'],
  [/IndexThe/g, 'Index The'],
  [/EachUnderlying/g, 'Each Underlying'],
  [/SomeUnderlying/g, 'Some Underlying'],
  [/ExplorePortfolio/g, 'Explore Portfolio'],
  [/WhyInvest/g, 'Why Invest'],
];

// ── 2. System dictionary loader ──────────────────────────────────────────
let DICT: Set<string> | null = null;
async function dict(): Promise<Set<string>> {
  if (DICT) return DICT;
  const raw = await readFile('/usr/share/dict/words', 'utf8');
  DICT = new Set(
    raw
      .split('\n')
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean),
  );
  return DICT;
}

function isKnownWord(word: string, dictSet: Set<string>): boolean {
  const w = word.toLowerCase();
  if (!w) return false;
  if (dictSet.has(w)) return true;
  if (FINANCE_TERMS.has(w)) return true;
  return false;
}

// ── 3. Generic splitter: split a capitalised token at its seams and verify
// every resulting chunk is a known word. If any chunk is unknown, return the
// token unchanged (we'd rather leave "BaaS" untouched than corrupt it).
function trySplitCamel(token: string, dictSet: Set<string>): string {
  // Only handle tokens that contain at least one lowercase->uppercase seam.
  if (!/[a-z][A-Z]/.test(token)) return token;

  const seams: number[] = [];
  for (let i = 1; i < token.length; i++) {
    if (/[a-z]/.test(token[i - 1]! as string) && /[A-Z]/.test(token[i] as string)) {
      seams.push(i);
    }
  }
  if (seams.length === 0) return token;

  // Try splitting at each seam; for multi-seam tokens, try all combinations
  // and accept the first where every segment is a known word.
  function tryCombos(start: number, acc: string[]): string[] | null {
    if (start === token.length) return acc;
    // try consuming from `start` to each seam or to end
    const candidates: number[] = [];
    for (const s of seams) {
      if (s > start) candidates.push(s);
    }
    candidates.push(token.length); // also try taking the rest
    for (const end of candidates) {
      const piece = token.slice(start, end);
      if (!isKnownWord(piece, dictSet)) continue;
      if (end === token.length) {
        return [...acc, piece];
      }
      const r = tryCombos(end, [...acc, piece]);
      if (r) return r;
    }
    return null;
  }

  const result = tryCombos(0, []);
  if (!result) return token; // couldn't validate all pieces
  return result.join(' ');
}

// Split text: run pre-split list, then run generic camelCase splitter on the
// remaining tokens, then run the lowercase-fusion splitter, then collapse
// double spaces.
function fixSpacing(text: string, dictSet: Set<string>): string {
  let out = text;
  for (const [re, replacement] of PRE_SPLIT) {
    out = out.replace(re, replacement);
  }
  // For any remaining tokens that still have a [a-z][A-Z] seam, try the generic
  // splitter. Process word-by-word so we don't disturb acronyms / symbols.
  out = out.replace(/[A-Za-z][A-Za-z0-9]*[a-z][A-Z][A-Za-z0-9]*/g, (tok) => {
    const split = trySplitCamel(tok, dictSet);
    return split;
  });
  // Lowercase→lowercase fusions (e.g. "fromoptions", "trackthe", "alsogain",
  // "periodsof", "onaweekly", "sella"): scan alphabetic runs that contain no
  // internal space and try to split into 2 or 3 known words. To avoid
  // false-splitting legitimate proper nouns (e.g. "Bloomberg", "Coinbase",
  // "reinvestment"), we require every non-function-word piece to be a real
  // word of length >= 3, AND at least one piece to be a function/connector
  // word. Function words may be 1-2 chars (e.g. "a", "of", "on", "is"). We try
  // 2-way splits first, then 3-way. No 4+ way splits (too noisy). Length 5..24.
  out = out.replace(/[A-Za-z]{5,24}/g, (tok) => {
    if (isKnownWord(tok, dictSet)) return tok;
    if (/[a-z][A-Z]/.test(tok)) return tok;
    if (FINANCE_TERMS.has(tok.toLowerCase())) return tok;

    const isFn = (w: string) => FUNCTION_WORDS.has(w.toLowerCase());
    const okWord = (w: string) => isKnownWord(w, dictSet) && w.length >= 3;
    const okFn = (w: string) => isFn(w) && isKnownWord(w, dictSet);

    // 2-way: one half is a function word, the other is a real word (>=3 chars).
    // Iterate the function word from the longest down so we prefer "from"
    // over "f"+"rom" style noise and align with natural word boundaries.
    for (let i = tok.length - 1; i >= 1; i--) {
      const a = tok.slice(0, i);
      const b = tok.slice(i);
      if (isFn(a) && okWord(b) && isKnownWord(a, dictSet)) return `${a} ${b}`;
      if (okWord(a) && isFn(b) && isKnownWord(b, dictSet)) return `${a} ${b}`;
    }
    // 2-way content split (noun+noun / adj+noun fusions like "investmentgains",
    // "equitysecurities"). To avoid false-splitting legitimate non-dict words
    // (e.g. "investable" → "invest able", "opportunistically" →
    // "opportunistic ally", "delisted" → "del is ted"), legitimate non-dict
    // words are listed in FINANCE_TERMS (checked at the top of this block) so
    // they skip splitting entirely. We only allow this rule when both halves
    // are >= 4 chars AND the joined token is >= 10 chars.
    if (tok.length >= 10) {
      for (let i = 4; i <= tok.length - 4; i++) {
        const a = tok.slice(0, i);
        const b = tok.slice(i);
        if (okWord(a) && okWord(b) && !isFn(a) && !isFn(b)) {
          return `${a} ${b}`;
        }
      }
    }
    // 3-way: split into a + b + c, at least one is a function word, the other
    // pieces must be (function word OR real word >=3 chars). Require at least
    // one non-function piece so we don't split "toais" into "to a is".
    // Prefer longer non-function pieces by scanning a from longest down.
    for (let i = tok.length - 2; i >= 1; i--) {
      const a = tok.slice(0, i);
      const aIsFn = isFn(a) && isKnownWord(a, dictSet);
      const aOkWord = okWord(a);
      if (!aIsFn && !aOkWord) continue;
      for (let j = i + 1; j <= tok.length - 1; j++) {
        const b = tok.slice(i, j);
        const c = tok.slice(j);
        const bIsFn = isFn(b) && isKnownWord(b, dictSet);
        const cIsFn = isFn(c) && isKnownWord(c, dictSet);
        const bOkWord = okWord(b);
        const cOkWord = okWord(c);
        if (!((bIsFn || bOkWord) && (cIsFn || cOkWord))) continue;
        const nonFnCount = [a, b, c].filter((x) => !isFn(x)).length;
        if (nonFnCount < 1) continue;
        if (aIsFn || bIsFn || cIsFn) return `${a} ${b} ${c}`;
      }
    }
    return tok;
  });
  // collapse accidental double spaces
  out = out.replace(/  +/g, ' ');
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const dictSet = await dict();
  const rows = await db
    .select({ id: etfs.id, ticker: etfs.ticker, description: etfs.description })
    .from(etfs)
    .where(and(isNotNull(etfs.description), ne(etfs.description, '')));

  console.log(`Found ${rows.length} ETFs with descriptions.${WRITE ? ' (WRITE mode)' : ' (dry run)'}`);

  let changed = 0;
  let unchanged = 0;

  for (const r of rows) {
    const original = r.description ?? '';
    const fixed = fixSpacing(original, dictSet);
    if (fixed === original) {
      unchanged++;
      continue;
    }
    changed++;
    if (!WRITE) {
      console.log(`\n=== ${r.ticker} ===`);
      // show first ~400 chars of diff for sanity
      console.log('  before:', JSON.stringify(original.slice(0, 400)));
      console.log('  after :', JSON.stringify(fixed.slice(0, 400)));
      continue;
    }
    await db.update(etfs).set({ description: fixed }).where(eq(etfs.id, r.id));
    console.log(`  ✓ ${r.ticker} (${original.length} -> ${fixed.length} chars)`);
  }

  console.log(`\nDone. ${changed} would be ${WRITE ? 'updated' : 'updated (dry run)'}, ${unchanged} unchanged.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });