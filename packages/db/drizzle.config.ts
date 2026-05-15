import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from monorepo root first, then CWD overrides
config({ path: resolve(__dirname, '../../.env') });
config(); // also load from CWD if present
import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL or DATABASE_URL_UNPOOLED must be set for migrations');
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
  casing: 'snake_case',
});
