import 'server-only';

import { prisma } from '@/lib/prisma';

export const MAX_NOTIFICATION_FAN_OUT = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_LINK_CHARACTER_RE = /[\u0000-\u001f\u007f\\]/;

type NotificationInput = {
  userId?: string;
  title: string;
  message: string;
  /** String types — e.g. INFO, JOB_APPLICATION, NOTE_AWAITING_BCBA_SIGN */
  type?: string;
  linkUrl?: string;
  /** Best-effort unread dedupe window. Pass 0 to disable. */
  dedupeHours?: number;
};

type NotifyUsersInput = {
  userIds: string[];
  title: string;
  message: string;
  type: string;
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

function normalizeNotificationLink(linkUrl: string | undefined): LinkResult {
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

export async function createNotification(data: NotificationInput) {
  const link = normalizeNotificationLink(data.linkUrl);
  if (!link.ok) return { success: false, error: link.error };

  const dedupeHours = resolveDedupeHours(data.dedupeHours);
  if (dedupeHours === null) {
    return { success: false, error: 'Invalid notification dedupe window.' };
  }

  if (!data.userId || !UUID_RE.test(data.userId)) {
    return { success: false, error: 'Missing notification recipient' };
  }

  try {
    const recipient = await prisma.user.findFirst({
      where: { id: data.userId, isActive: true },
      select: { id: true },
    });
    if (!recipient) {
      return { success: false, error: 'Notification recipient is unavailable.' };
    }

    if (dedupeHours > 0) {
      const since = new Date(Date.now() - dedupeHours * 60 * 60 * 1000);
      const existing = await prisma.notification.findFirst({
        where: {
          userId: recipient.id,
          type: data.type || 'INFO',
          title: data.title,
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
        userId: recipient.id,
        title: data.title,
        message: data.message,
        type: data.type || 'INFO',
        linkUrl: link.linkUrl,
      },
    });

    return { success: true, notification };
  } catch (error) {
    console.error(
      'Error creating notification:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return { success: false, error: 'Failed to create notification' };
  }
}

/**
 * Bounded best-effort fan-out. Unread dedupe is a read-then-write noise control,
 * not concurrent idempotency or durable delivery.
 */
export async function notifyUsers(input: NotifyUsersInput) {
  const safeUserIds = Array.isArray(input?.userIds) ? input.userIds : [];
  const unique = [...new Set(safeUserIds.filter((id) => typeof id === 'string' && UUID_RE.test(id)))];
  if (unique.length === 0) return { success: true, notified: 0 };
  if (unique.length > MAX_NOTIFICATION_FAN_OUT) {
    return {
      success: false,
      notified: 0,
      error: `Notification fan-out exceeds ${MAX_NOTIFICATION_FAN_OUT} recipients.`,
    };
  }

  const link = normalizeNotificationLink(input.linkUrl);
  if (!link.ok) return { success: false, notified: 0, error: link.error };

  const dedupeHours = resolveDedupeHours(input.dedupeHours);
  if (dedupeHours === null) {
    return {
      success: false,
      notified: 0,
      error: 'Invalid notification dedupe window.',
    };
  }

  try {
    const type = input.type || 'INFO';
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
          title: input.title,
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
          title: input.title,
          message: input.message,
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
