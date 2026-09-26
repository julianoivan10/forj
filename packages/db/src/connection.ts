/**
 * True for Postgres servers reached over the plain wire protocol (local
 * Docker, CI). Neon hosts use the serverless driver instead. Forcing the
 * choice is possible with DATABASE_DRIVER=pg | neon.
 */
export function isPlainPostgres(url: string): boolean {
  const forced = process.env.DATABASE_DRIVER;
  if (forced === 'pg') return true;
  if (forced === 'neon') return false;
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}
