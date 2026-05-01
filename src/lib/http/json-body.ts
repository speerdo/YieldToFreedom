function simpleEmailCheck(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const data = (await request.json()) as Record<string, unknown>;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  if (!e || e.length > 254) return null;
  if (!simpleEmailCheck(e)) return null;
  return e;
}
