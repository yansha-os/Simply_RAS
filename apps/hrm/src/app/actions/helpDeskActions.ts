'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { requireRole } from '@/lib/auth-guard';
import type { Role } from '@repo/db';
import {
  asRecord,
  deriveAtsStage,
  readProgressFromPacket,
} from '@/lib/atsStage';

const ATS_STAFF_ROLES = [
  'HEAD_HR',
  'HR',
  'HR_AGENT',
  'CEO',
  'OPS_DIRECTOR',
  'ADMIN',
  'SUPER_ADMIN',
] as Role[];

const ACTIVE_STATUSES = ['OPEN', 'CLAIMED', 'IN_PROGRESS'] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_COOKIE = 'ras_device_session_token';

/** Device-bound ATS candidate from httpOnly session cookie (no fake c1 fallback). */
async function resolveSessionCandidateId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const id = cookieStore.get(SESSION_COOKIE)?.value || null;
    if (!isUuid(id)) return null;
    const row = await prisma.atsCandidate.findUnique({
      where: { id },
      select: { id: true },
    });
    return row?.id ?? null;
  } catch {
    return null;
  }
}

export type HelpMessagePayload = {
  text: string;
  type?: 'TEXT' | 'JITSI_CALL' | 'DOCUMENT';
  senderName?: string;
  callRoomUrl?: string;
  callRoomName?: string;
  isHostJoined?: boolean;
  fileName?: string;
  fileUrl?: string;
  category?: string;
};

export type HelpTicketDto = {
  id: string;
  ticketNumber: string;
  candidateId: string;
  category: string;
  categoryLabel: string;
  subject: string;
  message: string;
  status: 'OPEN' | 'CLAIMED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
  assignedHrAgent?: string;
  claimedByUserId?: string | null;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  messages: Array<{
    id: string;
    sender: 'CANDIDATE' | 'HR_AGENT' | 'HEAD_HR' | 'SYSTEM';
    senderName: string;
    text: string;
    timestamp: string;
    type?: 'TEXT' | 'JITSI_CALL' | 'DOCUMENT';
    callRoomUrl?: string;
    callRoomName?: string;
    isHostJoined?: boolean;
    fileName?: string;
    fileUrl?: string;
  }>;
};

const CATEGORY_LABELS: Record<string, string> = {
  UPLOAD_CERTIFICATE: '40-Hour RBT Certificate Upload',
  INTERVIEW_SCHEDULE: '1-on-1 HR Interview Scheduling',
  SIMULATION_QUIZ: 'ABA Clinical Trial Simulator',
  AVAILABILITY_GRID: 'Weekly Work Availability',
  GENERAL_QUESTION: 'General Onboarding & Compliance',
  WAGE_OFFER: 'Wage Offer / LS-54 Discussion',
  PAYROLL_FINANCE: 'Payroll & Finance Support',
};

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

function encodeBody(payload: HelpMessagePayload): string {
  return JSON.stringify(payload);
}

function decodeBody(raw: string): HelpMessagePayload {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.text === 'string') {
      return parsed as HelpMessagePayload;
    }
  } catch {
    // plain text fallback
  }
  return { text: raw, type: 'TEXT' };
}

function ticketNumberFromId(id: string): string {
  return `TICK-${id.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}

function formatCreatedAt(date: Date): string {
  return date.toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function parseSubject(subject: string): { category: string; subject: string } {
  const match = subject.match(/^\[([A-Z0-9_]+)\]\s*(.*)$/);
  if (match) {
    return { category: match[1], subject: match[2] || subject };
  }
  return { category: 'GENERAL_QUESTION', subject };
}

function toTicketDto(row: {
  id: string;
  candidateId: string;
  claimedByUserId: string | null;
  subject: string;
  status: string;
  createdAt: Date;
  candidate: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  claimedBy: { firstName: string; lastName: string; role: string } | null;
  messages: Array<{
    id: string;
    senderType: string;
    body: string;
    createdAt: Date;
  }>;
}): HelpTicketDto {
  const { category, subject } = parseSubject(row.subject);
  // ticketInclude fetches desc (recent-N); render chronologically
  const orderedMessages = [...row.messages].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const messages = orderedMessages.map((m) => {
    const payload = decodeBody(m.body);
    const sender = (['CANDIDATE', 'HR_AGENT', 'HEAD_HR', 'SYSTEM'].includes(m.senderType)
      ? m.senderType
      : 'SYSTEM') as HelpTicketDto['messages'][number]['sender'];
    const defaultName =
      sender === 'CANDIDATE'
        ? `${row.candidate.firstName} ${row.candidate.lastName}`.trim()
        : row.claimedBy
          ? `${row.claimedBy.firstName} ${row.claimedBy.lastName}`
          : 'HR Agent';
    return {
      id: m.id,
      sender,
      senderName: payload.senderName || defaultName,
      text: payload.text,
      timestamp: formatTimestamp(m.createdAt),
      type: payload.type || 'TEXT',
      callRoomUrl: payload.callRoomUrl,
      callRoomName: payload.callRoomName,
      isHostJoined: payload.isHostJoined,
      fileName: payload.fileName,
      fileUrl: payload.fileUrl,
    };
  });

  const firstText = messages[0]?.text || '';
  const categoryFromMsg = decodeBody(orderedMessages[0]?.body || '').category;

  return {
    id: row.id,
    ticketNumber: ticketNumberFromId(row.id),
    candidateId: row.candidateId,
    category: categoryFromMsg || category,
    categoryLabel: CATEGORY_LABELS[categoryFromMsg || category] || 'General Support',
    subject,
    message: firstText,
    status: (row.status as HelpTicketDto['status']) || 'OPEN',
    createdAt: formatCreatedAt(row.createdAt),
    assignedHrAgent: row.claimedBy
      ? `${row.claimedBy.firstName} ${row.claimedBy.lastName}`
      : undefined,
    claimedByUserId: row.claimedByUserId,
    candidateName: `${row.candidate.firstName} ${row.candidate.lastName}`.trim(),
    candidateEmail: row.candidate.email,
    candidatePhone: row.candidate.phone || '',
    messages,
  };
}

const ticketInclude = {
  candidate: {
    select: { firstName: true, lastName: true, email: true, phone: true },
  },
  claimedBy: { select: { firstName: true, lastName: true, role: true } },
  // Most recent 200 (desc) — toTicketDto re-sorts to chronological so long
  // threads keep their NEWEST messages instead of freezing at the oldest 200.
  messages: { orderBy: { createdAt: 'desc' as const }, take: 200 },
};

async function syncHelpDeskStage(candidateId: string) {
  const openCount = await prisma.atsHelpTicket.count({
    where: { candidateId, status: { in: [...ACTIVE_STATUSES] } },
  });

  const candidate = await prisma.atsCandidate.findUnique({
    where: { id: candidateId },
    include: {
      onboardingPacket: {
        select: {
          tasksDone: true,
          availabilityDone: true,
          simulationDone: true,
          interviewBooked: true,
          interviewPassed: true,
          certUploaded: true,
          backgroundCleared: true,
          clearedForHire: true,
        },
      },
    },
  });
  if (!candidate) return;

  const progress = {
    ...readProgressFromPacket(candidate.onboardingPacket, candidate.dossier),
    helpDeskOpen: openCount > 0,
  };
  const nextStage = deriveAtsStage({
    activationStatus: candidate.activationStatus,
    currentStage: candidate.stage,
    progress,
  });

  await prisma.atsCandidate.update({
    where: { id: candidateId },
    data: {
      stage: nextStage,
      dossier: {
        ...asRecord(candidate.dossier),
        progress,
      },
    },
  });
}

export async function createHelpTicket(input: {
  candidateId?: string;
  category: string;
  subject: string;
  message: string;
  candidateName?: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'UNAUTHORIZED: Authentication required.' };
    }
    if (!input.subject.trim() || !input.message.trim()) {
      return { success: false, error: 'Subject and message are required.' };
    }

    const isStaff = ATS_STAFF_ROLES.includes(user.role as Role);
    let candidateId = isUuid(input.candidateId) ? input.candidateId : null;
    if (!candidateId) {
      candidateId = await resolveSessionCandidateId();
    }
    if (!candidateId) {
      return {
        success: false,
        error:
          'No active applicant session. Open your magic link or select a candidate in Dev Tools.',
      };
    }
    if (!isStaff) {
      const sessionId = await resolveSessionCandidateId();
      if (!sessionId || sessionId !== candidateId) {
        return { success: false, error: 'FORBIDDEN: Not your applicant session.' };
      }
    }

    const candidate = await prisma.atsCandidate.findUnique({
      where: { id: candidateId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!candidate) return { success: false, error: 'Candidate not found.' };

    const category = input.category || 'GENERAL_QUESTION';
    const senderName =
      input.candidateName ||
      `${candidate.firstName} ${candidate.lastName}`.trim();

    const ticket = await prisma.atsHelpTicket.create({
      data: {
        candidateId,
        subject: `[${category}] ${input.subject.trim()}`,
        status: 'OPEN',
        priority: 'NORMAL',
        messages: {
          create: {
            senderType: 'CANDIDATE',
            senderUserId: isUuid(user.id) ? user.id : null,
            body: encodeBody({
              text: input.message.trim(),
              type: 'TEXT',
              senderName,
              category,
            }),
          },
        },
      },
      include: ticketInclude,
    });

    await syncHelpDeskStage(candidateId);

    revalidatePath('/ats');
    revalidatePath('/ats/help-tickets');
    revalidatePath('/rbt/help-desk');
    revalidatePath('/rbt/payroll');
    
    return { success: true, ticket: toTicketDto(ticket) };
  } catch (error: unknown) {
    console.error(
      'createHelpTicket failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create ticket.',
    };
  }
}

export async function listHelpTickets(options?: {
  candidateId?: string;
  activeOnly?: boolean;
}): Promise<{ success: boolean; data: HelpTicketDto[]; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, data: [], error: 'UNAUTHORIZED: Authentication required.' };
    }

    const isStaff = ATS_STAFF_ROLES.includes(user.role as Role);
    const where: {
      candidateId?: string;
      status?: { in: string[] };
    } = {};

    if (options?.candidateId) {
      if (!isUuid(options.candidateId)) {
        return { success: false, data: [], error: 'Invalid candidate id.' };
      }
      if (!isStaff) {
        const sessionId = await resolveSessionCandidateId();
        if (!sessionId || sessionId !== options.candidateId) {
          return {
            success: false,
            data: [],
            error: 'FORBIDDEN: Not your applicant session.',
          };
        }
      }
      where.candidateId = options.candidateId;
    } else if (!isStaff) {
      const sessionId = await resolveSessionCandidateId();
      if (!sessionId) {
        return {
          success: false,
          data: [],
          error:
            'No active applicant session. Open your magic link or select a candidate in Dev Tools.',
        };
      }
      where.candidateId = sessionId;
    }

    if (options?.activeOnly !== false) {
      where.status = { in: [...ACTIVE_STATUSES] };
    }

    const rows = await prisma.atsHelpTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: ticketInclude,
    });

    // Honest empty — never seed demo tickets into LIVE.
    return { success: true, data: rows.map(toTicketDto) };
  } catch (error: unknown) {
    console.error(
      'listHelpTickets failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Failed to load tickets.',
    };
  }
}

export async function claimHelpTicket(ticketId: string) {
  try {
    await requireRole(ATS_STAFF_ROLES);
    const user = await getCurrentUser();
    // Dev impersonation may use a mock id — still allow claim without FK when not a UUID.
    const claimedByUserId = user && UUID_RE.test(user.id) ? user.id : null;

    const ticket = await prisma.atsHelpTicket.update({
      where: { id: ticketId },
      data: {
        claimedByUserId,
        status: 'CLAIMED',
        messages: {
          create: {
            senderType: user?.role === 'HEAD_HR' ? 'HEAD_HR' : 'HR_AGENT',
            senderUserId: claimedByUserId,
            body: encodeBody({
              text: 'Hello! I have claimed your help ticket and am reviewing your onboarding file now. How can I assist you?',
              type: 'TEXT',
              senderName: user
                ? `${user.firstName} ${user.lastName}`.trim()
                : 'HR Agent',
            }),
          },
        },
      },
      include: ticketInclude,
    });

    await syncHelpDeskStage(ticket.candidateId);

    revalidatePath('/ats');
    revalidatePath('/ats/help-tickets');
    revalidatePath('/rbt/help-desk');

    return { success: true, ticket: toTicketDto(ticket) };
  } catch (error: unknown) {
    console.error(
      'claimHelpTicket failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to claim ticket.',
    };
  }
}

export async function unclaimHelpTicket(ticketId: string) {
  try {
    await requireRole(ATS_STAFF_ROLES);

    const existing = await prisma.atsHelpTicket.findUnique({
      where: { id: ticketId },
      select: { candidateId: true },
    });
    if (!existing) return { success: false, error: 'Ticket not found.' };

    const ticket = await prisma.atsHelpTicket.update({
      where: { id: ticketId },
      data: {
        claimedByUserId: null,
        status: 'OPEN',
      },
      include: ticketInclude,
    });

    await syncHelpDeskStage(existing.candidateId);

    revalidatePath('/ats');
    revalidatePath('/ats/help-tickets');
    revalidatePath('/rbt/help-desk');

    return { success: true, ticket: toTicketDto(ticket) };
  } catch (error: unknown) {
    console.error(
      'unclaimHelpTicket failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to unclaim ticket.',
    };
  }
}

export async function resolveHelpTicket(ticketId: string) {
  try {
    await requireRole(ATS_STAFF_ROLES);

    const existing = await prisma.atsHelpTicket.findUnique({
      where: { id: ticketId },
      select: { candidateId: true },
    });
    if (!existing) return { success: false, error: 'Ticket not found.' };

    await prisma.atsHelpTicket.update({
      where: { id: ticketId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    });

    await syncHelpDeskStage(existing.candidateId);

    revalidatePath('/ats');
    revalidatePath('/ats/help-tickets');
    revalidatePath('/rbt/help-desk');
    
    return { success: true };
  } catch (error: unknown) {
    console.error(
      'resolveHelpTicket failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resolve ticket.',
    };
  }
}

export async function sendHelpMessage(
  ticketId: string,
  input: {
    text?: string;
    type?: 'TEXT' | 'JITSI_CALL' | 'DOCUMENT';
    senderSide: 'CANDIDATE' | 'HR';
    senderName?: string;
    callRoomUrl?: string;
    callRoomName?: string;
    isHostJoined?: boolean;
    fileName?: string;
    fileUrl?: string;
  }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'UNAUTHORIZED: Authentication required.' };
    }

    const ticket = await prisma.atsHelpTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, candidateId: true, status: true },
    });
    if (!ticket) return { success: false, error: 'Ticket not found.' };
    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      return { success: false, error: 'Ticket is already resolved.' };
    }

    const isStaff = ATS_STAFF_ROLES.includes(user.role as Role);
    if (input.senderSide === 'HR' && !isStaff) {
      return { success: false, error: 'FORBIDDEN: Staff only.' };
    }
    if (input.senderSide === 'CANDIDATE' && !isStaff) {
      const sessionId = await resolveSessionCandidateId();
      if (sessionId !== ticket.candidateId) {
        // Dev Tools may impersonate an applicant without the cookie — dev builds only.
        const { isDevToolsEnabled } = await import('@/lib/devToolsGate');
        if (!isDevToolsEnabled()) {
          return { success: false, error: 'FORBIDDEN: Not your ticket.' };
        }
      }
    }

    const senderType =
      input.senderSide === 'CANDIDATE'
        ? 'CANDIDATE'
        : user.role === 'HEAD_HR'
          ? 'HEAD_HR'
          : 'HR_AGENT';

    await prisma.atsHelpMessage.create({
      data: {
        ticketId,
        senderType,
        senderUserId: isUuid(user.id) ? user.id : null,
        body: encodeBody({
          text: (input.text || '').trim() || '(attachment)',
          type: input.type || 'TEXT',
          senderName:
            input.senderName || `${user.firstName} ${user.lastName}`.trim(),
          callRoomUrl: input.callRoomUrl,
          callRoomName: input.callRoomName,
          isHostJoined: input.isHostJoined,
          fileName: input.fileName,
          fileUrl: input.fileUrl,
        }),
      },
    });

    if (input.senderSide === 'HR' && ticket.status === 'OPEN') {
      await prisma.atsHelpTicket.update({
        where: { id: ticketId },
        data: {
          status: 'CLAIMED',
          claimedByUserId: isUuid(user.id) ? user.id : undefined,
        },
      });
    } else if (ticket.status === 'CLAIMED' || ticket.status === 'OPEN') {
      await prisma.atsHelpTicket.update({
        where: { id: ticketId },
        data: { status: ticket.status === 'OPEN' ? 'OPEN' : 'IN_PROGRESS' },
      });
    }

    const refreshed = await prisma.atsHelpTicket.findUnique({
      where: { id: ticketId },
      include: ticketInclude,
    });

    revalidatePath('/ats/help-tickets');
    revalidatePath('/rbt/help-desk');

    return {
      success: true,
      ticket: refreshed ? toTicketDto(refreshed) : undefined,
    };
  } catch (error: unknown) {
    console.error(
      'sendHelpMessage failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message.',
    };
  }
}

export async function updateHelpMessageMeta(
  messageId: string,
  patch: Partial<HelpMessagePayload>
) {
  try {
    await requireRole(ATS_STAFF_ROLES);

    const existing = await prisma.atsHelpMessage.findUnique({
      where: { id: messageId },
      select: { id: true, body: true, ticketId: true },
    });
    if (!existing) return { success: false, error: 'Message not found.' };

    const current = decodeBody(existing.body);
    const next = { ...current, ...patch };
    await prisma.atsHelpMessage.update({
      where: { id: messageId },
      data: { body: encodeBody(next) },
    });

    const refreshed = await prisma.atsHelpTicket.findUnique({
      where: { id: existing.ticketId },
      include: ticketInclude,
    });

    revalidatePath('/ats/help-tickets');
    revalidatePath('/rbt/help-desk');

    return {
      success: true,
      ticket: refreshed ? toTicketDto(refreshed) : undefined,
    };
  } catch (error: unknown) {
    console.error(
      'updateHelpMessageMeta failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update message.',
    };
  }
}
