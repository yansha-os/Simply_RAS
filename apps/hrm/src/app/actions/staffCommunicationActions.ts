'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { resolveActingRbtUserId } from '@/lib/resolveActingRbt';
import { createNotification } from '@/app/actions/notifications';

export type StaffCommPeerKind = 'CASE_COORD' | 'BCBA' | 'STAFF' | 'NOTIFICATIONS';

export type StaffCommPeer = {
  id: string;
  kind: StaffCommPeerKind;
  name: string;
  subtitle: string;
  roleLabel: string;
  initials: string;
  unreadCount: number;
  lastPreview: string | null;
  lastAt: string | null;
};

export type StaffCommMessage = {
  id: string;
  mine: boolean;
  senderName: string;
  text: string;
  timestamp: string;
  createdAt: string;
  type: 'TEXT' | 'JITSI_CALL' | 'DOCUMENT';
  callRoomUrl?: string;
  fileName?: string;
};

export type StaffCommNotificationItem = {
  id: string;
  title: string;
  message: string;
  type: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

export type StaffCommInbox = {
  success: boolean;
  rbtUserId: string | null;
  peers: StaffCommPeer[];
  notifications: StaffCommNotificationItem[];
  cases: {
    id: string;
    caseCode: string;
    clientInitials: string | null;
    borough: string | null;
    neighborhood: string | null;
    status: string;
    bcbaName: string | null;
  }[];
  error?: string;
};

const CALL_PREFIX = '__CALL__|';
const DOC_PREFIX = '__DOC__|';
/** Keep in sync with client `NOTIFICATIONS_CHANNEL_ID` in RbtStaffCommunicationView. */
const NOTIFICATIONS_CHANNEL_ID = '__notifications__';

function initialsOf(firstName: string, lastName: string) {
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
}

function roleLabel(role: string) {
  switch (role) {
    case 'CASE_COORDINATOR':
      return 'Case Coordinator';
    case 'BCBA':
      return 'BCBA';
    case 'CLINICAL_DIRECTOR':
      return 'Clinical Director';
    case 'HR':
    case 'HEAD_HR':
    case 'HR_AGENT':
      return 'HR';
    default:
      return role.replace(/_/g, ' ');
  }
}

function peerKind(role: string): StaffCommPeerKind {
  if (role === 'CASE_COORDINATOR') return 'CASE_COORD';
  if (role === 'BCBA') return 'BCBA';
  return 'STAFF';
}

function formatTime(d: Date) {
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function encodeCallContent(url: string, label: string) {
  return `${CALL_PREFIX}${url}|${label}`;
}

function encodeDocContent(fileName: string) {
  return `${DOC_PREFIX}${fileName}`;
}

function parseMessageContent(content: string): {
  type: 'TEXT' | 'JITSI_CALL' | 'DOCUMENT';
  text: string;
  callRoomUrl?: string;
  fileName?: string;
} {
  if (content.startsWith(CALL_PREFIX)) {
    const rest = content.slice(CALL_PREFIX.length);
    const pipe = rest.indexOf('|');
    if (pipe >= 0) {
      return {
        type: 'JITSI_CALL',
        callRoomUrl: rest.slice(0, pipe),
        text: rest.slice(pipe + 1) || 'Requested an instant 1-on-1 video call',
      };
    }
    return { type: 'JITSI_CALL', callRoomUrl: rest, text: 'Video call' };
  }
  if (content.startsWith(DOC_PREFIX)) {
    const fileName = content.slice(DOC_PREFIX.length) || 'Document';
    return { type: 'DOCUMENT', fileName, text: `Attached document: ${fileName}` };
  }
  return { type: 'TEXT', text: content };
}

function mapMessage(
  m: {
    id: string;
    senderId: string;
    content: string;
    createdAt: Date;
    sender: { firstName: string; lastName: string };
  },
  me: string
): StaffCommMessage {
  const parsed = parseMessageContent(m.content);
  return {
    id: m.id,
    mine: m.senderId === me,
    senderName: `${m.sender.firstName} ${m.sender.lastName}`.trim(),
    text: parsed.text,
    timestamp: formatTime(m.createdAt),
    createdAt: m.createdAt.toISOString(),
    type: parsed.type,
    callRoomUrl: parsed.callRoomUrl,
    fileName: parsed.fileName,
  };
}

export async function getRbtCommunicationInbox(): Promise<StaffCommInbox> {
  try {
    const rbtUserId = await resolveActingRbtUserId();
    if (!rbtUserId) {
      return {
        success: true,
        rbtUserId: null,
        peers: [],
        notifications: [],
        cases: [],
        error: 'Sign in as a hired RBT to load care-team threads.',
      };
    }

    const [caseCoords, assignedClients, applications, existingMessages, notifications] =
      await Promise.all([
        prisma.user.findMany({
          where: { role: 'CASE_COORDINATOR', isActive: true },
          select: { id: true, firstName: true, lastName: true, role: true },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          take: 40,
        }),
        prisma.client.findMany({
          where: { rbtId: rbtUserId, bcbaId: { not: null } },
          select: {
            id: true,
            bcba: { select: { id: true, firstName: true, lastName: true, role: true } },
          },
          take: 40,
        }),
        prisma.caseApplication.findMany({
          where: { rbtUserId },
          orderBy: { updatedAt: 'desc' },
          take: 30,
          select: {
            id: true,
            status: true,
            opening: {
              select: {
                caseCode: true,
                clientInitials: true,
                borough: true,
                neighborhood: true,
                bcbaDisplayName: true,
                client: {
                  select: {
                    bcba: { select: { id: true, firstName: true, lastName: true, role: true } },
                  },
                },
              },
            },
          },
        }),
        prisma.staffMessage.findMany({
          where: {
            OR: [{ senderId: rbtUserId }, { receiverId: rbtUserId }],
          },
          orderBy: { createdAt: 'desc' },
          take: 400,
          select: {
            id: true,
            senderId: true,
            receiverId: true,
            content: true,
            createdAt: true,
            readAt: true,
            sender: { select: { firstName: true, lastName: true } },
          },
        }),
        prisma.notification.findMany({
          where: { userId: rbtUserId },
          orderBy: { createdAt: 'desc' },
          take: 40,
        }),
      ]);

    const peerMap = new Map<
      string,
      {
        id: string;
        firstName: string;
        lastName: string;
        role: string;
      }
    >();

    for (const u of caseCoords) {
      peerMap.set(u.id, u);
    }
    for (const c of assignedClients) {
      if (c.bcba) peerMap.set(c.bcba.id, c.bcba);
    }
    for (const app of applications) {
      const bcba = app.opening.client.bcba;
      if (bcba) peerMap.set(bcba.id, bcba);
    }

    // Anyone we've already messaged (even if not CC/BCBA)
    const peerIdsFromThread = new Set<string>();
    for (const m of existingMessages) {
      const other = m.senderId === rbtUserId ? m.receiverId : m.senderId;
      peerIdsFromThread.add(other);
    }

    if (peerIdsFromThread.size > 0) {
      const missing = [...peerIdsFromThread].filter((id) => !peerMap.has(id));
      if (missing.length > 0) {
        const extras = await prisma.user.findMany({
          where: { id: { in: missing }, isActive: true },
          select: { id: true, firstName: true, lastName: true, role: true },
        });
        for (const u of extras) peerMap.set(u.id, u);
      }
    }

    const lastByPeer = new Map<
      string,
      { preview: string; at: Date; unread: number }
    >();
    for (const m of existingMessages) {
      const other = m.senderId === rbtUserId ? m.receiverId : m.senderId;
      const parsed = parseMessageContent(m.content);
      const existing = lastByPeer.get(other);
      if (!existing) {
        lastByPeer.set(other, {
          preview: parsed.text.slice(0, 80),
          at: m.createdAt,
          unread: m.receiverId === rbtUserId && !m.readAt ? 1 : 0,
        });
      } else if (m.receiverId === rbtUserId && !m.readAt) {
        existing.unread += 1;
      }
    }

    const peers: StaffCommPeer[] = [...peerMap.values()]
      .filter((u) => u.id !== rbtUserId)
      .map((u) => {
        const last = lastByPeer.get(u.id);
        return {
          id: u.id,
          kind: peerKind(u.role),
          name: `${u.firstName} ${u.lastName}`.trim(),
          subtitle: roleLabel(u.role),
          roleLabel: roleLabel(u.role),
          initials: initialsOf(u.firstName, u.lastName),
          unreadCount: last?.unread || 0,
          lastPreview: last?.preview || null,
          lastAt: last?.at?.toISOString() || null,
        };
      })
      .sort((a, b) => {
        if (a.lastAt && b.lastAt) return b.lastAt.localeCompare(a.lastAt);
        if (a.lastAt) return -1;
        if (b.lastAt) return 1;
        return a.name.localeCompare(b.name);
      });

    const unreadNotifs = notifications.filter((n) => !n.isRead).length;
    const notifPeer: StaffCommPeer = {
      id: NOTIFICATIONS_CHANNEL_ID,
      kind: 'NOTIFICATIONS',
      name: 'Notifications',
      subtitle:
        unreadNotifs > 0
          ? `${unreadNotifs} unread · staffing & clinical alerts`
          : 'Staffing & clinical alerts',
      roleLabel: 'Inbox',
      initials: 'IN',
      unreadCount: unreadNotifs,
      lastPreview: notifications[0]?.title || 'No alerts yet',
      lastAt: notifications[0]?.createdAt?.toISOString() || null,
    };

    return {
      success: true,
      rbtUserId,
      peers: [notifPeer, ...peers],
      notifications: notifications.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        linkUrl: n.linkUrl,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
      cases: applications.map((a) => ({
        id: a.id,
        caseCode: a.opening.caseCode,
        clientInitials: a.opening.clientInitials,
        borough: a.opening.borough,
        neighborhood: a.opening.neighborhood,
        status: a.status,
        bcbaName:
          a.opening.client.bcba
            ? `${a.opening.client.bcba.firstName} ${a.opening.client.bcba.lastName}`.trim()
            : a.opening.bcbaDisplayName,
      })),
    };
  } catch (error) {
    console.error(
      'Action failed [getRbtCommunicationInbox]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      success: false,
      rbtUserId: null,
      peers: [],
      notifications: [],
      cases: [],
      error: 'Failed to load communication inbox.',
    };
  }
}

export async function getRbtStaffThread(peerUserId: string): Promise<{
  success: boolean;
  messages: StaffCommMessage[];
  error?: string;
}> {
  try {
    if (!peerUserId || peerUserId === NOTIFICATIONS_CHANNEL_ID) {
      return { success: true, messages: [] };
    }

    const me = await resolveActingRbtUserId();
    if (!me) return { success: false, messages: [], error: 'Not signed in as RBT.' };

    // Most recent 200, then reversed for display — `asc, take` returned the
    // OLDEST 200, so threads past 200 rows never showed new messages (audit M4).
    const messages = (
      await prisma.staffMessage.findMany({
        where: {
          OR: [
            { senderId: me, receiverId: peerUserId },
            { senderId: peerUserId, receiverId: me },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          sender: { select: { firstName: true, lastName: true } },
        },
      })
    ).reverse();

    // Mark inbound as read
    const unreadIds = messages
      .filter((m) => m.receiverId === me && !m.readAt)
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      await prisma.staffMessage.updateMany({
        where: { id: { in: unreadIds } },
        data: { readAt: new Date() },
      });
    }

    return {
      success: true,
      messages: messages.map((m) => mapMessage(m, me)),
    };
  } catch (error) {
    console.error(
      'Action failed [getRbtStaffThread]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false, messages: [], error: 'Failed to load thread.' };
  }
}

export async function sendRbtStaffMessage(
  peerUserId: string,
  content: string,
  opts?: { kind?: 'TEXT' | 'JITSI_CALL' | 'DOCUMENT'; callRoomUrl?: string; fileName?: string }
): Promise<{ success: boolean; message?: StaffCommMessage; error?: string }> {
  try {
    const me = await resolveActingRbtUserId();
    if (!me) return { success: false, error: 'Not signed in as RBT.' };
    if (!peerUserId || peerUserId === NOTIFICATIONS_CHANNEL_ID) {
      return { success: false, error: 'Pick a staff member to message.' };
    }

    const peer = await prisma.user.findFirst({
      where: { id: peerUserId, isActive: true },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!peer) return { success: false, error: 'Recipient not found.' };

    let stored = content.trim();
    if (opts?.kind === 'JITSI_CALL' && opts.callRoomUrl) {
      stored = encodeCallContent(opts.callRoomUrl, content.trim() || 'Requested an instant 1-on-1 video call');
    } else if (opts?.kind === 'DOCUMENT' && opts.fileName) {
      stored = encodeDocContent(opts.fileName);
    }

    if (!stored) return { success: false, error: 'Message cannot be empty.' };

    const created = await prisma.staffMessage.create({
      data: {
        senderId: me,
        receiverId: peer.id,
        content: stored,
      },
      include: {
        sender: { select: { firstName: true, lastName: true } },
      },
    });

    const preview = parseMessageContent(stored).text.slice(0, 120);
    await createNotification({
      userId: peer.id,
      title: 'New message from RBT',
      message: preview,
      type: 'STAFF_MESSAGE',
      dedupeHours: 0,
    });

    revalidatePath('/rbt/communication');

    return { success: true, message: mapMessage(created, me) };
  } catch (error) {
    console.error(
      'Action failed [sendRbtStaffMessage]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false, error: 'Failed to send message.' };
  }
}
