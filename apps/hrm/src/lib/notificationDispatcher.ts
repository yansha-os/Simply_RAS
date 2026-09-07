import type { Role } from '@repo/db';
import { prisma } from '@/lib/prisma';

export const MAX_NOTIFICATION_FAN_OUT = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_LINK_CHARACTER_RE = /[\u0000-\u001f\u007f\\]/;

export type NotificationPayload = {
  title: string;
  message: string;
  type?: 'INFO' | 'WARNING' | 'ALERT' | string;
  linkUrl?: string;
  dedupeHours?: number;
};

type LinkResult =
  | { ok: true; linkUrl: string | undefined }
  | { ok: false; error: string };

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '0.0.0.0' ||
    normalized.startsWith('127.') ||
    normalized === '::1' ||
    normalized === '[::1]'
  );
}

function configuredTrustedOrigins() {
  const origins = new Set<string>();
  for (const configured of [
    process.env.NEXT_PUBLIC_CRM_URL,
    process.env.NEXT_PUBLIC_HRM_URL,
  ]) {
    if (!configured) continue;
    try {
      const url = new URL(configured);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      if (process.env.NODE_ENV === 'production' && isLoopbackHostname(url.hostname)) {
        continue;
      }
      origins.add(url.origin);
    } catch {
      // Invalid deployment configuration is not a trusted link target.
    }
  }
  return origins;
}

export function normalizeNotificationLink(linkUrl: string | undefined): LinkResult {
  if (linkUrl === undefined) return { ok: true, linkUrl: undefined };

  const candidate = linkUrl.trim();
  if (
    !candidate ||
    candidate.startsWith('//') ||
    UNSAFE_LINK_CHARACTER_RE.test(candidate)
  ) {
    return { ok: false, error: 'Invalid notification link.' };
  }

  if (candidate.startsWith('/')) {
    const parsed = new URL(candidate, 'https://notification.invalid');
    return {
      ok: true,
      linkUrl: `${parsed.pathname}${parsed.search}${parsed.hash}`,
    };
  }

  try {
    const parsed = new URL(candidate);
    const trustedOrigins = configuredTrustedOrigins();
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username ||
      parsed.password ||
      !trustedOrigins.has(parsed.origin)
    ) {
      return { ok: false, error: 'Invalid notification link.' };
    }
    return { ok: true, linkUrl: parsed.toString() };
  } catch {
    return { ok: false, error: 'Invalid notification link.' };
  }
}

function resolveDedupeHours(value: number | undefined) {
  const hours = value === undefined ? 24 : value;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

/**
 * Dispatches a notification to a specific internal staff user.
 */
export async function notifyUser(userId: string, payload: NotificationPayload) {
  return notifyUsers([userId], payload);
}

/**
 * Dispatches a notification to multiple internal staff users with unread deduplication.
 */
export async function notifyUsers(userIds: string[], payload: NotificationPayload) {
  const safeUserIds = Array.isArray(userIds) ? userIds : [];
  const unique = [...new Set(safeUserIds.filter((id) => typeof id === 'string' && UUID_RE.test(id)))];
  if (unique.length === 0) return { success: true, notified: 0 };
  if (unique.length > MAX_NOTIFICATION_FAN_OUT) {
    return {
      success: false,
      notified: 0,
      error: `Notification fan-out exceeds ${MAX_NOTIFICATION_FAN_OUT} recipients.`,
    };
  }

  const link = normalizeNotificationLink(payload.linkUrl);
  if (!link.ok) return { success: false, notified: 0, error: link.error };

  const dedupeHours = resolveDedupeHours(payload.dedupeHours);
  if (dedupeHours === null) {
    return {
      success: false,
      notified: 0,
      error: 'Invalid notification dedupe window.',
    };
  }

  try {
    const type = payload.type || 'INFO';
    const activeRecipients = await prisma.user.findMany({
      where: { id: { in: unique }, isActive: true },
      select: { id: true },
    });
    const activeIds = new Set(activeRecipients.map((recipient) => recipient.id));
    let toNotify = unique.filter((id) => activeIds.has(id));

    if (toNotify.length === 0) {
      return { success: true, notified: 0 };
    }

    if (dedupeHours > 0) {
      const since = new Date(Date.now() - dedupeHours * 60 * 60 * 1000);
      const existing = await prisma.notification.findMany({
        where: {
          userId: { in: toNotify },
          type,
          title: payload.title,
          linkUrl: link.linkUrl ?? null,
          isRead: false,
          createdAt: { gte: since },
        },
        select: { userId: true },
      });
      const alreadyNotified = new Set(existing.map((n) => n.userId));
      toNotify = toNotify.filter((id) => !alreadyNotified.has(id));
    }

    if (toNotify.length > 0) {
      await prisma.notification.createMany({
        data: toNotify.map((userId) => ({
          userId,
          title: payload.title,
          message: payload.message,
          type,
          linkUrl: link.linkUrl,
        })),
      });
    }

    return { success: true, notified: toNotify.length };
  } catch (error) {
    console.error(
      'notifyUsers failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false, notified: 0, error: 'Failed to notify users' };
  }
}

/**
 * Dispatches a notification to all active staff members with the specified role(s).
 */
export async function notifyRoles(roles: Role[], payload: NotificationPayload) {
  if (!roles || roles.length === 0) return { success: true, notified: 0 };

  try {
    const staffMembers = await prisma.user.findMany({
      where: { role: { in: roles }, isActive: true },
      select: { id: true },
    });

    const userIds = staffMembers.map((s) => s.id);
    return notifyUsers(userIds, payload);
  } catch (error) {
    console.error(
      'notifyRoles failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false, notified: 0, error: 'Failed to notify roles' };
  }
}

/**
 * Dispatches a notification to a client / parent portal (by clientId).
 */
export async function notifyClient(clientId: string, payload: NotificationPayload) {
  if (!clientId || !UUID_RE.test(clientId)) {
    return { success: false, error: 'Invalid client ID' };
  }

  const link = normalizeNotificationLink(payload.linkUrl);
  if (!link.ok) return { success: false, error: link.error };

  const dedupeHours = resolveDedupeHours(payload.dedupeHours);
  if (dedupeHours === null) {
    return { success: false, error: 'Invalid notification dedupe window.' };
  }

  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) {
      return { success: false, error: 'Client not found' };
    }

    const type = payload.type || 'INFO';

    if (dedupeHours > 0) {
      const since = new Date(Date.now() - dedupeHours * 60 * 60 * 1000);
      const existing = await prisma.notification.findFirst({
        where: {
          clientId,
          type,
          title: payload.title,
          linkUrl: link.linkUrl ?? null,
          isRead: false,
          createdAt: { gte: since },
        },
        select: { id: true },
      });
      if (existing) {
        return { success: true, notification: existing, deduped: true };
      }
    }

    const notification = await prisma.notification.create({
      data: {
        clientId,
        title: payload.title,
        message: payload.message,
        type,
        linkUrl: link.linkUrl,
      },
    });

    return { success: true, notification };
  } catch (error) {
    console.error(
      'notifyClient failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false, error: 'Failed to notify client' };
  }
}

/**
 * Dispatches a notification to the assigned case team (Case Coordinator, BCBA, Clinical Support, RBT)
 * for a specific client.
 */
export async function notifyCaseTeam(
  clientId: string,
  payload: NotificationPayload,
  includeIntakeCoordinators = false
) {
  if (!clientId || !UUID_RE.test(clientId)) {
    return { success: false, error: 'Invalid client ID' };
  }

  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        caseCoordinatorId: true,
        bcbaId: true,
        clinicalSupportId: true,
        rbtId: true,
      },
    });

    if (!client) {
      return { success: false, error: 'Client not found' };
    }

    const teamUserIds = [
      client.caseCoordinatorId,
      client.bcbaId,
      client.clinicalSupportId,
      client.rbtId,
    ].filter(Boolean) as string[];

    if (includeIntakeCoordinators) {
      const intakeCoordinators = await prisma.user.findMany({
        where: { role: 'INTAKE_PA_COORDINATOR', isActive: true },
        select: { id: true },
      });
      for (const ic of intakeCoordinators) {
        teamUserIds.push(ic.id);
      }
    }

    const uniqueUserIds = [...new Set(teamUserIds)];
    if (uniqueUserIds.length === 0) {
      return notifyRoles(['CASE_COORDINATOR', 'INTAKE_PA_COORDINATOR'], payload);
    }

    return notifyUsers(uniqueUserIds, payload);
  } catch (error) {
    console.error(
      'notifyCaseTeam failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false, error: 'Failed to notify case team' };
  }
}
