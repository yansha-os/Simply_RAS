'use server';

import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/auth-guard';
import type { Role } from '@repo/db';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 5_000;
const STAFF_ROLES: readonly Role[] = [
  'CEO',
  'CLINICAL_DIRECTOR',
  'OPS_DIRECTOR',
  'INTAKE_PA_COORDINATOR',
  'CASE_COORDINATOR',
  'SESSION_NOTES_COORDINATOR',
  'CLINICAL_SUPPORT',
  'BILLING',
  'BCBA',
  'RBT',
  'HR',
  'HEAD_HR',
  'HR_AGENT',
  'FINANCE',
];

/**
 * Staff chat identity is ALWAYS the session user (incl. dev impersonation).
 * The old prisma.user.findFirst() fallback allowed reading/sending as an
 * arbitrary staff member — removed (readiness Blocker 0a).
 */
async function getMe(): Promise<string | null> {
  const gate = await requireStaff();
  if (!gate.ok || gate.user.id === 'mock-user-id') return null;
  return gate.user.id;
}

export async function getStaffMembers() {
  try {
    const me = await getMe();
    if (!me) return [];

    const users = await prisma.user.findMany({
      where: { isActive: true, role: { in: [...STAFF_ROLES] }, NOT: { id: me } },
      select: { id: true, firstName: true, lastName: true, role: true }
    });
    return users;
  } catch (error) {
    console.error('getStaffMembers failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

export async function getStaffMessages(receiverId: string) {
  try {
    const me = await getMe();
    if (!me) return [];
    if (!UUID_PATTERN.test(receiverId) || receiverId === me) return [];

    // Most recent 200 (desc), reversed for chronological display — an
    // unbounded asc query degrades forever and drops new messages (audit M5).
    const messages = (
      await prisma.staffMessage.findMany({
        where: {
          OR: [
            { senderId: me, receiverId },
            { senderId: receiverId, receiverId: me }
          ]
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          senderId: true,
          receiverId: true,
          content: true,
          createdAt: true,
          readAt: true,
        }
      })
    ).reverse();

    return messages.map(m => ({
      ...m,
      isMine: m.senderId === me
    }));
  } catch (error) {
    console.error('getStaffMessages failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Mark every message the peer sent me as read (read receipts in GlobalStaffChat).
 * Scoped to the session user via getMe() — a user can only mark their own inbox.
 */
export async function markStaffThreadRead(peerId: string) {
  try {
    const me = await getMe();
    if (!me) return { success: false, error: 'Not authenticated.' };
    if (!UUID_PATTERN.test(peerId) || peerId === me) {
      return { success: false, error: 'Invalid staff thread.' };
    }

    await prisma.staffMessage.updateMany({
      where: { senderId: peerId, receiverId: me, readAt: null },
      data: { readAt: new Date() }
    });
    return { success: true };
  } catch (error) {
    console.error('markStaffThreadRead failed:', error instanceof Error ? error.message : error);
    return { success: false, error: 'Failed to mark thread as read.' };
  }
}

export async function sendStaffMessage(receiverId: string, content: string) {
  try {
    const me = await getMe();
    if (!me) return { success: false, error: 'Not authenticated.' };
    const trimmed = content.trim();
    if (!UUID_PATTERN.test(receiverId) || receiverId === me) {
      return { success: false, error: 'Invalid staff recipient.' };
    }
    if (!trimmed) return { success: false, error: 'Message cannot be empty.' };
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      return { success: false, error: 'Message is too long.' };
    }

    const recipient = await prisma.user.findFirst({
      where: {
        id: receiverId,
        isActive: true,
        role: { in: [...STAFF_ROLES] },
      },
      select: { id: true },
    });
    if (!recipient) return { success: false, error: 'Staff recipient not found.' };

    await prisma.staffMessage.create({
      data: {
        senderId: me,
        receiverId: recipient.id,
        content: trimmed
      }
    });

    // Hard to know exactly which path to revalidate since it's global, 
    // but we can just return success and let the client optimistically append
    return { success: true };
  } catch (error) {
    console.error('sendStaffMessage failed:', error instanceof Error ? error.message : error);
    return { success: false, error: 'Failed to send message.' };
  }
}
