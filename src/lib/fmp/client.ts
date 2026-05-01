// FMP deprecated /api/v3 and /api/v4 on 2025-08-31; all new endpoints use /stable/
const FMP_BASE = 'https://financialmodelingprep.com/stable';

function resolveFmpKey(): string {
  const meta =
    typeof import.meta !== 'undefined' && 'env' in import.meta
      ? (import.meta.env as Record<string, string | undefined>)
      : undefined;
  const key = meta?.FMP_API_KEY ?? process.env.FMP_API_KEY;
  if (!key) throw new Error('FMP_API_KEY is not set');
  return key;
}

export async function fmpGet<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${FMP_BASE}${path.startsWith('/') ? path : `/${path}`}`);
  url.searchParams.set('apikey', resolveFmpKey());
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FMP ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}
