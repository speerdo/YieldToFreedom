import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

function databaseUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_CONNECTION_STRING;
  if (!url) {
    throw new Error('Set DATABASE_URL (or NEON_DATABASE_CONNECTION_STRING) for Drizzle.');
  }
  return url;
}

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl(),
  },
});
