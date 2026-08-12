import { describe, expect, it } from 'vitest';

import {
  deriveInterviewView,
  formatInterviewDateEt,
  getDefaultInterviewDateEt,
  isInterviewJoinWindowOpen,
  isSafeInterviewMeetingUrl,
  normalizeInterviewTimeEt,
  parseInterviewSlotEt,
} from './interviewUi';

describe('interview Eastern Time handling', () => {
  it('parses legacy EST labels as New York wall time during daylight saving time', () => {
    expect(parseInterviewSlotEt('2026-08-12', '09:00 AM EST')?.toISOString()).toBe(
      '2026-08-12T13:00:00.000Z'
    );
  });

  it('uses the winter New York offset without changing the ET label', () => {
    expect(parseInterviewSlotEt('2026-01-12', '09:00 AM ET')?.toISOString()).toBe(
      '2026-01-12T14:00:00.000Z'
    );
    expect(normalizeInterviewTimeEt('09:00 AM EDT')).toBe('09:00 AM ET');
  });

  it('rejects malformed dates and times', () => {
    expect(parseInterviewSlotEt('not-a-date', '09:00 AM ET')).toBeNull();
    expect(parseInterviewSlotEt('2026-08-12', '25:00 PM ET')).toBeNull();
  });

  it('opens the meeting from five minutes before through sixty minutes after', () => {
    const date = '2026-08-12';
    const time = '09:00 AM ET';

    expect(isInterviewJoinWindowOpen(date, time, new Date('2026-08-12T12:54:59Z'))).toBe(false);
    expect(isInterviewJoinWindowOpen(date, time, new Date('2026-08-12T12:55:00Z'))).toBe(true);
    expect(isInterviewJoinWindowOpen(date, time, new Date('2026-08-12T14:00:00Z'))).toBe(true);
    expect(isInterviewJoinWindowOpen(date, time, new Date('2026-08-12T14:00:01Z'))).toBe(false);
  });

  it('defaults to the next weekday in Eastern Time', () => {
    expect(getDefaultInterviewDateEt(new Date('2026-08-14T18:00:00Z'))).toBe('2026-08-17');
    expect(getDefaultInterviewDateEt(new Date('2026-08-11T23:00:00Z'))).toBe('2026-08-12');
  });

  it('formats a date-only value without host-timezone drift', () => {
    expect(formatInterviewDateEt('2026-08-12')).toBe('Wednesday, August 12, 2026');
  });

  it('only permits approved HTTPS meeting hosts', () => {
    expect(isSafeInterviewMeetingUrl('https://meet.jit.si/RiseAndShine_123')).toBe(true);
    expect(isSafeInterviewMeetingUrl('https://meet.google.com/abc-defg-hij')).toBe(true);
    expect(isSafeInterviewMeetingUrl('http://meet.jit.si/insecure')).toBe(false);
    expect(isSafeInterviewMeetingUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeInterviewMeetingUrl('https://example.com/not-a-meeting')).toBe(false);
  });
});

describe('interview stage and outcome gating', () => {
  it('keeps scheduling locked until HR activates the applicant', () => {
    expect(
      deriveInterviewView({
        stage: 'APPLIED',
        activationStatus: 'PENDING_HR_REVIEW',
        interviewBooked: false,
        interviewPassed: false,
        interview: null,
      })
    ).toBe('LOCKED');
  });

  it('shows a closed state for rejected applications without an interview result', () => {
    expect(
      deriveInterviewView({
        stage: 'REJECTED',
        activationStatus: 'REJECTED',
        interviewBooked: false,
        interviewPassed: false,
        interview: null,
      })
    ).toBe('CLOSED');
  });

  it('allows an invited applicant to book', () => {
    expect(
      deriveInterviewView({
        stage: 'PHONE_SCREEN',
        activationStatus: 'INVITATION_SENT',
        interviewBooked: false,
        interviewPassed: false,
        interview: null,
      })
    ).toBe('BOOKING');
  });

  it('shows persisted scheduled and in-progress interviews as scheduled', () => {
    for (const status of ['SCHEDULED', 'IN_PROGRESS']) {
      expect(
        deriveInterviewView({
          stage: 'INTERVIEW',
          activationStatus: 'ACTIVE',
          interviewBooked: true,
          interviewPassed: false,
          interview: {
            status,
            recommendation: null,
            scheduledDate: '2026-08-12',
            scheduledTime: '09:00 AM ET',
          },
        })
      ).toBe('SCHEDULED');
    }
  });

  it('never presents a completed rejection as approved', () => {
    expect(
      deriveInterviewView({
        stage: 'REJECTED',
        activationStatus: 'REJECTED',
        interviewBooked: true,
        interviewPassed: false,
        interview: {
          status: 'COMPLETED',
          recommendation: 'REJECT',
          scheduledDate: '2026-08-12',
          scheduledTime: '09:00 AM ET',
        },
      })
    ).toBe('REVIEWED');
  });

  it('shows approval only from the persisted interviewPassed flag', () => {
    expect(
      deriveInterviewView({
        stage: 'PHONE_SCREEN',
        activationStatus: 'ACTIVE',
        interviewBooked: true,
        interviewPassed: true,
        interview: {
          status: 'COMPLETED',
          recommendation: 'ADVANCE',
          scheduledDate: '2026-08-12',
          scheduledTime: '09:00 AM ET',
        },
      })
    ).toBe('APPROVED');
  });

  it('allows recovery booking after cancellation or no-show', () => {
    for (const status of ['CANCELLED', 'NO_SHOW']) {
      expect(
        deriveInterviewView({
          stage: 'INTERVIEW',
          activationStatus: 'ACTIVE',
          interviewBooked: true,
          interviewPassed: false,
          interview: {
            status,
            recommendation: null,
            scheduledDate: '2026-08-12',
            scheduledTime: '09:00 AM ET',
          },
        })
      ).toBe('BOOKING');
    }
  });
});
