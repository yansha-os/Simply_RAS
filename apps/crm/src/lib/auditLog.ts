import { prisma } from '@/lib/prisma';

/**
 * AuditLogVault writer (gap 12) — PHI access/audit trail for view/sign/convert/export.
 * Fire-and-forget by contract: never throws, so audit failures cannot block clinical writes.
 * Log ids only — no client names / DOB / narrative in `meta`.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuditLogEntry = {
  /** User.id when available; non-UUID actors (dev impersonation) are kept in meta only */
  actorUserId?: string | null;
  /** VIEW | SIGN | CONVERT | EXPORT | EDIT | DELETE */
  action: string;
  /** SESSION_NOTE | CLIENT | PA_REQUEST | BILLING_CLAIM … */
  entityType: string;
  entityId: string;
  meta?: Record<string, unknown>;
};

function toRow(entry: AuditLogEntry) {
  const actorIsUuid = Boolean(entry.actorUserId && UUID_RE.test(entry.actorUserId));
  return {
    userId: actorIsUuid ? entry.actorUserId! : null,
    action: entry.action,
    resourceType: entry.entityType,
    resourceId: entry.entityId,
    metadata: {
      ...(entry.meta ?? {}),
      ...(!actorIsUuid && entry.actorUserId ? { actorLabel: entry.actorUserId } : {}),
    },
  };
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLogVault.create({ data: toRow(entry) });
  } catch (error) {
    console.error(
      'writeAuditLog failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
  }
}

export async function writeAuditLogs(entries: AuditLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    await prisma.auditLogVault.createMany({ data: entries.map(toRow) });
  } catch (error) {
    console.error(
      'writeAuditLogs failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
  }
}
