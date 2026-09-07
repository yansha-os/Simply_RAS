/**
 * Cross-app copy — keep in sync with apps/crm/src/lib/staffCredentials.ts
 * (clinicTimezone import path differs per app).
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
  expirationDate: string | null;
  required: boolean;
};

export type StaffCredentialStatus = {
  userId: string;
  displayName: string | null;
  role: string | null;
  overall: 'ACTIVE' | 'EXPIRED' | 'MISSING' | 'NOT_TRACKED';
  items: CredentialItemStatus[];
  warnings: string[];
};

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
  if (exp && endOfClinicDayForDateOnly(exp) < now) return false;
  return true;
}

function isoDateOnly(value: Date | string | null): string | null {
  const d = toDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

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

export type CredentialHardStopResult =
  | { ok: true; warnings: string[] }
  | { ok: false; code: 'CREDENTIAL_HARD_STOP'; blockers: string[]; warnings: string[] };

export function evaluateCredentialHardStop(input: {
  clientStatus: string;
  rbtStatus: StaffCredentialStatus | null;
  bcbaStatus: StaffCredentialStatus | null;
}): CredentialHardStopResult {
  const warnings: string[] = [];
  const blockers: string[] = [];
  const activeOnly = input.clientStatus === 'ACTIVE';

  const roles: Array<{ label: string; status: StaffCredentialStatus | null }> = [
    { label: 'Session RBT', status: input.rbtStatus },
    { label: 'Supervising BCBA', status: input.bcbaStatus },
  ];

  for (const { label, status } of roles) {
    if (!status || status.overall === 'NOT_TRACKED') continue;
    if (status.overall === 'ACTIVE') continue;
    const who = status.displayName ? `${label} ${status.displayName}` : label;
    const line = `${who}: ${status.warnings.join(', ') || 'credential issue on file'}`;
    if (activeOnly) blockers.push(line);
    else warnings.push(line);
  }

  if (activeOnly && blockers.length > 0) {
    return { ok: false, code: 'CREDENTIAL_HARD_STOP', blockers, warnings };
  }
  return { ok: true, warnings };
}
