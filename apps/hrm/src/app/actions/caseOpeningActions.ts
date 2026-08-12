'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { scoreJobMatch } from '@/lib/jobBoardMatching';
import {
  resolveActingRbtContext,
  resolveActingRbtUserId,
} from '@/lib/resolveActingRbt';

function normalizeZip(raw: unknown): string | null {
  if (raw == null) return null;
  const zip = String(raw).replace(/\D/g, '').slice(0, 5);
  return zip.length === 5 ? zip : null;
}

/** Application address ZIP lives on AtsCandidate.dossier / packet.formData. */
function zipFromApplicationPayload(...sources: unknown[]): string | null {
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    const zip = normalizeZip((src as Record<string, unknown>).zipCode);
    if (zip) return zip;
  }
  return null;
}

function boroughsFromJson(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]).filter((b) => typeof b === 'string') : [];
}

async function loadRbtTravelProfile(opts: {
  rbtUserId: string | null;
  candidateId: string | null;
}) {
  const defaults = {
    homeZipCode: null as string | null,
    maxTravelMiles: 15,
    preferredBoroughs: [] as string[],
    transportation: 'CAR' as string | null,
  };
  if (!opts.rbtUserId && !opts.candidateId) return defaults;

  try {
    const candidate = opts.candidateId
      ? await prisma.atsCandidate.findUnique({
          where: { id: opts.candidateId },
          select: {
            id: true,
            dossier: true,
            onboardingPacket: {
              select: {
                id: true,
                preferredBoroughs: true,
                transportation: true,
                homeZipCode: true,
                maxTravelMiles: true,
                formData: true,
              },
            },
          },
        })
      : await prisma.atsCandidate.findFirst({
          where: { userId: opts.rbtUserId! },
          select: {
            id: true,
            dossier: true,
            onboardingPacket: {
              select: {
                id: true,
                preferredBoroughs: true,
                transportation: true,
                homeZipCode: true,
                maxTravelMiles: true,
                formData: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        });

    if (!candidate) return defaults;
    const packet = candidate.onboardingPacket;
    const dossier = (candidate.dossier ?? null) as Record<string, unknown> | null;
    const formData = (packet?.formData ?? null) as Record<string, unknown> | null;

    // Prefer explicit travel ZIP; else application address ZIP from apply form
    const homeZipCode =
      normalizeZip(packet?.homeZipCode) ||
      zipFromApplicationPayload(dossier, formData) ||
      null;

    let boroughs = boroughsFromJson(packet?.preferredBoroughs);
    if (boroughs.length === 0) boroughs = boroughsFromJson(dossier?.preferredBoroughs);
    if (boroughs.length === 0) boroughs = boroughsFromJson(formData?.preferredBoroughs);

    const transportation =
      packet?.transportation ||
      (typeof dossier?.transportation === 'string' ? dossier.transportation : null) ||
      (typeof formData?.transportation === 'string' ? formData.transportation : null) ||
      'CAR';

    // Persist application ZIP into homeZipCode once so distance scoring sticks
    if (packet?.id && !normalizeZip(packet.homeZipCode) && homeZipCode) {
      void prisma.candidateOnboardingPacket
        .update({
          where: { id: packet.id },
          data: { homeZipCode },
        })
        .catch((err) => {
          console.warn(
            '[loadRbtTravelProfile] could not backfill homeZipCode:',
            err instanceof Error ? err.message : err
          );
        });
    }

    return {
      homeZipCode,
      maxTravelMiles: packet?.maxTravelMiles ?? 15,
      preferredBoroughs: boroughs,
      transportation,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    // Enrichment SQL not applied — still try dossier ZIP without homeZipCode column
    if (message.includes('homeZipCode') || message.includes('maxTravelMiles')) {
      console.warn(
        '[loadRbtTravelProfile] travel columns missing — run listing enrichment SQL. Falling back to application dossier ZIP.'
      );
      try {
        const candidate = opts.candidateId
          ? await prisma.atsCandidate.findUnique({
              where: { id: opts.candidateId },
              select: {
                dossier: true,
                onboardingPacket: {
                  select: {
                    preferredBoroughs: true,
                    transportation: true,
                    formData: true,
                  },
                },
              },
            })
          : await prisma.atsCandidate.findFirst({
              where: { userId: opts.rbtUserId! },
              select: {
                dossier: true,
                onboardingPacket: {
                  select: {
                    preferredBoroughs: true,
                    transportation: true,
                    formData: true,
                  },
                },
              },
              orderBy: { updatedAt: 'desc' },
            });

        if (!candidate) return defaults;
        const packet = candidate.onboardingPacket;
        const homeZipCode = zipFromApplicationPayload(
          candidate.dossier,
          packet?.formData
        );
        let boroughs = boroughsFromJson(packet?.preferredBoroughs);
        if (boroughs.length === 0) {
          boroughs = boroughsFromJson(
            (candidate.dossier as Record<string, unknown> | null)?.preferredBoroughs
          );
        }
        return {
          ...defaults,
          homeZipCode,
          preferredBoroughs: boroughs,
          transportation: packet?.transportation || 'CAR',
        };
      } catch {
        return defaults;
      }
    }
    throw error;
  }
}

export type DeidentifiedCaseOpening = {
  id: string;
  caseCode: string;
  clientInitials: string | null;
  childAge: number | null;
  ageBand: string | null;
  borough: string | null;
  neighborhood: string | null;
  zipCode: string | null;
  weeklyHours: number | null;
  scheduleText: string | null;
  daysOfWeek: string | null;
  sessionLengthMinutes: number | null;
  transportationNotes: string | null;
  languagePref: string | null;
  genderPref: string | null;
  serviceSetting: string | null;
  listingHighlights: string | null;
  bcbaDisplayName: string | null;
  status: string;
  matchScore: number;
  distanceMiles: number | null;
  etaMinutes: number | null;
  matchReason: string;
  recommended: boolean;
  /** exact | centroid | prefix | borough | unknown */
  zipMatchKind: string;
  zipMatchLabel: string;
  /** e.g. "11372 → 11101" when both ZIPs known */
  zipRoute: string | null;
  withinRadius: boolean;
  commuteMethod: string;
  myApplication: {
    id: string;
    status: string;
    meetAt: string | null;
    meetLink: string | null;
    message: string | null;
  } | null;
};

export async function listOpenCaseOpeningsForRbt(): Promise<{
  success: boolean;
  openings: DeidentifiedCaseOpening[];
  travelProfile: {
    homeZipCode: string | null;
    maxTravelMiles: number;
    preferredBoroughs: string[];
    transportation: string | null;
  };
  error?: string;
}> {
  const emptyProfile = {
    homeZipCode: null as string | null,
    maxTravelMiles: 15,
    preferredBoroughs: [] as string[],
    transportation: 'CAR' as string | null,
  };

  try {
    const { rbtUserId, candidateId } = await resolveActingRbtContext();
    const travelProfile = await loadRbtTravelProfile({ rbtUserId, candidateId });

    const rows = await prisma.caseOpening.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      include: {
        applications: rbtUserId
          ? {
              where: { rbtUserId },
              take: 1,
            }
          : false,
      },
    });

    const openings: DeidentifiedCaseOpening[] = rows.map((row) => {
      const mine = Array.isArray(row.applications) ? row.applications[0] : null;
      const match = scoreJobMatch({
        rbtZip: travelProfile.homeZipCode,
        clientZip: row.zipCode,
        clientBorough: row.borough,
        preferredBoroughs: travelProfile.preferredBoroughs,
        transportation: travelProfile.transportation,
        maxTravelMiles: travelProfile.maxTravelMiles,
        weeklyHours: row.weeklyHours,
        alreadyApplied: !!mine && mine.status !== 'WITHDRAWN',
      });

      return {
        id: row.id,
        caseCode: row.caseCode,
        clientInitials: row.clientInitials,
        childAge: row.childAge,
        ageBand: row.ageBand,
        borough: row.borough,
        neighborhood: row.neighborhood,
        zipCode: row.zipCode,
        weeklyHours: row.weeklyHours,
        scheduleText: row.scheduleText,
        daysOfWeek: row.daysOfWeek,
        sessionLengthMinutes: row.sessionLengthMinutes,
        transportationNotes: row.transportationNotes,
        languagePref: row.languagePref,
        genderPref: row.genderPref,
        serviceSetting: row.serviceSetting,
        listingHighlights: row.listingHighlights,
        bcbaDisplayName: row.bcbaDisplayName,
        status: row.status,
        matchScore: match.matchScore,
        distanceMiles: match.distanceMiles,
        etaMinutes: match.etaMinutes,
        matchReason: match.matchReason,
        recommended: match.recommended,
        zipMatchKind: match.zipMatchKind,
        zipMatchLabel: match.zipMatchLabel,
        zipRoute: match.zipRoute,
        withinRadius: match.withinRadius,
        commuteMethod: match.commuteMethod,
        myApplication: mine
          ? {
              id: mine.id,
              status: mine.status,
              meetAt: mine.meetAt?.toISOString() ?? null,
              meetLink: mine.meetLink,
              message: mine.message,
            }
          : null,
      };
    });

    // Best fit first, then score, then shortest commute (unknown distance last)
    openings.sort((a, b) => {
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      const da = a.distanceMiles ?? Number.POSITIVE_INFINITY;
      const db = b.distanceMiles ?? Number.POSITIVE_INFINITY;
      return da - db;
    });

    return { success: true, openings, travelProfile };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Action failed [listOpenCaseOpeningsForRbt]:', message);
    const hint =
      message.includes('does not exist') || message.includes('column')
        ? 'Database columns missing — run the case-opening listing enrichment SQL in Supabase.'
        : 'Failed to load job board.';
    return { success: false, openings: [], travelProfile: emptyProfile, error: hint };
  }
}

export async function saveRbtTravelProfile(input: {
  homeZipCode: string;
  maxTravelMiles?: number;
  transportation?: string;
}) {
  try {
    const { rbtUserId, candidateId } = await resolveActingRbtContext();
    if (!rbtUserId && !candidateId) return { success: false, error: 'No RBT user found.' };

    const zip = input.homeZipCode.replace(/\D/g, '').slice(0, 5);
    if (zip.length !== 5) return { success: false, error: 'Enter a valid 5-digit ZIP code.' };

    let candidate = candidateId
      ? await prisma.atsCandidate.findUnique({
          where: { id: candidateId },
          select: {
            id: true,
            dossier: true,
            onboardingPacket: { select: { id: true, formData: true } },
          },
        })
      : await prisma.atsCandidate.findFirst({
          where: { userId: rbtUserId! },
          select: {
            id: true,
            dossier: true,
            onboardingPacket: { select: { id: true, formData: true } },
          },
        });

    // Dev impersonation: attach to any hired candidate packet if user link missing
    if (!candidate) {
      candidate = await prisma.atsCandidate.findFirst({
        where: { stage: 'HIRED', onboardingPacket: { isNot: null } },
        select: {
          id: true,
          dossier: true,
          onboardingPacket: { select: { id: true, formData: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (!candidate?.onboardingPacket) {
      return {
        success: false,
        error: 'No onboarding profile found to save travel preferences. Complete availability first.',
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.candidateOnboardingPacket.update({
        where: { id: candidate!.onboardingPacket!.id },
        data: {
          homeZipCode: zip,
          maxTravelMiles: input.maxTravelMiles ?? 15,
          ...(input.transportation
            ? { transportation: input.transportation }
            : {}),
          // Keep formData.zipCode in sync so job board can fall back to application address
          formData: {
            ...((candidate!.onboardingPacket!.formData as Record<string, unknown>) || {}),
            zipCode: zip,
          },
        },
      });

      const dossier = (candidate!.dossier as Record<string, unknown>) || {};
      await tx.atsCandidate.update({
        where: { id: candidate!.id },
        data: {
          dossier: {
            ...dossier,
            zipCode: zip,
          },
        },
      });
    });

    revalidatePath('/rbt/job-board');
    return { success: true, homeZipCode: zip };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Action failed [saveRbtTravelProfile]:', message);

    // Column missing: still persist ZIP onto application dossier/formData
    if (message.includes('homeZipCode') || message.includes('maxTravelMiles')) {
      try {
        const { rbtUserId, candidateId } = await resolveActingRbtContext();
        const zip = input.homeZipCode.replace(/\D/g, '').slice(0, 5);
        if (zip.length !== 5) {
          return { success: false, error: 'Enter a valid 5-digit ZIP code.' };
        }

        const candidate = candidateId
          ? await prisma.atsCandidate.findUnique({
              where: { id: candidateId },
              select: {
                id: true,
                dossier: true,
                onboardingPacket: { select: { id: true, formData: true } },
              },
            })
          : await prisma.atsCandidate.findFirst({
              where: { userId: rbtUserId! },
              select: {
                id: true,
                dossier: true,
                onboardingPacket: { select: { id: true, formData: true } },
              },
            });

        if (!candidate) {
          return {
            success: false,
            error: 'Missing travel columns — run listing enrichment SQL, and no candidate found.',
          };
        }

        await prisma.$transaction(async (tx) => {
          if (candidate!.onboardingPacket) {
            await tx.candidateOnboardingPacket.update({
              where: { id: candidate!.onboardingPacket!.id },
              data: {
                formData: {
                  ...((candidate!.onboardingPacket!.formData as Record<string, unknown>) || {}),
                  zipCode: zip,
                },
                ...(input.transportation ? { transportation: input.transportation } : {}),
              },
            });
          }
          await tx.atsCandidate.update({
            where: { id: candidate!.id },
            data: {
              dossier: {
                ...((candidate!.dossier as Record<string, unknown>) || {}),
                zipCode: zip,
              },
            },
          });
        });

        revalidatePath('/rbt/job-board');
        return {
          success: true,
          homeZipCode: zip,
          warning:
            'Saved to application address. Run listing enrichment SQL to enable homeZipCode column.',
        };
      } catch (fallbackErr) {
        console.error(
          'Action failed [saveRbtTravelProfile fallback]:',
          fallbackErr instanceof Error ? fallbackErr.message : fallbackErr
        );
      }
    }

    return {
      success: false,
      error: message.includes('column')
        ? 'Database columns missing — run the listing enrichment SQL in Supabase.'
        : 'Failed to save travel profile.',
    };
  }
}

export async function applyToCaseOpening(openingId: string, message?: string) {
  try {
    const rbtUserId = await resolveActingRbtUserId();
    if (!rbtUserId) {
      return { success: false, error: 'No RBT user available to apply. Sign in or impersonate an RBT user.' };
    }

    const opening = await prisma.caseOpening.findUnique({ where: { id: openingId } });
    if (!opening || opening.status !== 'OPEN') {
      return { success: false, error: 'This opening is no longer available.' };
    }

    const existing = await prisma.caseApplication.findUnique({
      where: { openingId_rbtUserId: { openingId, rbtUserId } },
    });
    if (existing) {
      return { success: false, error: 'You already applied to this case.' };
    }

    const application = await prisma.$transaction(async (tx) => {
      const created = await tx.caseApplication.create({
        data: {
          openingId,
          rbtUserId,
          status: 'APPLIED',
          message: message?.trim() || null,
        },
      });
      // Bump opening so CRM Case Coord inbox sorts this listing to the top
      await tx.caseOpening.update({
        where: { id: openingId },
        data: { updatedAt: new Date() },
      });
      return created;
    });

    // JOB_APPLICATION → Case Coord (CRM deep link; prefer client owner)
    try {
      const { notifyUsers } = await import('@/app/actions/notifications');
      const client = await prisma.client.findUnique({
        where: { id: opening.clientId },
        select: { caseCoordinatorId: true },
      });

      const recipientIds: string[] = [];
      if (client?.caseCoordinatorId) {
        recipientIds.push(client.caseCoordinatorId);
      } else {
        const caseCoordinators = await prisma.user.findMany({
          where: { role: 'CASE_COORDINATOR', isActive: true },
          select: { id: true },
          take: 20,
        });
        recipientIds.push(...caseCoordinators.map((cc) => cc.id));
      }

      await notifyUsers({
        userIds: recipientIds,
        title: 'New RBT job board application',
        message: `An RBT applied to ${opening.caseCode}. Review Scheduling & Job Board.`,
        type: 'JOB_APPLICATION',
        // CRM client deep link (Case Coord bell lives in CRM)
        linkUrl: `/client/${opening.clientId}?mode=case-coord`,
        // Each application should ping — do not collapse applicants
        dedupeHours: 0,
      });
    } catch (notifyErr) {
      console.error(
        'applyToCaseOpening notify failed:',
        notifyErr instanceof Error ? notifyErr.message : 'Unknown'
      );
    }

    revalidatePath('/rbt/job-board');
    return { success: true, data: application };
  } catch (error) {
    console.error('Action failed [applyToCaseOpening]:', error instanceof Error ? error.message : 'Unknown error');
    return { success: false, error: 'Failed to submit application.' };
  }
}

export async function withdrawCaseApplication(applicationId: string) {
  try {
    const rbtUserId = await resolveActingRbtUserId();
    if (!rbtUserId) return { success: false, error: 'Not authorized.' };

    const app = await prisma.caseApplication.findUnique({
      where: { id: applicationId },
      include: { opening: { select: { clientId: true, caseCode: true } } },
    });
    if (!app || app.rbtUserId !== rbtUserId) {
      return { success: false, error: 'Application not found.' };
    }
    if (app.status === 'APPROVED') {
      return { success: false, error: 'Cannot withdraw an approved assignment.' };
    }

    await prisma.caseApplication.update({
      where: { id: applicationId },
      data: { status: 'WITHDRAWN' },
    });

    // JOB_APPLICATION_WITHDRAWN → Case Coord working this pipeline (prefer client owner)
    try {
      const { notifyUsers } = await import('@/app/actions/notifications');
      const client = await prisma.client.findUnique({
        where: { id: app.opening.clientId },
        select: { caseCoordinatorId: true },
      });

      const recipientIds: string[] = [];
      if (client?.caseCoordinatorId) {
        recipientIds.push(client.caseCoordinatorId);
      } else {
        const caseCoordinators = await prisma.user.findMany({
          where: { role: 'CASE_COORDINATOR', isActive: true },
          select: { id: true },
          take: 20,
        });
        recipientIds.push(...caseCoordinators.map((cc) => cc.id));
      }

      await notifyUsers({
        userIds: recipientIds,
        title: `Applicant withdrew · ${app.opening.caseCode}`,
        message: `An RBT withdrew their application for ${app.opening.caseCode}. Review remaining applicants.`,
        type: 'JOB_APPLICATION_WITHDRAWN',
        linkUrl: `/client/${app.opening.clientId}?mode=case-coord`,
        dedupeHours: 0,
      });
    } catch (notifyErr) {
      console.error(
        'withdrawCaseApplication notify failed:',
        notifyErr instanceof Error ? notifyErr.message : 'Unknown'
      );
    }

    revalidatePath('/rbt/job-board');
    return { success: true };
  } catch (error) {
    console.error('Action failed [withdrawCaseApplication]:', error instanceof Error ? error.message : 'Unknown error');
    return { success: false, error: 'Failed to withdraw.' };
  }
}

export async function listMyCaseApplications() {
  try {
    const rbtUserId = await resolveActingRbtUserId();
    if (!rbtUserId) return { success: true, applications: [] };

    const applications = await prisma.caseApplication.findMany({
      where: { rbtUserId },
      include: {
        opening: {
          select: {
            id: true,
            caseCode: true,
            borough: true,
            zipCode: true,
            weeklyHours: true,
            scheduleText: true,
            status: true,
            clientInitials: true,
            ageBand: true,
            childAge: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return { success: true, applications };
  } catch (error) {
    console.error('Action failed [listMyCaseApplications]:', error instanceof Error ? error.message : 'Unknown error');
    return { success: false, applications: [], error: 'Failed to load applications.' };
  }
}
