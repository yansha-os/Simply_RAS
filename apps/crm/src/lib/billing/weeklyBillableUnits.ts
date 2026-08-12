/**
 * Weekly billable units from durably attested SessionNotes.
 * Only positive persisted note.billableUnits count; duration is never billing truth.
 * Separate from authUnits.ts so AuthUnitsPanel / Track 2A can evolve independently.
 */

import { evaluateAttestationState } from '@repo/db/session-note-attestation';

import {
  CLINIC_TIME_ZONE,
  addClinicDays,
  clinicDateKey,
  clinicDayIndexMonday,
  endOfClinicDay,
  startOfClinicDay,
} from '@/lib/clinicTimezone';

export const WEEK_DAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type WeekDayLabel = (typeof WEEK_DAY_LABELS)[number];

export type WeeklyBillableSessionRow = {
  sessionId: string;
  noteId: string;
  cptCode: string;
  units: number;
  unitsSource: 'NOTE_BILLABLE_UNITS' | 'SESSION_DURATION_8_MIN';
  serviceDate: string; // ISO
  dayIndex: number; // 0 = Monday … 6 = Sunday (week containing serviceDate)
  dayLabel: WeekDayLabel;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  bcbaSigned: true;
  isConverted: boolean;
  convertedAt: string | null;
  plutusClaimRef: string | null;
  bcbaSignerName: string | null;
  rbtName: string | null;
};

export type WeeklyCptTotal = {
  cptCode: string;
  units: number;
  sessionCount: number;
  convertedCount: number;
};

export type WeeklyBillableDay = {
  dayIndex: number;
  dayLabel: WeekDayLabel;
  dateIso: string; // YYYY-MM-DD (clinic-TZ calendar day of week)
  sessions: WeeklyBillableSessionRow[];
  unitsTotal: number;
};

export type WeeklyBillableUnitsWeek = {
  clientId: string;
  weekStartIso: string; // Monday 00:00 clinic TZ → ISO
  weekEndIso: string; // Sunday end-of-day clinic TZ → ISO
  weekLabel: string;
  days: WeeklyBillableDay[];
  sessions: WeeklyBillableSessionRow[];
  byCpt: WeeklyCptTotal[];
  totals: {
    sessions: number;
    units: number;
    converted: number;
    awaitingConvert: number;
    integrityReviewCount: number;
  };
  manualReviewRequired: boolean;
  usageNote: string;
};

type NoteInput = {
  id: string;
  parentSigned: boolean;
  parentSignedAt: Date | string | null;
  parentSignerName: string | null;
  rbtSigned: boolean;
  rbtSignedAt: Date | string | null;
  rbtSignerName: string | null;
  bcbaSigned: boolean;
  bcbaSignedAt: Date | string | null;
  isConverted: boolean;
  billableUnits: number | null;
  checklistSnapshot: unknown;
  submissionFingerprint: string | null;
  openDeficiencyCount: number;
  convertedAt: Date | string | null;
  plutusClaimRef: string | null;
  bcbaSignerName: string | null;
};

type SessionInput = {
  id: string;
  cptCode: string | null;
  status: string;
  scheduledStart: Date | string;
  scheduledEnd: Date | string;
  actualStart: Date | string | null;
  actualEnd: Date | string | null;
  note: NoteInput | null;
  rbt: { firstName: string; lastName: string } | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(value: Date | string | null | undefined): string | null {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

/** Clinic-TZ (America/New_York) Monday 00:00:00.000 for the week containing `ref`. */
export function startOfWeekMonday(ref: Date = new Date()): Date {
  return addClinicDays(startOfClinicDay(ref), -clinicDayIndexMonday(ref));
}

/** Clinic-TZ Sunday 23:59:59.999 for the week starting at `weekStart`. */
export function endOfWeekSunday(weekStart: Date): Date {
  return endOfClinicDay(addClinicDays(weekStart, 6));
}

export function shiftWeek(weekStart: Date, deltaWeeks: number): Date {
  return startOfWeekMonday(addClinicDays(weekStart, deltaWeeks * 7));
}

function formatWeekLabel(weekStart: Date, weekEnd: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    timeZone: CLINIC_TIME_ZONE,
  };
  const start = weekStart.toLocaleDateString('en-US', opts);
  const end = weekEnd.toLocaleDateString('en-US', {
    ...opts,
    year: 'numeric',
  });
  return `${start} – ${end}`;
}

function sessionServiceDate(session: SessionInput): Date | null {
  return (
    toDate(session.actualStart) ??
    toDate(session.scheduledStart)
  );
}

function dayIndexFromDate(d: Date): number {
  // Mon=0…Sun=6, evaluated in the clinic timezone (not host TZ)
  return clinicDayIndexMonday(d);
}

/**
 * Aggregate durably attested sessions into a Mon–Sun week grid.
 */
export function computeWeeklyBillableUnits(input: {
  clientId: string;
  weekStart: Date;
  sessions: SessionInput[];
}): WeeklyBillableUnitsWeek {
  const weekStart = startOfWeekMonday(input.weekStart);
  const weekEnd = endOfWeekSunday(weekStart);
  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime();

  const days: WeeklyBillableDay[] = WEEK_DAY_LABELS.map((dayLabel, dayIndex) => ({
    dayIndex,
    dayLabel,
    dateIso: clinicDateKey(addClinicDays(weekStart, dayIndex)),
    sessions: [],
    unitsTotal: 0,
  }));

  const rows: WeeklyBillableSessionRow[] = [];
  let integrityReviewCount = 0;

  for (const session of input.sessions) {
    const note = session.note;
    if (session.status === 'CANCELLED' || session.status === 'NO_SHOW') continue;

    const serviceDate = sessionServiceDate(session);
    if (!serviceDate) continue;
    const t = serviceDate.getTime();
    if (t < weekStartMs || t > weekEndMs) continue;

    if (!note) continue;
    const attestation = evaluateAttestationState(
      {
        sessionStatus: session.status,
        parentSigned: note.parentSigned,
        parentSignedAt: note.parentSignedAt,
        parentSignerName: note.parentSignerName,
        rbtSigned: note.rbtSigned,
        rbtSignedAt: note.rbtSignedAt,
        rbtSignerName: note.rbtSignerName,
        bcbaSigned: note.bcbaSigned,
        bcbaSignedAt: note.bcbaSignedAt,
        bcbaSignerName: note.bcbaSignerName,
        isConverted: note.isConverted,
        checklistSnapshot: note.checklistSnapshot,
        openDeficiencyCount: note.openDeficiencyCount,
        billableUnits: note.billableUnits,
        submissionFingerprint: note.submissionFingerprint,
      },
      'DURABLE',
    );
    if (!attestation.ok) {
      if (note.bcbaSigned || note.isConverted || attestation.manualReviewRequired) {
        integrityReviewCount += 1;
      }
      continue;
    }

    const units = attestation.billableUnits;
    const dayIndex = dayIndexFromDate(serviceDate);
    const row: WeeklyBillableSessionRow = {
      sessionId: session.id,
      noteId: note.id,
      cptCode: (session.cptCode || '').trim() || '—',
      units,
      unitsSource: 'NOTE_BILLABLE_UNITS',
      serviceDate: serviceDate.toISOString(),
      dayIndex,
      dayLabel: WEEK_DAY_LABELS[dayIndex],
      scheduledStart: toIso(session.scheduledStart)!,
      scheduledEnd: toIso(session.scheduledEnd)!,
      actualStart: toIso(session.actualStart),
      actualEnd: toIso(session.actualEnd),
      bcbaSigned: true,
      isConverted: Boolean(note.isConverted),
      convertedAt: toIso(note.convertedAt),
      plutusClaimRef: note.plutusClaimRef,
      bcbaSignerName: note.bcbaSignerName,
      rbtName: session.rbt
        ? `${session.rbt.firstName} ${session.rbt.lastName}`.trim()
        : null,
    };
    rows.push(row);
    days[dayIndex].sessions.push(row);
    days[dayIndex].unitsTotal += units;
  }

  // Stable sort within each day by service time
  for (const day of days) {
    day.sessions.sort(
      (a, b) => new Date(a.serviceDate).getTime() - new Date(b.serviceDate).getTime(),
    );
  }
  rows.sort(
    (a, b) => new Date(a.serviceDate).getTime() - new Date(b.serviceDate).getTime(),
  );

  const cptMap = new Map<string, WeeklyCptTotal>();
  for (const row of rows) {
    const existing = cptMap.get(row.cptCode) ?? {
      cptCode: row.cptCode,
      units: 0,
      sessionCount: 0,
      convertedCount: 0,
    };
    existing.units += row.units;
    existing.sessionCount += 1;
    if (row.isConverted) existing.convertedCount += 1;
    cptMap.set(row.cptCode, existing);
  }
  const byCpt = Array.from(cptMap.values()).sort((a, b) =>
    a.cptCode.localeCompare(b.cptCode),
  );

  const converted = rows.filter((r) => r.isConverted).length;
  let usageNote =
    'Only notes with a completed Session, complete parent/RBT/BCBA signer metadata, a passed canonical checklist, no open deficiencies, a valid fingerprint, and positive durable SessionNote.billableUnits appear here. Duration estimates never count as billable utilization.';
  if (integrityReviewCount > 0) {
    usageNote += ` ${integrityReviewCount} apparently finalized note${integrityReviewCount === 1 ? '' : 's'} failed durable integrity and were excluded for manual review.`;
  }

  return {
    clientId: input.clientId,
    weekStartIso: weekStart.toISOString(),
    weekEndIso: weekEnd.toISOString(),
    weekLabel: formatWeekLabel(weekStart, weekEnd),
    days,
    sessions: rows,
    byCpt,
    totals: {
      sessions: rows.length,
      units: rows.reduce((s, r) => s + r.units, 0),
      converted,
      awaitingConvert: rows.length - converted,
      integrityReviewCount,
    },
    manualReviewRequired: integrityReviewCount > 0,
    usageNote,
  };
}
