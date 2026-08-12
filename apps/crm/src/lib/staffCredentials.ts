/**
 * StaffCredential soft gate (P2 credential enforcement, gap-analysis Phase 2).
 * Pure summarizer only — DB-backed helpers live in staffCredentials.server.ts.
 * WARN-ONLY by contract: callers surface `warnings` next to sign/convert but
 * never block on them — the hard gate stays signatures + checklist + auth units.
 */

import { endOfClinicDayForDateOnly } from '@/lib/clinicTimezone';

export type CredentialRow = {
  credentialType: string;
  isCredentialed: boolean;
  expirationDate: Date | string | null;
};

export type CredentialItemState = 'ACTIVE' | 'EXPIRED' | 'INACTIVE' | 'MISSING';

export type CredentialItemStatus = {
  credentialType: string;
  state: CredentialItemState;
  /** Latest expiration seen for the type (ISO), if any */
  expirationDate: string | null;
  /** Required for the user's role (drives overall + warnings) */
  required: boolean;
};

export type StaffCredentialStatus = {
  userId: string;
  displayName: string | null;
  role: string | null;
  /** Worst state across REQUIRED credential types */
  overall: 'ACTIVE' | 'EXPIRED' | 'MISSING' | 'NOT_TRACKED';
  items: CredentialItemStatus[];
  /** Human-readable, PHI-free — e.g. "BACB_LICENSE expired 2026-05-01" */
  warnings: string[];
};

/**
 * Minimal required set per clinical role — the payer-facing license only.
 * Other rows on file (CPR_CERT, NPI, …) are reported but never generate warnings.
 */
export const REQUIRED_CREDENTIALS_BY_ROLE: Record<string, string[]> = {
  BCBA: ['BACB_LICENSE'],
  RBT: ['BACB_LICENSE'],
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function rowIsActive(row: CredentialRow, now: Date): boolean {
  if (!row.isCredentialed) return false;
  const exp = toDate(row.expirationDate);
  // Date-only expiration is valid through clinic (ET) end-of-day, same as auth windows
  if (exp && endOfClinicDayForDateOnly(exp) < now) return false;
  return true;
}

function isoDateOnly(value: Date | string | null): string | null {
  const d = toDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * Pure per-type rollup: a type is ACTIVE when ANY row of that type is active
 * (renewals coexist with expired rows), EXPIRED/INACTIVE otherwise, and
 * required types with no row at all are reported MISSING.
 */
export function summarizeStaffCredentials(input: {
  userId: string;
  displayName?: string | null;
  role: string | null;
  credentials: CredentialRow[];
  now?: Date;
}): StaffCredentialStatus {
  const now = input.now ?? new Date();
  const required = new Set(REQUIRED_CREDENTIALS_BY_ROLE[input.role ?? ''] ?? []);

  const byType = new Map<string, CredentialRow[]>();
  for (const row of input.credentials) {
    const type = (row.credentialType || '').trim();
    if (!type) continue;
    const rows = byType.get(type) ?? [];
    rows.push(row);
    byType.set(type, rows);
  }

  const items: CredentialItemStatus[] = [];
  const warnings: string[] = [];

  for (const [type, rows] of byType) {
    const anyActive = rows.some((r) => rowIsActive(r, now));
    const anyCredentialed = rows.some((r) => r.isCredentialed);
    const state: CredentialItemState = anyActive
      ? 'ACTIVE'
      : anyCredentialed
        ? 'EXPIRED'
        : 'INACTIVE';
    const latestExpiration = rows
      .map((r) => toDate(r.expirationDate))
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    items.push({
      credentialType: type,
      state,
      expirationDate: latestExpiration ? isoDateOnly(latestExpiration) : null,
      required: required.has(type),
    });

    if (required.has(type) && state !== 'ACTIVE') {
      warnings.push(
        state === 'EXPIRED'
          ? `${type} expired${latestExpiration ? ` ${isoDateOnly(latestExpiration)}` : ''}`
          : `${type} marked not credentialed`,
      );
    }
  }

  for (const type of required) {
    if (byType.has(type)) continue;
    items.push({ credentialType: type, state: 'MISSING', expirationDate: null, required: true });
    warnings.push(`No ${type} on file`);
  }

  let overall: StaffCredentialStatus['overall'];
  if (required.size === 0) {
    overall = 'NOT_TRACKED';
  } else if ([...required].some((t) => !byType.has(t))) {
    overall = 'MISSING';
  } else if (
    [...required].some((t) => !(byType.get(t) ?? []).some((r) => rowIsActive(r, now)))
  ) {
    overall = 'EXPIRED';
  } else {
    overall = 'ACTIVE';
  }

  return {
    userId: input.userId,
    displayName: input.displayName ?? null,
    role: input.role,
    overall,
    items,
    warnings,
  };
}