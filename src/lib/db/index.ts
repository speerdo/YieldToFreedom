import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

function resolveDatabaseUrl(): string {
  const meta =
    typeof import.meta !== 'undefined' && 'env' in import.meta
      ? (import.meta.env as Record<string, string | undefined>)
      : undefined;
  const url =
    meta?.DATABASE_URL ??
    meta?.NEON_DATABASE_CONNECTION_STRING ??
    process.env.DATABASE_URL ??
    process.env.NEON_DATABASE_CONNECTION_STRING;
  if (!url) throw new Error('Set DATABASE_URL or NEON_DATABASE_CONNECTION_STRING');
  return url;
}

const sql = neon(resolveDatabaseUrl());
export const db = drizzle(sql, { schema });
