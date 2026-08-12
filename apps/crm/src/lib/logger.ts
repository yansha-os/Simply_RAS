/**
 * Structured logging helper (CRM).
 *
 * Emits one single-line JSON object per call to stdout/stderr so host log
 * drains (Vercel, pm2, systemd journal, Docker) can index and alert on it.
 * Shape: { ts, app, level, event, meta? }
 *
 * ── HARD RULE: NEVER LOG PHI ─────────────────────────────────────────────
 * No client/parent/staff names, DOB, addresses, phone numbers, emails,
 * insurance member IDs, or session-note content — EVER. Log opaque record
 * ids only (clientId, sessionNoteId, userId, etc.). Error messages from
 * Prisma/Supabase are acceptable; free-text user input is not.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   logInfo('health.db_probe', { durationMs: 12 })
 *   logError('upload.storage_failed', { message: err.message })
 */

type LogLevel = 'info' | 'warn' | 'error';

/** PHI-free context for a log line — ids, counts, durations, error messages. */
export type LogMeta = Record<string, unknown>;

const APP = 'crm';

function emit(level: LogLevel, event: string, meta?: LogMeta): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    app: APP,
    level,
    event,
    ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function logInfo(event: string, meta?: LogMeta): void {
  emit('info', event, meta);
}

export function logWarn(event: string, meta?: LogMeta): void {
  emit('warn', event, meta);
}

export function logError(event: string, meta?: LogMeta): void {
  emit('error', event, meta);
}

/** Serialize an unknown thrown value into PHI-safe meta fields. */
export function errorMeta(err: unknown): LogMeta {
  if (err instanceof Error) {
    return { errorName: err.name, message: err.message };
  }
  return { message: String(err) };
}
