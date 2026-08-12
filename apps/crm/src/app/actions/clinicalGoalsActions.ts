'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requireClientAccess } from '@/lib/auth-guard';
import {
  brpGoalsToBehaviorTargetPayloads,
  parseClinicalGoalsFromTreatmentPlan,
  skillGoalsToSkillTargetPayloads,
  SKILL_TARGET_STATUSES,
  type ClinicalGoalsSnapshot,
  type SkillTargetStatus,
} from '@/lib/clinicalGoals';

export type { ClinicalGoalsSnapshot };

const SYNC_ROLES = new Set([
  'BCBA',
  'CLINICAL_DIRECTOR',
  'CLINICAL_SUPPORT',
  'CASE_COORDINATOR',
  'CEO',
  'OPS_DIRECTOR',
]);

/**
 * Read-only: parse Client.treatmentPlan JSON into a clinical goals snapshot.
 */
export async function getClinicalGoalsSnapshot(
  clientId: string,
): Promise<{ success: true; data: ClinicalGoalsSnapshot } | { success: false; error: string }> {
  try {
    if (!clientId) {
      return { success: false, error: 'Client id is required.' };
    }

    const gate = await requireClientAccess(clientId);
    if (!gate.ok) return { success: false, error: gate.error };

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, treatmentPlan: true },
    });

    if (!client) {
      return { success: false, error: 'Client not found.' };
    }

    return {
      success: true,
      data: parseClinicalGoalsFromTreatmentPlan(client.treatmentPlan),
    };
  } catch (error) {
    console.error(
      'getClinicalGoalsSnapshot failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false, error: 'Failed to load clinical goals.' };
  }
}

export type StudioSkillTargetRow = {
  id: string;
  domain: string;
  title: string;
  measurementType: string;
  targetStatus: string;
  masteryCriteria: string | null;
  updatedAt: string;
};

export type StudioBehaviorTargetRow = {
  id: string;
  behaviorName: string;
  measurementType: string;
};

export type SessionStudioSyncStatus = {
  skillCount: number;
  behaviorCount: number;
  /** Lowercased titles currently present as durable SkillTarget rows */
  skillTitles: string[];
  /** Lowercased behavior names currently present as durable BehaviorTarget rows */
  behaviorNames: string[];
  /** Durable SkillTarget rows (for per-target status management) */
  skillTargets: StudioSkillTargetRow[];
  /** Durable BehaviorTarget rows (read-only — no status column in schema) */
  behaviorTargets: StudioBehaviorTargetRow[];
};

export type SyncTargetsResult = {
  success: true;
  skillsCreated: number;
  skillsUpdated: number;
  behaviorsCreated: number;
  behaviorsUpdated: number;
  skippedEmpty: number;
  /** Durable SkillTarget count after sync */
  skillTargetsTotal: number;
  /** Durable BehaviorTarget count after sync */
  behaviorTargetsTotal: number;
};

/**
 * Lightweight read: durable Session Studio SkillTarget / BehaviorTarget counts + titles.
 * Used by Clinical Goals tab to show TP ↔ Studio sync status without loading full EMR.
 */
export async function getSessionStudioSyncStatus(
  clientId: string,
): Promise<{ success: true; data: SessionStudioSyncStatus } | { success: false; error: string }> {
  try {
    if (!clientId) {
      return { success: false, error: 'Client id is required.' };
    }

    const gate = await requireClientAccess(clientId);
    if (!gate.ok) return { success: false, error: gate.error };

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        skillTargets: {
          select: {
            id: true,
            domain: true,
            title: true,
            measurementType: true,
            targetStatus: true,
            masteryCriteria: true,
            updatedAt: true,
          },
          orderBy: [{ domain: 'asc' }, { title: 'asc' }],
        },
        behaviorTargets: {
          select: { id: true, behaviorName: true, measurementType: true },
          orderBy: { behaviorName: 'asc' },
        },
      },
    });

    if (!client) {
      return { success: false, error: 'Client not found.' };
    }

    return {
      success: true,
      data: {
        skillCount: client.skillTargets.length,
        behaviorCount: client.behaviorTargets.length,
        skillTitles: client.skillTargets.map((t) => t.title.trim().toLowerCase()),
        behaviorNames: client.behaviorTargets.map((b) => b.behaviorName.trim().toLowerCase()),
        skillTargets: client.skillTargets.map((t) => ({
          id: t.id,
          domain: t.domain,
          title: t.title,
          measurementType: t.measurementType,
          targetStatus: t.targetStatus,
          masteryCriteria: t.masteryCriteria,
          updatedAt: t.updatedAt.toISOString(),
        })),
        behaviorTargets: client.behaviorTargets.map((b) => ({
          id: b.id,
          behaviorName: b.behaviorName,
          measurementType: b.measurementType,
        })),
      },
    };
  } catch (error) {
    console.error(
      'getSessionStudioSyncStatus failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false, error: 'Failed to load Session Studio sync status.' };
  }
}

/**
 * Idempotent bridge: Client.treatmentPlan skillGoals / brp → durable SkillTarget + BehaviorTarget.
 * Match key: clientId + title/behaviorName (case-insensitive). Safe to re-run after TP edits.
 */
export async function syncTreatmentPlanTargetsToSessionStudio(
  clientId: string,
): Promise<SyncTargetsResult | { success: false; error: string }> {
  try {
    if (!clientId) {
      return { success: false, error: 'Client id is required.' };
    }

    const gate = await requireClientAccess(clientId);
    if (!gate.ok) return { success: false, error: gate.error };
    if (!SYNC_ROLES.has(String(gate.user.role))) {
      return { success: false, error: 'Only clinical staff can sync Session Studio targets.' };
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        treatmentPlan: true,
        skillTargets: {
          select: { id: true, title: true },
        },
        behaviorTargets: {
          select: { id: true, behaviorName: true },
        },
      },
    });

    if (!client) {
      return { success: false, error: 'Client not found.' };
    }

    const snapshot = parseClinicalGoalsFromTreatmentPlan(client.treatmentPlan);
    const skillPayloads = skillGoalsToSkillTargetPayloads(snapshot.skillGoals);
    const behaviorPayloads = brpGoalsToBehaviorTargetPayloads(snapshot.brpGoals);
    const skippedEmpty =
      snapshot.skillGoals.length -
      skillPayloads.length +
      (snapshot.brpGoals.length - behaviorPayloads.length);

    if (skillPayloads.length === 0 && behaviorPayloads.length === 0) {
      return {
        success: false,
        error: 'No skill or behavior goals in the treatment plan to sync. Add goals first.',
      };
    }

    const skillByTitle = new Map(
      client.skillTargets.map((t) => [t.title.trim().toLowerCase(), t.id]),
    );
    const behaviorByName = new Map(
      client.behaviorTargets.map((b) => [b.behaviorName.trim().toLowerCase(), b.id]),
    );

    let skillsCreated = 0;
    let skillsUpdated = 0;
    let behaviorsCreated = 0;
    let behaviorsUpdated = 0;

    for (const payload of skillPayloads) {
      const key = payload.title.toLowerCase();
      const existingId = skillByTitle.get(key);
      if (existingId) {
        await prisma.skillTarget.update({
          where: { id: existingId },
          data: {
            domain: payload.domain,
            description: payload.description,
            measurementType: payload.measurementType,
            targetStatus: payload.targetStatus,
            masteryCriteria: payload.masteryCriteria,
            baselineData: payload.baselineData,
          },
        });
        skillsUpdated += 1;
      } else {
        const created = await prisma.skillTarget.create({
          data: {
            id: crypto.randomUUID(),
            clientId: client.id,
            domain: payload.domain,
            title: payload.title,
            description: payload.description,
            measurementType: payload.measurementType,
            targetStatus: payload.targetStatus,
            masteryCriteria: payload.masteryCriteria,
            baselineData: payload.baselineData,
          },
        });
        skillByTitle.set(key, created.id);
        skillsCreated += 1;
      }
    }

    for (const payload of behaviorPayloads) {
      const key = payload.behaviorName.toLowerCase();
      const existingId = behaviorByName.get(key);
      if (existingId) {
        await prisma.behaviorTarget.update({
          where: { id: existingId },
          data: {
            definition: payload.definition,
            measurementType: payload.measurementType,
            antecedents: payload.antecedents,
            consequences: payload.consequences,
            replacementBehavior: payload.replacementBehavior,
          },
        });
        behaviorsUpdated += 1;
      } else {
        const created = await prisma.behaviorTarget.create({
          data: {
            id: crypto.randomUUID(),
            clientId: client.id,
            behaviorName: payload.behaviorName,
            definition: payload.definition,
            measurementType: payload.measurementType,
            antecedents: payload.antecedents,
            consequences: payload.consequences,
            replacementBehavior: payload.replacementBehavior,
          },
        });
        behaviorByName.set(key, created.id);
        behaviorsCreated += 1;
      }
    }

    const skillTargetsTotal = skillByTitle.size;
    const behaviorTargetsTotal = behaviorByName.size;

    revalidatePath('/', 'layout');
    revalidatePath(`/client/${clientId}`);

    return {
      success: true,
      skillsCreated,
      skillsUpdated,
      behaviorsCreated,
      behaviorsUpdated,
      skippedEmpty: Math.max(0, skippedEmpty),
      skillTargetsTotal,
      behaviorTargetsTotal,
    };
  } catch (error) {
    console.error(
      'syncTreatmentPlanTargetsToSessionStudio failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false, error: 'Failed to sync targets to Session Studio.' };
  }
}

/**
 * Clinical decision: change a durable SkillTarget's status. MASTERED / ON_HOLD /
 * DISCONTINUED remove the target from Studio Collect (HRM only loads
 * BASELINE + IN_PROGRESS); trial history is preserved either way.
 */
export async function updateSkillTargetStatus(
  clientId: string,
  targetId: string,
  status: SkillTargetStatus,
): Promise<{ success: true; targetStatus: SkillTargetStatus } | { success: false; error: string }> {
  try {
    if (!clientId || !targetId) {
      return { success: false, error: 'Client id and target id are required.' };
    }
    if (!SKILL_TARGET_STATUSES.includes(status)) {
      return { success: false, error: 'Invalid target status.' };
    }

    const gate = await requireClientAccess(clientId);
    if (!gate.ok) return { success: false, error: gate.error };
    if (!SYNC_ROLES.has(String(gate.user.role))) {
      return { success: false, error: 'Only clinical staff can change target status.' };
    }

    // Conditional update: target must belong to this client (no cross-client IDOR).
    const result = await prisma.skillTarget.updateMany({
      where: { id: targetId, clientId },
      data: { targetStatus: status },
    });
    if (result.count === 0) {
      return { success: false, error: 'Target not found for this client.' };
    }

    revalidatePath(`/client/${clientId}`);

    return { success: true, targetStatus: status };
  } catch (error) {
    console.error(
      'updateSkillTargetStatus failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false, error: 'Failed to update target status.' };
  }
}
