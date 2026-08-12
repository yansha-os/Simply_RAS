import { describe, expect, it } from 'vitest';

import {
  ATS_PIPELINE_COLUMNS,
  activationStatusLabel,
  deriveAtsStage,
  getAtsPipelineColumns,
  readProgress,
  readProgressFromPacket,
  snapshotFromPacket,
  type CandidateProgressFlags,
} from '../atsStage';

const noProgress: CandidateProgressFlags = {};

const allFive: CandidateProgressFlags = {
  tasksDone: true,
  availabilityDone: true,
  simulationDone: true,
  interviewPassed: true,
  certUploaded: true,
};

describe('deriveAtsStage — pipeline placement rules', () => {
  it('HIRED stage is terminal and wins over everything else', () => {
    expect(
      deriveAtsStage({ activationStatus: 'REJECTED', currentStage: 'HIRED', progress: noProgress })
    ).toBe('HIRED');
    expect(
      deriveAtsStage({
        activationStatus: 'PENDING_HR_REVIEW',
        currentStage: 'HIRED',
        progress: { helpDeskOpen: true },
      })
    ).toBe('HIRED');
  });

  it('REJECTED via stage or activation status leaves the live funnel', () => {
    expect(
      deriveAtsStage({ activationStatus: 'ACTIVE', currentStage: 'REJECTED', progress: allFive })
    ).toBe('REJECTED');
    expect(
      deriveAtsStage({ activationStatus: 'REJECTED', currentStage: 'OFFER', progress: allFive })
    ).toBe('REJECTED');
  });

  it('stays APPLIED while pending HR review, regardless of progress', () => {
    expect(
      deriveAtsStage({
        activationStatus: 'PENDING_HR_REVIEW',
        currentStage: 'APPLIED',
        progress: allFive,
      })
    ).toBe('APPLIED');
  });

  it('an open help ticket overrides OFFER placement', () => {
    expect(
      deriveAtsStage({
        activationStatus: 'ACTIVE',
        currentStage: 'PHONE_SCREEN',
        progress: { ...allFive, helpDeskOpen: true },
      })
    ).toBe('HELP_DESK');
  });

  it('reaches OFFER only when all five requirements are complete', () => {
    expect(
      deriveAtsStage({ activationStatus: 'ACTIVE', currentStage: 'PHONE_SCREEN', progress: allFive })
    ).toBe('OFFER');
    for (const missing of Object.keys(allFive) as Array<keyof CandidateProgressFlags>) {
      const progress = { ...allFive, [missing]: false };
      expect(
        deriveAtsStage({ activationStatus: 'ACTIVE', currentStage: 'PHONE_SCREEN', progress })
      ).not.toBe('OFFER');
    }
  });

  it('preserves an explicit staff-set OFFER stage while automatic evidence remains pending', () => {
    expect(
      deriveAtsStage({
        activationStatus: 'ACTIVE',
        currentStage: 'OFFER',
        progress: noProgress,
      })
    ).toBe('OFFER');
  });

  it('sits in INTERVIEW while booked but not yet passed', () => {
    expect(
      deriveAtsStage({
        activationStatus: 'INVITATION_SENT',
        currentStage: 'PHONE_SCREEN',
        progress: { interviewBooked: true },
      })
    ).toBe('INTERVIEW');
  });

  it('returns to PHONE_SCREEN after a passed interview with requirements still missing', () => {
    expect(
      deriveAtsStage({
        activationStatus: 'ACTIVE',
        currentStage: 'INTERVIEW',
        progress: { interviewBooked: true, interviewPassed: true },
      })
    ).toBe('PHONE_SCREEN');
  });
});

describe('readProgress / readProgressFromPacket', () => {
  it('treats only strict boolean true as done (no truthy strings)', () => {
    const flags = readProgress({ progress: { tasksDone: 'true', availabilityDone: 1, simulationDone: true } });
    expect(flags.tasksDone).toBe(false);
    expect(flags.availabilityDone).toBe(false);
    expect(flags.simulationDone).toBe(true);
  });

  it('returns all-false flags for junk dossiers', () => {
    for (const dossier of [null, undefined, 'text', [], { progress: 'oops' }]) {
      const flags = readProgress(dossier);
      expect(Object.values(flags).every((v) => v === false)).toBe(true);
    }
  });

  it('prefers packet columns but keeps helpDeskOpen from the legacy dossier', () => {
    const flags = readProgressFromPacket(
      { tasksDone: true, certUploaded: null },
      { progress: { tasksDone: false, helpDeskOpen: true } }
    );
    expect(flags.tasksDone).toBe(true);
    expect(flags.certUploaded).toBe(false);
    expect(flags.helpDeskOpen).toBe(true);
  });

  it('falls back entirely to the dossier when no packet exists', () => {
    const flags = readProgressFromPacket(null, { progress: { simulationDone: true } });
    expect(flags.simulationDone).toBe(true);
    expect(flags.tasksDone).toBe(false);
  });
});

describe('snapshotFromPacket — defensive coercion', () => {
  it('filters non-numeric steps and non-string boroughs', () => {
    const snap = snapshotFromPacket({
      tasksCompletedSteps: [1, '2', null, 3],
      preferredBoroughs: ['Queens', 7, null, 'Bronx'],
    });
    expect(snap.tasksCompletedSteps).toEqual([1, 3]);
    expect(snap.preferredBoroughs).toEqual(['Queens', 'Bronx']);
  });

  it('nulls non-finite maxTravelMiles and defaults grid/transportation', () => {
    expect(snapshotFromPacket({ maxTravelMiles: Number.NaN }).maxTravelMiles).toBeNull();
    expect(snapshotFromPacket({ maxTravelMiles: 12 }).maxTravelMiles).toBe(12);
    const empty = snapshotFromPacket(null);
    expect(empty.availabilityGrid).toEqual([]);
    expect(empty.transportation).toBeNull();
    expect(empty.maxTravelMiles).toBeNull();
  });
});

describe('pipeline columns & activation labels', () => {
  it('hides the Help Desk column unless explicitly included', () => {
    expect(getAtsPipelineColumns().map((c) => c.key)).toEqual([
      'APPLIED',
      'PHONE_SCREEN',
      'INTERVIEW',
      'OFFER',
    ]);
    expect(getAtsPipelineColumns({ includeHelpDesk: true })).toHaveLength(
      ATS_PIPELINE_COLUMNS.length
    );
  });

  it('labels every activation status with the right tone', () => {
    expect(activationStatusLabel('ACTIVE')).toEqual({ label: 'Active', tone: 'active' });
    expect(activationStatusLabel('ACCOUNT_ACTIVE').tone).toBe('active');
    expect(activationStatusLabel('INVITATION_SENT').tone).toBe('invited');
    expect(activationStatusLabel('REJECTED').tone).toBe('rejected');
    expect(activationStatusLabel('PENDING_HR_REVIEW').tone).toBe('pending');
    expect(activationStatusLabel('anything-else').tone).toBe('pending');
  });
});
