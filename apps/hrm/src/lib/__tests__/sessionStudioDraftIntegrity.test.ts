import { describe, expect, it, vi } from 'vitest';

import * as draftLifecycle from '@/lib/sessionStudioDraft';

type SubmitResult =
  | { success: true; sessionId: string }
  | { success: false; error: string; code?: string };

type SubmitAttempt = (input: {
  persistFinalDraft: () => void;
  submit: () => Promise<SubmitResult>;
  validateSuccess?: (result: { success: true; sessionId: string }) => boolean;
  commitSuccess: (result: { success: true; sessionId: string }) => void;
}) => Promise<{ status: string; result?: SubmitResult }>;

type ClockInResult =
  | { success: true; startedAt?: string }
  | { success: false; error: string };

type ClockInAttempt = (input: {
  requestedStart: string;
  clockIn: () => Promise<ClockInResult>;
  commitDurableStart: (startedAt: string) => void;
}) => Promise<{ status: string; startedAt?: string }>;

type ClockOutResult =
  | {
      success: true;
      startedAt: string;
      endedAt: string;
      durationSeconds: number;
      billableUnits: number;
    }
  | { success: false; error: string; code?: string };

type ClockOutAttempt = (input: {
  persistFinalDraft: () => void;
  clockOut: () => Promise<ClockOutResult>;
  commitDurableEnd: (
    result: Extract<ClockOutResult, { success: true }>
  ) => void;
}) => Promise<{ status: string; result?: ClockOutResult }>;

type DocumentationSubmittedRecord = {
  id: string;
  client: string;
  date: string;
  time: string;
  units: number;
  status: 'DOCUMENTATION_SUBMITTED';
};

type BuildDocumentationSubmittedRecord = (
  input: Omit<DocumentationSubmittedRecord, 'status'>
) => DocumentationSubmittedRecord;

type NormalizeCompletedStudioSession = (
  input: unknown
) => DocumentationSubmittedRecord | null;

function lifecycleExports() {
  return draftLifecycle as typeof draftLifecycle & {
    attemptSessionStudioSubmit?: SubmitAttempt;
    attemptDurableSessionClockIn?: ClockInAttempt;
    attemptDurableSessionClockOut?: ClockOutAttempt;
  };
}

function completionExports() {
  return draftLifecycle as typeof draftLifecycle & {
    DOCUMENTATION_SUBMITTED_MESSAGE?: string;
    buildDocumentationSubmittedRecord?: BuildDocumentationSubmittedRecord;
    normalizeCompletedStudioSession?: NormalizeCompletedStudioSession;
  };
}

describe('Session Studio claim-ready submit lifecycle', () => {
  it('flushes the final edit before submit and preserves Sign on action rejection', async () => {
    const attempt = lifecycleExports().attemptSessionStudioSubmit;
    expect(attempt).toBeTypeOf('function');
    if (!attempt) return;

    let persistedNarrative = 'older autosave snapshot';
    const finalNarrative = 'final edit made inside the 400ms autosave debounce';
    const events: string[] = [];
    const markScheduleDone = vi.fn();
    const navigate = vi.fn();
    const clearDraft = vi.fn();

    const result = await attempt({
      persistFinalDraft: () => {
        persistedNarrative = finalNarrative;
        events.push('persist');
      },
      submit: async () => {
        events.push('submit');
        return {
          success: false,
          code: 'SESSION_NOTE_CONFLICT',
          error: 'The note changed in another request.',
        };
      },
      commitSuccess: () => {
        clearDraft();
        markScheduleDone();
        navigate();
      },
    });

    expect(events).toEqual(['persist', 'submit']);
    expect(persistedNarrative).toBe(finalNarrative);
    expect(result).toMatchObject({
      status: 'REJECTED',
      result: { success: false, code: 'SESSION_NOTE_CONFLICT' },
    });
    expect(clearDraft).not.toHaveBeenCalled();
    expect(markScheduleDone).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('preserves the final draft and Sign screen on transport failure', async () => {
    const attempt = lifecycleExports().attemptSessionStudioSubmit;
    expect(attempt).toBeTypeOf('function');
    if (!attempt) return;

    let persisted = false;
    const commitSuccess = vi.fn();
    const result = await attempt({
      persistFinalDraft: () => {
        persisted = true;
      },
      submit: async () => {
        throw new Error('network disconnected');
      },
      commitSuccess,
    });

    expect(persisted).toBe(true);
    expect(result).toMatchObject({ status: 'TRANSPORT_ERROR' });
    expect(commitSuccess).not.toHaveBeenCalled();
  });

  it('does not commit an incomplete success response as claim-ready', async () => {
    const attempt = lifecycleExports().attemptSessionStudioSubmit;
    expect(attempt).toBeTypeOf('function');
    if (!attempt) return;

    const commitSuccess = vi.fn();
    const result = await attempt({
      persistFinalDraft: vi.fn(),
      submit: async () => ({ success: true, sessionId: 'session-1' }),
      validateSuccess: () => false,
      commitSuccess,
    });

    expect(result).toMatchObject({ status: 'INVALID_RESPONSE' });
    expect(commitSuccess).not.toHaveBeenCalled();
  });
});

describe('Session Studio durable clock-in lifecycle', () => {
  it('enables collection only after durable success and uses the authoritative server start', async () => {
    const attempt = lifecycleExports().attemptDurableSessionClockIn;
    expect(attempt).toBeTypeOf('function');
    if (!attempt) return;

    const commitDurableStart = vi.fn();
    const result = await attempt({
      requestedStart: '2026-08-12T14:00:00.000Z',
      clockIn: async () => ({
        success: true,
        startedAt: '2026-08-12T14:00:01.250Z',
      }),
      commitDurableStart,
    });

    expect(commitDurableStart).toHaveBeenCalledOnce();
    expect(commitDurableStart).toHaveBeenCalledWith('2026-08-12T14:00:01.250Z');
    expect(result).toEqual({
      status: 'STARTED',
      startedAt: '2026-08-12T14:00:01.250Z',
    });
  });

  it('keeps collection locked when durable clock-in is rejected', async () => {
    const attempt = lifecycleExports().attemptDurableSessionClockIn;
    expect(attempt).toBeTypeOf('function');
    if (!attempt) return;

    const commitDurableStart = vi.fn();
    const result = await attempt({
      requestedStart: '2026-08-12T14:00:00.000Z',
      clockIn: async () => ({
        success: false,
        error: 'Assignment changed.',
      }),
      commitDurableStart,
    });

    expect(result).toMatchObject({ status: 'REJECTED' });
    expect(commitDurableStart).not.toHaveBeenCalled();
  });

  it('refuses a success response that omits the durable server start', async () => {
    const attempt = lifecycleExports().attemptDurableSessionClockIn;
    expect(attempt).toBeTypeOf('function');
    if (!attempt) return;

    const commitDurableStart = vi.fn();
    const result = await attempt({
      requestedStart: '1999-01-01T00:00:00.000Z',
      clockIn: async () => ({ success: true }),
      commitDurableStart,
    });

    expect(result).toMatchObject({ status: 'INVALID_RESPONSE' });
    expect(commitDurableStart).not.toHaveBeenCalled();
  });
});

describe('Session Studio durable incomplete close lifecycle', () => {
  it('persists the recovery draft before clock-out and commits only the durable end', async () => {
    const attempt = lifecycleExports().attemptDurableSessionClockOut;
    expect(attempt).toBeTypeOf('function');
    if (!attempt) return;

    const events: string[] = [];
    const commitDurableEnd = vi.fn();
    const result = await attempt({
      persistFinalDraft: () => events.push('persist'),
      clockOut: async () => {
        events.push('clock-out');
        return {
          success: true,
          startedAt: '2026-08-12T14:00:00.000Z',
          endedAt: '2026-08-12T15:00:00.000Z',
          durationSeconds: 3_600,
          billableUnits: 4,
        };
      },
      commitDurableEnd,
    });

    expect(events).toEqual(['persist', 'clock-out']);
    expect(commitDurableEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        endedAt: '2026-08-12T15:00:00.000Z',
        durationSeconds: 3_600,
      })
    );
    expect(result).toMatchObject({ status: 'CLOCKED_OUT' });
  });

  it('does not claim clock-out when the durable close is rejected', async () => {
    const attempt = lifecycleExports().attemptDurableSessionClockOut;
    expect(attempt).toBeTypeOf('function');
    if (!attempt) return;

    const commitDurableEnd = vi.fn();
    const result = await attempt({
      persistFinalDraft: vi.fn(),
      clockOut: async () => ({
        success: false,
        code: 'EVV_CLOCK_OUT_CONFLICT',
        error: 'Clock-out could not be reconciled.',
      }),
      commitDurableEnd,
    });

    expect(result).toMatchObject({
      status: 'REJECTED',
      result: { code: 'EVV_CLOCK_OUT_CONFLICT' },
    });
    expect(commitDurableEnd).not.toHaveBeenCalled();
  });

  it('rejects a success response whose durable anchors disagree with duration', async () => {
    const attempt = lifecycleExports().attemptDurableSessionClockOut;
    expect(attempt).toBeTypeOf('function');
    if (!attempt) return;

    const commitDurableEnd = vi.fn();
    const result = await attempt({
      persistFinalDraft: vi.fn(),
      clockOut: async () => ({
        success: true,
        startedAt: '2026-08-12T14:00:00.000Z',
        endedAt: '2026-08-12T15:00:00.000Z',
        durationSeconds: 1,
        billableUnits: 99,
      }),
      commitDurableEnd,
    });

    expect(result).toMatchObject({ status: 'INVALID_RESPONSE' });
    expect(commitDurableEnd).not.toHaveBeenCalled();
  });
});

describe('Session Studio documentation submission presentation', () => {
  it('uses awaiting-BCBA copy and creates no synthetic claim reference', () => {
    const exports = completionExports();
    expect(exports.DOCUMENTATION_SUBMITTED_MESSAGE).toBe(
      'Documentation submitted — awaiting BCBA review.'
    );
    expect(exports.buildDocumentationSubmittedRecord).toBeTypeOf('function');

    const record = exports.buildDocumentationSubmittedRecord!({
      id: 'session-1',
      client: 'Demo Learner',
      date: '2026-08-12',
      time: '03:00 PM',
      units: 4,
    });

    expect(record).toEqual({
      id: 'session-1',
      client: 'Demo Learner',
      date: '2026-08-12',
      time: '03:00 PM',
      units: 4,
      status: 'DOCUMENTATION_SUBMITTED',
    });
    expect(JSON.stringify(record)).not.toMatch(/claimId|CLM-|CLAIM_SUBMITTED/i);
  });

  it('sanitizes legacy local synthetic claim metadata into documentation status', () => {
    const normalize = completionExports().normalizeCompletedStudioSession;
    expect(normalize).toBeTypeOf('function');

    const record = normalize!({
      id: 'session-1',
      client: 'Demo Learner',
      date: '2026-08-12',
      time: '03:00 PM',
      units: 4,
      claimId: 'CLM-SESSION1',
      status: 'CLAIM_SUBMITTED',
    });

    expect(record).toEqual({
      id: 'session-1',
      client: 'Demo Learner',
      date: '2026-08-12',
      time: '03:00 PM',
      units: 4,
      status: 'DOCUMENTATION_SUBMITTED',
    });
    expect(JSON.stringify(record)).not.toMatch(/claimId|CLM-|CLAIM_SUBMITTED/i);
  });
});
