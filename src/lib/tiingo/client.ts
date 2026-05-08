const TIINGO_BASE = 'https://api.tiingo.com';

function resolveTiingoKey(): string {
  const meta =
    typeof import.meta !== 'undefined' && 'env' in import.meta
      ? (import.meta.env as Record<string, string | undefined>)
      : undefined;
  const key = meta?.TIINGO_API_KEY ?? process.env.TIINGO_API_KEY;
  if (!key) throw new Error('TIINGO_API_KEY is not set');
  return key;
}

function tiingoHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Token ${resolveTiingoKey()}`,
  };
}

export async function tiingoGet<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${TIINGO_BASE}${path.startsWith('/') ? path : `/${path}`}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: tiingoHeaders() });
  if (!res.ok) throw new Error(`Tiingo ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Typed Response Shapes ─────────────────────────────────────────────────

export interface TiingoMeta {
  ticker: string;
  name: string;
  exchangeCode: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
}

/** One row from /tiingo/daily/<ticker>/prices */
export interface TiingoEodRow {
  date: string;           // ISO-8601 with time component, e.g. "2025-01-15T00:00:00+00:00"
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  adjOpen: number | null;
  adjHigh: number | null;
  adjLow: number | null;
  adjClose: number | null;
  adjVolume: number | null;
  /** Dividend paid on this ex-date (0 if none) */
  divCash: number;
  /** Split factor (1.0 if no split) */
  splitFactor: number;
}

/** One row from /tiingo/dividends/<ticker> */
export interface TiingoDividendRow {
  /** Ex-dividend date */
  exDate: string;
  /** Cash amount per share */
  divCash: number;
  /** Split-adjusted dividend */
  adjDivCash?: number;
  /** Declared date */
  declaredDate?: string | null;
  /** Record date */
  recordDate?: string | null;
  /** Pay date */
  payDate?: string | null;
}

// ─── Convenience Helpers ────────────────────────────────────────────────────

/** Fetch metadata (name, exchange, description) for a ticker. */
export function tiingoMeta(ticker: string): Promise<TiingoMeta> {
  return tiingoGet<TiingoMeta>(`/tiingo/daily/${ticker.toLowerCase()}`);
}

/**
 * Fetch EOD price rows.
 * - No params → latest trading day only (array with 1 element).
 * - With startDate/endDate (YYYY-MM-DD) → full date range.
 */
export function tiingoPrices(
  ticker: string,
  params: Record<string, string> = {},
): Promise<TiingoEodRow[]> {
  return tiingoGet<TiingoEodRow[]>(`/tiingo/daily/${ticker.toLowerCase()}/prices`, params);
}

/**
 * Fetch dividend history from the dedicated dividends endpoint.
 * Returns rows sorted newest-first.
 * Params: startDate, endDate (YYYY-MM-DD).
 */
export function tiingoDividends(
  ticker: string,
  params: Record<string, string> = {},
): Promise<TiingoDividendRow[]> {
  return tiingoGet<TiingoDividendRow[]>(`/tiingo/dividends/${ticker.toLowerCase()}`, params);
}
