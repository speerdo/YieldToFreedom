/** Base URL for confirmation links (no trailing slash). */
export function publicSiteOrigin(): string {
  const meta =
    typeof import.meta !== 'undefined' && 'env' in import.meta
      ? (import.meta.env as Record<string, string | undefined>)
      : {};

  const raw =
    meta.PUBLIC_SITE_URL ??
    meta.SITE ??
    process.env.PUBLIC_SITE_URL ??
    'https://yieldtofreedom.com';

  return String(raw).replace(/\/+$/, '');
}
