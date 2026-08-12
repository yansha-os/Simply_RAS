'use server';

import { prisma } from '@/lib/prisma';
import { requireClientAccess } from '@/lib/auth-guard';
import {
  summarizeSessionNoteForQueue,
  type NoteModalityCounts,
} from '@/lib/sessionNoteSummary';

export type ChartSessionPoint = {
  sessionId: string;
  date: string;
  bcbaSigned: boolean;
  percentIndependent: number | null;
  trialCount: number;
  frequencyCount: number;
};

export type ChartSkillProgress = {
  targetId: string;
  domain: string;
  title: string;
  measurementType: string;
  targetStatus: string;
  masteryCriteria: string | null;
  baselineData: number | null;
  totalTrials: number;
  correct: number;
  prompted: number;
  incorrect: number;
  noResponse: number;
  percentIndependent: number | null;
  percentCorrect: number | null;
  sessionsWithData: number;
  lastTrialAt: string | null;
  signedTrials: number;
  pendingTrials: number;
  recentSessions: ChartSessionPoint[];
};

export type ChartBehaviorProgress = {
  behaviorId: string;
  behaviorName: string;
  measurementType: string;
  totalEvents: number;
  totalFrequency: number;
  totalDurationSeconds: number;
  sessionsWithData: number;
  lastLoggedAt: string | null;
  signedEvents: number;
  pendingEvents: number;
  recentSessions: Array<{
    sessionId: string;
    date: string;
    bcbaSigned: boolean;
    count: number;
    durationSeconds: number;
  }>;
};

export type ChartNoteRow = {
  noteId: string;
  sessionId: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  cptCode: string | null;
  location: string | null;
  rbtName: string | null;
  rbtSigned: boolean;
  bcbaSigned: boolean;
  isConverted: boolean;
  billableUnits: number | null;
  bcbaSignedAt: string | null;
  modalityCounts: NoteModalityCounts | null;
  goalsAddressed: string | null;
  objectiveData: string | null;
  preview: string;
};

export type ClientChartProgress = {
  skills: ChartSkillProgress[];
  behaviors: ChartBehaviorProgress[];
  notes: ChartNoteRow[];
  stats: {
    skillTargetCount: number;
    skillsWithData: number;
    behaviorTargetCount: number;
    behaviorsWithData: number;
    notesWithStructure: number;
    signedNotes: number;
    pendingBcba: number;
    readyForPlutus: number;
    converted: number;
    totalTrialsSigned: number;
    totalBehaviorEventsSigned: number;
  };
};

function scoreBucket(score: string): 'correct' | 'prompted' | 'incorrect' | 'noResponse' | 'other' {
  const s = (score || '').trim().toUpperCase();
  if (s === '+' || s === 'CORRECT' || s === 'I' || s === 'IND') return 'correct';
  if (s === 'P' || s === '+P' || s === 'PROMPTED') return 'prompted';
  if (s === 'NR' || s === 'NO_RESPONSE' || s === 'N') return 'noResponse';
  if (s === '-' || s === 'INCORRECT' || s === 'X') return 'incorrect';
  return 'other';
}

function pct(n: number, d: number): number | null {
  if (d <= 0) return null;
  return Math.round((n / d) * 1000) / 10;
}

/**
 * Clinical Chart Progress SoT: SkillTarget / BehaviorTarget aggregates from
 * SessionTrialData + BehaviorLog, plus structured SessionNote summaries.
 * Prefer BCBA-signed sessions for "chart" stats; pending RBT notes still surface.
 */
export async function getClientChartProgress(clientId: string, noteLimit = 40) {
  try {
    if (!clientId) {
      return { success: false as const, error: 'Client id is required.' };
    }

    // Client-scoped gate: BCBA/RBT must be assigned to this client.
    const gate = await requireClientAccess(clientId);
    if (!gate.ok) return { success: false as const, error: gate.error };

    const takeNotes = Math.min(Math.max(noteLimit, 1), 100);

    const [skillTargets, behaviorTargets, sessions] = await Promise.all([
      prisma.skillTarget.findMany({
        where: { clientId },
        include: {
          trialLogs: {
            include: {
              session: {
                select: {
                  id: true,
                  scheduledStart: true,
                  note: { select: { bcbaSigned: true } },
                },
              },
            },
            orderBy: { timestamp: 'desc' },
          },
        },
        orderBy: [{ domain: 'asc' }, { title: 'asc' }],
      }),
      prisma.behaviorTarget.findMany({
        where: { clientId },
        include: {
          behaviorLogs: {
            include: {
              session: {
                select: {
                  id: true,
                  scheduledStart: true,
                  note: { select: { bcbaSigned: true } },
                },
              },
            },
            orderBy: { timestamp: 'desc' },
          },
        },
        orderBy: { behaviorName: 'asc' },
      }),
      prisma.session.findMany({
        where: { clientId },
        include: {
          rbt: { select: { firstName: true, lastName: true } },
          // Session.note is one-to-one (SessionNote?) — direct object
          note: {
            select: {
              id: true,
              rbtSigned: true,
              bcbaSigned: true,
              isConverted: true,
              billableUnits: true,
              bcbaSignedAt: true,
              structuredContent: true,
              clinicalContent: true,
            },
          },
        },
        orderBy: { scheduledStart: 'desc' },
        take: takeNotes,
      }),
    ]);

    const skills: ChartSkillProgress[] = skillTargets.map((t) => {
      let correct = 0;
      let prompted = 0;
      let incorrect = 0;
      let noResponse = 0;
      let signedTrials = 0;
      let pendingTrials = 0;
      const bySession = new Map<
        string,
        { date: string; bcbaSigned: boolean; correct: number; prompted: number; incorrect: number; noResponse: number; total: number; opportunities: number }
      >();

      for (const log of t.trialLogs) {
        const bucket = scoreBucket(log.score);
        if (bucket === 'correct') correct += 1;
        else if (bucket === 'prompted') prompted += 1;
        else if (bucket === 'incorrect') incorrect += 1;
        else if (bucket === 'noResponse') noResponse += 1;

        const signed = Boolean(log.session?.note?.bcbaSigned);
        if (signed) signedTrials += 1;
        else pendingTrials += 1;

        const sid = log.sessionId;
        const cur = bySession.get(sid) || {
          date: log.session?.scheduledStart?.toISOString() || log.timestamp.toISOString(),
          bcbaSigned: signed,
          correct: 0,
          prompted: 0,
          incorrect: 0,
          noResponse: 0,
          total: 0,
          opportunities: 0,
        };
        cur.total += 1;
        // 'other' scores (e.g. raw duration/count values) are excluded from the
        // % independent denominator so they don't dilute trial-based percents.
        if (bucket !== 'other') cur.opportunities += 1;
        if (bucket === 'correct') cur.correct += 1;
        else if (bucket === 'prompted') cur.prompted += 1;
        else if (bucket === 'incorrect') cur.incorrect += 1;
        else if (bucket === 'noResponse') cur.noResponse += 1;
        bySession.set(sid, cur);
      }

      const scored = correct + prompted + incorrect;
      const opportunities = correct + prompted + incorrect + noResponse;
      const totalTrials = t.trialLogs.length;
      const recentSessions: ChartSessionPoint[] = [...bySession.entries()]
        .map(([sessionId, v]) => ({
          sessionId,
          date: v.date,
          bcbaSigned: v.bcbaSigned,
          trialCount: v.total,
          frequencyCount: 0,
          percentIndependent: pct(v.correct, v.opportunities),
        }))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 8);

      return {
        targetId: t.id,
        domain: t.domain,
        title: t.title,
        measurementType: t.measurementType,
        targetStatus: t.targetStatus,
        masteryCriteria: t.masteryCriteria,
        baselineData: t.baselineData,
        totalTrials,
        correct,
        prompted,
        incorrect,
        noResponse,
        percentIndependent: pct(correct, opportunities),
        percentCorrect: pct(correct, scored),
        sessionsWithData: bySession.size,
        lastTrialAt: t.trialLogs[0]?.timestamp?.toISOString() ?? null,
        signedTrials,
        pendingTrials,
        recentSessions,
      };
    });

    const behaviors: ChartBehaviorProgress[] = behaviorTargets.map((b) => {
      let totalFrequency = 0;
      let totalDurationSeconds = 0;
      let signedEvents = 0;
      let pendingEvents = 0;
      const bySession = new Map<
        string,
        { date: string; bcbaSigned: boolean; count: number; durationSeconds: number }
      >();

      for (const log of b.behaviorLogs) {
        const count = log.frequencyCount ?? 1;
        const dur = log.durationSeconds ?? 0;
        totalFrequency += count;
        totalDurationSeconds += dur;
        const signed = Boolean(log.session?.note?.bcbaSigned);
        if (signed) signedEvents += 1;
        else pendingEvents += 1;

        const sid = log.sessionId;
        const cur = bySession.get(sid) || {
          date: log.session?.scheduledStart?.toISOString() || log.timestamp.toISOString(),
          bcbaSigned: signed,
          count: 0,
          durationSeconds: 0,
        };
        cur.count += count;
        cur.durationSeconds += dur;
        bySession.set(sid, cur);
      }

      return {
        behaviorId: b.id,
        behaviorName: b.behaviorName,
        measurementType: b.measurementType,
        totalEvents: b.behaviorLogs.length,
        totalFrequency,
        totalDurationSeconds,
        sessionsWithData: bySession.size,
        lastLoggedAt: b.behaviorLogs[0]?.timestamp?.toISOString() ?? null,
        signedEvents,
        pendingEvents,
        recentSessions: [...bySession.entries()]
          .map(([sessionId, v]) => ({
            sessionId,
            date: v.date,
            bcbaSigned: v.bcbaSigned,
            count: v.count,
            durationSeconds: v.durationSeconds,
          }))
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .slice(0, 8),
      };
    });

    const notes: ChartNoteRow[] = sessions
      .filter((s) => s.note)
      .map((s) => {
        const note = s.note!;
        const summary = summarizeSessionNoteForQueue(note.structuredContent, note.clinicalContent);
        return {
          noteId: note.id,
          sessionId: s.id,
          scheduledStart: s.scheduledStart.toISOString(),
          scheduledEnd: s.scheduledEnd.toISOString(),
          status: s.status,
          cptCode: s.cptCode,
          location: s.location,
          rbtName: s.rbt ? `${s.rbt.firstName} ${s.rbt.lastName}` : null,
          rbtSigned: note.rbtSigned,
          bcbaSigned: note.bcbaSigned,
          isConverted: note.isConverted,
          billableUnits: note.billableUnits,
          bcbaSignedAt: note.bcbaSignedAt?.toISOString() ?? null,
          modalityCounts: summary.modalityCounts,
          goalsAddressed: summary.goalsAddressed,
          objectiveData: summary.objectiveData,
          preview: summary.preview,
        };
      });

    const signedNotes = notes.filter((n) => n.bcbaSigned).length;
    const pendingBcba = notes.filter((n) => n.rbtSigned && !n.bcbaSigned).length;
    const readyForPlutus = notes.filter((n) => n.bcbaSigned && !n.isConverted).length;
    const converted = notes.filter((n) => n.isConverted).length;
    const notesWithStructure = notes.filter(
      (n) =>
        n.modalityCounts &&
        (n.modalityCounts.trials > 0 ||
          n.modalityCounts.frequency > 0 ||
          n.modalityCounts.duration > 0 ||
          n.modalityCounts.abc > 0 ||
          n.modalityCounts.taskAnalysis > 0 ||
          n.modalityCounts.probes > 0 ||
          Boolean(n.goalsAddressed) ||
          Boolean(n.objectiveData))
    ).length;

    const data: ClientChartProgress = {
      skills,
      behaviors,
      notes,
      stats: {
        skillTargetCount: skills.length,
        skillsWithData: skills.filter((s) => s.totalTrials > 0).length,
        behaviorTargetCount: behaviors.length,
        behaviorsWithData: behaviors.filter((b) => b.totalEvents > 0).length,
        notesWithStructure,
        signedNotes,
        pendingBcba,
        readyForPlutus,
        converted,
        totalTrialsSigned: skills.reduce((sum, s) => sum + s.signedTrials, 0),
        totalBehaviorEventsSigned: behaviors.reduce((sum, b) => sum + b.signedEvents, 0),
      },
    };

    return { success: true as const, data };
  } catch (error) {
    console.error(
      'getClientChartProgress failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false as const, error: 'Failed to load chart progress.' };
  }
}
