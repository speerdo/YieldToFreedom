export function cronAuthorized(request: Request): boolean {
  const secret =
    (typeof import.meta !== 'undefined' && 'env' in import.meta
      ? (import.meta.env as Record<string, string | undefined>).CRON_SECRET
      : undefined) ?? process.env.CRON_SECRET;

  if (!secret) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export function cronUnauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
