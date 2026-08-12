import type {
  SessionPhase,
  SessionStudioClient,
  StudioAbc,
  StudioDurationEpisode,
  StudioFrequency,
  StudioProbe,
  StudioTaskAnalysis,
  StudioTrial,
} from '@/lib/sessionStudio';

const META_PREFIX = 'ras_session_studio_meta_';
const DRAFT_PREFIX = 'ras_session_studio_draft_';

export type SessionStudioDraft = {
  phase: SessionPhase;
  seconds: number;
  running: boolean;
  clockedIn: boolean;
  clockedOut: boolean;
  placeOfService: string;
  cptCode: string;
  caregiverPresent: 'YES' | 'NO' | '';
  caregiverName: string;
  activeTargetId: string;
  trials: StudioTrial[];
  abcEvents: StudioAbc[];
  frequencies?: StudioFrequency[];
  durations?: StudioDurationEpisode[];
  taskAnalyses?: StudioTaskAnalysis[];
  probes?: StudioProbe[];
  activeBehaviorTargetId?: string;
  /** @deprecated legacy SOAP — mapped into ABA fields on load */
  progressText?: string;
  subjective?: string;
  assessment?: string;
  plan?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  objectiveData?: string;
  goalsAddressed?: string;
  interventions?: string[];
  clientResponse?: string;
  barriersSafety?: string;
  caregiverParticipation?: string;
  planNext?: string;
  rbtSignature: string;
  caregiverSignature: string;
  updatedAt: string;
};

export function sessionMetaKey(sessionId: string) {
  return `${META_PREFIX}${sessionId}`;
}

export function sessionDraftKey(sessionId: string) {
  return `${DRAFT_PREFIX}${sessionId}`;
}

export function saveSessionStudioMeta(sessionId: string, client: SessionStudioClient) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(sessionMetaKey(sessionId), JSON.stringify(client));
}

export function loadSessionStudioMeta(sessionId: string): SessionStudioClient | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(sessionMetaKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as SessionStudioClient;
  } catch {
    return null;
  }
}

export function loadSessionStudioDraft(sessionId: string): SessionStudioDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(sessionDraftKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as SessionStudioDraft;
  } catch {
    return null;
  }
}

export function saveSessionStudioDraft(sessionId: string, draft: Omit<SessionStudioDraft, 'updatedAt'>) {
  if (typeof window === 'undefined') return;
  const payload: SessionStudioDraft = { ...draft, updatedAt: new Date().toISOString() };
  sessionStorage.setItem(sessionDraftKey(sessionId), JSON.stringify(payload));
}

type StudioSubmitResult = { success: boolean; error?: string };

/**
 * Keeps destructive local completion effects behind confirmed server success.
 * The final draft flush is synchronous and always precedes the action attempt.
 */
export async function attemptSessionStudioSubmit<TResult extends StudioSubmitResult>(input: {
  persistFinalDraft: () => void;
  submit: () => Promise<TResult>;
  validateSuccess?: (result: TResult & { success: true }) => boolean;
  commitSuccess: (result: TResult & { success: true }) => void;
}) {
  let result: TResult;
  try {
    input.persistFinalDraft();
    result = await input.submit();
  } catch {
    return { status: 'TRANSPORT_ERROR' as const };
  }

  if (!result.success) {
    return { status: 'REJECTED' as const, result };
  }

  const success = result as TResult & { success: true };
  if (input.validateSuccess && !input.validateSuccess(success)) {
    return { status: 'INVALID_RESPONSE' as const };
  }
  input.commitSuccess(success);
  return { status: 'SUCCESS' as const, result };
}

type StudioClockInSuccess = { success: true; startedAt?: string };
type StudioClockInFailure = { success: false; error?: string };

/**
 * Collection state is committed only after the clock-in action confirms its
 * durable write and returns a valid server-authored timestamp.
 */
export async function attemptDurableSessionClockIn<
  TSuccess extends StudioClockInSuccess,
  TFailure extends StudioClockInFailure,
>(input: {
  requestedStart: string;
  clockIn: () => Promise<TSuccess | TFailure>;
  commitDurableStart: (startedAt: string) => void;
}) {
  let result: TSuccess | TFailure;
  try {
    result = await input.clockIn();
  } catch {
    return { status: 'TRANSPORT_ERROR' as const };
  }

  if (!result.success) {
    return { status: 'REJECTED' as const, result };
  }

  const startedAt = result.startedAt;
  if (!startedAt) {
    return { status: 'INVALID_RESPONSE' as const };
  }
  if (Number.isNaN(new Date(startedAt).getTime())) {
    return { status: 'INVALID_RESPONSE' as const };
  }

  input.commitDurableStart(startedAt);
  return { status: 'STARTED' as const, startedAt };
}

type StudioClockOutSuccess = {
  success: true;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  billableUnits: number;
};
type StudioClockOutFailure = { success: false; error?: string; code?: string };

/**
 * Incomplete close is durable-first: preserve the recovery draft, then commit
 * local clocked-out UI only after Session + EVV closure succeeds.
 */
export async function attemptDurableSessionClockOut<
  TSuccess extends StudioClockOutSuccess,
  TFailure extends StudioClockOutFailure,
>(input: {
  persistFinalDraft: () => void;
  clockOut: () => Promise<TSuccess | TFailure>;
  commitDurableEnd: (result: TSuccess) => void;
}) {
  let result: TSuccess | TFailure;
  try {
    input.persistFinalDraft();
    result = await input.clockOut();
  } catch {
    return { status: 'TRANSPORT_ERROR' as const };
  }

  if (!result.success) {
    return { status: 'REJECTED' as const, result };
  }
  const startMs = new Date(result.startedAt).getTime();
  const endMs = new Date(result.endedAt).getTime();
  if (
    Number.isNaN(startMs) ||
    Number.isNaN(endMs) ||
    endMs <= startMs ||
    !Number.isFinite(result.durationSeconds) ||
    result.durationSeconds !== Math.floor((endMs - startMs) / 1000) ||
    !Number.isFinite(result.billableUnits) ||
    result.billableUnits < 0
  ) {
    return { status: 'INVALID_RESPONSE' as const };
  }

  input.commitDurableEnd(result);
  return { status: 'CLOCKED_OUT' as const, result };
}

export function clearSessionStudioDraft(sessionId: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(sessionDraftKey(sessionId));
}

export function clearSessionStudioMeta(sessionId: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(sessionMetaKey(sessionId));
}

export function clearSessionStudioAll(sessionId: string) {
  clearSessionStudioDraft(sessionId);
  clearSessionStudioMeta(sessionId);
}

const COMPLETED_KEY = 'ras_rbt_completed_sessions';

export const DOCUMENTATION_SUBMITTED_MESSAGE =
  'Documentation submitted — awaiting BCBA review.';

export type CompletedStudioSession = {
  id: string;
  client: string;
  date: string;
  time: string;
  units: number;
  status: 'DOCUMENTATION_SUBMITTED';
};

export function buildDocumentationSubmittedRecord(
  input: Omit<CompletedStudioSession, 'status'>
): CompletedStudioSession {
  return {
    ...input,
    status: 'DOCUMENTATION_SUBMITTED',
  };
}

export function normalizeCompletedStudioSession(
  input: unknown
): CompletedStudioSession | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (
    typeof value.id !== 'string' ||
    typeof value.client !== 'string' ||
    typeof value.date !== 'string' ||
    typeof value.time !== 'string' ||
    typeof value.units !== 'number' ||
    !Number.isFinite(value.units) ||
    value.units < 0
  ) {
    return null;
  }
  return buildDocumentationSubmittedRecord({
    id: value.id,
    client: value.client,
    date: value.date,
    time: value.time,
    units: value.units,
  });
}

export function loadCompletedStudioSessions(): CompletedStudioSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map(normalizeCompletedStudioSession)
      .filter((entry): entry is CompletedStudioSession => entry !== null);
    const sanitized = JSON.stringify(normalized);
    if (sanitized !== raw) localStorage.setItem(COMPLETED_KEY, sanitized);
    return normalized;
  } catch {
    return [];
  }
}

export function pushCompletedStudioSession(entry: CompletedStudioSession) {
  if (typeof window === 'undefined') return;
  const next = [entry, ...loadCompletedStudioSessions().filter((c) => c.id !== entry.id)].slice(0, 40);
  localStorage.setItem(COMPLETED_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('ras_rbt_completed_changed'));
}

const DONE_SCHEDULE_KEY = 'ras_rbt_schedule_done_ids';

export function markScheduleSessionDone(sessionId: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(DONE_SCHEDULE_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(sessionId)) {
      localStorage.setItem(DONE_SCHEDULE_KEY, JSON.stringify([...list, sessionId]));
      window.dispatchEvent(new Event('ras_rbt_schedule_done_changed'));
    }
  } catch {
    /* ignore */
  }
}

export function loadDoneScheduleSessionIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DONE_SCHEDULE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** UUID v4-ish check — real SkillTarget ids; demo targets use short ids like t1. */
export function isRealSkillTargetId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}
