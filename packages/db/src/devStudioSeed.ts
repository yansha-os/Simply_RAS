import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

const DEMO_UUID_NAMESPACE = 'simple-ras-crm:connected-product-studio:v1';
const MAX_SESSION_GENERATIONS = 64;
const THERAPY_CPT = '97153';
const DEMO_AUTH_NUMBER = 'DEV-TX-STUDIO';

export const DEMO_STUDIO_GUARDIAN_EMAIL =
  'demo.studio.learner@riseandshine.local';

export type DevStudioSeedMode = 'STAFFING_PENDING' | 'ACTIVE';

export type DevStudioSeedResult = {
  clientId: string;
  status: DevStudioSeedMode;
  rbtId: string;
  bcbaId: string;
  rbtEmail: string;
  bcbaEmail: string;
  sessionId: string | null;
  incompleteSessionId: string | null;
  claimReadySessionId: string | null;
  magicLinkToken: string | null;
  paRequestId: string;
  authorizationId: string;
  skillTargetIds: string[];
  behaviorTargetIds: string[];
  created: boolean;
};

export type DemoSessionKind = 'INCOMPLETE' | 'CLAIM_READY';

export type DemoSessionCandidate = {
  id: string;
  status: string;
  hasNote: boolean;
  isConverted: boolean;
};

export type DemoSessionSlot = {
  id: string;
  generation: number;
  shouldCreate: boolean;
};

/** Stable RFC-4122 UUIDv5-shaped identifier derived from a demo-only key. */
export function stableDemoUuid(key: string): string {
  const bytes = createHash('sha256')
    .update(`${DEMO_UUID_NAMESPACE}:${key}`)
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export const DEMO_SKILL_TARGETS = [
  {
    id: stableDemoUuid('skill:functional-communication-request'),
    label: '[DEMO] Functional communication: request a preferred item',
    domain: 'Communication',
    description:
      'Demo-only acquisition target for requesting a preferred item with functional communication.',
    measurementType: 'TRIAL',
    targetStatus: 'IN_PROGRESS',
    masteryCriteria: '80% independent across 3 demo sessions',
    baselineData: 25,
  },
  {
    id: stableDemoUuid('skill:listener-one-step-direction'),
    label: '[DEMO] Listener responding: follow one-step directions',
    domain: 'Listener Responding',
    description:
      'Demo-only acquisition target for following familiar one-step directions in the home setting.',
    measurementType: 'TRIAL',
    targetStatus: 'IN_PROGRESS',
    masteryCriteria: '80% independent across 3 demo sessions',
    baselineData: 40,
  },
] as const;

export const DEMO_BEHAVIOR_TARGETS = [
  {
    id: stableDemoUuid('behavior:elopement-attempts'),
    label: '[DEMO] Elopement attempts',
    definition:
      'Demo-only behavior target: movement more than six feet from the assigned area without permission.',
    measurementType: 'FREQUENCY',
    antecedents: 'Transitions or presentation of a non-preferred task.',
    consequences: 'Block safely, redirect, and reinforce functional communication.',
    replacementBehavior: 'Request a break or transition assistance.',
  },
] as const;

const DEMO_USERS = {
  rbt: {
    id: stableDemoUuid('user:rbt:david-miller'),
    email: 'david.m@riseandshine.nyc',
    role: 'RBT' as const,
    firstName: 'David',
    lastName: 'Miller',
  },
  bcba: {
    id: stableDemoUuid('user:bcba'),
    email: 'demo.bcba.studio@riseandshine.local',
    role: 'BCBA' as const,
    firstName: 'Demo',
    lastName: 'BCBA',
  },
  caseCoordinator: {
    id: stableDemoUuid('user:case-coordinator'),
    email: 'demo.casecoord.studio@riseandshine.local',
    role: 'CASE_COORDINATOR' as const,
    firstName: 'Demo',
    lastName: 'CaseCoord',
  },
};

export function demoSessionFixtureId(kind: DemoSessionKind, generation: number): string {
  if (!Number.isInteger(generation) || generation < 1) {
    throw new Error('Demo session generation must be a positive integer.');
  }
  return stableDemoUuid(`session:${kind.toLowerCase()}:${generation}`);
}

export function demoSessionLocation(kind: DemoSessionKind, generation: number): string {
  const branch = kind === 'CLAIM_READY' ? 'Claim-ready' : 'Close incomplete';
  return `12 - Home · [DEMO] ${branch} · v${generation}`;
}

/**
 * Reuse only an untouched scheduled fixture. Any started/completed/noted row is
 * historical evidence and gets a new deterministic generation instead.
 */
export function selectDemoSessionSlot(
  kind: DemoSessionKind,
  existing: DemoSessionCandidate[]
): DemoSessionSlot {
  const byId = new Map(existing.map((row) => [row.id, row]));

  for (let generation = 1; generation <= MAX_SESSION_GENERATIONS; generation += 1) {
    const id = demoSessionFixtureId(kind, generation);
    const row = byId.get(id);
    if (!row) {
      return { id, generation, shouldCreate: true };
    }
    if (row.status === 'SCHEDULED' && !row.hasNote) {
      return { id, generation, shouldCreate: false };
    }
  }

  throw new Error(`No available ${kind} demo session slot.`);
}

export function allDemoSessionFixtureIds(): string[] {
  return (['INCOMPLETE', 'CLAIM_READY'] as const).flatMap((kind) =>
    Array.from({ length: MAX_SESSION_GENERATIONS }, (_, index) =>
      demoSessionFixtureId(kind, index + 1)
    )
  );
}

export function toDevSeedDiagnostic(error: unknown): {
  code: string | null;
  message: string;
} {
  if (!error || typeof error !== 'object') {
    return { code: null, message: 'Unknown error' };
  }

  const candidate = error as { code?: unknown; message?: unknown };
  return {
    code: typeof candidate.code === 'string' ? candidate.code : null,
    message:
      typeof candidate.message === 'string' && candidate.message.trim()
        ? candidate.message
        : 'Unknown error',
  };
}

type DemoUserFixture = (typeof DEMO_USERS)[keyof typeof DEMO_USERS];

async function ensureDemoUser(
  tx: Prisma.TransactionClient,
  fixture: DemoUserFixture
) {
  const byEmail = await tx.user.findFirst({
    where: { email: { equals: fixture.email, mode: 'insensitive' } },
    select: { id: true },
  });

  if (byEmail) {
    return tx.user.update({
      where: { id: byEmail.id },
      data: {
        email: fixture.email,
        role: fixture.role,
        isActive: true,
        firstName: fixture.firstName,
        lastName: fixture.lastName,
      },
      select: { id: true, email: true },
    });
  }

  const idOwner = await tx.user.findUnique({
    where: { id: fixture.id },
    select: { id: true },
  });
  if (idOwner) {
    throw new Error(`Demo user fixture id collision: ${fixture.id}`);
  }

  return tx.user.create({
    data: {
      id: fixture.id,
      email: fixture.email,
      role: fixture.role,
      isActive: true,
      firstName: fixture.firstName,
      lastName: fixture.lastName,
    },
    select: { id: true, email: true },
  });
}

function demoTreatmentPlan(now: Date): Prisma.InputJsonValue {
  return {
    parentSignature: 'Demo Parent',
    preferredSchedule: {
      monday: ['10:00-12:00'],
      wednesday: ['10:00-12:00'],
    },
    skillGoals: DEMO_SKILL_TARGETS.map((target) => ({
      domain: target.domain,
      description: target.label,
      mastery: target.masteryCriteria,
      baseline: `${target.baselineData}% independent`,
      currentLevel: target.description,
      status: 'Continuing',
    })),
    brp: DEMO_BEHAVIOR_TARGETS.map((target) => ({
      behavior: target.label,
      function: 'Demo-only QA fixture',
      mastery: 'Reduce frequency while increasing functional communication',
      baseline: 'Demo baseline only',
      risk: 'Low — synthetic QA data',
    })),
    __devSeed: {
      kind: 'connected-product-studio',
      at: now.toISOString(),
      note: 'DevTools fixture — not a real intake',
    },
  };
}

async function ensureDemoPa(
  tx: Prisma.TransactionClient,
  clientId: string,
  effectiveDate: Date,
  expirationDate: Date
): Promise<string> {
  const existing = await tx.pARequest.findFirst({
    where: {
      clientId,
      type: 'TREATMENT',
      authNumber: DEMO_AUTH_NUMBER,
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  const data = {
    status: 'APPROVED' as const,
    authNumber: DEMO_AUTH_NUMBER,
    approvedUnits: 160,
    effectiveDate,
    expirationDate,
    vobCompleted: true,
    providerCredentialed: true,
  };

  if (existing) {
    await tx.pARequest.update({ where: { id: existing.id }, data });
    return existing.id;
  }

  const id = stableDemoUuid('pa-request:treatment');
  const idOwner = await tx.pARequest.findUnique({
    where: { id },
    select: { clientId: true },
  });
  if (idOwner && idOwner.clientId !== clientId) {
    throw new Error(`Demo PA fixture id collision: ${id}`);
  }

  if (idOwner) {
    await tx.pARequest.update({ where: { id }, data });
  } else {
    await tx.pARequest.create({
      data: { id, clientId, type: 'TREATMENT', ...data },
    });
  }
  return id;
}

async function ensureDemoAuthorization(
  tx: Prisma.TransactionClient,
  clientId: string,
  startDate: Date,
  endDate: Date
): Promise<string> {
  const existing = await tx.authorization.findFirst({
    where: {
      clientId,
      type: 'TREATMENT',
      authNumber: DEMO_AUTH_NUMBER,
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const id = existing?.id ?? stableDemoUuid('authorization:treatment');

  if (!existing) {
    const idOwner = await tx.authorization.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (idOwner && idOwner.clientId !== clientId) {
      throw new Error(`Demo authorization fixture id collision: ${id}`);
    }
  }

  const data = {
    status: 'APPROVED' as const,
    authNumber: DEMO_AUTH_NUMBER,
    startDate,
    endDate,
    unitsRequested: 160,
    unitsApproved: 160,
  };
  if (existing) {
    await tx.authorization.update({ where: { id }, data });
  } else {
    await tx.authorization.create({
      data: { id, clientId, type: 'TREATMENT', ...data },
    });
  }

  const cpt = await tx.authCptCode.findFirst({
    where: { authorizationId: id, code: THERAPY_CPT },
    select: { id: true },
  });
  if (cpt) {
    await tx.authCptCode.update({
      where: { id: cpt.id },
      data: { unitsApproved: 160 },
    });
  } else {
    const cptId = stableDemoUuid('authorization:treatment:97153');
    const cptIdOwner = await tx.authCptCode.findUnique({
      where: { id: cptId },
      select: { authorizationId: true },
    });
    if (cptIdOwner && cptIdOwner.authorizationId !== id) {
      throw new Error(`Demo authorization CPT fixture id collision: ${cptId}`);
    }
    if (cptIdOwner) {
      await tx.authCptCode.update({
        where: { id: cptId },
        data: { code: THERAPY_CPT, unitsApproved: 160 },
      });
    } else {
      await tx.authCptCode.create({
        data: {
          id: cptId,
          authorizationId: id,
          code: THERAPY_CPT,
          unitsApproved: 160,
        },
      });
    }
  }

  return id;
}

async function ensureDemoIntakePacket(
  tx: Prisma.TransactionClient,
  clientId: string
): Promise<string> {
  const existing = await tx.intakePacket.findUnique({
    where: { clientId },
    select: { id: true, magicLinkToken: true },
  });
  const token = existing?.magicLinkToken ?? stableDemoUuid('magic-link');

  const tokenOwner = await tx.intakePacket.findUnique({
    where: { magicLinkToken: token },
    select: { clientId: true },
  });
  if (tokenOwner && tokenOwner.clientId !== clientId) {
    throw new Error(`Demo magic-link token collision: ${token}`);
  }

  const data = {
    magicLinkToken: token,
    status: 'APPROVED' as const,
    intakeFormComplete: true,
    consentFormComplete: true,
  };
  if (existing) {
    await tx.intakePacket.update({ where: { id: existing.id }, data });
  } else {
    const id = stableDemoUuid('intake-packet');
    const idOwner = await tx.intakePacket.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (idOwner && idOwner.clientId !== clientId) {
      throw new Error(`Demo intake-packet fixture id collision: ${id}`);
    }
    if (idOwner) {
      await tx.intakePacket.update({ where: { id }, data });
    } else {
      await tx.intakePacket.create({ data: { id, clientId, ...data } });
    }
  }
  return token;
}

async function ensureDemoTargets(
  tx: Prisma.TransactionClient,
  clientId: string
): Promise<{ skillTargetIds: string[]; behaviorTargetIds: string[] }> {
  const skillIds = DEMO_SKILL_TARGETS.map((target) => target.id);
  const behaviorIds = DEMO_BEHAVIOR_TARGETS.map((target) => target.id);

  const skillOwners = await tx.skillTarget.findMany({
    where: { id: { in: skillIds } },
    select: { id: true, clientId: true },
  });
  const behaviorOwners = await tx.behaviorTarget.findMany({
    where: { id: { in: behaviorIds } },
    select: { id: true, clientId: true },
  });
  const wrongSkill = skillOwners.find((row) => row.clientId !== clientId);
  const wrongBehavior = behaviorOwners.find((row) => row.clientId !== clientId);
  if (wrongSkill) {
    throw new Error(`Demo SkillTarget fixture id collision: ${wrongSkill.id}`);
  }
  if (wrongBehavior) {
    throw new Error(`Demo BehaviorTarget fixture id collision: ${wrongBehavior.id}`);
  }

  for (const target of DEMO_SKILL_TARGETS) {
    await tx.skillTarget.upsert({
      where: { id: target.id },
      create: {
        id: target.id,
        clientId,
        domain: target.domain,
        title: target.label,
        description: target.description,
        measurementType: target.measurementType,
        targetStatus: target.targetStatus,
        masteryCriteria: target.masteryCriteria,
        baselineData: target.baselineData,
      },
      update: {
        domain: target.domain,
        title: target.label,
        description: target.description,
        measurementType: target.measurementType,
        targetStatus: target.targetStatus,
        masteryCriteria: target.masteryCriteria,
        baselineData: target.baselineData,
      },
    });
  }

  for (const target of DEMO_BEHAVIOR_TARGETS) {
    await tx.behaviorTarget.upsert({
      where: { id: target.id },
      create: {
        id: target.id,
        clientId,
        behaviorName: target.label,
        definition: target.definition,
        measurementType: target.measurementType,
        antecedents: target.antecedents,
        consequences: target.consequences,
        replacementBehavior: target.replacementBehavior,
      },
      update: {
        behaviorName: target.label,
        definition: target.definition,
        measurementType: target.measurementType,
        antecedents: target.antecedents,
        consequences: target.consequences,
        replacementBehavior: target.replacementBehavior,
      },
    });
  }

  return { skillTargetIds: skillIds, behaviorTargetIds: behaviorIds };
}

function roundedDemoSessionStart(now: Date): Date {
  const fifteenMinutes = 15 * 60 * 1000;
  const earliest = now.getTime() + 45 * 60 * 1000;
  return new Date(Math.ceil(earliest / fifteenMinutes) * fifteenMinutes);
}

async function ensureDemoSessions(
  tx: Prisma.TransactionClient,
  input: {
    clientId: string;
    rbtId: string;
    bcbaId: string;
    now: Date;
  }
): Promise<{ incompleteSessionId: string; claimReadySessionId: string }> {
  const fixtureIds = allDemoSessionFixtureIds();
  const existing = await tx.session.findMany({
    where: { id: { in: fixtureIds } },
    select: {
      id: true,
      clientId: true,
      status: true,
      note: { select: { id: true, isConverted: true } },
    },
  });
  const wrongOwner = existing.find((row) => row.clientId !== input.clientId);
  if (wrongOwner) {
    throw new Error(`Demo Session fixture id collision: ${wrongOwner.id}`);
  }

  const candidates = existing.map((row) => ({
    id: row.id,
    status: row.status,
    hasNote: Boolean(row.note),
    isConverted: row.note?.isConverted ?? false,
  }));
  const incomplete = selectDemoSessionSlot('INCOMPLETE', candidates);
  const claimReady = selectDemoSessionSlot('CLAIM_READY', candidates);
  const firstStart = roundedDemoSessionStart(input.now);

  const fixtures = [
    {
      kind: 'INCOMPLETE' as const,
      slot: incomplete,
      start: firstStart,
    },
    {
      kind: 'CLAIM_READY' as const,
      slot: claimReady,
      start: new Date(firstStart.getTime() + 3 * 60 * 60 * 1000),
    },
  ];

  for (const fixture of fixtures) {
    const data = {
      clientId: input.clientId,
      rbtId: input.rbtId,
      bcbaId: input.bcbaId,
      status: 'SCHEDULED' as const,
      scheduledStart: fixture.start,
      scheduledEnd: new Date(fixture.start.getTime() + 2 * 60 * 60 * 1000),
      cptCode: THERAPY_CPT,
      location: demoSessionLocation(fixture.kind, fixture.slot.generation),
      placeOfServiceCode: '12',
    };
    if (fixture.slot.shouldCreate) {
      await tx.session.create({ data: { id: fixture.slot.id, ...data } });
    } else {
      await tx.session.update({
        where: { id: fixture.slot.id },
        data: {
          rbtId: data.rbtId,
          bcbaId: data.bcbaId,
          scheduledStart: data.scheduledStart,
          scheduledEnd: data.scheduledEnd,
          cptCode: data.cptCode,
          location: data.location,
          placeOfServiceCode: data.placeOfServiceCode,
        },
      });
    }
  }

  return {
    incompleteSessionId: incomplete.id,
    claimReadySessionId: claimReady.id,
  };
}

export async function seedConnectedProductDemo(
  prisma: PrismaClient,
  options: {
    mode: DevStudioSeedMode;
    withSession: boolean;
  },
  assertDemoClientTarget: (
    tx: Prisma.TransactionClient,
    clientId: string
  ) => Promise<void>
): Promise<DevStudioSeedResult> {
  return prisma.$transaction(
    async (tx) => {
      // A prior read-only integrity check can leave this session-pooler GUC on.
      // The dev-only seed owns an explicit write transaction and never changes
      // the connection default outside this transaction.
      await tx.$executeRawUnsafe('SET TRANSACTION READ WRITE');
      await tx.$queryRawUnsafe(
        "SELECT 1::int AS acquired FROM (SELECT pg_advisory_xact_lock(hashtext('simple-ras-crm-dev-studio-seed'))) AS seed_lock"
      );

      const now = new Date();
      const startOfDay = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
      const endDate = new Date(startOfDay.getTime() + 180 * 24 * 60 * 60 * 1000);
      // The pg adapter reserves one connection for this interactive transaction;
      // serialize its queries rather than issuing concurrent client.query calls.
      const rbt = await ensureDemoUser(tx, DEMO_USERS.rbt);
      const bcba = await ensureDemoUser(tx, DEMO_USERS.bcba);
      const caseCoordinator = await ensureDemoUser(tx, DEMO_USERS.caseCoordinator);

      const matches = await tx.client.findMany({
        where: {
          guardianEmail: {
            equals: DEMO_STUDIO_GUARDIAN_EMAIL,
            mode: 'insensitive',
          },
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: 2,
      });
      if (matches.length > 1) {
        throw new Error(
          `Demo learner marker is ambiguous: ${matches.map((row) => row.id).join(',')}`
        );
      }

      const created = matches.length === 0;
      const clientId = matches[0]?.id ?? stableDemoUuid('client:studio-learner');
      const clientData = {
        firstName: 'Demo',
        lastName: 'Studio Learner',
        status: options.mode,
        rbtId: rbt.id,
        bcbaId: bcba.id,
        caseCoordinatorId: caseCoordinator.id,
        rbtApproved: true,
        childAge: 6,
        guardianName: 'Demo Parent',
        guardianPhone: '(555) 010-0100',
        guardianEmail: DEMO_STUDIO_GUARDIAN_EMAIL,
        parentAddress: '150 Court Street, Brooklyn, NY 11201',
        insurancePayer: 'Demo Medicaid',
        treatmentPlan: demoTreatmentPlan(now),
      };

      if (created) {
        const idOwner = await tx.client.findUnique({
          where: { id: clientId },
          select: { id: true },
        });
        if (idOwner) {
          throw new Error(`Demo Client fixture id collision: ${clientId}`);
        }
        await tx.client.create({ data: { id: clientId, ...clientData } });
      } else {
        await assertDemoClientTarget(tx, clientId);
        await tx.client.update({ where: { id: clientId }, data: clientData });
      }
      await assertDemoClientTarget(tx, clientId);

      const paRequestId = await ensureDemoPa(tx, clientId, startOfDay, endDate);
      const authorizationId = await ensureDemoAuthorization(
        tx,
        clientId,
        startOfDay,
        endDate
      );
      const magicLinkToken = await ensureDemoIntakePacket(tx, clientId);
      const targetIds = await ensureDemoTargets(tx, clientId);

      let incompleteSessionId: string | null = null;
      let claimReadySessionId: string | null = null;
      if (options.withSession) {
        const sessions = await ensureDemoSessions(tx, {
          clientId,
          rbtId: rbt.id,
          bcbaId: bcba.id,
          now,
        });
        incompleteSessionId = sessions.incompleteSessionId;
        claimReadySessionId = sessions.claimReadySessionId;
      }

      return {
        clientId,
        status: options.mode,
        rbtId: rbt.id,
        bcbaId: bcba.id,
        rbtEmail: rbt.email,
        bcbaEmail: bcba.email,
        sessionId: claimReadySessionId,
        incompleteSessionId,
        claimReadySessionId,
        magicLinkToken,
        paRequestId,
        authorizationId,
        skillTargetIds: targetIds.skillTargetIds,
        behaviorTargetIds: targetIds.behaviorTargetIds,
        created,
      };
    },
    { maxWait: 10_000, timeout: 30_000 }
  );
}

export function demoClaimReadySessionIds(): string[] {
  return Array.from({ length: MAX_SESSION_GENERATIONS }, (_, index) =>
    demoSessionFixtureId('CLAIM_READY', index + 1)
  );
}

export function demoIncompleteSessionIds(): string[] {
  return Array.from({ length: MAX_SESSION_GENERATIONS }, (_, index) =>
    demoSessionFixtureId('INCOMPLETE', index + 1)
  );
}
