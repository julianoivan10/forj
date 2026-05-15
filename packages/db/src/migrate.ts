import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

async function main() {
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL or DATABASE_URL_UNPOOLED must be set');
  }

  const sql = neon(databaseUrl);
  const db = drizzle(sql);

  console.warn('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.warn('Migrations complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
