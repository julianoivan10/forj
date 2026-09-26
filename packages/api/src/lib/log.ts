/**
 * Structured server logging: one JSON object per line, which Vercel's log
 * drain can filter by `event`. Used for money-path and security events
 * (escrow transactions, confirmations, reconciliation drift, webhook and
 * verification failures, admin actions).
 *
 * Redaction: values under keys that look like credentials or personal
 * data are replaced before serialising. Never pass raw request headers.
 *
 * Info lines go straight to stdout because the production build strips
 * `console.log` (next.config `removeConsole`).
 */
type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const SENSITIVE_KEY = /(secret|token|password|authorization|cookie|private|mnemonic|seed|signature|email|privyid|apikey|api_key)/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message.slice(0, 500) };
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Fields = {};
    for (const [k, v] of Object.entries(value as Fields)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

export function log(level: Level, event: string, fields: Fields = {}): void {
  if (process.env.FORJ_LOG_SILENT === '1') return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(sanitize(fields) as Fields) });
  if (level === 'info') process.stdout.write(`${line}\n`);
  else if (level === 'warn') console.warn(line);
  else console.error(line);
}
