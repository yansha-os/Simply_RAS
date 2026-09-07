'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Database,
  FileText,
  Gauge,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  getClientSessionHistory,
  type ClientSessionHistoryRow,
} from '@/app/actions/clientSessionHistoryActions';
import { signSingleSessionNoteAsBcba } from '@/app/actions/sessionNoteSignActions';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CLINIC_TIME_ZONE } from '@/lib/clinicTimezone';
import {
  summarizeSessionNoteForQueue,
  type NoteClinicalSummary,
} from '@/lib/sessionNoteSummary';

const HISTORY_PAGE_SIZE = 8;
const INTEGRITY_PAGE_SIZE = 8;
const MAX_HISTORY_ROWS = 100;
const MAX_CLINICAL_PREVIEW_SOURCE = 20_000;

type DateValue = Date | string | number | null | undefined;
type SubTab = 'session_logs' | 'service_mix' | 'integrity';
type BadgeTone = 'emerald' | 'amber' | 'rose' | 'sky' | 'zinc';

type SessionNoteSnapshot = {
  id: string;
  rbtSigned?: boolean;
  parentSigned?: boolean;
  bcbaSigned?: boolean;
  isConverted?: boolean;
  billableUnits?: number | null;
  clinicalContent?: string | null;
  structuredContent?: unknown;
  checklistSnapshot?: unknown;
  rbtSignedAt?: DateValue;
  parentSignedAt?: DateValue;
  bcbaSignedAt?: DateValue;
  convertedAt?: DateValue;
  updatedAt?: DateValue;
  submissionFingerprint?: string | null;
};

type SessionSnapshot = {
  id: string;
  status?: string | null;
  scheduledStart?: DateValue;
  scheduledEnd?: DateValue;
  actualStart?: DateValue;
  actualEnd?: DateValue;
  cptCode?: string | null;
  location?: string | null;
  placeOfServiceCode?: string | null;
  rbtName?: string | null;
  rbt?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  note?: SessionNoteSnapshot | null;
};

type ClientSnapshot = {
  id?: string | null;
  sessions?: unknown;
};

type NoteState = {
  rbtSigned: boolean;
  bcbaSigned: boolean;
  converted: boolean;
  canSign: boolean;
  consistentlyConverted: boolean;
  blockingConflict: boolean;
  messages: string[];
};

type SafeSummary = {
  summary: NoteClinicalSummary;
  preview: string | null;
  malformedLegacy: boolean;
};

type SessionView = {
  session: SessionSnapshot;
  noteState: NoteState;
  safeSummary: SafeSummary | null;
};

type IntegrityIssue = {
  id: string;
  sessionId: string | null;
  date: DateValue;
  title: string;
  detail: string;
  tone: 'amber' | 'rose';
};

const sessionDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const sessionTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

const timestampFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function asValidDate(value: DateValue): Date | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateSortValue(value: DateValue): number {
  return asValidDate(value)?.getTime() ?? 0;
}

function formatSessionDate(value: DateValue): string {
  const date = asValidDate(value);
  return date ? sessionDateFormatter.format(date) : 'Date unavailable';
}

function formatTimestamp(value: DateValue): string | null {
  const date = asValidDate(value);
  return date ? timestampFormatter.format(date) : null;
}

function formatTimeRange(startValue: DateValue, endValue: DateValue): string | null {
  const start = asValidDate(startValue);
  const end = asValidDate(endValue);
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  return `${sessionTimeFormatter.format(start)}–${sessionTimeFormatter.format(end)}`;
}

function actualDurationMinutes(session: SessionSnapshot): number | null {
  const start = asValidDate(session.actualStart);
  const end = asValidDate(session.actualEnd);
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  return minutes > 0 && minutes <= 24 * 60 ? minutes : null;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function formatHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)} hrs`;
}

function isSessionSnapshot(value: unknown): value is SessionSnapshot {
  return Boolean(value) && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string';
}

function noteHasOwnField(note: SessionNoteSnapshot, field: keyof SessionNoteSnapshot): boolean {
  return Object.prototype.hasOwnProperty.call(note, field);
}

function getRbtName(session: SessionSnapshot): string | null {
  if (typeof session.rbtName === 'string' && session.rbtName.trim()) {
    return session.rbtName.trim();
  }
  const name = [session.rbt?.firstName, session.rbt?.lastName]
    .filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
    .map((part) => part.trim())
    .join(' ');
  return name || null;
}

function getChecklistPassed(note: SessionNoteSnapshot): boolean | null {
  if (!noteHasOwnField(note, 'checklistSnapshot')) return null;
  const snapshot = note.checklistSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const passed = (snapshot as { passed?: unknown }).passed;
  return typeof passed === 'boolean' ? passed : null;
}

function deriveNoteState(session: SessionSnapshot): NoteState {
  const note = session.note;
  if (!note) {
    return {
      rbtSigned: false,
      bcbaSigned: false,
      converted: false,
      canSign: false,
      consistentlyConverted: false,
      blockingConflict: false,
      messages:
        String(session.status).toUpperCase() === 'COMPLETED'
          ? ['Completed session has no SessionNote on file.']
          : [],
    };
  }

  const rbtSigned = note.rbtSigned === true;
  const bcbaSigned = note.bcbaSigned === true;
  const converted = note.isConverted === true;
  const messages: string[] = [];
  let blockingConflict = false;

  if (bcbaSigned && !rbtSigned) {
    messages.push('BCBA signature is recorded without the prerequisite RBT signature.');
    blockingConflict = true;
  }
  if (converted && (!rbtSigned || !bcbaSigned)) {
    messages.push('Plutus entry is recorded without both required signatures.');
    blockingConflict = true;
  }
  if (note.rbtSignedAt != null && !rbtSigned) {
    messages.push('RBT signature timestamp exists while the RBT signature flag is false.');
    blockingConflict = true;
  }
  if (note.bcbaSignedAt != null && !bcbaSigned) {
    messages.push('BCBA signature timestamp exists while the BCBA signature flag is false.');
    blockingConflict = true;
  }
  if (note.convertedAt != null && !converted) {
    messages.push('Plutus entry timestamp exists while the conversion flag is false.');
    blockingConflict = true;
  }

  const checklistPassed = getChecklistPassed(note);
  if (converted && checklistPassed === false) {
    messages.push('Plutus entry conflicts with the failed billing-checklist snapshot.');
    blockingConflict = true;
  }

  if (rbtSigned && !note.rbtSignedAt) {
    messages.push('RBT signature timestamp is unavailable on this legacy record.');
  }
  if (bcbaSigned && !note.bcbaSignedAt) {
    messages.push('BCBA signature timestamp is unavailable on this legacy record.');
  }
  if (converted && !note.convertedAt) {
    messages.push('Plutus entry timestamp is unavailable on this legacy record.');
  }

  const canSign =
    String(session.status).toUpperCase() === 'COMPLETED' &&
    rbtSigned &&
    !bcbaSigned &&
    !converted &&
    !blockingConflict;

  return {
    rbtSigned,
    bcbaSigned,
    converted,
    canSign,
    consistentlyConverted: converted && rbtSigned && bcbaSigned && !blockingConflict,
    blockingConflict,
    messages,
  };
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function parseLegacyJson(value: string): { value: unknown | null; malformed: boolean } {
  if (value.length > MAX_CLINICAL_PREVIEW_SOURCE) {
    return { value: null, malformed: true };
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { value: null, malformed: true };
    }
    return { value: parsed, malformed: false };
  } catch {
    return { value: null, malformed: true };
  }
}

function minimizeClinicalText(value: string): string {
  return value
    .slice(0, MAX_CLINICAL_PREVIEW_SOURCE)
    .split(/\r?\n/)
    .filter(
      (line) =>
        !/^\s*(client|caregiver|parent|guardian|member id|medicaid id|dob|date of birth|address|phone|email)\s*:/i.test(
          line
        )
    )
    .join('\n')
    .trim();
}

function redactDirectIdentifiers(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email omitted]')
    .replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g, '[phone omitted]')
    .replace(/\b(?:member|medicaid)\s*(?:id|#)?\s*[:#-]?\s*[A-Z0-9-]{5,}\b/gi, '[identifier omitted]')
    .slice(0, 320);
}

function buildSafeSummary(note: SessionNoteSnapshot): SafeSummary {
  let structuredContent = note.structuredContent;
  let malformedLegacy = false;

  if (typeof structuredContent === 'string') {
    const parsed = parseLegacyJson(structuredContent);
    structuredContent = parsed.value;
    malformedLegacy = parsed.malformed;
  } else if (
    structuredContent != null &&
    (typeof structuredContent !== 'object' || Array.isArray(structuredContent))
  ) {
    structuredContent = null;
    malformedLegacy = true;
  }

  let clinicalFallback =
    typeof note.clinicalContent === 'string' ? minimizeClinicalText(note.clinicalContent) : '';

  if (!structuredContent && clinicalFallback && looksLikeJson(clinicalFallback)) {
    const parsed = parseLegacyJson(clinicalFallback);
    structuredContent = parsed.value;
    malformedLegacy = malformedLegacy || parsed.malformed;
    clinicalFallback = '';
  }

  const hasUsableSource = Boolean(structuredContent) || Boolean(clinicalFallback);
  const summary = summarizeSessionNoteForQueue(
    structuredContent,
    clinicalFallback || null
  );

  return {
    summary,
    preview: hasUsableSource ? redactDirectIdentifiers(summary.preview) : null,
    malformedLegacy,
  };
}

function mergeHistoryRow(
  row: ClientSessionHistoryRow,
  base: SessionSnapshot | undefined
): SessionSnapshot {
  const preservedNote =
    row.note && base?.note?.id === row.note.id ? base.note : undefined;

  return {
    ...base,
    id: row.sessionId,
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    status: row.status,
    cptCode: row.cptCode,
    location: row.location,
    rbtName: row.rbtName,
    note: row.note
      ? {
          ...preservedNote,
          ...row.note,
        }
      : null,
  };
}

function statusTone(status: string): BadgeTone {
  const normalized = status.toUpperCase();
  if (normalized === 'COMPLETED') return 'emerald';
  if (normalized === 'IN_PROGRESS') return 'sky';
  if (normalized === 'CANCELLED' || normalized === 'NO_SHOW') return 'rose';
  return 'zinc';
}

const badgeToneClasses: Record<BadgeTone, string> = {
  emerald: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  amber: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  rose: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
  sky: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
  zinc: 'border-white/10 bg-zinc-900/70 text-zinc-400',
};

function StateBadge({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: BadgeTone;
  icon?: 'check' | 'warning' | 'blocked';
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide ${badgeToneClasses[tone]}`}
    >
      {icon === 'check' ? (
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      ) : icon === 'warning' ? (
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      ) : icon === 'blocked' ? (
        <XCircle className="h-3 w-3" aria-hidden="true" />
      ) : null}
      {label}
    </span>
  );
}

function EmptyState({
  title,
  description,
  tone = 'zinc',
}: {
  title: string;
  description: string;
  tone?: 'zinc' | 'emerald';
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-dashed p-10 text-center ${
        tone === 'emerald'
          ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
          : 'border-white/10 bg-zinc-950/60'
      }`}
      role="status"
      aria-label={title}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.08),transparent_55%)]" />
      <div
        className={`relative mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border ${
          tone === 'emerald'
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
            : 'border-white/10 bg-zinc-900 text-zinc-500'
        }`}
      >
        {tone === 'emerald' ? (
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        ) : (
          <FileText className="h-5 w-5" aria-hidden="true" />
        )}
      </div>
      <h3 className="relative mt-4 font-heading text-base font-bold text-white">{title}</h3>
      <p className="relative mx-auto mt-1 max-w-lg text-xs leading-relaxed text-zinc-400">
        {description}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-label="Loading session history">
      <span className="sr-only">Loading the latest session history.</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="animate-pulse rounded-2xl border border-white/10 bg-zinc-950/70 p-5"
          aria-hidden="true"
        >
          <div className="h-4 w-40 rounded bg-zinc-800" />
          <div className="mt-3 h-3 w-72 max-w-full rounded bg-zinc-900" />
          <div className="mt-5 h-8 rounded-xl bg-zinc-900/80" />
        </div>
      ))}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  start,
  end,
  total,
  noun,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  start: number;
  end: number;
  total: number;
  noun: string;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;
  return (
    <nav
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      aria-label={`${noun} pagination`}
    >
      <p className="font-mono text-[10px] uppercase tracking-wide text-zinc-500" aria-live="polite">
        Showing {start}–{end} of {total} {noun}
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-zinc-900 text-zinc-300 transition-all hover:border-cyan-500/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Previous ${noun} page`}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="min-w-16 text-center font-mono text-[10px] text-zinc-400">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-zinc-900 text-zinc-300 transition-all hover:border-cyan-500/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Next ${noun} page`}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </nav>
  );
}

export default function BcbaSessionEmrTab({ client }: { client: ClientSnapshot }) {
  const router = useRouter();
  const clientId = typeof client.id === 'string' ? client.id : '';
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('session_logs');
  const [historyPage, setHistoryPage] = useState(1);
  const [integrityPage, setIntegrityPage] = useState(1);
  const [historySnapshot, setHistorySnapshot] = useState<{
    clientId: string;
    rows: ClientSessionHistoryRow[];
  } | null>(null);
  const [syncAttemptedFor, setSyncAttemptedFor] = useState<string | null>(null);
  const [syncFailure, setSyncFailure] = useState<{
    clientId: string;
    message: string;
  } | null>(null);
  const [signFeedback, setSignFeedback] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const [signingNoteId, setSigningNoteId] = useState<string | null>(null);
  const [isSyncPending, startSyncTransition] = useTransition();
  const [isSigning, startSignTransition] = useTransition();
  const signingLock = useRef(false);
  const syncStateKey = clientId || '__missing-client__';
  const historyRows =
    historySnapshot?.clientId === clientId ? historySnapshot.rows : null;
  const syncAttempted = syncAttemptedFor === syncStateKey;
  const syncError =
    syncFailure?.clientId === syncStateKey ? syncFailure.message : null;

  const initialSnapshot = useMemo(() => {
    const raw = Array.isArray(client.sessions) ? client.sessions : [];
    const valid = raw.filter(isSessionSnapshot);
    return {
      sessions: valid,
      malformedRows: raw.length - valid.length,
      invalidShape: !Array.isArray(client.sessions),
    };
  }, [client.sessions]);

  const syncHistory = useCallback(() => {
    if (!clientId) {
      setSyncFailure({
        clientId: '__missing-client__',
        message: 'Client identifier is unavailable; session history cannot be refreshed.',
      });
      setSyncAttemptedFor('__missing-client__');
      return;
    }

    startSyncTransition(async () => {
      setSyncFailure((current) => (current?.clientId === clientId ? null : current));
      try {
        const result = await getClientSessionHistory(clientId, MAX_HISTORY_ROWS);
        if (result.success) {
          setHistorySnapshot({ clientId, rows: result.data });
        } else {
          setSyncFailure({
            clientId,
            message: result.error || 'Failed to refresh session history.',
          });
        }
      } catch {
        setSyncFailure({ clientId, message: 'Failed to refresh session history.' });
      } finally {
        setSyncAttemptedFor(clientId);
      }
    });
  }, [clientId]);

  useEffect(() => {
    const timer = window.setTimeout(syncHistory, 0);
    return () => window.clearTimeout(timer);
  }, [syncHistory]);

  const sessions = useMemo(() => {
    const initialById = new Map(
      initialSnapshot.sessions.map((session) => [session.id, session] as const)
    );
    const source =
      historyRows === null
        ? initialSnapshot.sessions
        : historyRows.map((row) => mergeHistoryRow(row, initialById.get(row.sessionId)));

    return [...source]
      .sort(
        (a, b) =>
          dateSortValue(b.actualStart ?? b.scheduledStart) -
          dateSortValue(a.actualStart ?? a.scheduledStart)
      )
      .slice(0, MAX_HISTORY_ROWS);
  }, [historyRows, initialSnapshot.sessions]);

  const sessionViews = useMemo<SessionView[]>(
    () =>
      sessions.map((session) => ({
        session,
        noteState: deriveNoteState(session),
        safeSummary: session.note ? buildSafeSummary(session.note) : null,
      })),
    [sessions]
  );

  const integrityIssues = useMemo<IntegrityIssue[]>(() => {
    const issues: IntegrityIssue[] = [];

    if (initialSnapshot.invalidShape) {
      issues.push({
        id: 'invalid-session-payload',
        sessionId: null,
        date: null,
        title: 'Session payload unavailable',
        detail: 'The profile did not provide a session array. The read-only refresh is being used as fallback.',
        tone: 'rose',
      });
    }
    if (initialSnapshot.malformedRows > 0) {
      issues.push({
        id: 'malformed-session-rows',
        sessionId: null,
        date: null,
        title: 'Malformed session rows omitted',
        detail: `${initialSnapshot.malformedRows} row${initialSnapshot.malformedRows === 1 ? ' was' : 's were'} excluded because no durable session id was present.`,
        tone: 'rose',
      });
    }

    for (const view of sessionViews) {
      const { session, noteState, safeSummary } = view;
      const date = session.actualStart ?? session.scheduledStart;
      noteState.messages.forEach((detail, index) => {
        issues.push({
          id: `${session.id}-state-${index}`,
          sessionId: session.id,
          date,
          title: noteState.blockingConflict ? 'Lifecycle state conflict' : 'Legacy audit metadata gap',
          detail,
          tone: noteState.blockingConflict ? 'rose' : 'amber',
        });
      });

      if (
        String(session.status).toUpperCase() === 'COMPLETED' &&
        actualDurationMinutes(session) == null
      ) {
        issues.push({
          id: `${session.id}-actual-time`,
          sessionId: session.id,
          date,
          title: 'Actual time unavailable',
          detail: 'Duration was not inferred from scheduled time; actual start and end are required for an observed-duration total.',
          tone: 'amber',
        });
      }
      if (
        String(session.status).toUpperCase() === 'COMPLETED' &&
        !(typeof session.cptCode === 'string' && session.cptCode.trim())
      ) {
        issues.push({
          id: `${session.id}-cpt`,
          sessionId: session.id,
          date,
          title: 'CPT code not recorded',
          detail: 'The history leaves CPT blank rather than substituting a default code.',
          tone: 'amber',
        });
      }
      if (safeSummary?.malformedLegacy) {
        issues.push({
          id: `${session.id}-legacy-json`,
          sessionId: session.id,
          date,
          title: 'Legacy structured note unavailable',
          detail: 'A JSON-like legacy payload could not be parsed safely, so its raw contents were not rendered.',
          tone: 'amber',
        });
      }
    }

    return issues.sort((a, b) => dateSortValue(b.date) - dateSortValue(a.date));
  }, [
    initialSnapshot.invalidShape,
    initialSnapshot.malformedRows,
    sessionViews,
  ]);

  const pendingSignoffCount = sessionViews.filter((view) => view.noteState.canSign).length;
  const documentedCount = sessionViews.filter((view) => Boolean(view.session.note)).length;
  const enteredInPlutusCount = sessionViews.filter(
    (view) => view.noteState.consistentlyConverted
  ).length;

  const codedCompletedSessions = sessionViews.filter(
    ({ session }) =>
      String(session.status).toUpperCase() === 'COMPLETED' &&
      (session.cptCode === '97153' || session.cptCode === '97155')
  );
  const directMinutes = codedCompletedSessions.reduce(
    (sum, { session }) =>
      session.cptCode === '97153' ? sum + (actualDurationMinutes(session) ?? 0) : sum,
    0
  );
  const protocolModificationMinutes = codedCompletedSessions.reduce(
    (sum, { session }) =>
      session.cptCode === '97155' ? sum + (actualDurationMinutes(session) ?? 0) : sum,
    0
  );
  const codedSessionsWithActualTime = codedCompletedSessions.filter(
    ({ session }) => actualDurationMinutes(session) != null
  ).length;
  const observedServiceRatio =
    directMinutes > 0 ? (protocolModificationMinutes / directMinutes) * 100 : null;

  const historyTotalPages = Math.max(
    1,
    Math.ceil(sessionViews.length / HISTORY_PAGE_SIZE)
  );
  const currentHistoryPage = Math.min(historyPage, historyTotalPages);
  const historyStartIndex = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE;
  const visibleSessionViews = sessionViews.slice(
    historyStartIndex,
    historyStartIndex + HISTORY_PAGE_SIZE
  );

  const integrityTotalPages = Math.max(
    1,
    Math.ceil(integrityIssues.length / INTEGRITY_PAGE_SIZE)
  );
  const currentIntegrityPage = Math.min(integrityPage, integrityTotalPages);
  const integrityStartIndex = (currentIntegrityPage - 1) * INTEGRITY_PAGE_SIZE;
  const visibleIntegrityIssues = integrityIssues.slice(
    integrityStartIndex,
    integrityStartIndex + INTEGRITY_PAGE_SIZE
  );

  const handleBcbaSign = (noteId: string) => {
    const note = sessions.find((session) => session.note?.id === noteId)?.note;
    const updatedAt = asValidDate(note?.updatedAt);
    const submissionFingerprint = note?.submissionFingerprint;
    if (!note || !updatedAt || !submissionFingerprint) {
      toast.error('This note revision is incomplete. Refresh history before signing.');
      return;
    }
    if (signingLock.current) return;
    signingLock.current = true;
    setSigningNoteId(noteId);
    setSignFeedback(null);

    startSignTransition(async () => {
      try {
        const result = await signSingleSessionNoteAsBcba({
          noteId,
          expectedNoteUpdatedAt: updatedAt.toISOString(),
          expectedSubmissionFingerprint: submissionFingerprint,
        });
        if (result.success) {
          const text =
            'BCBA signature recorded. Billing conversion remains a separate checklist and authorization-gated action.';
          setSignFeedback({ tone: 'success', text });
          toast.success('BCBA signature recorded', {
            description:
              'This attestation does not mean the claim was entered, paid, or cleared for conversion.',
            action: {
              label: 'Open notes pipeline',
              onClick: () => router.push('/portal-billing/claims'),
            },
            duration: 8000,
          });
          syncHistory();
          router.refresh();
        } else {
          const text = result.error || 'Failed to record the BCBA signature.';
          setSignFeedback({ tone: 'error', text });
          toast.error(text);
        }
      } catch {
        const text = 'Failed to record the BCBA signature.';
        setSignFeedback({ tone: 'error', text });
        toast.error(text);
      } finally {
        signingLock.current = false;
        setSigningNoteId(null);
      }
    });
  };

  const tabs: Array<{
    id: SubTab;
    label: string;
    icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  }> = [
    { id: 'session_logs', label: 'Session & note history', icon: FileText },
    { id: 'service_mix', label: '97153 / 97155 context', icon: Gauge },
    { id: 'integrity', label: 'Data integrity', icon: ClipboardCheck },
  ];

  const selectTab = (tab: SubTab) => {
    setActiveSubTab(tab);
  };

  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + direction + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    selectTab(nextTab.id);
    document.getElementById(`bcba-emr-tab-${nextTab.id}`)?.focus();
  };

  return (
    <section
      className="animate-fade-in-up space-y-6"
      aria-labelledby="bcba-session-emr-heading"
      aria-busy={isSyncPending || isSigning}
    >
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/85 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/4 h-56 w-56 rounded-full bg-brand-orange-500/[0.07] blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-start">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
                <Activity className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-400/80">
                  Durable clinical chart
                </p>
                <h2
                  id="bcba-session-emr-heading"
                  className="font-heading text-xl font-bold text-white"
                >
                  BCBA Session EMR &amp; History
                </h2>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">
              Review durable Session and SessionNote fields. Signature, checklist, and
              Plutus-entry states remain distinct; “entered in Plutus” never means paid.
            </p>
            <p className="mt-2 font-mono text-[10px] text-zinc-500">
              Times display in {CLINIC_TIME_ZONE}. Clinical prose stays collapsed and
              common direct-identifier fields are filtered from previews.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[520px]">
            {[
              {
                label: 'Sessions',
                value: sessionViews.length,
                tone: 'text-white',
              },
              {
                label: 'Notes',
                value: documentedCount,
                tone: 'text-cyan-300',
              },
              {
                label: 'Awaiting BCBA',
                value: pendingSignoffCount,
                tone: pendingSignoffCount > 0 ? 'text-amber-300' : 'text-emerald-300',
              },
              {
                label: 'Entered in Plutus',
                value: enteredInPlutusCount,
                tone: 'text-sky-300',
              },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl border border-white/10 bg-zinc-900/70 p-3 text-center shadow-lg"
              >
                <span className="block font-mono text-[9px] font-bold uppercase tracking-wide text-zinc-500">
                  {metric.label}
                </span>
                <span className={`mt-1 block font-heading text-xl font-black ${metric.tone}`}>
                  {metric.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3" aria-live="polite">
        {isSyncPending ? (
          <div
            className="flex items-center gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06] px-4 py-3 text-xs text-cyan-200"
            role="status"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Verifying the latest read-only signature and Plutus-entry states…
          </div>
        ) : null}

        {syncError ? (
          <div
            className="flex flex-col gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <div className="flex items-start gap-2 text-xs text-amber-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Latest history verification failed</p>
                <p className="mt-0.5 text-amber-200/70">
                  {syncError} The server-rendered snapshot remains visible and is labeled
                  as such.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={syncHistory}
              disabled={isSyncPending}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 font-mono text-[10px] font-bold uppercase text-amber-200 transition-all hover:border-amber-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : null}

        {signFeedback ? (
          <div
            className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-xs ${
              signFeedback.tone === 'success'
                ? 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-200'
                : 'border-rose-500/25 bg-rose-500/[0.06] text-rose-200'
            }`}
            role={signFeedback.tone === 'error' ? 'alert' : 'status'}
          >
            {signFeedback.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {signFeedback.text}
          </div>
        ) : null}
      </div>

      <div
        className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-zinc-950/70 p-2"
        role="tablist"
        aria-label="BCBA Session EMR views"
      >
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`bcba-emr-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`bcba-emr-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                active
                  ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300 shadow-lg shadow-cyan-500/5'
                  : 'border-transparent text-zinc-500 hover:border-white/10 hover:bg-zinc-900 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {tab.label}
              {tab.id === 'integrity' && integrityIssues.length > 0 ? (
                <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-300">
                  {integrityIssues.length}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeSubTab === 'session_logs' && (
        <div
          id="bcba-emr-panel-session_logs"
          role="tabpanel"
          aria-labelledby="bcba-emr-tab-session_logs"
          className="space-y-4"
        >
          {sessionViews.length === 0 && !syncAttempted && clientId ? (
            <LoadingState />
          ) : sessionViews.length === 0 && syncError ? (
            <div
              className="rounded-3xl border border-rose-500/25 bg-rose-500/[0.06] p-8 text-center"
              role="alert"
              aria-label="Session history unavailable"
            >
              <AlertCircle className="mx-auto h-8 w-8 text-rose-400" aria-hidden="true" />
              <h3 className="mt-3 font-heading text-base font-bold text-white">
                Session history is unavailable
              </h3>
              <p className="mx-auto mt-1 max-w-md text-xs text-zinc-400">
                No safe snapshot is available. Retry the read-only history request before
                relying on note state.
              </p>
              <button
                type="button"
                onClick={syncHistory}
                disabled={isSyncPending}
                className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2 font-mono text-[10px] font-bold uppercase text-rose-200 transition-all hover:border-rose-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry history
              </button>
            </div>
          ) : sessionViews.length === 0 ? (
            <EmptyState
              title="No sessions recorded"
              description="Durable Session rows will appear here after scheduling or Session Studio activity. No demo history is substituted."
            />
          ) : (
            <>
              <div className="space-y-4">
                {visibleSessionViews.map(({ session, noteState, safeSummary }) => {
                  const note = session.note;
                  const actualRange = formatTimeRange(session.actualStart, session.actualEnd);
                  const scheduledRange = formatTimeRange(
                    session.scheduledStart,
                    session.scheduledEnd
                  );
                  const duration = actualDurationMinutes(session);
                  const rbtName = getRbtName(session);
                  const status = String(session.status || 'UNKNOWN').toUpperCase();
                  const checklistPassed = note ? getChecklistPassed(note) : null;
                  const signingThisNote = Boolean(note && signingNoteId === note.id);

                  return (
                    <Card
                      key={session.id}
                      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.005] hover:border-brand-orange-500/35 hover:shadow-2xl"
                    >
                      <div className="pointer-events-none absolute -right-14 -top-16 h-36 w-36 rounded-full bg-cyan-500/[0.06] blur-3xl" />
                      <div className="relative space-y-4">
                        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-heading text-sm font-bold text-white">
                                {formatSessionDate(
                                  session.actualStart ?? session.scheduledStart
                                )}
                              </span>
                              <StateBadge
                                label={status.replace(/_/g, ' ')}
                                tone={statusTone(status)}
                                icon={status === 'COMPLETED' ? 'check' : undefined}
                              />
                              <StateBadge
                                label={
                                  session.cptCode?.trim()
                                    ? `CPT ${session.cptCode.trim()}`
                                    : 'CPT not recorded'
                                }
                                tone={session.cptCode?.trim() ? 'sky' : 'amber'}
                                icon={session.cptCode?.trim() ? undefined : 'warning'}
                              />
                            </div>

                            <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2 xl:grid-cols-4">
                              <span className="inline-flex items-center gap-1.5">
                                <Clock3 className="h-3.5 w-3.5 text-zinc-600" aria-hidden="true" />
                                <span>
                                  Actual:{' '}
                                  <span className={actualRange ? 'text-zinc-200' : 'text-amber-300'}>
                                    {actualRange || 'not recorded'}
                                  </span>
                                </span>
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <Activity className="h-3.5 w-3.5 text-zinc-600" aria-hidden="true" />
                                <span>
                                  Duration:{' '}
                                  <span className={duration != null ? 'text-zinc-200' : 'text-zinc-500'}>
                                    {duration != null ? formatMinutes(duration) : 'not inferred'}
                                  </span>
                                </span>
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <UserCheck className="h-3.5 w-3.5 text-zinc-600" aria-hidden="true" />
                                <span>
                                  RBT:{' '}
                                  <span className={rbtName ? 'text-zinc-200' : 'text-zinc-500'}>
                                    {rbtName || 'not recorded'}
                                  </span>
                                </span>
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <Database className="h-3.5 w-3.5 text-zinc-600" aria-hidden="true" />
                                <span className="truncate">
                                  POS:{' '}
                                  <span
                                    className={
                                      session.placeOfServiceCode || session.location
                                        ? 'text-zinc-200'
                                        : 'text-zinc-500'
                                    }
                                  >
                                    {[
                                      session.placeOfServiceCode
                                        ? `code ${session.placeOfServiceCode}`
                                        : null,
                                      session.location,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ') || 'not recorded'}
                                  </span>
                                </span>
                              </span>
                            </div>
                            {scheduledRange ? (
                              <p className="mt-2 font-mono text-[9px] text-zinc-600">
                                Scheduled {scheduledRange}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex max-w-xl flex-wrap items-center gap-1.5 lg:justify-end">
                            {!note ? (
                              <StateBadge label="No note on file" tone="zinc" />
                            ) : (
                              <>
                                <StateBadge
                                  label={noteState.rbtSigned ? 'RBT signed' : 'RBT pending'}
                                  tone={noteState.rbtSigned ? 'emerald' : 'amber'}
                                  icon={noteState.rbtSigned ? 'check' : 'warning'}
                                />
                                <StateBadge
                                  label={
                                    noteState.bcbaSigned
                                      ? 'BCBA signed'
                                      : noteState.rbtSigned
                                        ? 'BCBA review'
                                        : 'Awaiting RBT'
                                  }
                                  tone={
                                    noteState.bcbaSigned
                                      ? 'emerald'
                                      : noteState.rbtSigned
                                        ? 'amber'
                                        : 'zinc'
                                  }
                                  icon={
                                    noteState.bcbaSigned
                                      ? 'check'
                                      : noteState.rbtSigned
                                        ? 'warning'
                                        : undefined
                                  }
                                />
                                <StateBadge
                                  label={
                                    noteState.converted
                                      ? noteState.consistentlyConverted
                                        ? 'Entered in Plutus'
                                        : 'Plutus state conflict'
                                      : noteState.bcbaSigned && noteState.rbtSigned
                                        ? 'Billing review'
                                        : 'Not entered'
                                  }
                                  tone={
                                    noteState.converted
                                      ? noteState.consistentlyConverted
                                        ? 'sky'
                                        : 'rose'
                                      : noteState.bcbaSigned && noteState.rbtSigned
                                        ? 'amber'
                                        : 'zinc'
                                  }
                                  icon={
                                    noteState.converted
                                      ? noteState.consistentlyConverted
                                        ? 'check'
                                        : 'blocked'
                                      : undefined
                                  }
                                />
                              </>
                            )}
                          </div>
                        </div>

                        {note ? (
                          <div className="grid gap-3 border-t border-white/[0.06] pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                            <div className="min-w-0 space-y-3">
                              <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-zinc-500">
                                <span>
                                  Billable units:{' '}
                                  <strong className="font-semibold text-zinc-200">
                                    {typeof note.billableUnits === 'number' &&
                                    Number.isFinite(note.billableUnits)
                                      ? note.billableUnits
                                      : 'not recorded'}
                                  </strong>
                                </span>
                                <span>
                                  RBT signed:{' '}
                                  <strong className="font-semibold text-zinc-200">
                                    {noteState.rbtSigned
                                      ? formatTimestamp(note.rbtSignedAt) || 'timestamp unavailable'
                                      : 'no'}
                                  </strong>
                                </span>
                                <span>
                                  BCBA signed:{' '}
                                  <strong className="font-semibold text-zinc-200">
                                    {noteState.bcbaSigned
                                      ? formatTimestamp(note.bcbaSignedAt) || 'timestamp unavailable'
                                      : 'no'}
                                  </strong>
                                </span>
                                <span>
                                  Checklist:{' '}
                                  <strong
                                    className={`font-semibold ${
                                      checklistPassed === true
                                        ? 'text-emerald-300'
                                        : checklistPassed === false
                                          ? 'text-rose-300'
                                          : 'text-zinc-500'
                                    }`}
                                  >
                                    {checklistPassed === true
                                      ? 'passed'
                                      : checklistPassed === false
                                        ? 'failed'
                                        : 'not loaded in this minimized view'}
                                  </strong>
                                </span>
                              </div>

                              {safeSummary?.malformedLegacy ? (
                                <div
                                  className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-[11px] text-amber-200"
                                  role="status"
                                >
                                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                  Legacy JSON could not be parsed safely; raw payload hidden.
                                </div>
                              ) : safeSummary?.preview ? (
                                <details className="group/summary rounded-xl border border-white/[0.07] bg-zinc-900/50">
                                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-semibold text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400 [&::-webkit-details-marker]:hidden">
                                    <span className="inline-flex items-center gap-2">
                                      <FileText className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                                      Show minimized clinical preview
                                    </span>
                                    <span className="font-mono text-[9px] uppercase tracking-wide text-zinc-600">
                                      collapsed by default
                                    </span>
                                  </summary>
                                  <div className="border-t border-white/[0.06] px-3 py-3">
                                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                                      {safeSummary.preview}
                                    </p>
                                    {safeSummary.summary.modalityCounts ? (
                                      <div className="mt-3 flex flex-wrap gap-1.5">
                                        {[
                                          ['Trials', safeSummary.summary.modalityCounts.trials],
                                          ['Frequency', safeSummary.summary.modalityCounts.frequency],
                                          ['Duration', safeSummary.summary.modalityCounts.duration],
                                          ['Probes', safeSummary.summary.modalityCounts.probes],
                                          ['ABC', safeSummary.summary.modalityCounts.abc],
                                          ['Task analysis', safeSummary.summary.modalityCounts.taskAnalysis],
                                        ]
                                          .filter(([, count]) => Number(count) > 0)
                                          .map(([label, count]) => (
                                            <span
                                              key={String(label)}
                                              className="rounded-lg border border-white/10 bg-zinc-950/80 px-2 py-1 font-mono text-[9px] text-zinc-400"
                                            >
                                              {label}: {count}
                                            </span>
                                          ))}
                                      </div>
                                    ) : null}
                                    <p className="mt-3 font-mono text-[9px] leading-relaxed text-zinc-600">
                                      Preview only. Common direct-identifier fields are filtered, and the
                                      full raw note is not expanded on the history surface.
                                    </p>
                                  </div>
                                </details>
                              ) : (
                                <p className="text-[11px] text-zinc-600">
                                  No clinical preview is available for this note.
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {noteState.blockingConflict ? (
                                <span className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 font-mono text-[10px] font-bold uppercase text-rose-300">
                                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                  Signing blocked by state conflict
                                </span>
                              ) : null}
                              {noteState.canSign ? (
                                <Button
                                  type="button"
                                  disabled={isSigning || isSyncPending || !syncAttempted}
                                  onClick={() => handleBcbaSign(note.id)}
                                  aria-label={`Record BCBA e-signature for session on ${formatSessionDate(
                                    session.actualStart ?? session.scheduledStart
                                  )}`}
                                  className="h-9 cursor-pointer rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-lg shadow-emerald-500/15 transition-all hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {signingThisNote ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                  ) : (
                                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                  )}
                                  {signingThisNote ? 'Recording signature…' : 'Record BCBA e-signature'}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </Card>
                  );
                })}
              </div>

              <Pagination
                page={currentHistoryPage}
                totalPages={historyTotalPages}
                start={historyStartIndex + 1}
                end={Math.min(historyStartIndex + HISTORY_PAGE_SIZE, sessionViews.length)}
                total={sessionViews.length}
                noun="sessions"
                onPageChange={setHistoryPage}
              />
              {sessionViews.length === MAX_HISTORY_ROWS ? (
                <p className="text-center font-mono text-[9px] text-zinc-600">
                  Profile history is bounded to the newest {MAX_HISTORY_ROWS} durable sessions.
                </p>
              ) : null}
            </>
          )}
        </div>
      )}

      {activeSubTab === 'service_mix' && (
        <div
          id="bcba-emr-panel-service_mix"
          role="tabpanel"
          aria-labelledby="bcba-emr-tab-service_mix"
          className="space-y-4"
        >
          <Card className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl backdrop-blur-xl">
            <div className="pointer-events-none absolute right-0 top-0 h-56 w-56 rounded-full bg-violet-500/[0.07] blur-3xl" />
            <div className="relative">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/10 text-violet-300">
                  <Gauge className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-heading text-base font-bold text-white">
                    Recorded service-code context
                  </h3>
                  <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-400">
                    Totals use completed sessions with valid actual start/end timestamps.
                    Scheduled duration is never substituted. CPT 97155 represents protocol
                    modification—not generic RBT supervision—and this view does not certify
                    BACB or payer supervision compliance.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
                  <span className="block font-mono text-[9px] font-bold uppercase tracking-wide text-zinc-500">
                    97153 actual time
                  </span>
                  <span className="mt-1 block font-heading text-2xl font-black text-white">
                    {formatHours(directMinutes)}
                  </span>
                  <span className="mt-1 block text-[10px] text-zinc-600">
                    Adaptive behavior treatment by protocol
                  </span>
                </div>
                <div className="rounded-2xl border border-violet-500/15 bg-violet-500/[0.05] p-4">
                  <span className="block font-mono text-[9px] font-bold uppercase tracking-wide text-violet-300/70">
                    97155 actual time
                  </span>
                  <span className="mt-1 block font-heading text-2xl font-black text-violet-300">
                    {formatHours(protocolModificationMinutes)}
                  </span>
                  <span className="mt-1 block text-[10px] text-zinc-600">
                    Protocol modification service
                  </span>
                </div>
                <div className={`rounded-2xl border p-4 ${
                  observedServiceRatio == null
                    ? 'border-white/10 bg-zinc-900/60'
                    : observedServiceRatio >= 5
                    ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
                    : 'border-amber-500/25 bg-amber-500/[0.06]'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="block font-mono text-[9px] font-bold uppercase tracking-wide text-zinc-400">
                      BACB Supervision Ratio
                    </span>
                    {observedServiceRatio != null && (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${
                        observedServiceRatio >= 5
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      }`}>
                        {observedServiceRatio >= 5 ? 'Compliant' : 'Below 5% Threshold'}
                      </span>
                    )}
                  </div>
                  <span className={`mt-1 block font-heading text-2xl font-black ${
                    observedServiceRatio == null
                      ? 'text-zinc-500'
                      : observedServiceRatio >= 5
                      ? 'text-emerald-300'
                      : 'text-amber-300'
                  }`}>
                    {observedServiceRatio == null ? '—' : `${observedServiceRatio.toFixed(1)}%`}
                  </span>
                  <span className="mt-1 block text-[10px] text-zinc-500">
                    97155 Supervision ÷ 97153 Direct (BACB Min: 5.0%)
                  </span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
                  <span className="block font-mono text-[9px] font-bold uppercase tracking-wide text-zinc-500">
                    Actual-time coverage
                  </span>
                  <span className="mt-1 block font-heading text-2xl font-black text-emerald-300">
                    {codedSessionsWithActualTime}/{codedCompletedSessions.length}
                  </span>
                  <span className="mt-1 block text-[10px] text-zinc-600">
                    Completed 97153 / 97155 sessions
                  </span>
                </div>
              </div>

              {codedCompletedSessions.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-zinc-950/50 p-6 text-center">
                  <p className="text-xs font-semibold text-zinc-300">
                    No completed 97153 or 97155 sessions are recorded.
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    The dashboard leaves the ratio unavailable instead of fabricating a
                    compliance percentage.
                  </p>
                </div>
              ) : codedSessionsWithActualTime < codedCompletedSessions.length ? (
                <div
                  className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 text-xs text-amber-200"
                  role="status"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {codedCompletedSessions.length - codedSessionsWithActualTime} coded
                  session
                  {codedCompletedSessions.length - codedSessionsWithActualTime === 1
                    ? ' is'
                    : 's are'}{' '}
                  excluded from time totals because actual start/end is missing or invalid.
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      )}

      {activeSubTab === 'integrity' && (
        <div
          id="bcba-emr-panel-integrity"
          role="tabpanel"
          aria-labelledby="bcba-emr-tab-integrity"
          className="space-y-4"
        >
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-950/70 px-5 py-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-heading text-base font-bold text-white">
                Read-only chart integrity checks
              </h3>
              <p className="mt-1 text-xs text-zinc-400">
                These checks report missing or contradictory durable fields. They do not
                create a deficiency or alter a signature.
              </p>
            </div>
            <Link
              href="/portal-clinical/daily?tab=esign"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 font-mono text-[10px] font-bold uppercase text-cyan-300 transition-all hover:border-cyan-400/50 hover:bg-cyan-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              Open clinical note queue
            </Link>
          </div>

          {integrityIssues.length === 0 ? (
            <EmptyState
              title="No integrity conflicts detected"
              description="The bounded history snapshot has no contradictory lifecycle flags, malformed legacy previews, or missing required session header fields."
              tone="emerald"
            />
          ) : (
            <>
              <div className="space-y-3">
                {visibleIntegrityIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`rounded-2xl border p-4 ${
                      issue.tone === 'rose'
                        ? 'border-rose-500/20 bg-rose-500/[0.05]'
                        : 'border-amber-500/20 bg-amber-500/[0.05]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
                          issue.tone === 'rose'
                            ? 'border-rose-500/20 bg-rose-500/10 text-rose-300'
                            : 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                        }`}
                      >
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-white">{issue.title}</h4>
                          {issue.date ? (
                            <span className="font-mono text-[9px] uppercase tracking-wide text-zinc-600">
                              {formatSessionDate(issue.date)}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                          {issue.detail}
                        </p>
                        {issue.sessionId ? (
                          <p className="mt-2 font-mono text-[9px] text-zinc-700">
                            Session …{issue.sessionId.slice(-8)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Pagination
                page={currentIntegrityPage}
                totalPages={integrityTotalPages}
                start={integrityStartIndex + 1}
                end={Math.min(
                  integrityStartIndex + INTEGRITY_PAGE_SIZE,
                  integrityIssues.length
                )}
                total={integrityIssues.length}
                noun="integrity findings"
                onPageChange={setIntegrityPage}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
