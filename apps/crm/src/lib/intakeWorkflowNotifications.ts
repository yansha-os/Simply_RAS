import { prisma } from '@/lib/prisma';
import { notifyRoles, notifyUsers } from '@/lib/notificationDispatcher';
import {
  billingPaQueueHref,
  clinicalSupportProfileHrefFromStatus,
} from '@/lib/clientProfileTabs';
import { CLINIC_TIME_ZONE } from '@/lib/clinicTimezone';

async function loadClientSummary(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      firstName: true,
      lastName: true,
      bcbaId: true,
      clinicalSupportId: true,
    },
  });
  if (!client) return null;
  return {
    name: `${client.firstName} ${client.lastName}`,
    bcbaId: client.bcbaId,
    clinicalSupportId: client.clinicalSupportId,
  };
}

async function activeClinicalSupportIds(excludeUserId?: string) {
  const staff = await prisma.user.findMany({
    where: { role: 'CLINICAL_SUPPORT', isActive: true },
    select: { id: true },
    take: 20,
  });
  return staff.map((user) => user.id).filter((id) => id !== excludeUserId);
}

async function activeBillingIds(excludeUserId?: string) {
  const staff = await prisma.user.findMany({
    where: { role: { in: ['BILLING', 'FINANCE'] }, isActive: true },
    select: { id: true },
    take: 20,
  });
  const ids = staff.map((user) => user.id).filter((id) => id !== excludeUserId);
  if (ids.length > 0) return ids;
  return undefined;
}

/** Intake approved packet → Clinical Support cross-check queue. */
export async function notifyIntakeSentToClinicalHandoff(clientId: string) {
  try {
    const client = await loadClientSummary(clientId);
    if (!client) return;

    await notifyRoles(['CLINICAL_SUPPORT'], {
      title: `Intake ready for clinical review · ${client.name}`,
      message: `${client.name}: intake approved the documents — open Clinical Support to cross-check verification docs.`,
      type: 'INTAKE_SENT_TO_CLINICAL',
      linkUrl: `/client/${clientId}?mode=clinical&tab=clinical`,
      dedupeHours: 24,
    });
  } catch (error) {
    console.error(
      'notifyIntakeSentToClinicalHandoff failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
  }
}

/** Clinical review signed off → Billing VOB queue. */
export async function notifyClinicalReviewApprovedHandoff(
  clientId: string,
  actorUserId?: string
) {
  try {
    const client = await loadClientSummary(clientId);
    if (!client) return;

    const payload = {
      title: `Clinical review approved · ${client.name}`,
      message: `${client.name}: clinical verification is complete — record VOB and credentialing in the billing queue.`,
      type: 'CLINICAL_REVIEW_APPROVED',
      linkUrl: billingPaQueueHref(clientId, 'ASSESSMENT', true),
      dedupeHours: 24,
    };

    const billingIds = await activeBillingIds(actorUserId);
    if (billingIds && billingIds.length > 0) {
      await notifyUsers(billingIds, payload);
      return;
    }

    await notifyRoles(['BILLING', 'FINANCE'], payload);
  } catch (error) {
    console.error(
      'notifyClinicalReviewApprovedHandoff failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
  }
}

/** Assessment PA approved/denied → Clinical Support scheduling + assigned BCBA. */
export async function notifyAssessmentPaDecisionHandoff(input: {
  clientId: string;
  clientName: string;
  decision: 'APPROVED' | 'DENIED_CLERICAL' | 'DENIED_CLINICAL';
  actorUserId?: string;
  reason?: string;
}) {
  try {
    const client = await loadClientSummary(input.clientId);
    const cssIds = await activeClinicalSupportIds(input.actorUserId);
    const recipientIds = [
      ...cssIds,
      client?.bcbaId,
      client?.clinicalSupportId,
    ].filter((id): id is string => Boolean(id));
    const unique = [...new Set(recipientIds)];
    if (unique.length === 0) return;

    const approved = input.decision === 'APPROVED';
    const reasonSnippet = input.reason?.replace(/\s+/g, ' ').trim().slice(0, 120);

    await notifyUsers(unique, {
      title: `Assessment PA ${approved ? 'approved' : 'denied'} · ${input.clientName}`,
      message: approved
        ? `${input.clientName}: 97151 authorization approved — schedule the assessment (Clinical Support) and begin assessment prep (BCBA).`
        : `${input.clientName}: Assessment PA denied.${reasonSnippet ? ` Reason: ${reasonSnippet}` : ''} Review next steps with billing and scheduling.`,
      type: approved ? 'ASSESSMENT_PA_APPROVED' : 'ASSESSMENT_PA_DENIED',
      linkUrl: clinicalSupportProfileHrefFromStatus(
        input.clientId,
        approved ? 'PA_APPROVED' : 'PA_SUBMITTED'
      ),
      dedupeHours: 24,
    });
  } catch (error) {
    console.error(
      'notifyAssessmentPaDecisionHandoff failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
  }
}

/** 97151 scheduled → BCBA (assessment prep) + Clinical Support (report assembly watch). */
export async function notifyAssessmentScheduledHandoff(input: {
  clientId: string;
  scheduledStart: Date;
  bcbaId: string | null;
  actorUserId?: string;
}) {
  try {
    const client = await loadClientSummary(input.clientId);
    if (!client) return;

    const when = input.scheduledStart.toLocaleString('en-US', {
      timeZone: CLINIC_TIME_ZONE,
    });

    if (input.bcbaId && input.bcbaId !== input.actorUserId) {
      await notifyUsers([input.bcbaId], {
        title: `97151 assessment scheduled · ${client.name}`,
        message: `${client.name}: assessment scheduled for ${when} ET — complete assessment prep and treatment plan work.`,
        type: 'ASSESSMENT_SCHEDULED',
        linkUrl: `/client/${input.clientId}?mode=assessment_prep&tab=assessment`,
        dedupeHours: 24,
      });
    }

    const cssIds = await activeClinicalSupportIds(input.actorUserId);
    if (cssIds.length === 0) return;

    await notifyUsers(cssIds, {
      title: `97151 assessment scheduled · ${client.name}`,
      message: `${client.name}: 97151 booked for ${when} ET — monitor BCBA treatment plan progress for report assembly.`,
      type: 'ASSESSMENT_SCHEDULED',
      linkUrl: clinicalSupportProfileHrefFromStatus(
        input.clientId,
        'ASSESSMENT_SCHEDULED'
      ),
      dedupeHours: 24,
    });
  } catch (error) {
    console.error(
      'notifyAssessmentScheduledHandoff failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
  }
}
